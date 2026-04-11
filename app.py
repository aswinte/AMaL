# AMaL: (A)njungan (M)asjid bebas-terbuk(a)/(L)ibre
# Setup
import json
import math
import os
import shutil
import time
import traceback
import logging
from flask import Flask, render_template, send_from_directory, jsonify, request, session, redirect, url_for
from datetime import datetime, timedelta
from adhanpy.PrayerTimes import PrayerTimes
from adhanpy.util.DateComponents import DateComponents
from adhanpy.calculation.CalculationParameters import CalculationParameters
from adhanpy.calculation.Madhab import Madhab
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from skyfield.api import load, wgs84
from skyfield import almanac, eclipselib
from pembaca_kalender import get_hijri_from_json
import threading
import copy

# Mencari lokasi folder tempat app.py berada
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, 
            template_folder=os.path.join(BASE_DIR, 'templates'),
            static_folder=os.path.join(BASE_DIR, 'static'))
app.secret_key = os.urandom(24)
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=2)
# Penampung sementara agar tidak hitung jadwal setiap detik
daily_cache = {"date": None, "data": None}

# ==========================================
# FILTER LOG: MEMBUNGKAM SPAM ENDPOINT DI TERMINAL
# ==========================================
class EndpointFilter(logging.Filter):
    def filter(self, record):
        msg = record.getMessage()
        # Daftar kata kunci/endpoint yang ingin dibisukan
        muted_endpoints = [
            '/api/simulasi',
            '/static/images/moon200.png'
        ]
        # Jika salah satu kata di atas ada di dalam pesan log, kembalikan False (jangan cetak)
        return not any(endpoint in msg for endpoint in muted_endpoints)

# Pasang filter ke mesin pencatat bawaan Flask (Werkzeug)
log = logging.getLogger('werkzeug')
log.addFilter(EndpointFilter())
# ==========================================

# Penampung sementara agar tidak hitung jadwal setiap detik
daily_cache = {"date": None, "data": None}

# ==========================================
# STATE KEAMANAN SESI (SINGLE LOGIN)
# ==========================================
global_active_session = {
    "username": None,
    "session_id": None,
    "last_ping": 0
}

@app.before_request
def enforce_single_session():
    """Fungsi pencegat: Tendang user jika ada yang mengambil alih sesi"""
    if session.get('logged_in'):
        if session.get('session_id') != global_active_session.get('session_id'):
            session.clear()
            if request.is_json:
                return jsonify({"status": "kicked", "msg": "Sesi Anda telah diputus oleh Superadmin."}), 401
            else:
                return redirect(url_for('login', kicked='1'))

@app.route('/api/heartbeat', methods=['POST'])
def api_heartbeat():
    """Menerima detak jantung dari layar admin agar sesi tetap hidup"""
    if session.get('logged_in') and session.get('session_id') == global_active_session.get('session_id'):
        global_active_session['last_ping'] = time.time()
        return jsonify({"status": "ok"})
    return jsonify({"status": "kicked"}), 401

# ==========================================
# Konfigurasi
# ==========================================
def load_config():
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
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

# ==========================================
# Menghitung arah kiblat dan rashdul qiblah harian
# ==========================================
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
        # Kita buat daftar menit dari 0 sampai 660 (11 jam)
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
# ----------------------------------------------------

