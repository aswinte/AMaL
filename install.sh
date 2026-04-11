#!/bin/bash
# AMaL Kiosk Auto-Installer untuk Raspberry Pi / Linux (DietPi Optimized)

echo "🚀 Memulai Instalasi AMaL Kiosk..."

# 1. Update & Instal Dependensi Sistem (Termasuk Compiler C++ & Header Python)
# Menambahkan python3-scipy agar kompilasi di RasPi lebih ringan
sudo apt update
sudo apt install -y python3-pip python3-venv libopenjp2-7 libtiff6 \
                    python3-numpy python3-scipy python3-matplotlib python3-cartopy \
                    libgeos-dev libproj-dev binutils \
                    build-essential g++ python3-dev \
                    fonts-hosny-amiri fonts-noto-color-emoji fonts-symbola \
                    fonts-noto-core fonts-arabeyes fonts-sil-scheherazade

sudo fc-cache -fv

# 2. Setup Virtual Environment
python3 -m venv venv
source venv/bin/activate

# 3. Instal Dependensi Python
pip install --upgrade pip
pip install -r requirements.txt

# 4. Buat Folder yang Dibutuhkan
mkdir -p cache static/json static/img/pengumuman/archive static/images

# 5. Unduh Aset Astronomi NASA Asli (de421.bsp)
if [ ! -f "de421.bsp" ]; then
    echo "📥 Mengunduh data NASA de421.bsp (16MB)..."
    wget -O de421.bsp https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/a_old_versions/de421.bsp
fi

# 6. Unduh Aset Peta Batas Negara (Shapefile Cartopy 110m)
echo "📥 Mengunduh Shapefile batas negara untuk visualisasi peta (Offline Prep)..."
python3 -c "import cartopy.io.shapereader as shpreader; shpreader.natural_earth(resolution='110m', category='cultural', name='admin_0_countries')"

# 7. Inisialisasi Kalender Tahun Berjalan
echo "⚙️ Menghitung kalender tahun berjalan (Membangun Cache Awal)..."
python3 -c "from generator_tahunan import generate_adaptif; generate_adaptif(2026, -7.4589, 109.2882, 'Sokaraja', True)"

echo "✅ Instalasi Selesai! Jalankan aplikasi dengan: source venv/bin/activate && python app.py"