import os
import json
from werkzeug.security import generate_password_hash

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ADMIN_FILE = os.path.join(BASE_DIR, 'admin.json')

def load_admin_data():
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

    if not os.path.exists(ADMIN_FILE):
        return buat_default()
        
    try:
        with open(ADMIN_FILE, 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"[Warning] File admin.json bermasalah: {e}")
        return buat_default()