# ==========================================
# Mengambil data harian
# ==========================================
def get_daily_data(tgl_manual=None):
    # 1. SELALU BACA CONFIG TERBARU
    CONFIG = load_config()
    
    if tgl_manual:
        try:
            now = datetime.strptime(tgl_manual, "%Y-%m-%d")
        except:
            now = datetime.now()
    else:
        now = datetime.now()
        
    current_date_str = now.strftime("%Y-%m-%d")
    pilihan_saat_ini = CONFIG.get("pilihan_kota", "Sokaraja")

    # ================================================================
    # AMBIL LOKASI DULU SEBELUM CACHE
    # ================================================================
    try:
        if CONFIG.get("mode") == "manual":
            lat = CONFIG.get("manual_lat", -7.4589)
            lon = CONFIG.get("manual_lon", 109.2882)
            tz_offset = CONFIG.get("manual_tz", 7)
            nama_lokasi = "Lokasi Manual"
        else:
            pilihan = CONFIG.get("pilihan_kota", "Sokaraja")
            daftar = CONFIG.get("daftar_kota", {"Sokaraja": {"lat": -7.4589, "lon": 109.2882, "tz": 7}})
            
            if pilihan in daftar:
                nama_lokasi = pilihan
                kota = daftar[pilihan]
            else:
                nama_lokasi = next(iter(daftar))
                kota = daftar[nama_lokasi]
            
            lat, lon = kota["lat"], kota["lon"]
            tz_offset = kota.get("tz", 7)
    except Exception as e:
        print(f"Error lokasi: {e}")
        lat, lon, tz_offset, nama_lokasi = -7.4589, 109.2882, 7, "Sokaraja (Error)"

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
        print(f"[Warning] Gagal melacak planet: {e}")

    # ================================================================
    # 2. LOGIKA CACHE
    # ================================================================
    if not tgl_manual and daily_cache["date"] == current_date_str:
        if daily_cache["data"] and daily_cache["data"]["lokasi"]["nama"] == pilihan_saat_ini:
            # data_update = daily_cache["data"].copy()
            data_update = copy.deepcopy(daily_cache["data"])
            data_update["nama_masjid"] = CONFIG.get("nama_masjid", "Masjid")
            data_update["alamat_masjid"] = CONFIG.get("alamat_masjid", "Lokasi")
            data_update["durasi_aktif"] = CONFIG.get("durasi_aktif", 15)
            data_update["selalu_aktif"] = CONFIG.get("selalu_aktif", True)
            data_update["tampilkan_jawa"] = CONFIG.get("tampilkan_jawa", True)
            data_update["metode"] = CONFIG.get("metode_kalender", "NASIONAL_MABIMS")
            data_update["display_settings"] = CONFIG.get("display_settings", {
                "tri_state_enabled": True,
                "blackout": [{"start": "22:00", "end": "03:30"}],
                "screensaver": [
                    {"start": "06:00", "end": "11:00"},
                    {"start": "13:00", "end": "14:30"}
                ]
            })
            data_update["keuangan"] = CONFIG.get("keuangan", {
                "tampilkan": False,
                "tanggal_laporan": "",
                "saldo_awal": 0,
                "pemasukan": 0,
                "pengeluaran": 0
            })
            
            data_update["lokasi"]["planetarium"] = posisi_tata_surya
            
            return data_update

    # ================================================================
    # 3. HITUNG ULANG JADWAL SHALAT (Hanya jika Cache kosong/beda hari)
    # ================================================================
    cfg_waktu = load_config_waktu()
    prm = cfg_waktu['parameter_kustom']
    iht = cfg_waktu['ihtiyati_menit']

    params = CalculationParameters(fajr_angle=prm['sudut_subuh'], isha_angle=prm['sudut_isya'])
    if prm.get('isya_menit_setelah_maghrib', 0) > 0:
        params.isha_interval = prm['isya_menit_setelah_maghrib']
        
    if prm.get('mazhab_ashar') == "HANAFI":
        params.madhab = Madhab.HANAFI
    else:
        params.madhab = Madhab.SHAFI

    pt = PrayerTimes((lat, lon), DateComponents(now.year, now.month, now.day), calculation_parameters=params)
    delta = timedelta(hours=tz_offset)

    waktu_subuh = pt.fajr + delta + timedelta(minutes=iht['subuh'])
    waktu_dzuhur = pt.dhuhr + delta + timedelta(minutes=iht['dzuhur'])
    waktu_ashar = pt.asr + delta + timedelta(minutes=iht['ashar'])
    waktu_maghrib = pt.maghrib + delta + timedelta(minutes=iht['maghrib'])
    waktu_isya = pt.isha + delta + timedelta(minutes=iht['isya'])
    waktu_terbit = pt.sunrise + delta + timedelta(minutes=iht['terbit'])
    waktu_imsak = waktu_subuh + timedelta(minutes=iht['imsak'])

    # Logika Shalat Jumat, digunakan untuk merubah jadwal Dzuhur jika diinginkan
    is_jumat = now.weekday() == 4 
    jumat_cfg = cfg_waktu.get("jumat", {"gunakan_waktu_tetap": False, "waktu_tetap": "12:00"})
    waktu_dzuhur_str = waktu_dzuhur.strftime("%H:%M")
    
    if is_jumat and jumat_cfg.get("gunakan_waktu_tetap", False):
        waktu_dzuhur_str = jumat_cfg.get("waktu_tetap", "12:00")

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
        "jadwal": {
            "Imsak": waktu_imsak.strftime("%H:%M"),
            "Subuh": waktu_subuh.strftime("%H:%M"),
            "Terbit": waktu_terbit.strftime("%H:%M"),
            "Dzuhur": waktu_dzuhur_str,
            "Ashar": waktu_ashar.strftime("%H:%M"),
            "Maghrib": waktu_maghrib.strftime("%H:%M"),
            "Isya": waktu_isya.strftime("%H:%M")
        },
        "iqomah": cfg_waktu.get("iqomah_menit", {}), 
        "is_jumat": is_jumat, 
        "jumat_config": jumat_cfg,
        "metode": CONFIG.get("metode_kalender", "NASIONAL_MABIMS"),
        "display_settings": CONFIG.get("display_settings", {
            "tri_state_enabled": True,
            "blackout": [{"start": "22:00", "end": "03:30"}],
            "screensaver": [
                {"start": "06:00", "end": "11:00"},
                {"start": "13:00", "end": "14:30"}
            ]
        }),
        "keuangan": CONFIG.get("keuangan", {
            "tampilkan": False,
            "tanggal_laporan": "",
            "saldo_awal": 0,
            "pemasukan": 0,
            "pengeluaran": 0
        })
    }

    if not tgl_manual:
        daily_cache["date"] = current_date_str
        daily_cache["data"] = data
        
    return data

# ==========================================
# Menghitung hari pasaran
# ==========================================
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

# ==========================================
# STATE MESIN WAKTU (SIMULASI REMOTE)
# ==========================================
state_simulasi = {
    "aktif": False,
    "waktu_mulai_real": 0,    # Timestamp saat admin menekan "Mulai" (milidetik)
    "waktu_mulai_simulasi": 0,# Timestamp target kalender yang dipilih admin (milidetik)
    "kecepatan": 1,            # 1x, 5x, 60x, dll
    "refresh_timestamp": 0  # <--- TAMBAHKAN INI
}

