import json
# import math
import os
import numpy as np
from datetime import datetime, timedelta, timezone
from skyfield.api import Topos, load
from skyfield import almanac
from global_land_mask import globe
from hijridate import Gregorian as HijriGregorian

# --- INISIALISASI SKYFIELD ---
BASE_DIR = os.path.dirname(f" os.path.dirname(os.path.dirname(os.path.abspath(__file__)))")
eph_path = os.path.join(BASE_DIR, 'de421.bsp')
if not os.path.exists(eph_path):
    print("Mengunduh data ephemeris (hanya sekali)...")
eph = load(eph_path)
ts = load.timescale()

# --- FUNGSI BANTUAN DASAR ---
def load_kriteria_config():
    # --- FUNGSI LOAD KRITERIA DARI HISTORY CONFIG ---
    config_path = os.path.join(BASE_DIR, 'static', 'json', 'config_kriteria.json')
    
    # Fallback default jika file tidak ditemukan
    default_res = {
        "versi_algoritma": "1.0-default",
        "kriteria": {
            "MABIMS": {"alt": 3.0, "elong": 6.4},
            "KHGT": {"alt": 5.0, "elong": 8.0, "limit_utc_hour": 0},
            "WH": {"alt": 0.0}
        }
    }

    if not os.path.exists(config_path):
        print("[!] config_kriteria.json tidak ditemukan, menggunakan kriteria default.")
        return default_res

    try:
        with open(config_path, 'r') as f:
            full_config = json.load(f)
            v_aktif = full_config.get("versi_aktif")
            
            # Mencari detail kriteria berdasarkan versi_aktif di dalam history
            for item in full_config.get("history", []):
                if item["versi_algoritma"] == v_aktif:
                    return {
                        "versi_algoritma": item["versi_algoritma"],
                        "kriteria": item["kriteria"]
                    }
    except Exception as e:
        print(f"[!] Error membaca config: {e}")
    
    return default_res

# menebah bulan hijriah
def get_hijri_month_name(dt_masehi):
    """Menebak nama bulan Hijriah berdasarkan tanggal Masehi + 2 hari (agar pasti masuk bulan baru)"""
    dt_target = dt_masehi + timedelta(days=2)
    h = HijriGregorian(dt_target.year, dt_target.month, dt_target.day).to_hijri()
    bulan_indo = ["", "Muharram", "Safar", "Rabi'ul Awwal", "Rabi'ul Akhir", 
                  "Jumadil Ula", "Jumadil Akhira", "Rajab", "Sya'ban", 
                  "Ramadhan", "Syawal", "Dzulqa'dah", "Dzulhijjah"]
    return f"{bulan_indo[h.month]} {h.year} H"

# Mencari ijtima tahunan
def get_semua_ijtima_tahunan(tahun):
    """Mencari semua waktu Ijtima dalam satu tahun penuh"""
    t0 = ts.utc(tahun, 1, 1)
    t1 = ts.utc(tahun + 1, 1, 1)
    f_fase = almanac.moon_phases(eph)
    t_times, t_events = almanac.find_discrete(t0, t1, f_fase)
    
    list_ijtima = []
    for tm, ev in zip(t_times, t_events):
        if ev == 0:  # 0 adalah fase New Moon / Ijtima'
            list_ijtima.append(tm)
    return list_ijtima

# Menghitung posisi hilal dengan Waktu Lokal Relatif (LMT)
# --- FUNGSI CORE (BARU) ---
def core_hitung_hilal(date_dt, lat, lon, eph_obj, ts_obj):
    """Rumus murni astronomi. Tidak peduli darimana eph_obj berasal."""
 
    earth, sun, moon = eph_obj['earth'], eph_obj['sun'], eph_obj['moon']
    lokasi = Topos(latitude_degrees=lat, longitude_degrees=lon)
    observer = earth + lokasi
    
    offset_jam = lon / 15.0
    utc_start_hour = 12.0 - offset_jam
    
    t0 = ts_obj.utc(date_dt.year, date_dt.month, date_dt.day, utc_start_hour)
    t1 = ts_obj.utc(date_dt.year, date_dt.month, date_dt.day, utc_start_hour + 24)
    
    f = almanac.sunrise_sunset(eph_obj, lokasi)
    t_times, t_events = almanac.find_discrete(t0, t1, f)
    
    t_sunset = None
    for tm, ev in zip(t_times, t_events):
        if ev == 0:
            t_sunset = tm
            break
            
    if t_sunset is None:
        return -99, -99, None
        
    geo_sun = earth.at(t_sunset).observe(sun).apparent()
    geo_moon = earth.at(t_sunset).observe(moon).apparent()
    
    astrometric_moon = observer.at(t_sunset).observe(moon).apparent()
    alt_topo, _, _ = astrometric_moon.altaz()
    
    alt_geo = alt_topo.degrees + 0.95 # Konversi ke Geosentris
    elong_geo = geo_moon.separation_from(geo_sun).degrees
    
    return alt_geo, elong_geo, t_sunset

