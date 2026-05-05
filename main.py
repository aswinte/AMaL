# AMaL: (A)njungan (M)asjid bebas-terbuk(a)/(L)ibre

# ==========================================
# 1. IMPORTS
# ==========================================
# Standar Python
import os
import time
import logging
import threading
import tempfile
from datetime import timedelta

# Pustaka Eksternal (Third-Party)
from flask import Flask, jsonify, request, session, redirect, url_for

# Modul Internal (Workers, Routes, Utils)
from src.workers.audio_worker import init_smart_audio, audio_background_worker
from src.workers.main_worker import maintenance_worker
from src.routes.api_admin import api_admin_bp
from src.routes.api_konten import api_konten_bp
from src.routes.api_waktu import api_waktu_bp
from src.routes.web_routes import web_bp
from src.routes.api_audio import api_audio_bp
from src.utils.session import global_active_session

# ==========================================
# 2. KONFIGURASI SISTEM & FLASK
# ==========================================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Paksa sistem menggunakan folder data AMaL sebagai tempat transit (bukan RAM)
temp_dir = os.path.join(BASE_DIR, 'data', 'uploads_temp')
os.makedirs(temp_dir, exist_ok=True)
tempfile.tempdir = temp_dir

app = Flask(__name__, 
            template_folder=os.path.join(BASE_DIR, 'templates'),
            static_folder=os.path.join(BASE_DIR, 'static'))
app.secret_key = os.urandom(24)
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=2)
app.config['MAX_CONTENT_LENGTH'] = 3000 * 1024 * 1024  # Batas maksimal 3 GB

# ==========================================
# 3. FILTER LOGGING (Mencegah Spam Terminal)
# ==========================================
class EndpointFilter(logging.Filter):
    def filter(self, record):
        msg = record.getMessage()
        muted_endpoints = [         # Daftar kata kunci/endpoint yang ingin dibisukan
            '/api/simulasi',
            '/static/images/moon200.png',
            '/api/audio_state',
            '/api/heartbeat'
        ]
        return not any(endpoint in msg for endpoint in muted_endpoints)

log = logging.getLogger('werkzeug')
log.addFilter(EndpointFilter())

# ==========================================
# 4. REGISTRASI BLUEPRINT (Rute Aplikasi)
# ==========================================
app.register_blueprint(api_admin_bp)
app.register_blueprint(api_konten_bp)
app.register_blueprint(api_waktu_bp)
app.register_blueprint(web_bp)
app.register_blueprint(api_audio_bp)

# ==========================================
# 5. MIDDLEWARE (Pencegat & Detak Jantung)
# ==========================================
@app.before_request
def enforce_single_session():
    global global_active_session
    """Fungsi pencegat: Tendang user jika ada yang mengambil alih sesi"""
    if session.get('logged_in'):
        if session.get('session_id') != global_active_session.get('session_id'):
            session.clear()
            if request.is_json:
                return jsonify({"status": "kicked", "msg": "Sesi Anda telah diputus oleh Superadmin."}), 401
            else:
                return redirect(url_for('web.login', kicked='1'))

@app.route('/api/heartbeat', methods=['POST'])
def api_heartbeat():
    global global_active_session
    """Menerima detak jantung dari layar admin agar sesi tetap hidup"""
    if session.get('logged_in') and session.get('session_id') == global_active_session.get('session_id'):
        global_active_session['last_ping'] = time.time()
        return jsonify({"status": "ok"})
    return jsonify({"status": "kicked"}), 401

# ==========================================
# 6. TITIK MASUK UTAMA (MAIN ENTRY)
# ==========================================
_threads_started = False

if __name__ == '__main__':
    if not _threads_started:
        print("\n" + "="*40)
        print(" [AMaL System] MENGHIDUPKAN MESIN LATAR")
        print("="*40)
        
        # Inisialisasi Audio Engine
        status_audio = init_smart_audio()
        print(f"[AMaL System] Mesin Audio terkunci pada mode: {status_audio}")
        
        # 1. Jalankan Audio Background Worker
        audio_thread = threading.Thread(target=audio_background_worker, daemon=True)
        audio_thread.start()
        print(" -> Mesin Audio: AKTIF")
        
        # 2. Jalankan Maintenance Worker
        mtx_thread = threading.Thread(target=maintenance_worker, daemon=True)
        mtx_thread.start()
        print(" -> Mesin Pemeliharaan: AKTIF")
        
        _threads_started = True
        print("="*40 + "\n")
        
    app.run(debug=False, host='0.0.0.0', port=5000, use_reloader=False)