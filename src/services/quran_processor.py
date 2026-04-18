import os
import json
import re
from mutagen.mp3 import MP3

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

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
                
                # 1. Ambil teks mentah dari file txt
                raw_arab = teks_arab.get(s_num, {}).get(a_num, "")
                raw_indo = teks_indo.get(s_num, {}).get(a_num, "")

                # ========================================================
                # 2. PEMBERSIHAN TEKS BISMILLAH BAWAAN PADA AYAT 1
                # ========================================================
                # Hanya potong jika ini ayat 1 DAN surat ini memang butuh bismillah (Bukan Al-Fatihah/At-Tawbah)
                if a == 1 and master_data[s_num]["requires_bismillah"]:
                    
                    # Hapus Bismillah teks Arab
                    bismillah_arab = "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ"
                    if raw_arab.startswith(bismillah_arab):
                        # Potong string bismillah dan hapus spasi kosong di depannya
                        raw_arab = raw_arab[len(bismillah_arab):].strip()
                        
                    # Hapus Bismillah teks Indonesia (Ada 2 versi yang sering dipakai Kemenag/Tanzil)
                    bismillah_indo_1 = "Dengan menyebut nama Allah Yang Maha Pemurah lagi Maha Penyayang."
                    bismillah_indo_2 = "Dengan nama Allah Yang Maha Pengasih, Maha Penyayang."
                    
                    if raw_indo.startswith(bismillah_indo_1):
                        raw_indo = raw_indo[len(bismillah_indo_1):].strip()
                    elif raw_indo.startswith(bismillah_indo_2):
                        raw_indo = raw_indo[len(bismillah_indo_2):].strip()

                # 3. Teks khusus untuk ayat 000 (File Bismillah Mandiri)
                if a == 0:
                    raw_arab = "بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ"
                    raw_indo = "Dengan menyebut nama Allah Yang Maha Pemurah lagi Maha Penyayang."
                
                # 4. Masukkan ke master data
                master_data[s_num]["ayahs"][a_num] = {
                    "durasi": durasi,
                    "arab": raw_arab,
                    "indo": raw_indo
                }

        output_path = os.path.join(self.output_dir, f"quran_master_{qari_name}.json")
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(master_data, f, ensure_ascii=False, indent=2)
        
        return True, f"Metadata {qari_name} berhasil dibuat."
