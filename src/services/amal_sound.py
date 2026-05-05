import os
import json

# WAJIB: Kunci folder utama aplikasi agar tidak salah baca file
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

class SoundEngine:
    def __init__(self):
        # PERBAIKAN 1: Gunakan BASE_DIR untuk semua path
        self.config_path = os.path.join(BASE_DIR, "config.json")
        self.status_path = os.path.join(BASE_DIR, "data", "status_bacaan.json")
        self.generated_dir = os.path.join(BASE_DIR, "data", "generated")
        self.audio_base = os.path.join(BASE_DIR, "static", "audio")

    def _load_json(self, path, default=None):
        if os.path.exists(path):
            with open(path, 'r', encoding='utf-8') as f:
                return json.load(f)
        return default or {}

    def _save_json(self, path, data):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=4)

    def get_status(self):
        """Membaca posisi terakhir, jika tidak ada maka buat berkas baru dengan default Al-Fatihah 1"""
        # Cek apakah file ada
        if not os.path.exists(self.status_path):
            default_data = {
                "surat": "001", 
                "ayat": "001"
            }
            # Buat berkas baru
            self._save_json(self.status_path, default_data)
            return default_data
        
        # Jika ada, load seperti biasa
        return self._load_json(self.status_path)

    def build_playlist(self):
        """Fungsi utama merakit playlist untuk jadwal shalat terdekat"""
        
        # 1. Cek Konfigurasi Admin (Lapis 1)
        config = self._load_json(self.config_path).get("audio_settings", {})
        if not config.get("murottal_aktif", False):
            return False, "Murotaal dinonaktifkan oleh Admin.", None

        qari_aktif = config.get("qari_aktif", "")
        if not qari_aktif:
            return False, "Qari belum dipilih.", None

        # 2. Muat Metadata Qari (Master JSON)
        master_path = os.path.join(self.generated_dir, f"quran_master_{qari_aktif}.json")
        if not os.path.exists(master_path):
            return False, f"Metadata untuk {qari_aktif} belum diproses.", None
        
        metadata = self._load_json(master_path)
        
        # Pengaturan Waktu
        target_detik = config.get("target_durasi_menit", 10) * 60
        toleransi_detik = config.get("toleransi_tamat_menit", 3) * 60

        # Status Terakhir
        status = self.get_status()
        curr_surat = status["surat"]
        curr_ayat = status["ayat"]

        playlist = []
        total_durasi = 0.0

        # --- ADAB 1: Selalu mulai dengan Ta'awwudh ---
        playlist.append({
            "tipe": "core",
            "file": "core/taawudh.mp3",
            "teks_arab": "أَعُوذُ بِٱللَّهِ مِنَ ٱلشَّيْطَانِ ٱلرَّجِيمِ",
            "teks_indo": "Aku berlindung kepada Allah dari godaan setan yang terkutuk."
        })
        total_durasi += 5.0 # Estimasi durasi taawudh jika tidak dilacak

        # 3. Looping Pengumpulan Ayat
        selesai_kumpul = False
        
        while not selesai_kumpul:
            data_surat = metadata.get(curr_surat)
            if not data_surat:
                break # Keamanan jika data surat hilang

            total_ayat_di_surat = data_surat["total_ayahs"]

            # --- ADAB 2: Pengecekan Basmalah ---
            if curr_ayat == "001" and data_surat["requires_bismillah"]:
                # Ambil data ayat 000 (jika ada)
                ayat_000 = data_surat["ayahs"].get("000", {})
                
                # Cek apakah Qari punya basmalah sendiri DAN file aslinya ada (durasi > 0)
                if ayat_000 and ayat_000.get("durasi", 0) > 0:
                    playlist.append({
                        "tipe": "bismillah",
                        "file": f"quran/{qari_aktif}/{curr_surat}000.mp3",
                        "teks_arab": ayat_000["arab"],
                        "teks_indo": ayat_000["indo"]
                    })
                    total_durasi += ayat_000["durasi"]
                else:
                    # Fallback ke bismillah generik
                    playlist.append({
                        "tipe": "bismillah",
                        "file": "core/bismillah.mp3",
                        "teks_arab": "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ",
                        "teks_indo": "Dengan menyebut nama Allah Yang Maha Pemurah lagi Maha Penyayang."
                    })
                    total_durasi += 4.0 

            # Ambil data ayat utama
            data_ayat = data_surat["ayahs"].get(curr_ayat)
            if data_ayat:
                playlist.append({
                    "tipe": "ayat",
                    "surat": data_surat["nama_latin"],
                    "ayat_num": f"{int(curr_surat)}:{int(curr_ayat)}",
                    "file": f"quran/{qari_aktif}/{curr_surat}{curr_ayat}.mp3",
                    "teks_arab": data_ayat["arab"],
                    "teks_indo": data_ayat["indo"]
                })
                total_durasi += data_ayat["durasi"]

            # Evaluasi Waktu (Apakah sudah mencapai 10 menit?)
            if total_durasi >= target_detik:
                # Hitung estimasi sisa durasi di surat ini
                estimasi_sisa_durasi = 0
                for a in range(int(curr_ayat) + 1, total_ayat_di_surat + 1):
                    a_str = str(a).zfill(3)
                    estimasi_sisa_durasi += data_surat["ayahs"].get(a_str, {}).get("durasi", 0)

                # Jika sisa durasi masih lama (lewat batas toleransi), tandai selesai
                if estimasi_sisa_durasi > toleransi_detik or estimasi_sisa_durasi == 0:
                    selesai_kumpul = True 

            # --- PERUBAHAN DI SINI ---
            # Kita majukan ayat DAHULU, baru cek apakah loop harus berhenti
            next_ayat_int = int(curr_ayat) + 1
            if next_ayat_int > total_ayat_di_surat:
                curr_surat = str(int(curr_surat) + 1).zfill(3)
                curr_ayat = "001"
                if int(curr_surat) > 114:
                    curr_surat = "001" 
            else:
                curr_ayat = str(next_ayat_int).zfill(3)

            # Jika sudah ditandai selesai_kumpul, hentikan loop SEKARANG
            # Posisi curr_surat dan curr_ayat sudah berada di titik "selanjutnya"
            if selesai_kumpul:
                break 

        # PERBAIKAN 2: Variabel cetak log sudah dibenarkan
        print(f"Status Bookmark Akhir = Surat: {curr_surat}, Ayat: {curr_ayat}")
        print(f"Total Durasi Dirakit: {round(total_durasi, 2)} detik.")

        # --- TAMBAHKAN BLOK INI UNTUK DEBUGGING TERMINAL ---
        print("\n=== ISI PLAYLIST YANG AKAN DIPUTAR ===")
        for i, item in enumerate(playlist):
            # Coba ambil info ayat jika ada, jika tidak kosongkan
            info = item.get('ayat_num', 'Lainnya') 
            print(f"{i+1}. [{item['tipe'].upper()}] -> File: {item['file']} | Ayat: {info}")
        print("======================================\n")
        # ---------------------------------------------------
        
        self._save_json(self.status_path, {
            "surat": curr_surat,
            "ayat": curr_ayat
        })

        return True, "Playlist berhasil dirakit", {
            "qari": qari_aktif,
            "total_detik": round(total_durasi, 2),
            "playlist": playlist
        }
    
    def get_single_ayat(self, qari, curr_surat, curr_ayat):
        """Mengambil data satu ayat dan menentukan ayat berikutnya"""
        master_path = os.path.join(self.generated_dir, f"quran_master_{qari}.json")
        if not os.path.exists(master_path):
            return None

        metadata = self._load_json(master_path)
        data_surat = metadata.get(curr_surat)
        if not data_surat: return None

        total_ayat_di_surat = data_surat["total_ayahs"]
        
        # Penanganan Bismillah di awal surat (opsional, bisa Anda kembangkan)
        # Untuk kesederhanaan, kita langsung tembak ayat yang diminta.
        data_ayat = data_surat["ayahs"].get(curr_ayat)
        if not data_ayat: return None

        item_ayat = {
            "surat_nama": data_surat["nama_latin"],
            "ayat_num": f"{int(curr_surat)}:{int(curr_ayat)}",
            "file": f"quran/{qari}/{curr_surat}{curr_ayat}.mp3",
            "teks_arab": data_ayat["arab"],
            "teks_indo": data_ayat["indo"]
        }

        # Kalkulasi indeks berikutnya[cite: 1]
        next_ayat_int = int(curr_ayat) + 1
        next_surat = curr_surat
        next_ayat = str(next_ayat_int).zfill(3)

        if next_ayat_int > total_ayat_di_surat:
            next_surat = str(int(curr_surat) + 1).zfill(3)
            next_ayat = "001"
            if int(next_surat) > 114:
                next_surat = "001"

        return item_ayat, next_surat, next_ayat
    
    def get_taawudh(self):
        """Mengembalikan data audio dan teks untuk Ta'awwudh"""
        return {
            "surat_nama": "Mulai Tilawah",
            "ayat_num": "Ta'awwudh",
            "file": "core/taawudh.mp3",
            "teks_arab": "أَعُوذُ بِٱللَّهِ مِنَ ٱلشَّيْطَانِ ٱلرَّجِيمِ",
            "teks_indo": "Aku berlindung kepada Allah dari godaan setan yang terkutuk."
        }

    def get_bismillah(self, qari, curr_surat):
        """Mengembalikan data Bismillah sesuai Qari dan Surat, atau None jika tidak perlu"""
        master_path = os.path.join(self.generated_dir, f"quran_master_{qari}.json")
        metadata = self._load_json(master_path)
        data_surat = metadata.get(curr_surat)

        # Jika surat tidak butuh basmalah (seperti At-Taubah), kembalikan None
        if not data_surat or not data_surat.get("requires_bismillah"):
            return None
        
        # Cek apakah Qari punya bismillah sendiri (di ayat 000)
        ayat_000 = data_surat["ayahs"].get("000", {})
        if ayat_000 and ayat_000.get("durasi", 0) > 0:
            return {
                "surat_nama": data_surat["nama_latin"],
                "ayat_num": "Basmalah",
                "file": f"quran/{qari}/{curr_surat}000.mp3",
                "teks_arab": ayat_000["arab"],
                "teks_indo": ayat_000["indo"]
            }
        else:
            # Fallback ke Bismillah bawaan sistem (core)
            return {
                "surat_nama": data_surat["nama_latin"],
                "ayat_num": "Basmalah",
                "file": "core/bismillah.mp3",
                "teks_arab": "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ",
                "teks_indo": "Dengan menyebut nama Allah Yang Maha Pemurah lagi Maha Penyayang."
            }