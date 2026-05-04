import os
import time
import json
from datetime import datetime

from src.services.astronomy import get_current_location
from src.services.generator_tahunan import generate_adaptif
from src.routes.api_waktu import is_hilal_generating

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Variabel global untuk maintenance
is_maintenance_running = False

# Pindahkan fungsi maintenance_worker() ke sini ...
# (Penting: Di dalam fungsi ini ada pengecekan is_hilal_generating. 
# Anda bisa menghapus pengecekan tersebut sementara, atau mengimpornya dari src.routes.api_waktu)

def maintenance_worker():
    """Tugas: Menyiapkan data tahun depan (28-31 Des, Jam 00-04 pagi)"""
    global is_maintenance_running, is_hilal_generating
    print("[SYSTEM] Maintenance Worker Aktif.")
    
    while True:
        try:
            sekarang = datetime.now()
            # Syarat: 28-31 Desember dan dini hari (00:00 - 04:00)
            if sekarang.month == 12 and sekarang.day >= 28 and (0 <= sekarang.hour < 4):
                
                # JANGAN jalan jika Hilal Engine sedang bekerja
                if is_hilal_generating:
                    time.sleep(600)
                    continue

                tahun_target = sekarang.year + 1
                file_path = os.path.join(BASE_DIR, f"kalender_jangkar_{tahun_target}.json")
                
                # Cek integritas file
                perlu_buat = True
                if os.path.exists(file_path):
                    try:
                        with open(file_path, 'r') as f:
                            json.load(f)
                        perlu_buat = False
                    except:
                        perlu_buat = True

                if perlu_buat and not is_maintenance_running:
                    is_maintenance_running = True
                    lokasi = get_current_location()
                    
                    print(f"[MAINTENANCE] {sekarang.strftime('%H:%M')} - Memulai regenerasi tahun {tahun_target}...")
                    
                    # Berikan prioritas rendah agar Audio Adzan tetap mulus
                    if hasattr(os, 'nice'):
                        try:
                            os.nice(15)
                            print(" -> Mode prioritas rendah aktif.")
                        except: pass
                    
                    from src.services.generator_tahunan import generate_adaptif
                    generate_adaptif(tahun_target, lokasi['lat'], lokasi['lon'], lokasi['nama'])
                    
                    print(f"[MAINTENANCE] Selesai membangun data {tahun_target}.")
                    is_maintenance_running = False
        except Exception as e:
            print(f"[MAINTENANCE] Error: {e}")
            is_maintenance_running = False
        
        # Cek setiap 1 jam
        time.sleep(3600)