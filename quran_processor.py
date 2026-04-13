import os
import json
import re
from mutagen.mp3 import MP3

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

class QuranProcessor:
    def __init__(self):
        # Jalur ke berkas sumber (Bawaan AMaL di data/quran_base/)
        self.data_dir = os.path.join(BASE_DIR, "data", "quran_base")
        self.js_file = os.path.join(self.data_dir, "quran-data.js")
        self.arab_file = os.path.join(self.data_dir, "quran-uthmani.txt")
        self.indo_file = os.path.join(self.data_dir, "id.indonesian.txt")
        
        self.output_dir = os.path.join(BASE_DIR, "data", "generated")
        os.makedirs(self.output_dir, exist_ok=True)

    def _parse_quran_js(self):
        """Mengekstrak metadata surat dari quran-data.js Tanzil"""
        surah_meta = {}
        try:
            with open(self.js_file, 'r', encoding='utf-8') as f:
                content = f.read()
            # Regex untuk menangkap array: [index, ayas, order, ruku, name, tname, ename, type]
            pattern = re.compile(r"\[\d+,\s*(\d+),\s*\d+,\s*\d+,\s*'([^']+)',\s*\"([^\"]+)\",\s*'[^']+',\s*'([^']+)'\]")
            matches = pattern.findall(content)
            for idx, match in enumerate(matches):
                surah_num = str(idx + 1).zfill(3)
                surah_meta[surah_num] = {
                    "nama_arab": match[1],
                    "nama_latin": match[2],
                    "tipe": match[3],
                    "total_ayahs": int(match[0])
                }
            return surah_meta
        except Exception as e:
            print(f"Error parsing JS: {e}")
            return {}

    def _parse_text_file(self, filepath):
        """Membaca format surah|ayah|teks"""
        text_data = {}
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                for line in f:
                    if not line.strip() or line.startswith('#'): continue
                    parts = line.split('|', 2)
                    if len(parts) == 3:
                        s, a, t = parts[0].zfill(3), parts[1].zfill(3), parts[2].strip()
                        if s not in text_data: text_data[s] = {}
                        text_data[s][a] = t
            return text_data
        except Exception as e:
            print(f"Error parsing {filepath}: {e}")
            return {}

    def build_qari_metadata(self, qari_name):
        """Fungsi utama penggabungan data"""
        audio_dir = os.path.join(BASE_DIR, "static", "audio", "quran", qari_name)
        if not os.path.exists(audio_dir):
            return False, f"Folder audio {qari_name} tidak ditemukan di path: {audio_dir}"

        meta_tanzil = self._parse_quran_js()
        teks_arab = self._parse_text_file(self.arab_file)
        teks_indo = self._parse_text_file(self.indo_file)
        
        master_data = {}
        for i in range(1, 115):
            s_num = str(i).zfill(3)
            # Logika Adab Bismillah
            # Surat 001 (Al-Fatihah) di-false karena ayat pertamanya SUDAH Bismillah.
            # Surat 009 (At-Tawbah) di-false karena memang haram menggunakan Bismillah.
            req_bismillah = False if s_num in ["001", "009"] else True
            
            master_data[s_num] = {
                "nama_arab": meta_tanzil.get(s_num, {}).get("nama_arab", ""),
                "nama_latin": meta_tanzil.get(s_num, {}).get("nama_latin", ""),
                "total_ayahs": meta_tanzil.get(s_num, {}).get("total_ayahs", 0),
                "requires_bismillah": req_bismillah,
                "ayahs": {}
            }

            # Scan durasi (000-Total Ayat)
            for a in range(0, master_data[s_num]["total_ayahs"] + 1):
                a_num = str(a).zfill(3)
                file_path = os.path.join(audio_dir, f"{s_num}{a_num}.mp3")
                durasi = 0
                if os.path.exists(file_path):
                    try: durasi = round(MP3(file_path).info.length, 2)
                    except: pass
                
                # Masukkan data teks (Basmalah pakai teks default jika 000)
                master_data[s_num]["ayahs"][a_num] = {
                    "durasi": durasi,
                    "arab": teks_arab.get(s_num, {}).get(a_num, "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ" if a==0 else ""),
                    "indo": teks_indo.get(s_num, {}).get(a_num, "Dengan menyebut nama Allah..." if a==0 else "")
                }

        output_path = os.path.join(self.output_dir, f"quran_master_{qari_name}.json")
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(master_data, f, ensure_ascii=False, indent=2)
        
        return True, f"Metadata {qari_name} berhasil dibuat."

# import os
# import json
# import re
# from mutagen.mp3 import MP3

# class QuranProcessor:
#     def __init__(self):
#         # Jalur ke berkas sumber (Bawaan AMaL)
#         self.data_dir = "data/quran_base"
#         self.js_file = os.path.join(self.data_dir, "quran-data.js")
#         self.arab_file = os.path.join(self.data_dir, "quran-uthmani.txt")
#         self.indo_file = os.path.join(self.data_dir, "id.indonesian.txt")
        
#         # Jalur keluaran
#         self.output_dir = "data/generated"
#         os.makedirs(self.output_dir, exist_ok=True) # Otomatis buat folder jika tidak ada

#     def _parse_quran_js(self):
#         """Mengekstrak metadata surat dari quran-data.js"""
#         surah_meta = {}
#         try:
#             with open(self.js_file, 'r', encoding='utf-8') as f:
#                 content = f.read()
                