@app.route('/api/simulasi', methods=['GET', 'POST'])
def api_simulasi():
    """Endpoint untuk Remote Control Mesin Waktu & Media"""
    global state_simulasi
    
    # Inisialisasi Kendali Media jika belum ada
    if 'media_status' not in state_simulasi:
        state_simulasi['media_status'] = 'play'
        state_simulasi['media_next_trigger'] = 0

    if request.method == 'POST':
        data = request.json
        aksi = data.get('aksi')
        
        if aksi == 'mulai':
            state_simulasi['aktif'] = True
            state_simulasi['waktu_mulai_real'] = int(time.time() * 1000)
            state_simulasi['waktu_mulai_simulasi'] = data.get('target_timestamp')
            state_simulasi['kecepatan'] = data.get('kecepatan', 1)
        elif aksi == 'stop':
            state_simulasi['aktif'] = False
        elif aksi == 'media_next':
            state_simulasi['media_next_trigger'] += 1
        elif aksi == 'media_pause':
            state_simulasi['media_status'] = 'pause'
        elif aksi == 'media_play':
            state_simulasi['media_status'] = 'play'
        elif aksi == 'refresh_layar':
            state_simulasi['refresh_timestamp'] = time.time()
            
        return jsonify({"status": "success", "state": state_simulasi})
        
    return jsonify(state_simulasi)

# ==========================================
# index.html
# ==========================================
@app.route('/')
def index():
    conf = load_config()
    debug_mode = conf.get("debug_mode", False)
    
    # Mencari lokasi file JS untuk cek waktu modifikasi terakhir (Cache Busting)
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    script_path = os.path.join(BASE_DIR, 'static', 'js', 'script.js')
    
    mtime = int(os.path.getmtime(script_path)) if os.path.exists(script_path) else 0
    
    return render_template('index.html', v=mtime, debug=debug_mode)

# ==========================================
# GET DATA
@app.route('/get_data')
def get_data():
    tgl_simulasi = request.args.get('date')
    return jsonify(get_daily_data(tgl_simulasi))

# ==========================================
# Mengambil gambar pengumuman
# ==========================================
@app.route('/get_assets')
def get_assets():
    """Men-scan folder gambar pengumuman"""
    path_p = os.path.join(app.root_path, 'static', 'img', 'pengumuman')
    if not os.path.exists(path_p): os.makedirs(path_p)
    
    # Hanya ambil file gambar di folder utama (bukan di subfolder archive)
    valid_ext = ('.jpg', '.jpeg', '.png', '.webp')
    images = [f for f in os.listdir(path_p) 
              if os.path.isfile(os.path.join(path_p, f)) and f.lower().endswith(valid_ext)]
    return jsonify(images)

# ==========================================
# Memindahkan pengumunan, kutipan, dan gambar pengumuman yang sudah lewat
# ==========================================
@app.route('/archive_expired', methods=['POST'])
def archive_expired():
    """Memindahkan konten kedaluwarsa ke arsip DENGAN BATASAN KAPASITAS"""
    data = request.json
    content_type = data.get('type') # 'image' atau 'json'
    
    if content_type == 'image':
        filename = data.get('filename')
        src = os.path.join(app.root_path, 'static', 'img', 'pengumuman', filename)
        dist_dir = os.path.join(app.root_path, 'static', 'img', 'pengumuman', 'archive')
        if not os.path.exists(dist_dir): os.makedirs(dist_dir)
        
        if os.path.exists(src):
            shutil.move(src, os.path.join(dist_dir, filename))
            
            # --- PENGAMAN KAPASITAS ARSIP GAMBAR (MAKSIMAL 50 GAMBAR) ---
            # Ambil semua file di folder arsip, urutkan dari yang paling lama
            arsip_gambar = [os.path.join(dist_dir, f) for f in os.listdir(dist_dir) if os.path.isfile(os.path.join(dist_dir, f))]
            arsip_gambar.sort(key=os.path.getmtime)
            
            # Jika lebih dari 50, hapus yang paling usang sampai jumlahnya pas 50
            while len(arsip_gambar) > 50:
                file_usang = arsip_gambar.pop(0)
                try:
                    os.remove(file_usang)
                    print(f"[Auto-Clean] Arsip gambar usang dihapus: {file_usang}")
                except Exception as e:
                    print(f"Gagal menghapus arsip usang: {e}")
            # -------------------------------------------------------------
            
            return jsonify({"status": "success", "msg": f"Image {filename} archived"})

    elif content_type == 'json':
        isi_teks = data.get('isi')
        json_path = os.path.join(app.root_path, 'static', 'json', 'pengumuman.json')
        archive_path = os.path.join(app.root_path, 'static', 'json', 'archive_pengumuman.json')
        
        if os.path.exists(json_path):
            with open(json_path, 'r+') as f:
                items = json.load(f)
                to_archive = [i for i in items if i.get('isi') == isi_teks]
                remaining = [i for i in items if i.get('isi') != isi_teks]
                
                # Update file utama
                f.seek(0)
                json.dump(remaining, f, indent=4)
                f.truncate()

                # Update file arsip
                old_archive = []
                if os.path.exists(archive_path):
                    try:
                        with open(archive_path, 'r') as af: old_archive = json.load(af)
                    except: old_archive = []
                
                old_archive.extend(to_archive)
                
                # --- PENGAMAN KAPASITAS ARSIP TEKS (MAKSIMAL 100 TEKS TERBARU) ---
                old_archive = old_archive[-100:] 
                # -----------------------------------------------------------------
                
                with open(archive_path, 'w') as af: json.dump(old_archive, af, indent=4)
                
            return jsonify({"status": "success", "msg": "Teks archived"})

    return jsonify({"status": "error"}), 400