# --- FUNGSI ASLI (DIPERBARUI menggunakan core_hitung_hilal, tetap ada untuk kompatibilitas) ---
def get_hilal_data(date_dt, lat, lon):
    """Fungsi wrapper untuk kompatibilitas kode lama (menggunakan global eph & ts)"""
    global eph, ts 
    # Cukup panggil fungsi core di atas, masukkan eph dan ts global!
    return core_hitung_hilal(date_dt, lat, lon, eph, ts)

# =========================================================
# EKSTRAKTOR DATA DARI MATRIKS NPZ (v3.0)
# =========================================================
def npz_scan_indonesia(npz_data, ijtima_unix, k_mabims, k_wh):
    """Memindai seluruh NKRI dalam hitungan milidetik menggunakan Masking NumPy"""
    LATS, LONS = npz_data['LAT'], npz_data['LON']
    ALT, ELONG, WAKTU = npz_data['ALT'], npz_data['ELONG'], npz_data['WAKTU']

    # 1. Buat 'Topeng' (Mask) untuk membatasi wilayah Indonesia
    mask_indo = (LONS >= 95) & (LONS <= 142) & (LATS >= -11) & (LATS <= 7)

    # 2. Topeng Kriteria MABIMS (Hanya di dalam wilayah Indo)
    mask_mabims = mask_indo & (ALT >= k_mabims["alt"]) & (ELONG >= k_mabims["elong"])
    mabims_sukses = np.any(mask_mabims) # True jika ada minimal 1 titik tembus

    # 3. Topeng Kriteria WH (Waktu sunset > Waktu Ijtima)
    mask_wh = mask_indo & (ALT > k_wh["alt"]) & (WAKTU > ijtima_unix) & (WAKTU != -99)
    wh_sukses = np.any(mask_wh)

    max_alt_indo = np.max(ALT[mask_indo]) if np.any(mask_indo) else -99.0
    max_elong_indo = np.max(ELONG[mask_indo]) if np.any(mask_indo) else -99.0

    return mabims_sukses, wh_sukses, max_alt_indo, max_elong_indo

def get_fajar_selandia_baru(hari_rukyat_dt, eph_obj, ts_obj):
    """Mencari waktu Fajar Astronomis (Sun Alt -18°) di Gisborne, NZ untuk keesokan harinya"""
    
    # Koordinat Gisborne, Selandia Baru (Kota paling timur)
    nz_lokasi = Topos(latitude_degrees=-38.6623, longitude_degrees=178.0176)
    
    # Fajar di NZ besok paginya (Waktu Lokal NZ) terjadi pada Sore/Malam hari ini (Waktu UTC)
    # Kita buat rentang pencarian dari jam 12:00 UTC hari ini hingga 12:00 UTC besok
    t0 = ts_obj.utc(hari_rukyat_dt.year, hari_rukyat_dt.month, hari_rukyat_dt.day, 12) 
    t1 = ts_obj.utc(hari_rukyat_dt.year, hari_rukyat_dt.month, hari_rukyat_dt.day + 1, 12)
    
    # almanac.dark_twilight_day membagi hari menjadi: 
    # 0 = Dark, 1 = Astronomical twilight, 2 = Nautical, 3 = Civil, 4 = Day
    f = almanac.dark_twilight_day(eph_obj, nz_lokasi)
    t_times, t_events = almanac.find_discrete(t0, t1, f)
    
    for tm, ev in zip(t_times, t_events):
        if ev == 1: # Transisi dari Dark (0) ke Astronomical Twilight (1) adalah saat FAJAR
            return tm.utc_datetime().timestamp() # Kembalikan Unix Timestamp
            
    return 9999999999.0 # Fallback aman jika terjadi anomali ekstrem

