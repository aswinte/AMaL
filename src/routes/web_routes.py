import os
import time
from flask import Blueprint, render_template, request, jsonify, session, redirect, url_for
from werkzeug.security import check_password_hash

from src.utils.logger import catat_log
from src.utils.session import global_active_session
from src.utils.auth import load_admin_data

# Naik 2 level ke root
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

web_bp = Blueprint('web', __name__)

# ==========================================
# 1. HALAMAN UTAMA (INDEX)
# ==========================================
@web_bp.route('/')
def index():
    # baca config.json langsung dengan os.path.join(BASE_DIR, 'config.json')
    from src.services.astronomy import load_config
    
    conf = load_config()
    debug_mode = conf.get("debug_mode", False)
    
    # Mencari lokasi file JS untuk cek waktu modifikasi terakhir (Cache Busting)
    script_path = os.path.join(BASE_DIR, 'static', 'js', 'script.js')
    
    mtime = int(os.path.getmtime(script_path)) if os.path.exists(script_path) else 0
    
    return render_template('index.html', v=mtime, debug=debug_mode)

# ==========================================
# 2. LOGIN & LOGOUT
# ==========================================
@web_bp.route('/login', methods=['GET', 'POST'])
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
            return redirect(url_for('web.halaman_admin'))
            
        if request.is_json:
            return jsonify({"status": "error", "msg": "Username atau Password salah!"}), 401
        return "Login Gagal. Silakan kembali.", 401

    kicked = request.args.get('kicked')
    return render_template('login.html', kicked=kicked)

@web_bp.route('/logout')
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
    return redirect(url_for('web.login'))

# ==========================================
# 3. HALAMAN ADMIN
# ==========================================
@web_bp.route('/admin')
def halaman_admin():
    # CEGAHAN KEAMANAN: Jika belum ada session login, tendang balik ke halaman login
    if not session.get('logged_in'):
        return redirect(url_for('web.login'))
        
    # Jika aman, berikan halaman admin sesuai hak aksesnya
    return render_template('admin.html', 
                           username=session.get('username'), 
                           role=session.get('role'))

# ==========================================
# 4. HALAMAN SET WAKTU
# ==========================================
@web_bp.route('/time')
def halaman_set_waktu():
    # CEGAHAN KEAMANAN: Jika belum ada session login, tendang balik ke halaman login
    if not session.get('logged_in'):
        return redirect(url_for('web.login'))
        
    # Jika aman, berikan halaman admin sesuai hak aksesnya
    return render_template('time.html', 
                           username=session.get('username'), 
                           role=session.get('role'))