# ==========================================
# Perhitungan kalender hari ini
# ==========================================
@app.route('/api/tanggal_sekarang')
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

# ==========================================
# Mengambil kalender jangkar
# ==========================================
@app.route('/api/kalender_jangkar/<int:tahun>')
def get_jangkar_json(tahun):
    print(f"==== MEMINTA DATA JANGKAR TAHUN {tahun} ====")
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    nama_file = f"kalender_jangkar_{tahun}.json"
    file_path = os.path.join(BASE_DIR, nama_file)
    
    # Ambil parameter 'force' dari URL jika ada (contoh: /api/kalender_jangkar/2026?force=true)
    force_build = request.args.get('force') == 'true'
    
    # LOGIKA OTOMATIS & PAKSA
    if not os.path.exists(file_path) or force_build:
        print(f"[System] Membangun Kalender Jangkar {tahun} (Force: {force_build})...")
        try:
            # Panggil fungsi generator
            from generator_tahunan import generate_adaptif

            # --- AMBIL KOORDINAT DARI CONFIG ---
            CONFIG = load_config()
            if CONFIG.get("mode") == "manual":
                lat = CONFIG.get("manual_lat", -7.4589)
                lon = CONFIG.get("manual_lon", 109.2882)
                kota = "Lokasi Manual"
            else:
                pilihan = CONFIG.get("pilihan_kota", "Sokaraja")
                daftar = CONFIG.get("daftar_kota", {"Sokaraja": {"lat": -7.4589, "lon": 109.2882}})
                
                if pilihan in daftar:
                    kota = pilihan
                    lat = daftar[pilihan]["lat"]
                    lon = daftar[pilihan]["lon"]
                else:
                    kota = next(iter(daftar))
                    lat = daftar[kota]["lat"]
                    lon = daftar[kota]["lon"]
            # --------------------------------------------------- 
            
            print(f"[System] Koordinat generator: {kota} ({lat}, {lon})")
            
            # Panggil generator dengan argumen LENGKAP
            generate_adaptif(tahun, lat, lon, kota)

            # Cek sekali lagi apakah file berhasil dibuat
            if not os.path.exists(file_path):
                return jsonify({"error": "Gagal membangun file jangkar"}), 500
        except Exception as e:
            print("\n!!! ERROR GENERATOR KALENDER !!!")
            traceback.print_exc() # Cetak detail error berwarna merah di terminal
            print("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n")
            return jsonify({"error": f"Kesalahan generator: {str(e)}"}), 500
         
    return send_from_directory(BASE_DIR, nama_file)

# ==========================================
# RUTE SISTEM ADMIN & LOGIN
# ==========================================
# Mengambil data admin
def load_admin_data():
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    ADMIN_FILE = os.path.join(BASE_DIR, 'admin.json')
    
    # Fungsi bantuan untuk membuat file default
    def buat_default():
        print("[System] Membuat ulang admin.json dengan akun default...")
        default_data = {
            "users": {
                "admin": {
                    "password_hash": generate_password_hash("admin"),
                    "role": "superadmin",
                    "nama_lengkap": "Administrator Utama"
                }
            }
        }
        with open(ADMIN_FILE, 'w') as f:
            json.dump(default_data, f, indent=4)
        return default_data

    # 1. Jika file tidak ada sama sekali
    if not os.path.exists(ADMIN_FILE):
        return buat_default()
        
    # 2. Jika file ada, coba baca
    try:
        with open(ADMIN_FILE, 'r') as f:
            return json.load(f)
    except Exception as e:
        # 3. Jika file ada tapi KOSONG atau RUSAK (JSONDecodeError)
        print(f"[Warning] File admin.json bermasalah: {e}")
        return buat_default()

@app.route('/login', methods=['GET', 'POST'])
def login():
    global global_active_session

    if request.method == 'POST':
        data = request.json if request.is_json else request.form
        username = data.get('username')
        password = data.get('password')
        force_login = data.get('force', False) # Tangkap perintah paksa dari superadmin

        admin_data = load_admin_data()
        users = admin_data.get('users', {})

        if username in users and check_password_hash(users[username]['password_hash'], password):
            user_role = users[username]['role']

            # --- LOGIKA KUNCI TUNGGAL (SINGLE SESSION) ---
            # Cek apakah sesi yang lama sudah mati (tidak ada detak selama 30 detik)
            is_dead = (time.time() - global_active_session['last_ping']) > 30

            # Jika masih ada orang yang sedang login & berdetak
            if global_active_session['session_id'] is not None and not is_dead:
                
                # Jika yang mencoba login ini bukan memegang kunci (bisa beda orang, atau orang sama dari browser beda)
                if global_active_session['session_id'] != session.get('session_id'):
                    
                    if user_role == 'superadmin':
                        if not force_login:
                            # Tawarkan pilihan untuk menendang
                            return jsonify({
                                "status": "confirm_override",
                                "msg": f"Peringatan: Pengguna @{global_active_session['username']} saat ini sedang login di perangkat lain.\n\nLanjutkan login dan putuskan koneksi mereka?"
                            })
                    else:
                        # Jika user biasa, tolak mutlak
                        return jsonify({
                            "status": "error",
                            "msg": f"Akses Ditolak! Sistem sedang digunakan oleh @{global_active_session['username']}."
                        }), 403

            # --- JIKA LOLOS ATAU SUPERADMIN MEMAKSA MASUK ---
            session_id = os.urandom(16).hex() # Buat KTP acak baru
            session.permanent = True
            session['logged_in'] = True
            session['username'] = username
            session['role'] = user_role
            session['session_id'] = session_id

            # Rebut kunci global di server
            global_active_session['username'] = username
            global_active_session['session_id'] = session_id
            global_active_session['last_ping'] = time.time()

            catat_log(username, "AUTH", "Login ke sistem")

            if request.is_json:
                return jsonify({"status": "success", "msg": "Login berhasil"})
            return redirect(url_for('halaman_admin'))
            
        if request.is_json:
            return jsonify({"status": "error", "msg": "Username atau Password salah!"}), 401
        return "Login Gagal. Silakan kembali.", 401

    kicked = request.args.get('kicked')
    return render_template('login.html', kicked=kicked)