def npz_scan_khgt(npz_data, k_khgt, ijtima_unix, batas_utc_unix, fajar_nz_unix):
    """Scan Global KHGT yang mematuhi Resolusi Istanbul 2016 secara ketat"""
    LATS, LONS = npz_data['LAT'], npz_data['LON']
    ALT, ELONG, WAKTU = npz_data['ALT'], npz_data['ELONG'], npz_data['WAKTU']

    # 1. Saring Lintang Manusia (-60 s.d 65) dan Kriteria Dasar 5/8
    mask_astronomi = (LATS >= -60) & (LATS <= 65) & (ALT >= k_khgt["alt"]) & (ELONG >= k_khgt["elong"])
    
    # 2. SKENARIO NORMAL: Terpenuhi SEBELUM 00:00 UTC di mana saja
    mask_normal = mask_astronomi & (WAKTU < batas_utc_unix) & (WAKTU != -99)
    
    # 3. SKENARIO EKSTENSI: Terpenuhi SETELAH 00:00 UTC
    # Syarat A: Hanya sah jika di Daratan Amerika (Bujur sekitar -170 hingga -30)
    mask_amerika = (LONS >= -170) & (LONS <= -30)
    # Syarat B: Ijtima harus terjadi sebelum fajar di Selandia Baru
    syarat_nz_terpenuhi = (ijtima_unix < fajar_nz_unix)
    
    # Gabungkan syarat ekstensi
    mask_ekstensi = mask_astronomi & (WAKTU >= batas_utc_unix) & mask_amerika & syarat_nz_terpenuhi
    
    # 4. GABUNGKAN: Titik potensial adalah Skenario Normal ATAU Skenario Ekstensi
    mask_potensial = mask_normal | mask_ekstensi

    # Jika tidak ada titik yang lolos satupun skenario, langsung gagal
    if not np.any(mask_potensial):
        return False, float(np.max(ALT)), "Gagal Global (Tidak memenuhi syarat Istanbul)"

    # ==========================================================
    # Cek Validasi Benua / Daratan
    # ==========================================================
    lats_potensial = LATS[mask_potensial]
    lons_potensial = LONS[mask_potensial]
    alts_potensial = ALT[mask_potensial]
    waktus_potensial = WAKTU[mask_potensial]

    mask_daratan = globe.is_land(lats_potensial, lons_potensial)

    if np.any(mask_daratan):
        alt_di_daratan = alts_potensial[mask_daratan]
        waktu_di_daratan = waktus_potensial[mask_daratan]
        
        # Cek apakah titik tertinggi yang lolos itu berada di skenario mana untuk detail laporan
        # (Kita ambil sampel waktu dari titik dengan altitude tertinggi)
        idx_max = np.argmax(alt_di_daratan)
        waktu_tertinggi = waktu_di_daratan[idx_max]
        
        detail_status = "Daratan Tembus 5/8 (Skenario Normal < 00:00 UTC)"
        if waktu_tertinggi >= batas_utc_unix:
            detail_status = "Daratan Amerika Tembus 5/8 & Ijtima < Fajar NZ (Skenario Ekstensi)"
            
        return True, float(np.max(alt_di_daratan)), detail_status

    return False, float(np.max(ALT)), "Gagal (Titik hanya di Lautan)"

