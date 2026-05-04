import os
import json
import shutil
import time
import zipfile
import pygame
from flask import Blueprint, request, jsonify, session
from werkzeug.utils import secure_filename

from src.utils.logger import catat_log
from src.services.quran_processor import QuranProcessor

from src.utils.state import state_simulasi, state_audio

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

api_audio_bp = Blueprint('api_audio', __name__)

# ==========================================
# 1. SIMULASI & KENDALI MEDIA
# ==========================================
@api_audio_bp.route('/api/simulasi', methods=['GET', 'POST'])
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

# API untuk Frontend Kiosk (mengambil lirik/ayat yang sedang diputar)
@api_audio_bp.route('/api/audio_state')
def get_audio_state():
    return jsonify(state_audio)

# ==========================================
# 2. MANAJEMEN QARI
# ==========================================
@api_audio_bp.route('/api/list_qari', methods=['GET'])
def list_qari():
    """Mengambil daftar folder Qari yang tersedia"""
    base_path = os.path.join(BASE_DIR, "static", "audio", "quran")
    if not os.path.exists(base_path):
        os.makedirs(base_path, exist_ok=True)
    
    # Ambil info qari_aktif dari config.json
    config_path = os.path.join(BASE_DIR, 'config.json')
    active_qari = ""
    if os.path.exists(config_path):
        with open(config_path, 'r', encoding='utf-8') as f:
            active_qari = json.load(f).get('audio_settings', {}).get('qari_aktif', "")
    
    folders = [f for f in os.listdir(base_path) if os.path.isdir(os.path.join(base_path, f))]
    qari_list = []
    
    for f in folders:
        json_path = os.path.join(BASE_DIR, "data", "generated", f"quran_master_{f}.json")
        qari_list.append({
            "name": f,
            "has_metadata": os.path.exists(json_path),
            "is_active": (f == active_qari) # Tambahkan flag status aktif
        })
    
    return jsonify(qari_list)

@api_audio_bp.route('/api/upload_qari', methods=['POST'])
def upload_qari():
    """Menangani unggahan ZIP Murottal dan mengekstraknya"""
    if 'file' not in request.files:
        return jsonify({"status": "error", "msg": "Tidak ada file yang diunggah"})
    
    file = request.files['file']
    qari_name = request.form.get('qari_name', '').strip()
    
    if not qari_name or file.filename == '':
        return jsonify({"status": "error", "msg": "Nama Qari dan File wajib diisi"})
    
    # Amankan nama folder
    qari_name = secure_filename(qari_name).lower()
    temp_path = os.path.join(BASE_DIR, "data", "uploads", "uploads_temp", file.filename)
    extract_path = os.path.join(BASE_DIR, "static", "audio", "quran", qari_name)
    
    os.makedirs(os.path.dirname(temp_path), exist_ok=True)
    file.save(temp_path)
    
    try:
        with zipfile.ZipFile(temp_path, 'r') as zip_ref:
            # Pastikan folder ekstraksi bersih atau buat baru
            if os.path.exists(extract_path):
                shutil.rmtree(extract_path)
            os.makedirs(extract_path, exist_ok=True)
            
            # Ekstrak semua file langsung ke folder qari_name
            # (Jika ZIP berisi folder, kita mungkin perlu logika perapihan lebih lanjut)
            zip_ref.extractall(extract_path)
            
        os.remove(temp_path) # Hapus ZIP setelah selesai
        return jsonify({"status": "success", "msg": f"Berhasil mengekstrak {qari_name}"})
    except Exception as e:
        return jsonify({"status": "error", "msg": str(e)})

@api_audio_bp.route('/api/delete_qari', methods=['POST'])
def delete_qari():
    """Menghapus data audio dan metadata Qari"""
    qari_name = request.json.get('qari_name')
    if not qari_name: return jsonify({"status": "error", "msg": "Nama Qari tidak valid"})
    
    try:
        # Hapus Audio
        audio_path = os.path.join(BASE_DIR, "static", "audio", "quran", qari_name)
        if os.path.exists(audio_path): shutil.rmtree(audio_path)
        
        # Hapus Metadata
        json_path = os.path.join(BASE_DIR, "data", "generated", f"quran_master_{qari_name}.json")
        if os.path.exists(json_path): os.remove(json_path)
        
        return jsonify({"status": "success", "msg": f"Qari {qari_name} berhasil dihapus"})
    except Exception as e:
        return jsonify({"status": "error", "msg": str(e)})

@api_audio_bp.route('/api/proses_metadata_qari', methods=['POST'])
def proses_metadata():
    qari_name = request.json.get('qari_name')
    if not qari_name:
        return jsonify({"status": "error", "msg": "Nama Qari tidak disertakan"})
    
    processor = QuranProcessor()
    success, message = processor.build_qari_metadata(qari_name)
    
    if success:
        return jsonify({"status": "success", "msg": message})
    else:
        return jsonify({"status": "error", "msg": message})

# ==========================================
# 3. UJI COBA SUARA
# ==========================================
@api_audio_bp.route('/api/test_audio', methods=['POST'])
def api_test_audio():
    # Keamanan: Hanya admin yang bisa memicu suara
    if not session.get('logged_in'):
        return jsonify({"status": "error", "msg": "Akses Ditolak"}), 401
        
    try:
        # Kita gunakan file bismillah sebagai suara tes
        file_test = os.path.join(BASE_DIR, "static", "audio", "core", "bismillah.mp3")
        
        if not os.path.exists(file_test):
            return jsonify({"status": "error", "msg": "File bismillah.mp3 tidak ditemukan"}), 404
            
        # Jika mesin sedang memutar sesuatu (misal Murottal/Adzan sedang jalan), kita hentikan dulu
        if pygame.mixer.music.get_busy():
            pygame.mixer.music.stop()
            
        # Putar suara tes
        pygame.mixer.music.load(file_test)
        pygame.mixer.music.play()
        
        # Catat di Audit Log
        catat_log(session.get('username'), "SISTEM", "Menguji coba keluaran suara (Test Audio)")
        
        return jsonify({"status": "success", "msg": "Audio tes (Bismillah) sedang diputar..."})
        
    except Exception as e:
        return jsonify({"status": "error", "msg": str(e)}), 500