@app.route('/logout')
def logout():
    user_yg_keluar = session.get('username', 'Unknown')
    
    # Bebaskan kunci global JIKA yang menekan tombol logout adalah pemegang kunci
    if session.get('session_id') == global_active_session.get('session_id'):
        global_active_session['username'] = None
        global_active_session['session_id'] = None
        global_active_session['last_ping'] = 0

    if user_yg_keluar != 'Unknown':
        catat_log(user_yg_keluar, "AUTH", "Logout dari sistem")

    session.clear() 
    return redirect(url_for('login'))

@app.route('/admin')
def halaman_admin():
    # CEGAHAN KEAMANAN: Jika belum ada session login, tendang balik ke halaman login
    if not session.get('logged_in'):
        return redirect(url_for('login'))
        
    # Jika aman, berikan halaman admin sesuai hak aksesnya
    return render_template('admin.html', 
                           username=session.get('username'), 
                           role=session.get('role'))

# ==========================================
# API UNTUK PENGATURAN ADMIN
# ==========================================
@app.route('/api/config', methods=['GET', 'POST'])
def api_config():
    # KEAMANAN: Pastikan hanya admin yang login yang bisa akses API ini
    if not session.get('logged_in'):
        return jsonify({"status": "error", "msg": "Akses Ditolak"}), 401
        
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    config_path = os.path.join(BASE_DIR, 'config.json')

    # Jika Admin meminta data (Membaca)
    if request.method == 'GET':
        try:
            with open(config_path, 'r') as f:
                return jsonify(json.load(f))
        except Exception as e:
            return jsonify({"status": "error", "msg": str(e)}), 500

    # Jika Admin menyimpan data (Menulis)
    if request.method == 'POST':
        try:
            new_data = request.json
            
            # Kita baca dulu file aslinya agar _catatan01 dll tidak hilang tertimpa
            with open(config_path, 'r') as f:
                current_config = json.load(f)
                
            # Update dengan data baru dari form
            current_config.update(new_data)
            
            with open(config_path, 'w') as f:
                json.dump(current_config, f, indent=4)
            
            catat_log(session.get('username', 'Unknown'), "CONFIG", "Memperbarui Profil & Lokasi Masjid")
                
            return jsonify({"status": "success", "msg": "Konfigurasi berhasil disimpan!"})
        except Exception as e:
            return jsonify({"status": "error", "msg": str(e)}), 500

@app.route('/api/cities', methods=['GET'])
def api_cities():
    if not session.get('logged_in'):
        return jsonify({"status": "error"}), 401
        
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    cities_path = os.path.join(BASE_DIR, 'static', 'json', 'cities.json')
    try:
        with open(cities_path, 'r') as f:
            return jsonify(json.load(f))
    except Exception as e:
        # Fallback jika file gagal dibaca
        return jsonify({"Sokaraja": {"lat": -7.4589, "lon": 109.2882, "tz": 7}})

# ==========================================
# BACA BERKAS
# ==========================================
@app.route('/api/json_data/<filename>', methods=['GET', 'POST'])
def api_json_data(filename):
    # Keamanan pintu masuk
    if not session.get('logged_in'):
        return jsonify({"status": "error", "msg": "Akses Ditolak"}), 401

    # Daftar file yang diizinkan untuk diedit via API ini (mencegah akses file sembarangan)
    allowed_files = ['kutipan', 'pengumuman', 'event', 'archive_pengumuman']
    if filename not in allowed_files:
        return jsonify({"status": "error", "msg": "Akses file tidak diizinkan!"}), 403

    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    file_path = os.path.join(BASE_DIR, 'static', 'json', f'{filename}.json')

    if request.method == 'GET':
        try:
            print(f"[DEBUG API] Mencari file di: {file_path}")
            # Jika file belum ada, kembalikan list kosong
            if not os.path.exists(file_path):
                print(f"[DEBUG API] File TIDAK DITEMUKAN, mengirim []") # <-- Tambahkan ini
                return jsonify([]) 
                
            with open(file_path, 'r', encoding='utf-8') as f:
                print(f"[DEBUG API] File DITEMUKAN, membaca isi...") # <-- Tambahkan ini
                return jsonify(json.load(f))
        except Exception as e:
            return jsonify({"status": "error", "msg": str(e)}), 500

    if request.method == 'POST':
        try:
            new_data = request.json
            with open(file_path, 'w', encoding='utf-8') as f:
                json.dump(new_data, f, indent=4, ensure_ascii=False)

            catat_log(session.get('username', 'Unknown'), "KONTEN", f"Memperbarui data {filename}.json")

            return jsonify({"status": "success", "msg": f"Data {filename} berhasil diperbarui!"})
        except Exception as e:
            return jsonify({"status": "error", "msg": str(e)}), 500

