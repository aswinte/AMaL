import os
import math
import json
import copy

from datetime import datetime, timedelta

from adhanpy.PrayerTimes import PrayerTimes
from adhanpy.util.DateComponents import DateComponents
from adhanpy.calculation.CalculationParameters import CalculationParameters
from adhanpy.calculation.Madhab import Madhab

from skyfield.api import load, wgs84
# from skyfield import almanac, eclipselib

from flask import request

# Penampung sementara agar tidak hitung jadwal setiap detik
daily_cache = {"date": None, "data": None}

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Membaca konfigurasi utama
def load_config():
    config_path = os.path.join(BASE_DIR, 'config.json')
    cities_path = os.path.join(BASE_DIR, 'static', 'json', 'cities.json')
    
    # 1. Definisi Default Config Utama
    default_config_utama = {
        "_catatan01": "pilihan mode bisa 'kota' dengan menuliskan daftar kota yang sudah disiapkan atau manual dengan menuliskan lat, lon, dan tz secara manual.",
        "_catatan02": "Pilihan metode_kalender yang bisa ditulis adalah LOKAL_IMKANUR_RUKYAT, LOKAL_WUJUDUL_HILAL,NASIONAL_MABIMS, NASIONAL_WUJUDUL_HILAL, GLOBAL_KHGT",
        "nama_masjid": "Al AMaL",
        "alamat_masjid": "Sokaraja, Banyumas, Jawa Tengah",
        "pilihan_kota": "Sokaraja",
        "metode_kalender": "NASIONAL_MABIMS",
        "mode": "kota",
        "manual_lat": -7.45,
        "manual_lon": 109.28,
        "manual_tz": 7,
        "offset_hijri": 0,
        "durasi_aktif": 15,
        "debug_mode": False,
        "selalu_aktif": False,
        "audio_settings": {
            "tarhim_aktif": False,
            "murottal_aktif": True,
            "adzan_aktif": True,
            "qari_aktif": "",
            "target_durasi_menit": 10,
            "toleransi_tamat_menit": 3
        },
        "tampilkan_jawa": True,
        "display_settings": {
            "tri_state_enabled": True,
            "blackout": [{"start": "22:00", "end": "03:30"}],
            "screensaver": [
                {"start": "06:00", "end": "11:00"},
                {"start": "13:00", "end": "14:30"}
            ]
        },
        "keuangan": {
            "tampilkan": True,
            "tanggal_laporan": "",
            "saldo_awal": "",
            "pemasukan": "",
            "pengeluaran": "" 
        }
    }

    # Default config jika file tidak ada
    config = {}
    # 2. Load Config Utama (Dengan mekanisme Auto-Create & Auto-Repair)
    config_utama_loaded = False
    if os.path.exists(config_path):
        try:
            with open(config_path, 'r') as f:
                config.update(json.load(f))
            config_utama_loaded = True
        except json.JSONDecodeError:
            print("[Warning] config.json rusak (Format JSON tidak valid). Membuat ulang file default...")
        except Exception as e:
            print(f"[Warning] Gagal membaca config.json: {e}. Membuat ulang file default...")
            
    # Jika file tidak ada atau rusak, buat baru
    if not config_utama_loaded:
        try:
            with open(config_path, 'w') as f:
                json.dump(default_config_utama, f, indent=4)
            config.update(default_config_utama)
            print("[System] config.json default berhasil dibuat/dipulihkan.")
        except Exception as e:
            print(f"[Error] Gagal membuat config.json: {e}")
            # Tetap gunakan default di memori (RAM) meskipun gagal simpan ke penyimpanan
            config.update(default_config_utama) 
            
    # 3. Load Daftar Kota
    if os.path.exists(cities_path):
        try:
            with open(cities_path, 'r') as f:
                config['daftar_kota'] = json.load(f)
        except Exception as e:
            print(f"[Warning] cities.json rusak atau gagal dibaca: {e}")
            config['daftar_kota'] = {"Sokaraja": {"lat": -7.4589, "lon": 109.2882, "tz": 7}}
    else:
        # Jika file cities.json hilang, sediakan minimal satu kota agar tidak error
        config['daftar_kota'] = {"Sokaraja": {"lat": -7.4589, "lon": 109.2882, "tz": 7}}
        
    return config

