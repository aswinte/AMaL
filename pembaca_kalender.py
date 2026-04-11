import json
import os
from datetime import datetime

def get_hijri_from_json(target_date, metode="NASIONAL_MABIMS"):
    """
    Mengekstraksi tanggal Hijriah dari berkas JSON yang telah dihasilkan oleh generator.
    Algoritma ini menggunakan pencarian sekuensial terbalik (reverse sequential search) 
    untuk menemukan jangkar bulan Hijriah yang paling relevan.
    """
    tahun_masehi = target_date.year
    
    # Memastikan direktori pembacaan merujuk pada lokasi absolut berkas
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    nama_file = os.path.join(BASE_DIR, f"kalender_jangkar_{tahun_masehi}.json")
    
    try:
        with open(nama_file, 'r') as f:
            data_kalender = json.load(f)
    except FileNotFoundError:
        return "Data kalender belum tersedia"

    # Konversi ke format date murni untuk akurasi operasi aritmatika tanggal
    if isinstance(target_date, datetime):
        target_date = target_date.date()

    # Iterasi terbalik untuk mengevaluasi jangkar dari bulan terakhir ke bulan pertama
    for bulan in reversed(data_kalender['jangkar_bulan']):
        str_tgl_1 = bulan['keputusan_metode'][metode]['tgl_1']
        tgl_1_dt = datetime.strptime(str_tgl_1, "%Y-%m-%d").date()
        
        # Evaluasi kondisi: Apakah tanggal target jatuh pada atau setelah tanggal 1 bulan Hijriah ini?
        if target_date >= tgl_1_dt:
            selisih_hari = (target_date - tgl_1_dt).days
            tanggal_hijriah = selisih_hari + 1
            nama_bulan = bulan['bulan_hijriah']
            
            return f"{tanggal_hijriah} {nama_bulan}"

    return "Data di luar jangkauan"