# ==========================================
# API UNTUK GAMBAR PENGUMUMAN
# ==========================================
@app.route('/api/gambar_pengumuman', methods=['GET', 'POST', 'PUT', 'DELETE'])
def api_gambar_pengumuman():
    if not session.get('logged_in'):
        return jsonify({"status": "error", "msg": "Akses Ditolak"}), 401

    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    img_folder = os.path.join(BASE_DIR, 'static', 'img', 'pengumuman')
    os.makedirs(img_folder, exist_ok=True) 

    valid_ext = ('.jpg', '.jpeg', '.png', '.webp', '.gif')

    # 1. GET: Ambil daftar gambar
    if request.method == 'GET':
        try:
            files = [f for f in os.listdir(img_folder) 
                     if os.path.isfile(os.path.join(img_folder, f)) and f.lower().endswith(valid_ext)]
            return jsonify(files)
        except Exception as e:
            return jsonify({"status": "error", "msg": str(e)}), 500

    # 2. POST: Upload gambar baru
    if request.method == 'POST':
        if 'file' not in request.files:
            return jsonify({"status": "error", "msg": "Tidak ada file gambar"}), 400
            
        file = request.files['file']
        if file.filename == '':
            return jsonify({"status": "error", "msg": "File kosong"}), 400

        # Ambil & Validasi Metadata
        bobot_str = request.form.get('bobot', '1')
        deadline = request.form.get('deadline', '').strip()
        bobot = int(bobot_str) if str(bobot_str).isdigit() and int(bobot_str) > 0 else 1

        # Tangkap status aktif
        aktif_str = str(request.form.get('aktif', 'true')).lower()
        aktif_kode = '1' if aktif_str == 'true' else '0'

        asli = secure_filename(file.filename)
        
        # LOGIKA PREFIX GAMBAR
        prefix = f"W{bobot}__"
        if deadline != "":
            prefix += f"D{deadline}__"
        prefix += f"A{aktif_kode}__"
            
        nama_file_baru = prefix + asli
        
        try:
            file.save(os.path.join(img_folder, nama_file_baru))
            catat_log(session.get('username', 'Unknown'), "KONTEN", f"Mengunggah poster gambar: {nama_file_baru}")
            return jsonify({"status": "success", "msg": "Gambar berhasil diunggah!"})
        except Exception as e:
            return jsonify({"status": "error", "msg": str(e)}), 500

    # 3. PUT: Edit Bobot / Deadline Gambar (Me-rename File)
    if request.method == 'PUT':
        data = request.json
        filename_lama = data.get('filename_lama')
        
        bobot_str = data.get('bobot', '1')
        deadline = data.get('deadline', '').strip()
        bobot = int(bobot_str) if str(bobot_str).isdigit() and int(bobot_str) > 0 else 1

        aktif_val = data.get('aktif', True)
        aktif_kode = '1' if aktif_val else '0'

        if not filename_lama: return jsonify({"status": "error", "msg": "Filename tidak valid"}), 400
        file_path_lama = os.path.join(img_folder, filename_lama)
        if not os.path.exists(file_path_lama): return jsonify({"status": "error", "msg": "File tidak ditemukan"}), 404

        # Ekstrak nama murni asli (Ambil bagian paling belakang setelah __)
        nama_murni = filename_lama.split('__')[-1]
        
        # LOGIKA PREFIX BERSIH
        # prefix = ""
        # if bobot > 1 or deadline != "":
        #     prefix = f"W{bobot}__"
        #     if deadline != "":
        #         prefix += f"D{deadline}__"
        prefix = f"W{bobot}__"
        if deadline != "":
            prefix += f"D{deadline}__"
        prefix += f"A{aktif_kode}__"
        
        nama_file_baru = prefix + nama_murni
        file_path_baru = os.path.join(img_folder, nama_file_baru)

        try:
            # Rename file di OS (Hanya jika namanya berubah)
            if filename_lama != nama_file_baru:
                os.rename(file_path_lama, file_path_baru)
            catat_log(session.get('username', 'Unknown'), "KONTEN", f"Mengedit data poster: {nama_murni}")
            return jsonify({"status": "success", "msg": "Data gambar berhasil diperbarui!"})
        except Exception as e:
            return jsonify({"status": "error", "msg": str(e)}), 500

    # 4. DELETE: Hapus gambar
    if request.method == 'DELETE':
        filename = request.json.get('filename')
        if not filename: return jsonify({"status": "error", "msg": "Nama file tidak valid"}), 400
        file_path = os.path.join(img_folder, filename)
        if os.path.exists(file_path):
            os.remove(file_path)
            catat_log(session.get('username', 'Unknown'), "KONTEN", f"Menghapus poster: {filename}")
            return jsonify({"status": "success", "msg": "Gambar dihapus!"})
        return jsonify({"status": "error", "msg": "File tidak ditemukan!"}), 404

