```
/amal-masjid
├── /data                       # Folder untuk data mentah dan transit
│   ├── /quran_base             # Berkas mentah ayat Quran (.txt, .js)
│   ├── /generated              # Metadata JSON Qari yang sudah dirakit
│   ├── /uploads_temp           # Folder transit file unggahan (paksa RAM)
│   └── status_bacaan.json      # Bookmark/Status ayat terakhir yang dibaca
│
├── /static                     # Aset publik (Frontend)
│   ├── /css
│   ├── /js
|   |   ├── script.js           # Script utama
|   |   ├── admin.js            # Script admin
|   |   └── kalender_jawa.js    # Script kalender jawa
|   |
│   ├── /images                 # Gambar-gambar statis
│   ├── /img
│   ├── /json                   # File JSON publik (config_kriteria, dll)
│   └── /audio                  # MP3 Qari, Adzan, Tarhim
│
├── /templates                  # Berkas HTML (Jinja2)
│   ├── index.html
│   ├── admin.html
│   └── login.html
│
├── /cache                      # (Dibuat otomatis) File .npz dan peta hilal sementara
│
├── /src                        # 🫀 JANTUNG APLIKASI (Kode Python Utama)
│   ├── __init__.py             # (Kosong, penanda modul)
│   │
│   ├── /config                 # (Opsional) Jika nanti ada config khusus sistem
│   │   └── __init__.py
│   │
│   ├── /routes                 # 🛣️ BLUEPRINTS (Pintu Masuk HTTP/API)
│   │   ├── __init__.py
│   │   ├── web_routes.py       # Rute UI (/, /login, /admin, /logout)
│   │   ├── api_admin.py        # Rute Pengaturan (/api/config, users, logs, cities)
│   │   ├── api_konten.py       # Rute Media (/api/gambar_pengumuman, json_data, arsip)
│   │   ├── api_waktu.py        # Rute Hisab (/api/gerhana, kiblat, jadwal, hilal)
│   │   └── api_audio.py        # Rute Suara (/api/simulasi, list_qari, test_audio)
│   │
│   ├── /services               # 🧠 BUSINESS LOGIC (Otak Perhitungan)
│   │   ├── __init__.py
│   │   ├── astronomy.py        # Algoritma Jadwal, Kiblat, Rashdul
│   │   ├── audio.py            # (Dulu amal_sound.py) Mesin perakit playlist Murottal
│   │   ├── quran_processor.py  # Ekstraktor metadata quran (.txt ke .json)
│   │   ├── hilal_engine.py     # Renderer peta kontur dan laporan harian
│   │   ├── generator_tahunan.py# Mesin pembuat kalender jangkar setahun
│   │   └── pembaca_kalender.py # Ekstraktor tanggal hijriah dari kalender
│   │
│   ├── /utils                  # 🛠️ HELPER (Alat Bantu Global)
│   │   ├── __init__.py
│   │   ├── logger.py           # Fungsi catat_log()
│   │   ├── auth.py             # Fungsi load_admin_data()
│   │   ├── session.py          # Variabel global_active_session
│   │   └── state.py            # Variabel state_simulasi & state_audio
│   │
│   └── /workers                # ⚙️ BACKGROUND THREADS (Pekerja Latar Belakang)
│       ├── __init__.py
│       ├── audio_worker.py     # Pemantau waktu adzan & pemutar Pygame
│       └── main_worker.py      # Pembuat kalender otomatis di akhir tahun
│
├── admin.json                  # Data akun (Superadmin/Admin)
├── audit_log.json              # Catatan aktivitas pengguna
├── config.json                 # Konfigurasi masjid, MABIMS, dll
├── de421.bsp                   # Data Ephemeris (Skyfield)
├── kalender_jangkar_202X.json  # (Dibuat otomatis) Hasil hisab setahun
├── requirements.txt            # Daftar pustaka Python (pip install -r)
├── install.sh
├── LICENSE
├── README.md
│
└── main.py                     # 🚀 ENTRY POINT (jalankan aplikasi dari sini)
