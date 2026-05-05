import os
import time
import json
from datetime import datetime, timedelta
import platform
import pygame

from src.utils.state import state_audio, state_tilawah
from src.services.amal_sound import SoundEngine
from src.services.astronomy import get_prayer_times_data

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ['PYGAME_HIDE_SUPPORT_PROMPT'] = "hide"

def init_smart_audio():
    print("\n[AMaL Debug] Memulai proses inisialisasi mesin audio...")
    
    is_linux = platform.system() == "Linux"
    if is_linux and not os.environ.get('DISPLAY'):
        print("[AMaL Debug] Mode Linux Headless terdeteksi. Memaksa SDL_AUDIODRIVER=alsa")
        os.environ['SDL_AUDIODRIVER'] = 'alsa'

    freq, size, chan, buf = 44100, -16, 2, 4096

    if is_linux:
        jalur_prioritas = [
            ('Hardware Direct (plughw:0,0)', 'plughw:0,0'),
            ('USB Soundcard / HDMI Alt (plughw:1,0)', 'plughw:1,0'),
            ('Default OS', None)
        ]
    else:
        jalur_prioritas = [
            ('Default OS', None)
        ]

    for nama_jalur, audio_dev in jalur_prioritas:
        print(f"[AMaL Debug] -> Mencoba jalur: {nama_jalur}")
        try:
            if audio_dev:
                os.environ['AUDIODEV'] = audio_dev
            elif 'AUDIODEV' in os.environ:
                del os.environ['AUDIODEV']

            pygame.mixer.pre_init(frequency=freq, size=size, channels=chan, buffer=buf)
            pygame.mixer.init()
            
            # PERBAIKAN: Gunakan get_init() bukan get_driver()
            status_init = pygame.mixer.get_init()
            print(f"[AMaL Debug] === BERHASIL di {nama_jalur} ===")
            print(f"[AMaL Debug] Spesifikasi Mixer Aktif: {status_init}")
            
            return nama_jalur
            
        except Exception as e:
            print(f"[AMaL Debug] X GAGAL di {nama_jalur} | Pesan Error: {e}")
            try:
                pygame.mixer.quit()
            except:
                pass

    return "Gagal Total"

