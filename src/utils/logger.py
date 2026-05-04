import os
import json
from datetime import datetime

# Naik 2 level ke root
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def catat_log(user, kategori, aksi):
    """Fungsi sakti untuk mencatat aktifitas ke audit_log.json"""
    log_file = os.path.join(BASE_DIR, 'audit_log.json')
    
    waktu_sekarang = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_baru = {
        "waktu": waktu_sekarang,
        "user": user,
        "kategori": kategori,
        "aksi": aksi
    }
    
    logs = []
    if os.path.exists(log_file):
        try:
            with open(log_file, 'r', encoding='utf-8') as f:
                logs = json.load(f)
        except:
            logs = []
            
    logs.insert(0, log_baru)
    logs = logs[:500]
    
    try:
        with open(log_file, 'w', encoding='utf-8') as f:
            json.dump(logs, f, indent=4, ensure_ascii=False)
    except Exception as e:
        print(f"[Error Log] Gagal mencatat log: {e}")