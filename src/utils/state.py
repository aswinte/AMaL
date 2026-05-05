# src/utils/state.py

state_simulasi = {
    "aktif": False,
    "waktu_mulai_real": 0,    
    "waktu_mulai_simulasi": 0,
    "kecepatan": 1,            
    "refresh_timestamp": 0  
}

state_audio = {
    "is_playing": False,
    "teks_arab": "",
    "teks_indo": "",
    "surat_ayat": ""
}

state_tilawah = {
    "aktif": False,
    "surat": None,
    "ayat": None,
    "qari": None, # Menggunakan qari aktif dari konfigurasi
    "sesi_baru": False,
    "perlu_bismillah": False
}