def audio_background_worker():
    """Detak Jantung Audio: Memantau waktu dan memutar Murottal, Tarhim, & Adzan"""
    global state_audio
    engine = SoundEngine()
    
    playlist_hari_ini = None
    waktu_putar = None
    
    # --- 3 KUNCI PENGAMAN ---
    sudah_dirakit_untuk_jadwal = "" 
    tarhim_sudah_berbunyi_untuk = "" 
    adzan_sudah_berbunyi_untuk = "" 
    cache_durasi_tarhim = None
    cache_jejak_waktu_tarhim = 0
    
    while True:
        time.sleep(1) 
        try:
            jadwal_hari_ini = get_prayer_times_data()
            if not jadwal_hari_ini:
                continue 
                
            now = datetime.now()
            
            with open(os.path.join(BASE_DIR, 'config.json'), 'r', encoding='utf-8') as f:
                config = json.load(f)
            
            audio_conf = config.get('audio_settings', {})

            # ========================================================
            # 1. PENENTUAN TARGET (Titik Jangkar Waktu)
            # ========================================================
            nama_target, waktu_adzan = get_next_prayer_target(now, jadwal_hari_ini)

            # ========================================================
            # 2. CEK STATUS & DURASI TARHIM (JIKA AKTIF)
            # ========================================================
            tarhim_aktif = audio_conf.get('tarhim_aktif', False)
            durasi_tarhim = 0
            tarhim_path = os.path.join(BASE_DIR, "static", "audio", "core", "tarhim.mp3")
            
            if tarhim_aktif and os.path.exists(tarhim_path):
                # Deteksi kapan file ini terakhir diotak-atik oleh sistem operasi (dalam hitungan detik)
                jejak_waktu_sekarang = os.path.getmtime(tarhim_path)
                
                # Ukur ulang HANYA JIKA: Ingatan kosong ATAU file telah diganti/ditimpa dengan yang baru
                if cache_durasi_tarhim is None or jejak_waktu_sekarang != cache_jejak_waktu_tarhim:
                    try:
                        cache_durasi_tarhim = pygame.mixer.Sound(tarhim_path).get_length()
                        cache_jejak_waktu_tarhim = jejak_waktu_sekarang # Perbarui ingatan jejak waktu
                        print(f"[AMaL Audio] File Tarhim baru terdeteksi! Mengkalibrasi durasi: {round(cache_durasi_tarhim, 2)} detik.")
                    except:
                        cache_durasi_tarhim = 0
                        tarhim_aktif = False # Matikan paksa jika file MP3 korup/rusak
                        print(f"[AMaL Audio] File Tarhim tidak dapat dibaca! Non-aktifkan Tarhim.")
                
                durasi_tarhim = cache_durasi_tarhim
            else:
                tarhim_aktif = False
                cache_durasi_tarhim = None 
                cache_jejak_waktu_tarhim = 0 #

            # ========================================================
            # 3. BLOK MUROTTAL
            # ========================================================
            if audio_conf.get('murottal_aktif', False):
                t_durasi = audio_conf.get('target_durasi_menit', 10) or 10
                t_toleransi = audio_conf.get('toleransi_tamat_menit', 3) or 3
                target_menit = t_durasi + t_toleransi
                batas_rakit = waktu_adzan - timedelta(minutes=target_menit + 5, seconds=durasi_tarhim)
                
                if now >= batas_rakit and now < waktu_adzan and sudah_dirakit_untuk_jadwal != nama_target:
                    print(f"\n[AMaL Audio] Memasuki zona persiapan {nama_target}.")
                    status, pesan, data = engine.build_playlist()
                    
                    if status:
                        playlist_hari_ini = data['playlist']
                        
                        # --- LOGIKA JANGKAR WAKTU (KALKULASI MUNDUR) ---
                        if tarhim_aktif:
                            # Adzan - 60s (Jeda) - Durasi Tarhim - 15s (Jeda) - Durasi Murottal
                            total_mundur = 60 + durasi_tarhim + 15 + data['total_detik']
                        else:
                            # Adzan - 60s (Jeda) - Durasi Murottal
                            total_mundur = 60 + data['total_detik']
                            
                        waktu_putar = waktu_adzan - timedelta(seconds=total_mundur)
                        sudah_dirakit_untuk_jadwal = nama_target 
                        print(f"[AMaL Audio] Selesai! Murottal dijadwalkan pada {waktu_putar.strftime('%H:%M:%S')}")
                    else:
                        print(f"[AMaL Audio] Gagal merakit: {pesan}")
                        sudah_dirakit_untuk_jadwal = nama_target 
                        
                # if sudah_dirakit_untuk_jadwal == nama_target and playlist_hari_ini and now >= waktu_putar and now < waktu_adzan:
                if sudah_dirakit_untuk_jadwal == nama_target and playlist_hari_ini and now >= waktu_putar and (now < waktu_putar + timedelta(seconds=30)):

                    if not state_audio["is_playing"]:
                        state_audio["is_playing"] = True
                        print(f"\n[AMaL Audio] MEMULAI TILAWAH PRA-ADZAN {nama_target.upper()}...")
                        
                        for item in playlist_hari_ini:
                            with open(os.path.join(BASE_DIR, 'config.json'), 'r') as f:
                                if not json.load(f).get('audio_settings', {}).get('murottal_aktif', False): break
                                    
                            file_path = os.path.join(BASE_DIR, "static", "audio", item['file'])
                            if os.path.exists(file_path):
                                state_audio["teks_arab"] = item.get("teks_arab", "")
                                state_audio["teks_indo"] = item.get("teks_indo", "")
                                state_audio["surat_ayat"] = item.get("surat", "") + " " + item.get("ayat_num", "")
                                
                                pygame.mixer.music.load(file_path)
                                pygame.mixer.music.play()
                                while pygame.mixer.music.get_busy(): time.sleep(0.1)
                                    
                        state_audio["is_playing"] = False
                        playlist_hari_ini = None
                        print(f"[AMaL Audio] Tilawah Selesai.")
            else:
                sudah_dirakit_untuk_jadwal = "" 

            # ========================================================
            # 6. BLOK TILAWAH MANUAL (ON-DEMAND)
            # ========================================================
            if state_tilawah.get("aktif"):
                # Hitung DEADLINE (Batas waktu mentok 5 menit sebelum kegiatan berikutnya)
                # 1. Mulai dari waktu Adzan
                batas_waktu_audio = waktu_adzan 
                
                # 2. Tarik mundur jika Tarhim aktif
                if tarhim_aktif:
                    batas_waktu_audio -= timedelta(seconds=(60 + durasi_tarhim))
                    
                # 3. Tarik mundur jika Murottal Otomatis aktif
                if audio_conf.get('murottal_aktif', False):
                    t_durasi = audio_conf.get('target_durasi_menit', 10) or 10
                    t_toleransi = audio_conf.get('toleransi_tamat_menit', 3) or 3
                    batas_waktu_audio -= timedelta(minutes=t_durasi + t_toleransi)
                
                # Deadline absolut: 5 menit sebelum batas_waktu_audio
                deadline_stop = batas_waktu_audio - timedelta(minutes=5)

                if now < deadline_stop:
                    # Ambil posisi terakhir dari file jika user tidak memilih spesifik
                    if not state_tilawah["surat"]:
                        status_terakhir = engine.get_status()
                        state_tilawah["surat"] = status_terakhir["surat"]
                        state_tilawah["ayat"] = status_terakhir["ayat"]

                    qari = state_tilawah["qari"]
                    surat_skrg = state_tilawah["surat"]
                    ayat_skrg = state_tilawah["ayat"]

                    # Variabel penampung apa yang akan diputar di siklus ini
                    item_to_play = None
                    next_surat = surat_skrg
                    next_ayat = ayat_skrg
                    update_posisi_bacaan = False

                    # LOGIKA ANTRETAN TILAWAH (SUTRADARA)
                    if state_tilawah.get("sesi_baru", False):
                        # 1. Putar Ta'awwudh di awal sesi
                        item_to_play = engine.get_taawudh()
                        state_tilawah["sesi_baru"] = False
                        
                    elif ayat_skrg == "001" and state_tilawah.get("perlu_bismillah", True):
                        # 2. Putar Bismillah di awal surat (jika disyaratkan)
                        item_to_play = engine.get_bismillah(qari, surat_skrg)
                        state_tilawah["perlu_bismillah"] = False
                        
                        # Bypass khusus untuk At-Taubah (item_to_play akan bernilai None)
                        if not item_to_play:
                            item_to_play, next_surat, next_ayat = engine.get_single_ayat(qari, surat_skrg, ayat_skrg)
                            state_tilawah["perlu_bismillah"] = True
                            update_posisi_bacaan = True
                            
                    else:
                        # 3. Putar Ayat Utama
                        item_to_play, next_surat, next_ayat = engine.get_single_ayat(qari, surat_skrg, ayat_skrg)
                        state_tilawah["perlu_bismillah"] = True # Reset jika nanti pindah ke surat baru
                        update_posisi_bacaan = True

                    # EKSEKUSI PEMUTARAN AUDIO
                    if item_to_play and not pygame.mixer.music.get_busy():
                        file_path = os.path.join(BASE_DIR, "static", "audio", item_to_play["file"])
                        if os.path.exists(file_path):
                            state_audio["is_playing"] = True
                            state_audio["teks_arab"] = item_to_play["teks_arab"]
                            state_audio["teks_indo"] = item_to_play["teks_indo"]
                            state_audio["surat_ayat"] = f"{item_to_play['surat_nama']} {item_to_play['ayat_num']}"

                            print(f"[AMaL Tilawah] Memutar {state_audio['surat_ayat']}...")
                            
                            pygame.mixer.music.load(file_path)
                            pygame.mixer.music.play()
                            
                            # Tahan loop SELAMA audio ini berbunyi
                            while pygame.mixer.music.get_busy():
                                if not state_tilawah["aktif"]:
                                    break
                                time.sleep(0.1)

                            # Simpan posisi HANYA jika yang baru selesai diputar adalah Ayat (bukan Ta'awwudh/Basmalah)
                            if update_posisi_bacaan:
                                state_tilawah["surat"] = next_surat
                                state_tilawah["ayat"] = next_ayat
                                engine._save_json(engine.status_path, {
                                    "surat": next_surat,
                                    "ayat": next_ayat
                                })
                                
                            state_audio["is_playing"] = False
                            
                else:
                    # Menabrak Deadline H-5 Menit!
                    print(f"[AMaL Tilawah] Waktu habis (Mendekati jadwal otomatis). Tilawah dihentikan.")
                    state_tilawah["aktif"] = False

            # ========================================================
            # 4. BLOK TARHIM
            # ========================================================
            if tarhim_aktif:
                # Kapan Tarhim mulai? Titik Adzan ditarik mundur 60 detik, lalu ditarik mundur lagi sepanjang durasi Tarhim.
                waktu_mulai_tarhim = waktu_adzan - timedelta(seconds=(60 + durasi_tarhim))
                
                # if now >= waktu_mulai_tarhim and now < waktu_adzan and tarhim_sudah_berbunyi_untuk != nama_target:
                if now >= waktu_mulai_tarhim and now < (waktu_mulai_tarhim + timedelta(seconds=45)) and tarhim_sudah_berbunyi_untuk != nama_target:
                    print(f"\n[AMaL Audio] MEMULAI TARHIM {nama_target.upper()}...")
                    
                    state_audio["is_playing"] = True
                    state_audio["teks_arab"] = "الصَّلَاةُ وَالسَّلَامُ عَلَيْكَ" # Bisa diganti jika ada lirik spesifik
                    state_audio["teks_indo"] = f"Tarhim menjelang {nama_target}"
                    state_audio["surat_ayat"] = "Pujian & Shalawat"
                    
                    pygame.mixer.music.load(tarhim_path)
                    pygame.mixer.music.play()
                    
                    while pygame.mixer.music.get_busy():
                        time.sleep(0.1)
                        
                    state_audio["is_playing"] = False
                    tarhim_sudah_berbunyi_untuk = nama_target
                    print(f"[AMaL Audio] Tarhim Selesai. Menunggu 1 menit menuju Adzan {nama_target}.")

            # ========================================================
            # 5. BLOK ADZAN
            # ========================================================
            if now >= waktu_adzan and adzan_sudah_berbunyi_untuk != nama_target:
                
                # Reset kunci Murottal & Tarhim agar siap merakit untuk jadwal shalat selanjutnya
                sudah_dirakit_untuk_jadwal = ""
                tarhim_sudah_berbunyi_untuk = "" 
                
                if audio_conf.get('adzan_aktif', False):
                    print(f"\n[AMaL Audio] MEMULAI PANGGILAN ADZAN {nama_target.upper()}...")
                    
                    file_adzan = "fajr.mp3" if nama_target == "Subuh" else "adzan.mp3"
                    file_path = os.path.join(BASE_DIR, "static", "audio", "core", file_adzan)
                    
                    if os.path.exists(file_path):
                        state_audio["is_playing"] = True
                        state_audio["teks_arab"] = "حَيَّ عَلَى الصَّلَاةِ"
                        state_audio["teks_indo"] = f"Adzan {nama_target} Berkumandang"
                        state_audio["surat_ayat"] = "Panggilan Shalat"
                        
                        pygame.mixer.music.load(file_path)
                        pygame.mixer.music.play()
                        
                        while pygame.mixer.music.get_busy():
                            time.sleep(0.1)
                            
                        state_audio["is_playing"] = False
                        print(f"[AMaL Audio] Adzan {nama_target} Selesai.")
                    else:
                        print(f"[AMaL Audio] Peringatan: File {file_adzan} tidak ditemukan!")
                
                adzan_sudah_berbunyi_untuk = nama_target
                
        except Exception as e:
            print(f"[AMaL Audio Worker] Error: {e}")
            time.sleep(5)

