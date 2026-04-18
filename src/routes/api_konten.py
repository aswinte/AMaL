import os
import json
import shutil
from flask import Blueprint, request, jsonify, session
from werkzeug.utils import secure_filename

from src.utils.logger import catat_log

# Naik 2 level ke root
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Inisialisasi Blueprint
api_konten_bp = Blueprint('api_konten', __name__)

# ==========================================
# 1. MENGAMBIL ASET PENGUMUMAN
# ==========================================
@api_konten_bp.route('/get_assets')
def get_assets():
    """Men-scan folder gambar pengumuman"""
    path_p = os.path.join(BASE_DIR, 'static', 'img', 'pengumuman')
    if not os.path.exists(path_p): os.makedirs(path_p)
    
    # Hanya ambil file gambar di folder utama (bukan di subfolder archive)
    valid_ext = ('.jpg', '.jpeg', '.png', '.webp')
    images = [f for f in os.listdir(path_p) 
              if os.path.isfile(os.path.join(path_p, f)) and f.lower().endswith(valid_ext)]
    return jsonify(images)

# ==========================================
# 2. ARSIP KEDALUWARSA
# ==========================================
@api_konten_bp.route('/archive_expired', methods=['POST'])
def archive_expired():
    """Memindahkan konten kedaluwarsa ke arsip DENGAN BATASAN KAPASITAS"""
    data = request.json
    content_type = data.get('type') # 'image' atau 'json'
    
    if content_type == 'image':
        filename = data.get('filename')
        src = os.path.join(BASE_DIR, 'static', 'img', 'pengumuman', filename)
        dist_dir = os.path.join(BASE_DIR, 'static', 'img', 'pengumuman', 'archive')
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
        json_path = os.path.join(BASE_DIR, 'static', 'json', 'pengumuman.json')
        archive_path = os.path.join(BASE_DIR, 'static', 'json', 'archive_pengumuman.json')
        
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
# 3. BACA/TULIS BERKAS JSON
# ==========================================
@api_konten_bp.route('/api/json_data/<filename>', methods=['GET', 'POST'])
def api_json_data(filename):
    # Keamanan pintu masuk
    if not session.get('logged_in'):
        return jsonify({"status": "error", "msg": "Akses Ditolak"}), 401

    # Daftar file yang diizinkan untuk diedit via API ini (mencegah akses file sembarangan)
    allowed_files = ['kutipan', 'pengumuman', 'event', 'archive_pengumuman']
    if filename not in allowed_files:
        return jsonify({"status": "error", "msg": "Akses file tidak diizinkan!"}), 403

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
# 4. GAMBAR PENGUMUMAN (CRUD)
# ==========================================
@api_konten_bp.route('/api/gambar_pengumuman', methods=['GET', 'POST', 'PUT', 'DELETE'])
def api_gambar_pengumuman():
    if not session.get('logged_in'):
        return jsonify({"status": "error", "msg": "Akses Ditolak"}), 401

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
# 5. GAMBAR ARSIP
# ==========================================
@api_konten_bp.route('/api/gambar_arsip', methods=['GET', 'DELETE'])
def api_gambar_arsip():
    if not session.get('logged_in'):
        return jsonify({"status": "error", "msg": "Akses Ditolak"}), 401

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