# ==========================================
# MENGARSIPKAN GAMBAR PENGUMUMAN YANG SUDAH LEWAT
# ==========================================
@app.route('/api/gambar_arsip', methods=['GET', 'DELETE'])
def api_gambar_arsip():
    if not session.get('logged_in'):
        return jsonify({"status": "error", "msg": "Akses Ditolak"}), 401

    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    archive_folder = os.path.join(BASE_DIR, 'static', 'img', 'pengumuman', 'archive')
    os.makedirs(archive_folder, exist_ok=True) # Jaga-jaga jika folder belum dibuat

    valid_ext = ('.jpg', '.jpeg', '.png', '.webp', '.gif')

    if request.method == 'GET':
        try:
            files = [f for f in os.listdir(archive_folder)
                     if os.path.isfile(os.path.join(archive_folder, f)) and f.lower().endswith(valid_ext)]
            return jsonify(files)
        except Exception as e:
            return jsonify({"status": "error", "msg": str(e)}), 500

    if request.method == 'DELETE':
        filename = request.json.get('filename')
        if not filename:
            return jsonify({"status": "error", "msg": "Nama file tidak valid"}), 400
            
        file_path = os.path.join(archive_folder, filename)
        if os.path.exists(file_path):
            os.remove(file_path)
            return jsonify({"status": "success", "msg": "Arsip gambar dihapus permanen!"})
        return jsonify({"status": "error", "msg": "File tidak ditemukan!"}), 404

# ==========================================
# API UNTUK AUDIT TRAIL (LOG AKTIFITAS)
# ==========================================
def catat_log(user, kategori, aksi):
    """Fungsi sakti untuk mencatat aktifitas ke audit_log.json"""
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    log_file = os.path.join(BASE_DIR, 'audit_log.json')
    
    # Format waktu sekarang
    waktu_sekarang = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # Rakit baris log baru
    log_baru = {
        "waktu": waktu_sekarang,
        "user": user,
        "kategori": kategori,
        "aksi": aksi
    }
    
    # Baca log lama (jika ada)
    logs = []
    if os.path.exists(log_file):
        try:
            with open(log_file, 'r', encoding='utf-8') as f:
                logs = json.load(f)
        except:
            logs = []
            
    # Tambahkan di urutan PERTAMA (paling atas)
    logs.insert(0, log_baru)
    
    # BATASI MAKSIMAL 500 LOG (Agar Raspberry Pi tidak kehabisan memori)
    logs = logs[:500]
    
    # Simpan kembali
    try:
        with open(log_file, 'w', encoding='utf-8') as f:
            json.dump(logs, f, indent=4, ensure_ascii=False)
    except Exception as e:
        print(f"[Error Log] Gagal mencatat log: {e}")

@app.route('/api/logs', methods=['GET'])
def api_logs():
    # Hanya admin yang bisa melihat buku catatan ini
    if not session.get('logged_in'):
        return jsonify({"status": "error", "msg": "Akses Ditolak"}), 401
        
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    log_file = os.path.join(BASE_DIR, 'audit_log.json')
    
    if os.path.exists(log_file):
        try:
            with open(log_file, 'r', encoding='utf-8') as f:
                return jsonify(json.load(f))
        except:
            pass
    return jsonify([]) # Kembalikan array kosong jika belum ada log

# ==========================================
# API UNTUK MANAJEMEN AKUN & PASSWORD
# ==========================================
@app.route('/api/users', methods=['GET', 'POST', 'DELETE'])
def api_users():
    # KEAMANAN: Hanya Superadmin yang boleh mengakses fitur ini!
    if not session.get('logged_in') or session.get('role') != 'superadmin':
        return jsonify({"status": "error", "msg": "Akses Ditolak. Khusus Superadmin."}), 403

    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    admin_file = os.path.join(BASE_DIR, 'admin.json')
    admin_data = load_admin_data()
    users = admin_data.get('users', {})

    # 1. GET: Menampilkan daftar pengguna (tanpa password)
    if request.method == 'GET':
        safe_users = {}
        for k, v in users.items():
            safe_users[k] = {"role": v.get("role"), "nama_lengkap": v.get("nama_lengkap")}
        return jsonify(safe_users)

    # 2. POST: Tambah User Baru atau Edit User yang sudah ada
    if request.method == 'POST':
        data = request.json
        username = data.get('username')
        password = data.get('password') # Bisa kosong jika hanya mengubah role/nama
        role = data.get('role', 'operator')
        nama_lengkap = data.get('nama_lengkap', username)

        if not username:
            return jsonify({"status": "error", "msg": "Username tidak boleh kosong"}), 400

        if username in users and not password:
            # Mode Edit: Update profil saja
            users[username]['role'] = role
            users[username]['nama_lengkap'] = nama_lengkap
            catat_log(session.get('username'), "AUTH", f"Memperbarui profil user: {username}")
        else:
            # Mode Tambah/Reset Password
            if not password and username not in users:
                return jsonify({"status": "error", "msg": "User baru wajib diberi password"}), 400
            
            if username not in users:
                users[username] = {}
                catat_log(session.get('username'), "AUTH", f"Membuat user baru: {username} ({role})")
            else:
                catat_log(session.get('username'), "AUTH", f"Mereset password user: {username}")
                
            users[username]['role'] = role
            users[username]['nama_lengkap'] = nama_lengkap
            if password:
                users[username]['password_hash'] = generate_password_hash(password)

        with open(admin_file, 'w') as f:
            json.dump(admin_data, f, indent=4)
        return jsonify({"status": "success", "msg": "Data pengguna berhasil disimpan!"})

    # 3. DELETE: Menghapus User
    if request.method == 'DELETE':
        username = request.json.get('username')
        if username == session.get('username'):
            return jsonify({"status": "error", "msg": "Anda tidak bisa menghapus akun Anda sendiri!"}), 400
        
        if username in users:
            del users[username]
            with open(admin_file, 'w') as f:
                json.dump(admin_data, f, indent=4)
            catat_log(session.get('username'), "AUTH", f"Menghapus user: {username}")
            return jsonify({"status": "success", "msg": "User berhasil dihapus!"})
        return jsonify({"status": "error", "msg": "User tidak ditemukan"}), 404