def get_next_prayer_target(now, jadwal_hari_ini):
    """
    Mencari waktu shalat terdekat yang belum tiba.
    Urutan: Subuh, Dzuhur, Ashar, Maghrib, Isya.
    """
    # Urutan shalat yang didukung untuk fitur Tarhim
    urutan_shalat = ["Subuh", "Dzuhur", "Ashar", "Maghrib", "Isya"]
    
    for nama_shalat in urutan_shalat:
        waktu_str = jadwal_hari_ini.get(nama_shalat)
        if not waktu_str:
            continue
            
        jam, menit = map(int, waktu_str.split(':'))
        waktu_target = now.replace(hour=jam, minute=menit, second=0, microsecond=0)
        
        # Jika waktu target masih di masa depan, inilah target kita, target adalah waktu adzan, ditambah dengan toleransi 2 menit untuk memastikan pengecekan persis saat waktu adzan tidak mengembalikan waktu adzan berikutnya
        if (waktu_target + timedelta(minutes=2)) > now:
            return nama_shalat, waktu_target
            
    # Jika semua sudah lewat (setelah Isya), maka targetnya adalah Subuh besok
    # Kita asumsikan jam Subuh besok kurang lebih sama dengan hari ini 
    # (atau sistem akan update cache saat lewat tengah malam)
    waktu_str_subuh = jadwal_hari_ini.get("Subuh", "04:30")
    jam, menit = map(int, waktu_str_subuh.split(':'))
    besok = now + timedelta(days=1)
    waktu_subuh_besok = besok.replace(hour=jam, minute=menit, second=0, microsecond=0)
    
    return "Subuh", waktu_subuh_besok