# Membaca konfigurasi waktu
def load_config_waktu():
    config_path = os.path.join(BASE_DIR, 'static', 'json', 'config_waktu.json')
    
    # Nilai default (Standar Kemenag RI & Ihtiyati Umum)
    default_config = {
        "metode_aktif": "KEMENAG",
        "parameter_kustom": {
            "sudut_subuh": 20.0,
            "sudut_isya": 18.0,
            "isya_menit_setelah_maghrib": 0,
            "mazhab_ashar": "SHAFII"
        },
        "ihtiyati_menit": {
            "imsak": -10,
            "subuh": 2,
            "terbit": -2, # Terbit biasanya dikurangi agar batas syuruq aman
            "dzuhur": 2,
            "ashar": 2,
            "maghrib": 2,
            "isya": 2
        },
        "iqomah_menit": {
            "subuh": 15,
            "dzuhur": 10,
            "ashar": 10,
            "maghrib": 5,
            "isya": 10
        }
    }

    # Jika file belum ada, buat otomatis
    if not os.path.exists(config_path):
        with open(config_path, 'w') as f:
            json.dump(default_config, f, indent=4)
        return default_config
    
    # Jika ada, baca isinya
    try:
        with open(config_path, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error membaca config_waktu.json: {e}")
        return default_config

# Fungsi untuk mendapatkan lokasi dari konfigurasi    
def get_current_location():
    """Fungsi tunggal pengambil koordinat agar tidak ada inkonsistensi antar fitur"""
    CONFIG = load_config()
    
    if CONFIG.get("mode") == "manual":
        return {
            "nama": "Lokasi Manual",
            "lat": float(CONFIG.get("manual_lat", -7.45)),
            "lon": float(CONFIG.get("manual_lon", 109.28)),
            "tz": float(CONFIG.get("manual_tz", 7))
        }
    else:
        pilihan = CONFIG.get("pilihan_kota", "Sokaraja")
        daftar = CONFIG.get("daftar_kota", {})
        
        if pilihan not in daftar: # Fallback jika error
            pilihan = "Sokaraja"
            kota_data = {"lat": -7.4589, "lon": 109.2882, "tz": 7}
        else:
            kota_data = daftar[pilihan]
            
        return {
            "nama": pilihan,
            "lat": float(kota_data.get("lat", -7.45)),
            "lon": float(kota_data.get("lon", 109.28)),
            "tz": float(kota_data.get("tz", 7))
        }
    
# Fungsi untuk menghitung jadwal sholat dengan ihtiyati dan logika jumat
def calculate_prayer_times_core(lat, lon, tz_offset, date_target):
    """Fungsi inti pengolah mesin Adhanpy, Ihtiyati, dan logika Jumat"""
    cfg_waktu = load_config_waktu()
    prm = cfg_waktu.get('parameter_kustom', {})
    iht = cfg_waktu.get('ihtiyati_menit', {})

    params = CalculationParameters(fajr_angle=prm.get('sudut_subuh', 20.0), isha_angle=prm.get('sudut_isya', 18.0))
    if prm.get('isya_menit_setelah_maghrib', 0) > 0:
        params.isha_interval = prm['isya_menit_setelah_maghrib']
        
    if prm.get('mazhab_ashar') == "HANAFI":
        params.madhab = Madhab.HANAFI
    else:
        params.madhab = Madhab.SHAFI

    pt = PrayerTimes((lat, lon), DateComponents(date_target.year, date_target.month, date_target.day), calculation_parameters=params)
    delta = timedelta(hours=tz_offset)

    # Kalkulasi Jam + Timezone + Ihtiyati
    waktu_subuh = pt.fajr + delta + timedelta(minutes=iht.get('subuh', 0))
    waktu_dzuhur = pt.dhuhr + delta + timedelta(minutes=iht.get('dzuhur', 0))
    waktu_ashar = pt.asr + delta + timedelta(minutes=iht.get('ashar', 0))
    waktu_maghrib = pt.maghrib + delta + timedelta(minutes=iht.get('maghrib', 0))
    waktu_isya = pt.isha + delta + timedelta(minutes=iht.get('isya', 0))
    waktu_terbit = pt.sunrise + delta + timedelta(minutes=iht.get('terbit', 0))
    waktu_imsak = waktu_subuh + timedelta(minutes=iht.get('imsak', 0))

    # --- ROMBAK LOGIKA JUMAT DISINI ---
    is_jumat = date_target.weekday() == 4 
    jumat_cfg = cfg_waktu.get("jumat", {"gunakan_waktu_tetap": False, "waktu_tetap": "12:00"})
    
    # Simpan waktu dzuhur asli sebagai default
    final_dzuhur = waktu_dzuhur

    if is_jumat and jumat_cfg.get("gunakan_waktu_tetap", False):
        # Parse waktu tetap (misal "12:00") menjadi objek datetime untuk perbandingan
        jam_fix, menit_fix = map(int, jumat_cfg.get("waktu_tetap", "12:00").split(':'))
        waktu_fix_obj = waktu_dzuhur.replace(hour=jam_fix, minute=menit_fix)
        
        # HANYA gunakan waktu tetap jika waktu tersebut SETELAH atau SAMA DENGAN waktu dzuhur asli
        if waktu_fix_obj >= waktu_dzuhur:
            final_dzuhur = waktu_fix_obj
    
    waktu_dzuhur_str = final_dzuhur.strftime("%H:%M")
    # ----------------------------------

    jadwal = {
        "Imsak": waktu_imsak.strftime("%H:%M"),
        "Subuh": waktu_subuh.strftime("%H:%M"),
        "Terbit": waktu_terbit.strftime("%H:%M"),
        "Dzuhur": waktu_dzuhur_str,
        "Ashar": waktu_ashar.strftime("%H:%M"),
        "Maghrib": waktu_maghrib.strftime("%H:%M"),
        "Isya": waktu_isya.strftime("%H:%M")
    }
    
    return {
        "jadwal": jadwal,
        "iqomah": cfg_waktu.get("iqomah_menit", {}),
        "is_jumat": is_jumat,
        "jumat_config": jumat_cfg
    }

# Fungsi untuk menghitung arah kiblat
def hitung_arah_kiblat(lat, lon):
    lat_kabah = math.radians(21.4225)
    lon_kabah = math.radians(39.8262)
    lat_lokasi = math.radians(lat)
    lon_lokasi = math.radians(lon)
    
    d_lon = lon_kabah - lon_lokasi
    y = math.sin(d_lon) * math.cos(lat_kabah)
    x = math.cos(lat_lokasi) * math.sin(lat_kabah) - math.sin(lat_lokasi) * math.cos(lat_kabah) * math.cos(d_lon)
    
    arah_rad = math.atan2(y, x)
    arah_deg = math.degrees(arah_rad)
    return round((arah_deg + 360) % 360, 2)

def cari_rashdul_harian(lat, lon, tz_offset, tgl, arah_kiblat):
    try:
        eph_path = os.path.join(BASE_DIR, 'de421.bsp')
        if not os.path.exists(eph_path): return None
        eph = load(eph_path)
        ts = load.timescale()
        bumi, matahari = eph['earth'], eph['sun']
        lokasi = bumi + wgs84.latlon(lat, lon)
        
        jam_mulai_utc = int(6 - tz_offset)
        
        # PERBAIKAN: Gunakan Vectorized Time Array
        # Buat daftar menit dari 0 sampai 660 (11 jam)
        menit_array = list(range(0, 11 * 60)) 
        
        # Masukkan array menit langsung ke ts.utc()
        t_array = ts.utc(tgl.year, tgl.month, tgl.day, jam_mulai_utc, menit_array)
        
        # Hitung posisi matahari sekaligus
        altaz = lokasi.at(t_array).observe(matahari).apparent().altaz()
        alts = altaz[0].degrees
        azs = altaz[1].degrees
        
        target_1 = arah_kiblat # Matahari di arah Kabah
        target_2 = (arah_kiblat + 180) % 360 # Matahari membelakangi Kabah
        
        best_diff = 360
        best_time = None
        tipe = ""
        
        for i in range(len(menit_array)):
            if alts[i] > 0: # Pastikan matahari sudah terbit
                d1 = min(abs(azs[i] - target_1), 360 - abs(azs[i] - target_1))
                d2 = min(abs(azs[i] - target_2), 360 - abs(azs[i] - target_2))
                
                # Toleransi super ketat (1 derajat meleset)
                if d1 < best_diff and d1 < 1.0:
                    best_diff = d1
                    best_time = t_array[i].utc_datetime() + timedelta(hours=tz_offset)
                    tipe = "bayangan_menjauh" 
                
                if d2 < best_diff and d2 < 1.0:
                    best_diff = d2
                    best_time = t_array[i].utc_datetime() + timedelta(hours=tz_offset)
                    tipe = "bayangan_menuju"
                    
        if best_time:
            return {"waktu": best_time.strftime("%H:%M"), "tipe": tipe}
        return None
    except Exception as e:
        print(f"[Warning] Gagal hitung rashdul harian: {e}")
        return None

# Fungsi untuk mendapatkan data harian lengkap (lokasi, jadwal, planetarium, dll) dengan mekanisme cache
def get_daily_data(tgl_manual=None):
    CONFIG = load_config()
    
    if tgl_manual:
        try:
            now = datetime.strptime(tgl_manual, "%Y-%m-%d")
        except:
            now = datetime.now()
    else:
        now = datetime.now()
        
    current_date_str = now.strftime("%Y-%m-%d")

    # 1. AMBIL LOKASI (Cukup 1 Baris dengan Helper)
    lok = get_current_location()
    lat, lon, tz_offset, nama_lokasi = lok["lat"], lok["lon"], lok["tz"], lok["nama"]

    # ================================================================
    # HITUNG PLANETARIUM DULU SEBELUM CACHE
    # ================================================================
    posisi_tata_surya = {"matahari": 0, "bulan": 0, "matahari_terbit": False, "bulan_terbit": False}
    try:
        eph_path = os.path.join(BASE_DIR, 'de421.bsp')
        eph = load(eph_path)
        ts = load.timescale()
        bumi, mthri, bln = eph['earth'], eph['sun'], eph['moon']
        lokasi_radar = bumi + wgs84.latlon(lat, lon)
        
        jam_kiosk = now.hour
        menit_kiosk = now.minute
        
        waktu_dari_kiosk = request.args.get('time')
        if waktu_dari_kiosk:
            j, m = waktu_dari_kiosk.split(':')
            jam_kiosk = int(j)
            menit_kiosk = int(m)
            
        now_utc = now.replace(hour=jam_kiosk, minute=menit_kiosk) - timedelta(hours=float(tz_offset))
        t_sekarang = ts.utc(now_utc.year, now_utc.month, now_utc.day, now_utc.hour, now_utc.minute)
        
        alt_m, az_m, _ = lokasi_radar.at(t_sekarang).observe(mthri).apparent().altaz()
        alt_b, az_b, _ = lokasi_radar.at(t_sekarang).observe(bln).apparent().altaz()
        
        posisi_tata_surya = {
            "matahari": float(round(az_m.degrees, 1)),
            "bulan": float(round(az_b.degrees, 1)),
            "alt_matahari": float(round(alt_m.degrees, 1)),
            "alt_bulan": float(round(alt_b.degrees, 1)),
            "matahari_terbit": bool(alt_m.degrees > 0),
            "bulan_terbit": bool(alt_b.degrees > 0)
        }
    except Exception as e:
        pass # Supress error planetarium agar tidak spam terminal

    # 2. LOGIKA CACHE
    if not tgl_manual and daily_cache.get("date") == current_date_str:
        if daily_cache.get("data") and daily_cache["data"]["lokasi"]["nama"] == nama_lokasi:
            data_update = copy.deepcopy(daily_cache["data"])
            data_update["nama_masjid"] = CONFIG.get("nama_masjid", "Masjid")
            data_update["alamat_masjid"] = CONFIG.get("alamat_masjid", "Lokasi")
            data_update["durasi_aktif"] = CONFIG.get("durasi_aktif", 15)
            data_update["selalu_aktif"] = CONFIG.get("selalu_aktif", True)
            data_update["tampilkan_jawa"] = CONFIG.get("tampilkan_jawa", True)
            data_update["metode"] = CONFIG.get("metode_kalender", "NASIONAL_MABIMS")
            data_update["display_settings"] = CONFIG.get("display_settings", {})
            data_update["keuangan"] = CONFIG.get("keuangan", {})
            data_update["lokasi"]["planetarium"] = posisi_tata_surya
            return data_update

    # 3. HITUNG ULANG JADWAL SHALAT (Cukup 1 Baris dengan Helper)
    kalkulasi_shalat = calculate_prayer_times_core(lat, lon, tz_offset, now)

    arah_kiblat = hitung_arah_kiblat(lat, lon)
    rashdul_harian = cari_rashdul_harian(lat, lon, tz_offset, now, arah_kiblat)

    data = {
        "nama_masjid": CONFIG.get("nama_masjid", "Masjid"),
        "alamat_masjid": CONFIG.get("alamat_masjid", "Lokasi"),
        "lokasi": {
            "nama": nama_lokasi,
            "lat": lat,
            "lon": lon,
            "koordinat": f"{lat}, {lon}",
            "kiblat": arah_kiblat,
            "rashdul_harian": rashdul_harian,
            "planetarium": posisi_tata_surya
        },
        "durasi_aktif": CONFIG.get("durasi_aktif", 15),
        "selalu_aktif": CONFIG.get("selalu_aktif", True),
        "tampilkan_jawa": CONFIG.get("tampilkan_jawa", True),
        "jadwal": kalkulasi_shalat["jadwal"], 
        "iqomah": kalkulasi_shalat["iqomah"],
        "is_jumat": kalkulasi_shalat["is_jumat"], 
        "jumat_config": kalkulasi_shalat["jumat_config"],
        "metode": CONFIG.get("metode_kalender", "NASIONAL_MABIMS"),
        "display_settings": CONFIG.get("display_settings", {}),
        "keuangan": CONFIG.get("keuangan", {})
    }

    if not tgl_manual:
        daily_cache["date"] = current_date_str
        daily_cache["data"] = data
        
    return data

# Fungsi untuk menghitung hari pasaran Jawa
def get_pasaran(dt):
    """Menghitung hari pasaran Jawa"""
    pasaran = ["Legi", "Pahing", "Pon", "Wage", "Kliwon"]
    # 1 Januari 1900 adalah hari Senin Pahing
    # Kita hitung selisih hari dari tanggal tersebut
    base_date = datetime(1900, 1, 1)
    delta_days = (dt - base_date).days
    
    # Karena 1 Jan 1900 adalah Pahing (indeks 1), kita tambah 1
    index = (delta_days + 1) % 5
    return pasaran[index]

# Fungsi untuk mengambil waktu shalat
def get_prayer_times_data():
    """Fungsi mandiri mesin audio untuk menghitung/mengambil jadwal"""
    global daily_cache
    now = datetime.now()
    today_str = now.strftime("%Y-%m-%d")

    # Jika TV Kiosk sudah nyala dan bikin cache, numpang ambil dari sana
    if daily_cache.get("date") == today_str and daily_cache.get("data"):
        return daily_cache["data"].get("jadwal")

    # Jika TV belum nyala, hitung mandiri menggunakan Helper Utama
    try:
        lokasi = get_current_location()
        kalkulasi = calculate_prayer_times_core(lokasi["lat"], lokasi["lon"], lokasi["tz"], now)
        return kalkulasi["jadwal"]
    except Exception as e:
        print(f"[AMaL System] ERROR Hitung Jadwal Audio: {e}")
        return None