@app.route('/api/ganti_password', methods=['POST'])
def api_ganti_password():
    # Fitur ini bisa diakses oleh SEMUA user yang sedang login
    if not session.get('logged_in'):
        return jsonify({"status": "error", "msg": "Akses Ditolak"}), 401

    data = request.json
    password_lama = data.get('password_lama')
    password_baru = data.get('password_baru')
    username = session.get('username')

    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    admin_file = os.path.join(BASE_DIR, 'admin.json')
    admin_data = load_admin_data()
    users = admin_data.get('users', {})

    if username in users:
        # Cek apakah password lama yang dimasukkan benar
        if check_password_hash(users[username]['password_hash'], password_lama):
            # Jika benar, timpa dengan hash password baru
            users[username]['password_hash'] = generate_password_hash(password_baru)
            with open(admin_file, 'w') as f:
                json.dump(admin_data, f, indent=4)
            catat_log(username, "AUTH", "Mengganti password miliknya sendiri")
            return jsonify({"status": "success", "msg": "Password berhasil diganti!"})
        else:
            return jsonify({"status": "error", "msg": "Password lama Anda salah!"}), 400
            
    return jsonify({"status": "error", "msg": "Terjadi kesalahan sistem"}), 500

# ==========================================
# API UNTUK MANAJEMEN WAKTU SHALAT
# ==========================================
@app.route('/api/config_waktu', methods=['GET', 'POST'])
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
    
# ==========================================
# API UNTUK RASHDUL QIBLAH
# ==========================================
@app.route('/api/rashdul_qiblah', methods=['GET'])
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

# ==========================================
# API UNTUK GERHANA MATAHARI DAN BULAN
# ==========================================
@app.route('/api/gerhana', methods=['GET'])
def api_gerhana():
    try:
        # 1. Ambil Koordinat Masjid dari config.json
        config_path = os.path.join(BASE_DIR, 'config.json')
        with open(config_path, 'r') as f:
            cfg = json.load(f)
        
        tz_offset = cfg.get('manual_tz', 7)
        lat = cfg.get('manual_lat', -7.45)
        lon = cfg.get('manual_lon', 109.28)
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

# ==========================================
# API UNTUK RUKYATUL HILAL
# ==========================================
# Variabel global sebagai penanda agar mesin tidak merender ganda
is_hilal_generating = False
@app.route('/api/hilal', methods=['GET'])
def api_hilal():
    global is_hilal_generating
    try:
        # 1. Jalankan Tukang Sapu Otomatis (bersihkan cache > 30 hari)
        try:
            from hilal_engine import bersihkan_cache_tahunan
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

        from generator_tahunan import get_semua_ijtima_tahunan, load_kriteria_config
        
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
        config_kriteria = load_kriteria_config()
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
            
            # AMBIL KOORDINAT DARI CONFIG AMAL
            # PENTING: Karena ini ada di file terpisah, kita butuh cara baca config
            try:
                with open(os.path.join(BASE_DIR, 'config.json'), 'r') as f:
                    config_app = json.load(f)
            except:
                config_app = {}

            if config_app.get("mode") == "manual":
                lat = config_app.get("manual_lat", -7.4589)
                lon = config_app.get("manual_lon", 109.2882)
                kota = "Lokasi Manual"
            else:
                pilihan = config_app.get("pilihan_kota", "Sokaraja")
                # Jika daftar_kota tidak ada di config, gunakan nilai statis ini
                lat = -7.4589
                lon = 109.2882
                kota = pilihan

            # PEKERJA LATAR BELAKANG (THREAD)
            def background_worker():
                global is_hilal_generating
                is_hilal_generating = True
                print(f"[AMaL Hilal Engine] Memulai render background untuk {target_date.strftime('%Y-%m-%d')}...")
                try:
                    from hilal_engine import generate_laporan_harian, generate_peta_kontur
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

# ==========================================
# --- ENDPOINT SINKRONISASI WAKTU ANTAR MONITOR ---
# ==========================================
# digunakan untuk menyamakan waktu antar monitor agar antar monitor dapat menampilkan waktu yang sama
@app.route('/api/sync_waktu')
def sync_waktu():
    # Mengembalikan waktu server saat ini dalam satuan milidetik (millisecond)
    waktu_server_ms = int(time.time() * 1000)
    return jsonify({"server_time": waktu_server_ms})

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
