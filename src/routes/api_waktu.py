import os
import json
import traceback
import threading
from flask import Blueprint, request, jsonify, send_from_directory, session
from datetime import datetime, timedelta
from skyfield.api import load, wgs84
from skyfield import almanac, eclipselib
import time

# Import otak hitungannya dari services
from src.services.astronomy import (
    load_config_waktu, get_current_location, get_daily_data, get_pasaran
)
from src.services.pembaca_kalender import get_hijri_from_json
from src.utils.logger import catat_log

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

api_waktu_bp = Blueprint('api_waktu', __name__)

# Variabel global untuk state hilal dan maintenance
is_hilal_generating = False
is_maintenance_running = False

# ========================================================
# Pindahkan rute-rute (1 sampai 8) ke bawah garis ini.
# Ingat: ganti @app.route menjadi @api_waktu_bp.route
# ========================================================

# Contoh:
# @api_waktu_bp.route('/get_data')
# def get_data():
#     tgl_simulasi = request.args.get('date')
#     return jsonify(get_daily_data(tgl_simulasi))

# GET DATA
@api_waktu_bp.route('/get_data')
def get_data():
    tgl_simulasi = request.args.get('date')
    return jsonify(get_daily_data(tgl_simulasi))

# Perhitungan kalender hari ini
@api_waktu_bp.route('/api/tanggal_sekarang')
def api_tanggal():
    """
    Rute REST API untuk pembaruan data dinamis tanpa memuat ulang (reload) halaman.
    """
    hari_ini = datetime.now()
    data = {
        "masehi": hari_ini.strftime("%Y-%m-%d"),
        "hijriah_lokal_mabims": get_hijri_from_json(hari_ini, "LOKAL_MABIMS"),
        "hijriah_lokal_wh": get_hijri_from_json(hari_ini, "LOKAL_WH"),
        "hijriah_nasional_mabims": get_hijri_from_json(hari_ini, "NASIONAL_MABIMS"),
        "hijriah_nasional_wh": get_hijri_from_json(hari_ini, "NASIONAL_WH"),
        "hijriah_khgt": get_hijri_from_json(hari_ini, "GLOBAL_KHGT"),
        "hari": hari_ini.strftime("%A"),
        "pasaran": get_pasaran(hari_ini)
    }
    return jsonify(data)

# Mengambil kalender jangkar
@api_waktu_bp.route('/api/kalender_jangkar/<int:tahun>')
def get_jangkar_json(tahun):
    print(f"==== MEMINTA DATA JANGKAR TAHUN {tahun} ====")
    global is_maintenance_running
    nama_file = f"kalender_jangkar_{tahun}.json"
    file_path = os.path.join(BASE_DIR, nama_file)
    
    force_build = request.args.get('force') == 'true'
    
    if not os.path.exists(file_path) or force_build:
        # Jika sedang dikerjakan oleh background worker, beri tahu JS
        if is_maintenance_running:
            return jsonify({"status": "processing", "msg": "Sistem sedang membangun kalender tahun depan di latar belakang..."}), 202
        
        # Jika dipanggil paksa via API (bukan oleh maintenance_worker)
        try:
            from src.services.generator_tahunan import generate_adaptif
            lokasi = get_current_location()
            generate_adaptif(tahun, lokasi["lat"], lokasi["lon"], lokasi["nama"])
        except Exception as e:
            # Jika error bisa dilihat penyebabnya di terminal
            print(f"\n[ERROR JANGKAR] Gagal membuat kalender: {e}\n")
            return jsonify({"error": str(e)}), 500
         
    return send_from_directory(BASE_DIR, nama_file)

# API UNTUK MANAJEMEN WAKTU SHALAT
@api_waktu_bp.route('/api/config_waktu', methods=['GET', 'POST'])
def api_config_waktu():
    config_path = os.path.join(BASE_DIR, 'static', 'json', 'config_waktu.json')
    
    if request.method == 'GET':
        cfg = load_config_waktu()
        return jsonify(cfg)
        
    if request.method == 'POST':
        # Proteksi: Hanya bisa disimpan jika sudah login
        if not session.get('logged_in'):
            return jsonify({"status": "error", "msg": "Akses Ditolak"}), 401
            
        data = request.json
        with open(config_path, 'w') as f:
            json.dump(data, f, indent=4)
            
        # Catat di audit trail
        username = session.get('username', 'Unknown')
        catat_log(username, "SISTEM", f"Mengubah Parameter Waktu & Iqomah (Metode: {data.get('metode_aktif')})")
        
        return jsonify({"status": "success", "msg": "✅ Pengaturan Waktu Berhasil Disimpan!"})
    
