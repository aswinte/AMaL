import os
import json
from flask import Blueprint, request, jsonify, session
from werkzeug.security import generate_password_hash, check_password_hash

from src.utils.logger import catat_log
from src.utils.auth import load_admin_data

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Inisialisasi Blueprint
api_admin_bp = Blueprint('api_admin', __name__)

@api_admin_bp.route('/api/config', methods=['GET', 'POST'])
def api_config():
    if not session.get('logged_in'):
        return jsonify({"status": "error", "msg": "Akses Ditolak"}), 401
        
    config_path = os.path.join(BASE_DIR, 'config.json')

    if request.method == 'GET':
        try:
            with open(config_path, 'r') as f:
                return jsonify(json.load(f))
        except Exception as e:
            return jsonify({"status": "error", "msg": str(e)}), 500

    if request.method == 'POST':
        try:
            new_data = request.json
            with open(config_path, 'r') as f:
                current_config = json.load(f)
                
            current_config.update(new_data)
            with open(config_path, 'w') as f:
                json.dump(current_config, f, indent=4)
            
            catat_log(session.get('username', 'Unknown'), "CONFIG", "Memperbarui Profil & Lokasi Masjid")
            return jsonify({"status": "success", "msg": "Konfigurasi berhasil disimpan!"})
        except Exception as e:
            return jsonify({"status": "error", "msg": str(e)}), 500

@api_admin_bp.route('/api/logs', methods=['GET'])
def api_logs():
    if not session.get('logged_in'):
        return jsonify({"status": "error", "msg": "Akses Ditolak"}), 401
        
    log_file = os.path.join(BASE_DIR, 'audit_log.json')
    if os.path.exists(log_file):
        try:
            with open(log_file, 'r', encoding='utf-8') as f:
                return jsonify(json.load(f))
        except:
            pass
    return jsonify([]) 

@api_admin_bp.route('/api/users', methods=['GET', 'POST', 'DELETE'])
def api_users():
    # KEAMANAN: Hanya Superadmin yang boleh mengakses fitur ini!
    if not session.get('logged_in') or session.get('role') != 'superadmin':
        return jsonify({"status": "error", "msg": "Akses Ditolak. Khusus Superadmin."}), 403

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

@api_admin_bp.route('/api/ganti_password', methods=['POST'])
def api_ganti_password():
    # Fitur ini bisa diakses oleh SEMUA user yang sedang login
    if not session.get('logged_in'):
        return jsonify({"status": "error", "msg": "Akses Ditolak"}), 401

    data = request.json
    password_lama = data.get('password_lama')
    password_baru = data.get('password_baru')
    username = session.get('username')

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

@api_admin_bp.route('/api/cities', methods=['GET'])
def api_cities():
    if not session.get('logged_in'):
        return jsonify({"status": "error"}), 401
        
    cities_path = os.path.join(BASE_DIR, 'static', 'json', 'cities.json')
    try:
        with open(cities_path, 'r') as f:
            return jsonify(json.load(f))
    except Exception as e:
        # Fallback jika file gagal dibaca
        return jsonify({"Sokaraja": {"lat": -7.4589, "lon": 109.2882, "tz": 7}})

@api_admin_bp.route('/api/update_config', methods=['POST'])
def update_config():
    """Menyimpan pembaruan pengaturan dari panel Admin ke config.json"""
    try:
        new_data = request.json
        config_path = os.path.join(BASE_DIR, 'config.json')

        # 1. Baca konfigurasi yang ada saat ini
        if os.path.exists(config_path):
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
        else:
            config = {}

        # 2. Perbarui blok audio_settings (gabungkan data baru tanpa menghapus data lama)
        if 'audio_settings' in new_data:
            if 'audio_settings' not in config:
                config['audio_settings'] = {}
            # Update hanya nilai yang dikirim dari JS
            config['audio_settings'].update(new_data['audio_settings'])

        # (Opsional) Jika ke depannya ada pengaturan lain yang mau diupdate, 
        # bisa ditambahkan di sini.

        # 3. Tulis kembali ke config.json
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=4, ensure_ascii=False)

        return jsonify({"status": "success", "msg": "Konfigurasi berhasil disimpan"})

    except Exception as e:
        print(f"Error update config: {e}")
        return jsonify({"status": "error", "msg": str(e)}), 500