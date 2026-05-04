# Panduan Instalasi AMaL di komputer lokal atau Raspberry Pi.

## Perangkat Keras
Perangkat keras yang dibutuhkan adalah sebagai berikut.
1. Komputer personal atau mini PC atau SoC (**System on Chip**) seperti **Raspberry Pi** (minimal **Raspberry Pi** 4).
2. Monitor/TV LCD sesuai dengan kebutuhan.
3. Sound system jika membutuhkan 

**catatan:**
* Jika menggunakan raspberry pi agar perangkat dapat mengatur dan menyimpan waktu secara luring, perangkat harus dilengkapi dengan RTC

## Menggunakan Raspberry Pi dengan DietPi
**AMaL** telah diujicoba pada perangkat Raspberry Pi 4 dengan OS [DietPi](https://dietpi.com/) yang telah dipasangi RTC. Instalasi DietPi pada Raspberry Pi 4 menggunakan [Raspberry Pi Imager](https://www.raspberrypi.com/software/).

1. Install `DietPi` pada `Raspberry Pi 4` dengan menggunakan `Raspberry Pi Imager`. 
2. Setting `DietPi` sebagai kiosk.
3. Kloning repositori **AMaL** dari [GitHub](https://github.com/aswinte/AMaL).
    ```bash
   git clone [https://github.com/aswinte/AMaL.git](https://github.com/aswinte/AMaL.git)
4. jalankan skrip instalasi.
    ```bash
    cd AMaL
    chmod +x install.sh
    ./install.sh

## Memjadikan AMaL sebagai service yang otomatis menyala
1. Buat berkas layanan
```bash
sudo nano /etc/systemd/system/amal.service
```

2. Salin kode berikut
```bash
[Unit]
Description=AMaL Kiosk Flask Server
After=network.target

[Service]
User=dietpi
WorkingDirectory=/home/dietpi/AMaL
Environment="PATH=/home/dietpi/AMaL/venv/bin"
ExecStart=/home/dietpi/AMaL/venv/bin/python main.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

3. aktifkan danjalankan service
```bash
sudo systemctl daemon-reload
sudo systemctl enable amal.service
sudo systemctl start amal.service
```

## Menghapus service amal
```bash
sudo systemctl stop amal.service
sudo systemctl disable amal.service
sudo rm /etc/systemd/system/amal.service
sudo systemctl daemon-reload
```