#             # Menggunakan Regex untuk mencari array data surat dari format JS Tanzil
#             # Format: [0, 7, 5, 1, 'الفاتحة', "Al-Faatiha", 'The Opening', 'Meccan']
#             pattern = re.compile(r"\[\d+,\s*(\d+),\s*\d+,\s*\d+,\s*'([^']+)',\s*\"([^\"]+)\",\s*'[^']+',\s*'([^']+)'\]")
#             matches = pattern.findall(content)
            
#             for idx, match in enumerate(matches):
#                 surah_num = str(idx + 1).zfill(3)
#                 surah_meta[surah_num] = {
#                     "nama_arab": match[1],
#                     "nama_latin": match[2],
#                     "tipe": match[3], # Meccan / Medinan
#                     "total_ayahs": int(match[0])
#                 }
#             return surah_meta
#         except Exception as e:
#             print(f"Error parsing quran-data.js: {e}")
#             return {}

#     def _parse_text_file(self, filepath):
#         """Mengekstrak teks berdasarkan format surah|ayah|teks"""
#         text_data = {}
#         try:
#             with open(filepath, 'r', encoding='utf-8') as f:
#                 for line in f:
#                     if line.startswith("#") or not line.strip():
#                         continue # Abaikan komentar/baris kosong
                    
#                     parts = line.split('|', 2)
#                     if len(parts) == 3:
#                         surah = parts[0].zfill(3)
#                         ayah = parts[1].zfill(3)
#                         teks = parts[2].strip()
                        
#                         if surah not in text_data:
#                             text_data[surah] = {}
#                         text_data[surah][ayah] = teks
#             return text_data
#         except Exception as e:
#             print(f"Error parsing {filepath}: {e}")
#             return {}

#     def build_qari_metadata(self, qari_name):
#         """Fungsi utama yang dipanggil saat admin selesai upload ZIP"""
#         audio_dir = os.path.join("static/audio/quran", qari_name)
        
#         if not os.path.exists(audio_dir):
#             return False, f"Folder audio {qari_name} tidak ditemukan."

#         print(f"Membangun metadata untuk Qari: {qari_name}...")
        
#         # 1. Muat Data Dasar
#         meta_tanzil = self._parse_quran_js()
#         teks_arab = self._parse_text_file(self.arab_file)
#         teks_indo = self._parse_text_file(self.indo_file)
        
#         # Teks Basmalah Standar untuk xxx000
#         bismillah_arab = "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ"
#         bismillah_indo = "Dengan menyebut nama Allah Yang Maha Pemurah lagi Maha Penyayang."

#         master_data = {}

#         # 2. Iterasi 114 Surat
#         for i in range(1, 115):
#             surah_num = str(i).zfill(3)
            
#             # Pengecekan Adab Bismillah (True untuk semua kecuali At-Tawbah 009)
#             req_bismillah = False if s_num in ["001", "009"] else True
            
#             master_data[surah_num] = {
#                 "nama_arab": meta_tanzil.get(surah_num, {}).get("nama_arab", ""),
#                 "nama_latin": meta_tanzil.get(surah_num, {}).get("nama_latin", ""),
#                 "total_ayahs": meta_tanzil.get(surah_num, {}).get("total_ayahs", 0),
#                 "requires_bismillah": req_bismillah,
#                 "ayahs": {}
#             }

#             # 3. Pindai Berkas Audio di Folder Qari
#             # Pindai Basmalah (xxx000.mp3) jika ada
#             file_000 = os.path.join(audio_dir, f"{surah_num}000.mp3")
#             if os.path.exists(file_000):
#                 try:
#                     dur_000 = MP3(file_000).info.length
#                     master_data[surah_num]["ayahs"]["000"] = {
#                         "durasi": round(dur_000, 2),
#                         "arab": bismillah_arab,
#                         "indo": bismillah_indo
#                     }
#                 except:
#                     pass

#             # Pindai Ayat-Ayat Utama (001 dst)
#             total_ayat = master_data[surah_num]["total_ayahs"]
#             for a in range(1, total_ayat + 1):
#                 ayah_num = str(a).zfill(3)
#                 file_mp3 = os.path.join(audio_dir, f"{surah_num}{ayah_num}.mp3")
                
#                 # Jika file audio ada, ambil durasinya. Jika tidak, set durasi 0 (sebagai penanda error/hilang)
#                 durasi = 0
#                 if os.path.exists(file_mp3):
#                     try:
#                         durasi = MP3(file_mp3).info.length
#                     except:
#                         pass
                
#                 # Masukkan ke master data beserta teksnya
#                 master_data[surah_num]["ayahs"][ayah_num] = {
#                     "durasi": round(durasi, 2),
#                     "arab": teks_arab.get(surah_num, {}).get(ayah_num, ""),
#                     "indo": teks_indo.get(surah_num, {}).get(ayah_num, "")
#                 }

#         # 4. Simpan Hasil Gabungan
#         output_file = os.path.join(self.output_dir, f"quran_master_{qari_name}.json")
#         with open(output_file, 'w', encoding='utf-8') as f:
#             json.dump(master_data, f, ensure_ascii=False, indent=2)
            
#         return True, f"Berhasil membangun metadata di {output_file}"

# # Contoh Penggunaan (Nanti dipanggil dari app.py):
# # processor = QuranProcessor()
# # status, pesan = processor.build_qari_metadata("mishary_alafasy")
# # print(pesan)