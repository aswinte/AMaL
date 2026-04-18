    function fetchDailyData(callback) {

        // Ambil tanggal dari Mesin Waktu (Bukan waktu nyata dari browser)
        const d = getWaktuSekarang();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        let paramTime = `time=${hh}:${mm}`;
        
        let url = `/get_data?date=${y}-${m}-${day}&${paramTime}`;

        fetch(url)
            .then(r => r.json())
            .then(data => {
                selaluAktif = (data.selalu_aktif === true);
                durasiAktifMenit = parseInt(data.durasi_aktif) || 15;
                metodeKalenderAktif = data.metode || "NASIONAL_MABIMS";
                pasaranDasar = data.pasaran;

                // Tangkap data iqomah dan status hari
                dataIqomah = data.iqomah || {};
                isHariJumat = data.is_jumat || false;

                // Ubah Visual Kartu Dzuhur menjadi Jumat jika hari ini Jumat
                const kartuDzuhur = document.getElementById('kartu-Dzuhur');
                if (kartuDzuhur && isHariJumat) {
                    kartuDzuhur.querySelector('.title').innerText = "Jumat";
                    kartuDzuhur.querySelector('.nama-shalat').innerText = "Jumat";
                } else if (kartuDzuhur) {
                    kartuDzuhur.querySelector('.title').innerText = "Dzuhur";
                    kartuDzuhur.querySelector('.nama-shalat').innerText = "Dzuhur";
                }

                // --- TAMBAHAN: Tangkap Pengaturan Layar dari app.py ---
                window.configLayar = data.display_settings;
                window.dataKeuangan = data.keuangan;
                console.log("🪙 Radar Kas Masjid:", window.dataKeuangan);
                window.tampilkanJawa = data.tampilkan_jawa !== false;
                
                // LOGIKA HIDE/SHOW DI SIDEBAR KIRI
                // const elTglJawa = document.getElementById('tgl-jawa');
                //const elInfoKurup = document.getElementById('info-kurup');
                if (UI.tglJawa) UI.tglJawa.style.display = window.tampilkanJawa ? "block" : "none";
                if (UI.infoKurup) UI.infoKurup.style.display = window.tampilkanJawa ? "block" : "none";
                
                document.getElementById('nama-masjid').innerText = data.nama_masjid;
                document.getElementById('alamat-masjid').innerText = data.alamat_masjid;
                document.getElementById('info-kota').innerText = data.lokasi.nama;
                document.getElementById('info-lokasi').innerText = data.lokasi.koordinat;


                // =======================================================
                // UPDATE VISUAL RASHDUL QIBLAH HARIAN (TEATER MATAHARI)
                // =======================================================
                const kiblatUtara = data.lokasi.kiblat;
                // Konversi derajat kompas (Utara=-90deg, Kanan/Timur=0deg dalam CSS Math)
                const rotasiCSS = kiblatUtara - 90; 
                
                const kabahEl = document.getElementById('ikon-kabah-rashdul');
                const wadahMatahari = document.getElementById('wadah-matahari-bayangan');
                const teksKiblat = document.getElementById('teks-kiblat');
                const teksWaktuR = document.getElementById('teks-waktu-rashdul');

                if (teksKiblat) teksKiblat.innerText = `Arah Kiblat: ${parseFloat(kiblatUtara).toFixed(1)}°`;

                if (kabahEl) {
                    // Letakkan Kabah di radius 6vmin (pinggir), pastikan ikon tetap tegak
                    kabahEl.style.transform = `rotate(${rotasiCSS}deg) translate(7vmin, 0) rotate(-${rotasiCSS}deg)`;
                }

                if (data.lokasi.rashdul_harian) {
                    const rh = data.lokasi.rashdul_harian;
                    waktuRashdulHariIni = rh.waktu;
                    if (teksWaktuR) teksWaktuR.innerText = `Rashdul Qiblah harian pukul ${rh.waktu}`;
                    
                    if (wadahMatahari) {
                        wadahMatahari.style.opacity = 1;
                        
                        if (rh.tipe === "bayangan_menuju") {
                            // Matahari membelakangi Kabah (+180 derajat)
                            wadahMatahari.style.transform = `rotate(${rotasiCSS + 180}deg)`;
                        } else {
                            // Matahari sejajar dengan Kabah
                            wadahMatahari.style.transform = `rotate(${rotasiCSS}deg)`;
                        }
                    }
                } else {
                    if (teksWaktuR) teksWaktuR.innerText = "Tidak terjadi hari ini";
                    if (wadahMatahari) wadahMatahari.style.opacity = 0; // Sembunyikan Matahari/Bayangan
                }                
                // =======================================================
                
                // =======================================================
                // UPDATE PLANETARIUM MINI (REAL-TIME POSISI PLANET)
                // =======================================================
                if (data.lokasi.planetarium) {
                    const plan = data.lokasi.planetarium;
                    const wadahMat = document.getElementById('planetarium-matahari');
                    const wadahBul = document.getElementById('planetarium-bulan');
                    
                    if (wadahMat && wadahMat.firstElementChild) {
                        // Konversi Ketinggian ke Jari-jari (Radius)
                        // Ketinggian 90° = radius 0vmin (tengah kompas)
                        // Ketinggian 0° = radius 7vmin (pinggir cakrawala)
                        let altMat = Math.max(0, plan.alt_matahari || 0); // Cegah nilai minus saat tenggelam
                        let radiusMat = 7 * ((90 - altMat) / 90);
                        
                        wadahMat.style.opacity = plan.matahari_terbit ? 1 : 0.1; 
                        wadahMat.style.transform = `rotate(${plan.matahari - 90}deg)`;
                        wadahMat.firstElementChild.style.left = `${radiusMat}vmin`; 
                    }
                    
                    if (wadahBul && wadahBul.firstElementChild) {
                        let altBul = Math.max(0, plan.alt_bulan || 0);
                        let radiusBul = 7 * ((90 - altBul) / 90);
                        
                        wadahBul.style.opacity = plan.bulan_terbit ? 1 : 0.1;
                        wadahBul.style.transform = `rotate(${plan.bulan - 90}deg)`;
                        wadahBul.firstElementChild.style.left = `${radiusBul}vmin`;
                    }
                }
                // =======================================================

                jadwalShalat = data.jadwal;
                for (const [key, value] of Object.entries(data.jadwal)) {
                    if (document.getElementById(key)) document.getElementById(key).innerText = value;
                }

                window.jumatConfig = data.jumat_config || { durasi_menit: 45 };

                const rt1 = document.getElementById('running-text-1');
                const rt2 = document.getElementById('running-text-2');
                if (rt1) {
                    // SEKARANG RUNNING TEXT MENGGUNAKAN LOGIKA LOKAL
                    let pesan = generateRunningText(getWaktuSekarang(), data.nama_masjid, data.alamat_masjid);
                    rt1.innerText = rt2.innerText = (pesan + "\u00A0".repeat(15));
                }

                updateClock();
                if (callback) callback();
                if (UI.calendarContainer &&UI.calendarContainer.style.display !== "none") fetchCalendar();
            });
    }

