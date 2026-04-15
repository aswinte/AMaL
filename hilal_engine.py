import json
import os
import csv
import time
import multiprocessing
import numpy as np
import matplotlib
matplotlib.use('Agg')
from scipy.interpolate import griddata
import cartopy.io.shapereader as shpreader
from datetime import datetime, timezone, timedelta
import glob
import shutil
import re

# Mengimpor fungsi dari mesin utama
from generator_tahunan import (
    load_kriteria_config, get_semua_ijtima_tahunan, core_hitung_hilal, get_hijri_month_name, generate_adaptif
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_IMG_DIR = os.path.join(BASE_DIR, 'static', 'images')
STATIC_JSON_DIR = os.path.join(BASE_DIR, 'static', 'json')
CACHE_DIR = os.path.join(BASE_DIR, 'cache')

os.makedirs(STATIC_IMG_DIR, exist_ok=True)
os.makedirs(STATIC_JSON_DIR, exist_ok=True)
os.makedirs(CACHE_DIR, exist_ok=True)

# =========================================================
# INISIALISASI MULTIPROCESSING AMAN (WORKER)
# =========================================================
w_eph = None
w_ts = None

def init_worker():
    """Menginisialisasi ephemeris khusus untuk setiap core prosesor"""
    global w_eph, w_ts
    from skyfield.api import load
    bsp_path = os.path.join(BASE_DIR, 'de421.bsp')
    w_eph = load(bsp_path)
    w_ts = load.timescale()

def worker_hitung_hilal(koordinat):
    """Pekerja komputasi untuk Grid Kasar (Kini menggunakan fungsi inti terpusat)"""
    global w_eph, w_ts
    lat, lon, date_dt = koordinat
    
    # 1. Panggil fungsi inti, tapi "SUNTIKKAN" eph dan ts khusus milik worker ini!
    alt_geo, elong_geo, t_sunset = core_hitung_hilal(date_dt, lat, lon, w_eph, w_ts)
    
    # 2. Lakukan konversi Unix Timestamp seperti biasa
    if t_sunset is None:
        return lat, lon, -99, -99, -99
        
    dt_sunset = t_sunset.utc_datetime()
    unix_sunset = dt_sunset.timestamp()
    
    return lat, lon, alt_geo, elong_geo, unix_sunset

# =========================================================
# FUNGSI PETA & CACHE YANG DIPERBARUI
# =========================================================
def generate_peta_kontur(date_dt, ijtima_unix, lat_lokal, lon_lokal, kota):
    print(f"\n[1] Merender Peta Kontur Terselerasi untuk {date_dt.strftime('%d-%m-%Y')}...")
    
    config = load_kriteria_config()
    k_aktif = config["kriteria"]
    val_wh_alt = k_aktif["WH"]["alt"]
    val_mabims_alt = k_aktif["MABIMS"]["alt"]
    val_mabims_elong = k_aktif["MABIMS"]["elong"]
    val_khgt_alt = k_aktif["KHGT"]["alt"]
    val_khgt_elong = k_aktif["KHGT"]["elong"]
    
    str_tanggal = date_dt.strftime('%Y%m%d')
    versi_algo = config["versi_algoritma"].replace(".", "_")

    kota_aman = "".join([c if c.isalnum() else "_" for c in kota])
    
    file_npz = os.path.join(CACHE_DIR, f"data_hilal_{str_tanggal}_v{versi_algo}.npz")
    file_csv = os.path.join(CACHE_DIR, f"data_hilal_{str_tanggal}_v{versi_algo}.csv")
    #file_png = os.path.join(CACHE_DIR, f"peta_hilal_{str_tanggal}_v{versi_algo}.png") # Nama file peta unik
    file_png = os.path.join(CACHE_DIR, f"peta_hilal_{str_tanggal}_{kota_aman}_v{versi_algo}.png")

    # Grid Resolusi 0.5 Derajat
    lats_05deg = np.arange(-90, 90.1, 0.5)
    lons_05deg = np.arange(-180, 180.1, 0.5)
    LONS_05DEG, LATS_05DEG = np.meshgrid(lons_05deg, lats_05deg)

    print(f"\n[1] Memproses Data & Peta untuk {date_dt.strftime('%d-%m-%Y')}...")

    if os.path.exists(file_npz):
        print(f"    -> [CACHE MEMORY] Memuat data dari cache lokal... (Instant!)")
        data_cache = np.load(file_npz)
        ALT_05DEG= data_cache['ALT']
        ELONG_05DEG = data_cache['ELONG']
        WAKTU_05DEG = data_cache.get('WAKTU', np.full(ALT_05DEG.shape, -99)) # Pakai .get() agar tidak error jika load cache lama
        LONS_05DEG = data_cache['LON']
        LATS_05DEG = data_cache['LAT']
    else:
        # print("    -> Menghitung Alt & Elong dengan Multiprocessing (Estimasi < 30 detik)...")
        print("    -> Menghitung Alt & Elong dengan Multiprocessing...")
        # 1. Bangun Grid Kasar
        step = 5
        lats_kasar = np.arange(-90, 91, step)
        lons_kasar = np.arange(-180, 181, step)
        titik_koordinat = [(lat, lon, date_dt) for lat in lats_kasar for lon in lons_kasar]
        
        # 2. Hitung Paralel
        # hasil_alt = np.zeros((len(lats_kasar), len(lons_kasar)))
        # hasil_elong = np.zeros((len(lats_kasar), len(lons_kasar)))

        # Deteksi total core yang dimiliki perangkat (Laptop = 8, RasPi = 4)
        total_core = os.cpu_count()
        
        # Rumus Aman: Gunakan total core dikurangi 2 (Minimal selalu gunakan 1)
        # Jika di RasPi (4 core), maka ia pakai 2. Jika di Laptop (8 core), maka ia pakai 6.
        core_dipakai = max(1, total_core - 2) 
        
        print(f"-> Memulai komputasi paralel menggunakan {core_dipakai} dari {total_core} CPU Core...")
        
        with multiprocessing.Pool(processes=core_dipakai, initializer=init_worker) as pool:
            results = pool.map(worker_hitung_hilal, titik_koordinat)

        # -----------------------------
        # 3. Kumpulkan HANYA data yang valid (Ada Sunset)
        titik_valid = []
        alt_valid = []
        elong_valid = []
        waktu_valid = []

        for lat, lon, alt, elong, unix_sunset in results:
            if alt is not None and alt != -99:
                titik_valid.append((lon, lat)) # Perhatikan urutannya: Lon (X), Lat (Y)
                alt_valid.append(alt)
                elong_valid.append(elong)
                waktu_valid.append(unix_sunset) # Buka komentar ini jika butuh

        # 4. Interpolasi Cerdas ke Resolusi 0.5 Derajat (Abaikan Kutub)
        print("    -> Melakukan interpolasi Griddata ke grid 0.5 derajat...")
        ALT_05DEG = griddata(titik_valid, alt_valid, (LONS_05DEG, LATS_05DEG), method='cubic', fill_value=-99)
        ELONG_05DEG = griddata(titik_valid, elong_valid, (LONS_05DEG, LATS_05DEG), method='cubic', fill_value=-99)
        WAKTU_05DEG = griddata(titik_valid, waktu_valid, (LONS_05DEG, LATS_05DEG), method='cubic', fill_value=-99)
        # -----------------------------
        
        # 5. Tulis Metadata dan CSV
        with open(file_csv, mode='w', newline='', encoding='utf-8') as f_csv:
            writer = csv.writer(f_csv)
            writer.writerow([f"# METADATA LAPORAN HILAL AMaL (TERAKSELERASI)"])
            writer.writerow([f"# Tanggal Ijtima/Observasi : {date_dt.strftime('%Y-%m-%d')}"])
            writer.writerow([f"# Versi Algoritma          : {config['versi_algoritma']}"])
            writer.writerow([f"# Kriteria MABIMS          : Alt {val_mabims_alt}°, Elong {val_mabims_elong}°"])
            writer.writerow([f"# Kriteria KHGT            : Alt {val_khgt_alt}°, Elong {val_khgt_elong}°"])
            writer.writerow([f"# Kriteria Wujudul Hilal   : Alt > {val_wh_alt}°"])
            writer.writerow([])
            writer.writerow(['Latitude', 'Longitude', 'Altitude(deg)', 'Elongation(deg)', 'Sunset_Unix', 'Sunset_UTC'])
            for i in range(len(lats_05deg)):
                for j in range(len(lons_05deg)):
                    u_ts = WAKTU_05DEG[i, j]
                    # Konversi Unix ke String jam (Hanya jika bukan -99)
                    str_utc = "-"
                    if u_ts != -99:
                        str_utc = datetime.fromtimestamp(u_ts, tz=timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
                    writer.writerow([
                        lats_05deg[i], 
                        lons_05deg[j], 
                        round(ALT_05DEG[i, j], 4), 
                        round(ELONG_05DEG[i, j], 4), 
                        round(u_ts, 2), # Unix Timestamp
                        str_utc        # Readable UTC
                    ])
                    
        np.savez(file_npz, 
            LAT=LATS_05DEG, 
            LON=LONS_05DEG, 
            ALT=ALT_05DEG, 
            ELONG=ELONG_05DEG, 
            WAKTU=WAKTU_05DEG, 
            tanggal_ijtima=date_dt.strftime('%Y-%m-%d'),
            versi=config['versi_algoritma'])
        
        print(f"    -> [DATA DISIMPAN] Laporan CSV terekspor: {file_csv}")

# =========================================================
    # MERENDER GAMBAR & SINKRONISASI KE STATIC UI
    # =========================================================
    import shutil # Panggil pustaka penyalin file OS
    peta_terbaru_ui = os.path.join(STATIC_IMG_DIR, 'peta_hilal_current.png')

    if os.path.exists(file_png):
        print(f"    -> [CACHE] Peta sudah tersedia: {os.path.basename(file_png)}")
        # Wajib salin file dari cache ke Static UI agar layar TV Kiosk ter-update!
        try:
            shutil.copy2(file_png, peta_terbaru_ui)
            print("    -> [SYNC] Layar Kiosk disinkronkan dari Cache.")
        except Exception as e:
            print(f"    -> [ERROR] Gagal menyalin peta ke UI: {e}")
    else:
        print("    -> Merender peta baru ke cache (Tema Gelap Ekstrem)...")
        import matplotlib.pyplot as plt
        import cartopy.crs as ccrs
        import cartopy.feature as cfeature
        from matplotlib.lines import Line2D
        
        plt.style.use('dark_background')
        
        grid_lon, grid_lat = LONS_05DEG, LATS_05DEG
        alt_draw, elong_draw = ALT_05DEG, ELONG_05DEG

        # --- Hitung Unix Timestamp untuk 00:00 UTC Hari Berikutnya ---
        besok = date_dt + timedelta(days=1)
        batas_utc_dt = datetime(besok.year, besok.month, besok.day, 0, 0, 0, tzinfo=timezone.utc)
        batas_utc_unix = batas_utc_dt.timestamp()

        # Deteksi nilai maksimum dinamis untuk gradasi warna
        max_alt_draw = np.ceil(np.max(alt_draw))
        level_dinamis = np.arange(0, max_alt_draw + 3, 1)

        fig = plt.figure(figsize=(15, 8), facecolor='#121212')
        ax = plt.axes(projection=ccrs.PlateCarree())
        ax.set_facecolor('#121212')
        
        # Layer Bawah (Geografi)
        ax.add_feature(cfeature.LAND, facecolor='#2A2A2A', zorder=0) 
        ax.add_feature(cfeature.OCEAN, facecolor='#181818', zorder=0) 
        
        # --- Highlight Wilayah Indonesia ---
        try:
            shpfilename = shpreader.natural_earth(resolution='110m', category='cultural', name='admin_0_countries')
            reader = shpreader.Reader(shpfilename)
            indo_geoms = [
                record.geometry for record in reader.records() 
                if record.attributes.get('NAME') == 'Indonesia' or record.attributes.get('ADMIN') == 'Indonesia'
            ]
            if indo_geoms:
                ax.add_geometries(indo_geoms, ccrs.PlateCarree(), 
                                  facecolor="#77DE71", edgecolor="#7CF97A",
                                  linewidth=1, alpha=1, zorder=0.5)
        except Exception as e:
            print(f"    -> [WARNING] Gagal mewarnai wilayah Indonesia: {e}")

        # Layer Tengah (Gradasi Altitude)
        contour = ax.contourf(grid_lon, grid_lat, alt_draw, 
                              levels=level_dinamis, cmap='magma', alpha=0.45, 
                              transform=ccrs.PlateCarree(), zorder=1)
        
        # Layer Atas (Batas Negara/Pantai)
        ax.add_feature(cfeature.COASTLINE, linewidth=1.0, edgecolor='#DDDDDD', alpha=0.8, zorder=5) 
        ax.add_feature(cfeature.BORDERS, linewidth=0.5, linestyle=':', edgecolor='#BBBBBB', alpha=0.7, zorder=5)
        
        cbar = plt.colorbar(contour, pad=0.02)
        cbar.ax.yaxis.set_tick_params(color='white', labelcolor='white')
        cbar.set_label('Ketinggian Hilal (Derajat)', color='white')

        # =========================================================
        # PENGGAMBARAN GARIS KRITERIA
        # =========================================================
        alt_garis = np.where(alt_draw == -99, np.nan, alt_draw)
        elong_garis = np.where((ELONG_05DEG == -99) | (WAKTU_05DEG <= ijtima_unix), np.nan, ELONG_05DEG)
        waktu_garis = np.where(WAKTU_05DEG == -99, np.nan, WAKTU_05DEG)

        # Gambar Kontur (Wujudul Hilal & MABIMS)
        ax.contour(grid_lon, grid_lat, alt_garis, levels=[val_wh_alt], colors='#FF3333', linewidths=1.5, transform=ccrs.PlateCarree(), zorder=2)
        ax.contour(grid_lon, grid_lat, alt_garis, levels=[val_mabims_alt], colors="#40E712", linewidths=1.5, transform=ccrs.PlateCarree(), zorder=2)
        ax.contour(grid_lon, grid_lat, elong_garis, levels=[val_mabims_elong], colors='#40E712', linewidths=1.0, linestyles='dashed', transform=ccrs.PlateCarree(), zorder=2)
        
        # Gambar Kontur (KHGT)
        ax.contour(grid_lon, grid_lat, alt_garis, levels=[val_khgt_alt], colors='#3399FF', linewidths=1.5, transform=ccrs.PlateCarree(), zorder=2)
        ax.contour(grid_lon, grid_lat, elong_garis, levels=[val_khgt_elong], colors='#3399FF', linewidths=1.0, linestyles='dashed', transform=ccrs.PlateCarree(), zorder=2)

        # Garis Pembatas 00:00 UTC (Warna Emas, Dotted)
        ax.contour(grid_lon, grid_lat, waktu_garis, levels=[batas_utc_unix], colors='gold', linewidths=1.0, linestyles='dotted', transform=ccrs.PlateCarree(), zorder=3)

        # Titik Lokasi Kiosk
        ax.plot(lon_lokal, lat_lokal, marker='*', color='#FF0000', markersize=6, transform=ccrs.PlateCarree(), zorder=6)
        ax.text(lon_lokal + 2, lat_lokal, kota, color='#FF0000', fontsize=8, fontweight='bold', transform=ccrs.PlateCarree(), zorder=6)

        # =========================================================
        # LEGENDA DAN FINISHING
        # =========================================================
        custom_lines = [
            Line2D([0], [0], color='#FF3333', lw=1.5),
            Line2D([0], [0], color='#40E712', lw=1.5),
            Line2D([0], [0], color='#40E712', lw=1.0, linestyle='dashed'),
            Line2D([0], [0], color='#3399FF', lw=1.5),
            Line2D([0], [0], color='#3399FF', lw=1.0, linestyle='dashed'),
            Line2D([0], [0], color='gold', lw=1.0, linestyle='dotted')
        ]
        
        legend = ax.legend(custom_lines, 
                  [f'WH Alt ({val_wh_alt}°)', 
                   f'MABIMS Alt ({val_mabims_alt}°)', f'MABIMS Elong ({val_mabims_elong}°)', 
                   f'KHGT Alt ({val_khgt_alt}°)', f'KHGT Elong ({val_khgt_elong}°)',
                   'Batas Normal KHGT (00:00 UTC)'],
                  loc='lower left', framealpha=0.8, facecolor='#1E1E1E', edgecolor='#333333')
        for text in legend.get_texts(): text.set_color("white"), text.set_fontsize(6)

        ax.set_title(f"Peta Visibilitas Hilal Global - {date_dt.strftime('%d %b %Y')}", pad=15, fontsize=16, fontweight='bold', color='white')
        
        gl = ax.gridlines(draw_labels=True, linestyle='--', alpha=0.3, color='#888888', zorder=0)
        gl.top_labels = False; gl.right_labels = False
        gl.xlabel_style = {'color': 'white'}; gl.ylabel_style = {'color': 'white'}

        # 1. Simpan gambar dari memori (Matplotlib) ke file Cache (Hanya dirender 1x)
        plt.savefig(file_png, bbox_inches='tight', dpi=150, facecolor=fig.get_facecolor(), edgecolor='none')
        plt.close()
        print(f"[OK] Peta arsip berhasil dirender dan disimpan ke cache: {file_png}")

        # 2. Salin file cache yang baru saja jadi tersebut ke Static UI (Kecepatan 0.01 detik)
        try:
            shutil.copy2(file_png, peta_terbaru_ui)
            print("    -> [SYNC] Layar Kiosk berhasil diperbarui dengan peta baru.")
        except Exception as e:
            print(f"    -> [ERROR] Gagal menyalin peta baru ke UI: {e}")

# Baca langsung dari kalender_jangkar
def generate_laporan_harian(date_dt, lat_lokal, lon_lokal, kota, t_ijtima_terdekat=None):
    print(f"\n[2] Mengekstrak Laporan Hisab Harian untuk {date_dt.strftime('%d-%m-%Y')}...")
    
    tahun = date_dt.year
    file_kalender = os.path.join(BASE_DIR, f"kalender_jangkar_{tahun}.json")
    
    # 1. Pastikan file kalender tahunan sudah ada, jika belum, buat dulu!
    if not os.path.exists(file_kalender):
        print(f"    -> Kalender {tahun} belum ada. Melakukan komputasi setahun penuh...")
        generate_adaptif(tahun, lat_lokal, lon_lokal, kota)

    # 2. Buka dan baca JSON kalender
    with open(file_kalender, 'r') as f:
        data_kalender = json.load(f)
        
    # 3. Cari bulan yang sesuai dengan Ijtima saat ini
    nama_bulan_target = get_hijri_month_name(date_dt)
    data_bulan_ini = None
    
    for bulan in data_kalender.get("jangkar_bulan", []):
        if bulan["bulan_hijriah"] == nama_bulan_target:
            data_bulan_ini = bulan
            break
            
    if not data_bulan_ini:
        print(f"[!] Error: Data untuk {nama_bulan_target} tidak ditemukan di kalender.")
        return

    # 4. Ekstrak data yang sudah matang dari JSON
    k = data_bulan_ini["keputusan_metode"]
    
    laporan = {
        "metadata": {
            "tanggal_pengamatan": date_dt.strftime("%Y-%m-%d"),
            "lokasi": {"kota": kota, "lat": lat_lokal, "lon": lon_lokal},
            "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        },
        "data_lokal": {
            "tinggi_hilal": k["LOKAL_MABIMS"]["alt"],
            "elongasi": k["LOKAL_MABIMS"].get("elong", 0.0), # Mengambil parameter yang baru ditambahkan
            "status_mabims": "Memenuhi" if k["LOKAL_MABIMS"]["status"] == "Sukses" else "Belum Memenuhi",
            "status_wh": "Wujud" if k["LOKAL_WH"]["status"] == "Sukses" else "Di Bawah Ufuk"
        },
        "data_nasional": {
            "mabims_sukses": True if k["NASIONAL_MABIMS"]["status"] == "Sukses" else False,
            "wh_sukses": True if k["NASIONAL_WH"]["status"] == "Sukses" else False
        },
        "data_global": {
            "khgt_sukses": True if k["GLOBAL_KHGT"]["status"] == "Sukses" else False
        }
    }

    # 5. Simpan ke Laporan Harian
    nama_json = os.path.join(STATIC_JSON_DIR, 'laporan_hilal_current.json')
    with open(nama_json, 'w') as f:
        json.dump(laporan, f, indent=4)
        
    print(f"[OK] Laporan Hisab berhasil diekstrak dan disimpan: {nama_json}")

    # 6. SALIN PETA DARI CACHE UNTUK TAMPILAN KIOSK UI
    config = load_kriteria_config()
    str_tanggal = date_dt.strftime('%Y%m%d')
    versi_algo = config["versi_algoritma"].replace(".", "_")
    
    # Rangkai nama file di cache yang seharusnya sudah dibuat oleh V3.0
    file_png_cache = os.path.join(CACHE_DIR, f"peta_hilal_{str_tanggal}_{kota}_v{versi_algo}.png")
    peta_terbaru_ui = os.path.join(STATIC_IMG_DIR, 'peta_hilal_current.png')
    
    # Cek apakah peta di cache benar-benar ada
    if os.path.exists(file_png_cache):
        # Menggunakan copy2 agar metadata file (tanggal dibuat, dll) tetap dipertahankan
        shutil.copy2(file_png_cache, peta_terbaru_ui)
        print(f"[OK] Peta arsip berhasil disalin untuk tampilan UI.")
    else:
        print(f"[!] Peringatan: Peta arsip tidak ditemukan di {file_png_cache}")
        # Jika Anda ingin lebih aman, Anda bisa menyuruh sistem untuk memanggil 
        # fungsi generate_peta_kontur() di sini jika ternyata file-nya benar-benar hilang.

def bersihkan_cache_tahunan(tahun_aktif=None):
    # Jika tahun tidak didefinisikan, gunakan tahun sistem saat ini
    if tahun_aktif is None:
        tahun_aktif = datetime.now().year
        
    print(f"\n[0] Membersihkan cache di luar ekosistem kalender tahun {tahun_aktif}...")
    
    # Menetapkan Jendela Aman (Safe Window)
    # Menyisakan waktu 2 bulan di akhir tahun lalu (Nov & Des) 
    # dan 2 bulan di awal tahun depan (Jan & Feb) untuk jangkar Ijtima
    batas_awal = datetime(tahun_aktif - 1, 11, 1)
    batas_akhir = datetime(tahun_aktif + 1, 3, 1)
    
    # Regex untuk menangkap teks 8 digit angka YYYYMMDD di antara underscore '_'
    pola_tanggal = re.compile(r"_(\d{8})_v")
    
    files = glob.glob(os.path.join(CACHE_DIR, '*'))
    
    for f in files:
        if not os.path.isfile(f):
            continue
            
        nama_file = os.path.basename(f)
        cocok = pola_tanggal.search(nama_file)
        
        if cocok:
            # --- 1. Logika Berdasarkan Tahun Jangkar ---
            str_tanggal = cocok.group(1)
            try:
                tanggal_target = datetime.strptime(str_tanggal, "%Y%m%d")
                
                # Hapus jika Ijtima terjadi sebelum batas awal ATAU sesudah batas akhir
                if tanggal_target < batas_awal or tanggal_target >= batas_akhir:
                    os.remove(f)
                    print(f"    -> [DELETED] Cache usang (di luar {tahun_aktif}) dihapus: {nama_file}")
            except ValueError:
                pass # Abaikan jika gagal di-parsing
                
        else:
            # --- 2. Logika Pembersihan File Yatim Piatu (Orphan Files) ---
            # Menghapus file aneh/tidak sesuai format nama yang usianya lebih dari 30 hari
            skrg = time.time()
            batas_waktu_orphan = skrg - (30 * 86400) # 86400 detik = 1 hari
            if os.path.getmtime(f) < batas_waktu_orphan:
                os.remove(f)
                print(f"    -> [DELETED] File orphan/tak dikenal dihapus: {nama_file}")
                
    print("    -> Pembersihan cache selesai.")

if __name__ == "__main__":
    # Koordinat diatur otomatis 
    LAT_LOKAL = -7.4589
    LON_LOKAL = 109.2882
    KOTA = "Sokaraja"

    print(f"=== MEMULAI AMaL NIGHTLY ENGINE (ACCELERATED) ===")
    bersihkan_cache_tahunan()
    
    sekarang = datetime.now()
    ijtima_tahun_ini = get_semua_ijtima_tahunan(sekarang.year)
    ijtima_terdekat = min(ijtima_tahun_ini, key=lambda x: abs((x.utc_datetime().replace(tzinfo=None) - sekarang).total_seconds()))
    
    dt_ijtima = ijtima_terdekat.utc_datetime()
    TARGET_DATE = datetime(dt_ijtima.year, dt_ijtima.month, dt_ijtima.day)
    
    selisih_hari = abs((TARGET_DATE - sekarang).days)
    
    if selisih_hari <= 5:
        print(f"\n[!] MASA RUKYATUL HILAL TERDETEKSI (Target Pengamatan: {TARGET_DATE.strftime('%d %b %Y')})")
        # Fungsi di-bypass untuk keperluan tes kerangka
        generate_laporan_harian(TARGET_DATE, LAT_LOKAL, LON_LOKAL, KOTA, ijtima_terdekat)
        # generate_peta_kontur(TARGET_DATE, LAT_LOKAL, LON_LOKAL, KOTA)
        print("=== PROSES SELESAI & UPDATE BERHASIL ===")
    else:
        print(f"\n[zZz] Bukan masa Rukyatul Hilal (Ijtima terdekat: {dt_ijtima.strftime('%d %b %Y')}). Mesin kembali tidur.")
        print("=== SELESAI ===")