# =========================================================
# MESIN UTAMA AMaL ENGINE V3.0 (HYBRID DRIVEN)
# =========================================================
def generate_adaptif(tahun, lat_lokal, lon_lokal, kota, force_rebuild=False):
    from .hilal_engine import generate_peta_kontur, CACHE_DIR

    nama_file = f"kalender_jangkar_{tahun}.json"
    file_path = os.path.join(BASE_DIR, nama_file)
    data_lama = None
    config_aktif = load_kriteria_config()
    
    # 1. Cek apakah file sudah ada dan cek integritas (Kriteria dan Versi)
    if os.path.exists(file_path):
        with open(file_path, 'r') as f:
            data_lama = json.load(f)

        metadata_lama = data_lama.get("metadata", {})
        if (metadata_lama.get("kriteria") != config_aktif["kriteria"] or 
            metadata_lama.get("versi_algoritma") != config_aktif["versi_algoritma"]):
            print(f"[!] Versi/Kriteria berbeda ({metadata_lama.get('versi_algoritma')} -> {config_aktif['versi_algoritma']})")
            print("[!] Memicu Full Rebuild untuk validasi ulang.")
            force_rebuild = True
        else: 
            print(f"[*] Versi/Kriteria sama ({metadata_lama.get('versi_algoritma')}). Tidak ada perubahan data.")
            
    # 2 Periksa apakah kota atau koordinat berubah
    if data_lama and not force_rebuild:
        loc = data_lama.get("lokasi_masjid", {})
        if loc.get("lat") == lat_lokal and loc.get("lon") == lon_lokal:
            print(f"[*] Lokasi sama {loc.get('kota')} ({lat_lokal}, {lon_lokal}). Tidak ada perubahan data.")
            return data_lama
        else:
            print(f"[*] Perubahan lokasi terdeteksi dari {loc.get('kota')} ({loc.get("lat")}, {loc.get("lon")}) ke {kota} ({lat_lokal}, {lon_lokal}). Mengupdate data LOKAL saja...")

    # 3. Persiapan Kriteria & Ijtima
    k_mabims = config_aktif["kriteria"]["MABIMS"]
    k_khgt = config_aktif["kriteria"]["KHGT"]
    k_wh = config_aktif["kriteria"]["WH"]
    
    ijtima_lalu = get_semua_ijtima_tahunan(tahun - 1)
    ijtima_ini = get_semua_ijtima_tahunan(tahun)
    ijtima_depan = get_semua_ijtima_tahunan(tahun + 1)
    daftar_ijtima_lengkap = [ijtima_lalu[-1]] + ijtima_ini + [ijtima_depan[0]]
    
    hasil_tahunan = {
        "metadata": {
            "versi_algoritma": config_aktif["versi_algoritma"],
            "kriteria": config_aktif["kriteria"],
            "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "mesin": "AMaL Engine v3.0-Hybrid"
        },
        "tahun_masehi": tahun,
        "lokasi_masjid": {"lat": lat_lokal, "lon": lon_lokal, "kota": kota},
        "jangkar_bulan": []
    }

    # 4. Looping Utama V3.0
    for i, t_ijtima in enumerate(daftar_ijtima_lengkap):
        dt_ijtima_utc = t_ijtima.utc_datetime()
        hari_rukyat = datetime(dt_ijtima_utc.year, dt_ijtima_utc.month, dt_ijtima_utc.day)
        besok, lusa = hari_rukyat + timedelta(days=1), hari_rukyat + timedelta(days=2)
        nama_bulan = get_hijri_month_name(hari_rukyat)
        
        print(f"\n[{nama_bulan}] Mengevaluasi Hilal untuk Ijtima: {dt_ijtima_utc.strftime('%Y-%m-%d %H:%M UTC')}")
        
        # --- PERSIAPAN GRID NPZ ---
        # Fungsi ini akan melompati proses jika data NPZ hari tersebut sudah ada (Cache)
        generate_peta_kontur(hari_rukyat, dt_ijtima_utc.timestamp(), lat_lokal, lon_lokal, kota)
        
        # Load berkas NPZ yang baru saja dipastikan keberadaannya
        str_tanggal = hari_rukyat.strftime('%Y%m%d')
        versi_algo = config_aktif["versi_algoritma"].replace(".", "_")
        file_npz = os.path.join(CACHE_DIR, f"data_hilal_{str_tanggal}_v{versi_algo}.npz")
        
        npz_data = np.load(file_npz)
        ijtima_unix = dt_ijtima_utc.timestamp()
        keputusan = {}

        # --- A. LOKAL (Hitung Presisi dengan Fungsi Asli) ---
        alt_lok, elong_lok, t_sun_lok = get_hilal_data(hari_rukyat, lat_lokal, lon_lokal)

        lulus_mabims = (alt_lok >= k_mabims["alt"] and elong_lok >= k_mabims["elong"])
        keputusan["LOKAL_MABIMS"] = {
            "tgl_1": besok.strftime("%Y-%m-%d") if lulus_mabims else lusa.strftime("%Y-%m-%d"),
            "status": "Sukses" if lulus_mabims else "Istikmal",
            "alt": float(round(alt_lok, 2)),
            "elong": float(round(elong_lok, 2)),
            "detail": f"T: {alt_lok:.2f}°, E: {elong_lok:.2f}°"
        }

        lulus_wh = ((t_sun_lok is not None) and (t_ijtima.tt < t_sun_lok.tt) and (alt_lok > k_wh['alt']))
        keputusan["LOKAL_WH"] = {
            "tgl_1": besok.strftime("%Y-%m-%d") if lulus_wh else lusa.strftime("%Y-%m-%d"),
            "status": "Sukses" if lulus_wh else "Istikmal",
            "alt": float(round(alt_lok, 2)),
            "detail": "Wujud" if (alt_lok > k_wh['alt']) else "Tidak Wujud"
        }

        # --- B. NASIONAL (Ekstrak Cepat dari NPZ) ---
        mabims_indo, wh_indo, max_alt_indo, max_elong_indo = npz_scan_indonesia(npz_data, ijtima_unix, k_mabims, k_wh)
        keputusan["NASIONAL_MABIMS"] = {
            "tgl_1": besok.strftime("%Y-%m-%d") if mabims_indo else lusa.strftime("%Y-%m-%d"),
            "status": "Sukses" if mabims_indo else "Istikmal",
            "alt": float(round(max_alt_indo, 2)),
            "elong": float(round(max_elong_indo, 2)),
            "detail": "NKRI Tembus 3/6.4" if mabims_indo else "Gagal Nasional"
        }
        keputusan["NASIONAL_WH"] = {
            "tgl_1": besok.strftime("%Y-%m-%d") if wh_indo else lusa.strftime("%Y-%m-%d"),
            "status": "Sukses" if wh_indo else "Istikmal",
            "alt": float(round(max_alt_indo, 2)),
            "elong": float(round(max_elong_indo, 2)),
            "detail": "NKRI Wujud" if wh_indo else "Gagal Nasional"
        }

        # --- C. GLOBAL KHGT (Menerapkan Istanbul 2016) ---
        # Siapkan batas waktu 00:00 UTC keesokan harinya (Batas Normal KHGT)
        batas_utc_dt = datetime(besok.year, besok.month, besok.day, 0, 0, 0, tzinfo=timezone.utc)
        batas_utc_unix = batas_utc_dt.timestamp()
        
        # Cari waktu fajar di Selandia Baru
        fajar_nz_unix = get_fajar_selandia_baru(hari_rukyat, eph, ts)

        limit_utc = ts.utc(besok.year, besok.month, besok.day, k_khgt["limit_utc_hour"]).tt
        if t_ijtima.tt >= limit_utc:
            keputusan["GLOBAL_KHGT"] = {"tgl_1": lusa.strftime("%Y-%m-%d"), "status": "Istikmal", "alt": 0.0, "detail": "Ijtima > Limit UTC"}
        else:
            # Panggil fungsi KHGT Istanbul yang baru
            khgt_sukses, max_alt_global, detail_khgt = npz_scan_khgt(
                npz_data, k_khgt, ijtima_unix, batas_utc_unix, fajar_nz_unix
            )
            
            keputusan["GLOBAL_KHGT"] = {
                "tgl_1": besok.strftime("%Y-%m-%d") if khgt_sukses else lusa.strftime("%Y-%m-%d"),
                "status": "Sukses" if khgt_sukses else "Istikmal",
                "alt": float(round(max_alt_global, 2)),
                "detail": detail_khgt
            }

        hasil_tahunan["jangkar_bulan"].append({
            "bulan_hijriah": nama_bulan,
            "data_astronomi": {"ijtima_utc": dt_ijtima_utc.strftime('%Y-%m-%d %H:%M:%S')},
            "keputusan_metode": keputusan
        })

    # 5. Post-Processing Umur Bulan
    for i in range(len(ijtima_ini) + 1):
        for m in hasil_tahunan["jangkar_bulan"][i]["keputusan_metode"].keys():
            d1 = datetime.strptime(hasil_tahunan["jangkar_bulan"][i]["keputusan_metode"][m]["tgl_1"], "%Y-%m-%d")
            d2 = datetime.strptime(hasil_tahunan["jangkar_bulan"][i+1]["keputusan_metode"][m]["tgl_1"], "%Y-%m-%d")
            hasil_tahunan["jangkar_bulan"][i]["keputusan_metode"][m]["umur_bulan"] = (d2 - d1).days
    
    # Simpan hasil (Hanya bulan yang valid untuk tahun ini)
    hasil_tahunan["jangkar_bulan"] = hasil_tahunan["jangkar_bulan"][:len(ijtima_ini) + 1]
    with open(file_path, 'w') as f:
        json.dump(hasil_tahunan, f, indent=4)
    print(f"[OK] Kalender {tahun} diperbarui dan disimpan di: {file_path}")
    return hasil_tahunan

# --- EKSEKUSI UNTUK DRY RUN ---
if __name__ == "__main__":
    # Ganti koordinat dengan lokasi masjid Anda (Sokaraja)
    KOTA = "Sokaraja"
    LAT_LOKAL = -7.4589
    LON_LOKAL = 109.2882
    TAHUN_TARGET = 2026
    
    # generate_adaptif(TAHUN_TARGET, LAT_LOKAL, LON_LOKAL, KOTA)
    generate_adaptif(2026, -7.4589, 109.2882, "Sokaraja", True)