# API UNTUK RASHDUL QIBLAH
@api_waktu_bp.route('/api/rashdul_qiblah', methods=['GET'])
def api_rashdul_qiblah():
    try:
        # 1. Dapatkan zona waktu dan tahun berjalan
        config_path = os.path.join(BASE_DIR, 'config.json')
        with open(config_path, 'r') as f:
            cfg = json.load(f)
        
        tz_offset = cfg.get('manual_tz', 7)
        tahun_sekarang = datetime.now().year
        
        # 2. Setup Skyfield dan load data astronomi
        eph_path = os.path.join(BASE_DIR, 'de421.bsp')
        eph = load(eph_path)
        ts = load.timescale()
        
        bumi, matahari = eph['earth'], eph['sun']
        
        # --- PERBAIKAN DI SINI ---
        # kaaba_lokasi (Lokasi Murni) untuk meridian_transits
        # kaaba_vektor (Vektor Gabungan) untuk observasi altitudo
        kaaba_lokasi = wgs84.latlon(21.4225, 39.8262)
        kaaba_vektor = bumi + kaaba_lokasi
        # -------------------------
        
        # 3. Fungsi pencari kulminasi tertinggi (Sudah Anti-Error)
        def cari_transit_puncak(bulan, hari_start, hari_end):
            t0 = ts.utc(tahun_sekarang, bulan, hari_start)
            t1 = ts.utc(tahun_sekarang, bulan, hari_end)
            
            f_transit = almanac.meridian_transits(eph, matahari, kaaba_lokasi)
            t_transit, y_transit = almanac.find_discrete(t0, t1, f_transit)
            
            # --- PENANGANAN SINGLE vs ARRAY TIME ---
            daftar_waktu = []
            daftar_status = []
            
            try:
                # Coba cek apakah ini array (bisa dihitung panjangnya)
                panjang = len(t_transit)
                for i in range(panjang):
                    daftar_waktu.append(t_transit[i])
                    # Handle array y_transit (bisa numpy array atau list)
                    try:
                        daftar_status.append(y_transit[i])
                    except:
                        daftar_status.append(y_transit)
            except ValueError:
                # Jika error ValueError ("this is a single Time..."), berarti ini waktu tunggal
                daftar_waktu.append(t_transit)
                daftar_status.append(y_transit)
            # ---------------------------------------
            
            max_alt = 0
            best_time = None
            
            # Looping aman menggunakan daftar yang sudah distandardisasi
            for i in range(len(daftar_waktu)):
                t_single = daftar_waktu[i]
                y_val = daftar_status[i]
                
                if y_val == 1: # y==1 artinya transit atas (Matahari di puncak)
                    astrometric = kaaba_vektor.at(t_single).observe(matahari)
                    alt, az, distance = astrometric.apparent().altaz()
                    
                    if alt.degrees > max_alt:
                        max_alt = alt.degrees
                        best_time = t_single
                        
            return best_time

        # Rashdul Qiblah selalu terjadi sekitar 27-28 Mei dan 15-16 Juli
        waktu_mei = cari_transit_puncak(5, 26, 29)
        waktu_juli = cari_transit_puncak(7, 14, 17)
        
        # 4. Konversi ke waktu lokal Kiosk
        def format_waktu(t_obj):
            if t_obj is None: return None
            dt_utc = t_obj.utc_datetime()
            dt_lokal = dt_utc + timedelta(hours=tz_offset)
            return dt_lokal.strftime("%Y-%m-%d %H:%M:%S")

        return jsonify({
            "status": "success",
            "tahun": tahun_sekarang,
            "tz_offset": tz_offset,
            "peristiwa": {
                "mei": format_waktu(waktu_mei),
                "juli": format_waktu(waktu_juli)
            }
        })
    except Exception as e:
        # Menambahkan traceback di terminal agar mudah dilacak jika error lagi
        traceback.print_exc()
        return jsonify({"status": "error", "msg": str(e)}), 500
    
# API UNTUK GERHANA MATAHARI DAN BULAN
@api_waktu_bp.route('/api/gerhana', methods=['GET'])
def api_gerhana():
    try:
        # 1. Ambil Koordinat Terpusat
        lokasi = get_current_location()
        lat, lon, tz_offset = lokasi["lat"], lokasi["lon"], lokasi["tz"]
        tahun_sekarang = datetime.now().year
        
        # 2. Setup Vektor Pengamat (Lokasi Masjid)
        eph_path = os.path.join(BASE_DIR, 'de421.bsp')
        eph = load(eph_path)
        ts = load.timescale()
        bumi = eph['earth']
        
        masjid_lokasi = wgs84.latlon(lat, lon)
        masjid_vektor = bumi + masjid_lokasi
        
        t0 = ts.utc(tahun_sekarang, 1, 1)
        t1 = ts.utc(tahun_sekarang + 5, 12, 31)
        
        daftar_gerhana = []

        # Fungsi pembantu format waktu lokal
        def format_waktu(t_obj):
            dt_lokal = t_obj.utc_datetime() + timedelta(hours=tz_offset)
            return dt_lokal.strftime("%Y-%m-%d %H:%M:%S")

        # ==========================================
        # 3. DETEKSI GERHANA BULAN (KHUSUF)
        # ==========================================
        t_lunar, y_lunar, _ = eclipselib.lunar_eclipses(t0, t1, eph)
        
        # Mengubah Single Time menjadi List (Anti-Error Skyfield)
        if not hasattr(t_lunar, '__len__'):
            t_lunar, y_lunar = [t_lunar], [y_lunar]
            
        for i in range(len(t_lunar)):
            ti = t_lunar[i]
            yi = y_lunar[i]
            
            # Cek Visibilitas: Apakah Bulan berada di atas ufuk (horizon) masjid saat itu?
            alt, _, _ = masjid_vektor.at(ti).observe(eph['moon']).apparent().altaz()
            
            if alt.degrees > 0: # Jika derajatnya positif, berarti terlihat!
                # Kode Skyfield Lunar: 0=Penumbra, 1=Sebagian, 2=Total
                tipe_nama = ["Penumbra", "Sebagian", "Total"][int(yi)]
                daftar_gerhana.append({
                    "jenis": "Bulan",
                    "tipe": tipe_nama,
                    "waktu": format_waktu(ti)
                })

        # ==========================================
        # 4. DETEKSI GERHANA MATAHARI (KUSUF) LOKAL
        # ==========================================
        # Gerhana matahari LOKAL dideteksi dengan mencari fase Bulan Baru (Ijtima')
        fase_t, fase_y = almanac.find_discrete(t0, t1, almanac.moon_phases(eph))
        
        # Anti-Error jika hanya ada 1 waktu
        if not hasattr(fase_t, '__len__'):
            fase_t, fase_y = [fase_t], [fase_y]
            
        for ti, yi in zip(fase_t, fase_y):
            if yi == 0: # 0 = New Moon (Fase Bulan Baru), syarat mutlak Kusuf
                # Cek dari sudut pandang Masjid Anda
                sun_obs = masjid_vektor.at(ti).observe(eph['sun']).apparent()
                moon_obs = masjid_vektor.at(ti).observe(eph['moon']).apparent()
                
                alt_sun = sun_obs.altaz()[0].degrees
                sep = sun_obs.separation_from(moon_obs).degrees
                
                # Jika jarak titik pusat < 0.55 derajat (Piringan saling menutupi)
                # DAN Matahari berada di atas ufuk (Terlihat dari masjid / siang hari)
                if sep < 0.55 and alt_sun > 0:
                    tipe_nama = "Sebagian"
                    if sep < 0.1: # Jika jarak pusat sangat dekat
                        tipe_nama = "Total / Cincin"
                        
                    daftar_gerhana.append({
                        "jenis": "Matahari",
                        "tipe": tipe_nama,
                        "waktu": format_waktu(ti)
                    })

        return jsonify({
            "status": "success",
            "tahun": tahun_sekarang,
            "data": daftar_gerhana
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({"status": "error", "msg": str(e)}), 500
    
# API UNTUK RUKYATUL HILAL
# Variabel global sebagai penanda agar mesin tidak merender ganda
is_hilal_generating = False
@api_waktu_bp.route('/api/hilal', methods=['GET'])
def api_hilal():
    global is_hilal_generating
    try:
        # 1. Jalankan Tukang Sapu Otomatis (bersihkan cache > 30 hari)
        try:
            from src.services.hilal_engine import bersihkan_cache_tahunan
            bersihkan_cache_tahunan()
        except: pass

        # =======================================================
        # 2. CARI TARGET TANGGAL IJTIMA TERDEKAT (MENDUKUNG SIMULASI)
        # =======================================================
        req_date_str = request.args.get('date')
        if req_date_str:
            try:
                # Jika Kiosk mengirimkan tanggal simulasi, gunakan itu
                sekarang = datetime.strptime(req_date_str, '%Y-%m-%d')
            except ValueError:
                sekarang = datetime.now()
        else:
            # Jika tidak ada simulasi (berjalan normal), gunakan waktu asli server
            sekarang = datetime.now()
        # =======================================================

        from src.services.generator_tahunan import get_semua_ijtima_tahunan, load_kriteria_config
        
        ijtima_tahun_ini = get_semua_ijtima_tahunan(sekarang.year)
        ijtima_terdekat = min(ijtima_tahun_ini, key=lambda x: abs((x.utc_datetime().replace(tzinfo=None) - sekarang).total_seconds()))
        
        dt_ijtima = ijtima_terdekat.utc_datetime()
        target_date = datetime(dt_ijtima.year, dt_ijtima.month, dt_ijtima.day)
        
        # Hitung selisih hari
        selisih_hari = abs((target_date - sekarang).days)
        
        # Jika bukan H-4 dari Ijtima, matikan fitur hilal
        if selisih_hari > 5:
            return jsonify({
                "status": "inactive", 
                "msg": "Bukan masa rukyat",
                "target_date": target_date.strftime("%Y-%m-%d"), # BOCORAN TANGGAL UNTUK SIMULASI
                "tgl_ijtima_terdekat": ijtima_terdekat.utc_datetime().strftime("%Y-%m-%d %H:%M:%S") # BOCORAN TANGGAL UNTUK SIMULASI
            })

        # 3. Cek apakah laporan JSON sudah ter-update untuk hari ini
        # config_kriteria = load_kriteria_config()
        laporan_path = os.path.join(BASE_DIR, 'static', 'json', 'laporan_hilal_current.json')
        
        butuh_update = True
        if os.path.exists(laporan_path):
            with open(laporan_path, 'r') as f:
                data_lama = json.load(f)
                tgl_laporan = data_lama.get("metadata", {}).get("tanggal_pengamatan")
                
                # Jika tanggal di laporan sudah sama dengan tanggal target ijtima, berarti sudah siap!
                if tgl_laporan == target_date.strftime("%Y-%m-%d"):
                    butuh_update = False
                    return jsonify({"status": "success", "data": data_lama})

        # 4. Jika butuh update (file belum ada / masih pakai tanggal lama)
        if butuh_update:
            if is_hilal_generating:
                return jsonify({"status": "processing", "msg": "Sedang merender peta (estimasi 5-10 menit)..."})
            
            # AMBIL KOORDINAT TERPUSAT
            lokasi = get_current_location()
            lat, lon, kota = lokasi["lat"], lokasi["lon"], lokasi["nama"]

            # PEKERJA LATAR BELAKANG (THREAD)
            def background_worker():
                global is_hilal_generating
                is_hilal_generating = True
                print(f"[AMaL Hilal Engine] Memulai render background untuk {target_date.strftime('%Y-%m-%d')}...")
                try:
                    from src.services.hilal_engine import generate_laporan_harian, generate_peta_kontur
                    generate_laporan_harian(target_date, lat, lon, kota, ijtima_terdekat)
                    generate_peta_kontur(target_date, dt_ijtima.timestamp(), lat, lon, kota)
                    print("[AMaL Hilal Engine] Render background SELESAI!")
                except Exception as e:
                    print(f"[AMaL Hilal Engine] ERROR Render: {e}")
                finally:
                    is_hilal_generating = False

            # Nyalakan thread agar berjalan tanpa memblokir server Flask
            thread = threading.Thread(target=background_worker)
            thread.start()
            
            return jsonify({"status": "processing", "msg": "Proses render dimulai di latar belakang..."})

    except Exception as e:
        traceback.print_exc()
        return jsonify({"status": "error", "msg": str(e)}), 500

# --- ENDPOINT SINKRONISASI WAKTU ANTAR MONITOR ---
# digunakan untuk menyamakan waktu antar monitor agar antar monitor dapat menampilkan waktu yang sama
@api_waktu_bp.route('/api/sync_waktu')
def sync_waktu():
    # Mengembalikan waktu server saat ini dalam satuan milidetik (millisecond)
    waktu_server_ms = int(time.time() * 1000)
    return jsonify({"server_time": waktu_server_ms})
