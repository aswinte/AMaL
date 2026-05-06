document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // 1. VARIABEL GLOBAL & STATE
    // ==========================================
    let localLoadTime = Date.now() / 1000;
    let dataIqomah = {};
    let isHariJumat = false;
    let jadwalShalat = {};
    let durasiAktifMenit = 15; 
    let selaluAktif = true; 
    let hijriahDasar = ""; 
    let offsetHijri = 0;
    let lastDateString = ""; 
    let lastSimulatedDateStr = ""; 
    let rollingStep = 0; // 0: Kalender, 1: Pengumuman, 2: Kutipan
    let rollingTimer = null;
    let masterPool = [];
    let currentAstroIndex = 0;
    let currentPoolIndex = 0;
    let currentPhase = "AKTIF"; // AKTIF, PRA_ADZAN, ADZAN, IQOMAH, SHALAT
    let activeShalatName = "";
    let waktuRashdulHariIni = null;
    let countdownSeconds = 0;
    let cachedFloatingClock = null;

    // State Data Eksternal
    let dataEvent = { masehi: {}, hijriah: {} };
    // let listPengumuman = [];
    // let listKutipan = [];

    let dataJangkarGlobal = null;
    let metodeKalenderAktif = "NASIONAL_MABIMS"; // Default, nanti diupdate dari config

    let dataRashdul = null;
    let pesanRashdulH3 = ""; // Menyimpan teks H-3 untuk disisipkan ke pengumuman
    let isRashdulTakeover = false; // Penanda apakah layar sedang diblokir
    let dataGerhana = [];
    let pesanGerhanaH3 = ""; 
    let isGerhanaTakeover = false;
    let kontenSlideRashdul = "";
    let kontenSlideGerhana = "";

    let dataHilal = null;
    let kontenSlideHilal = "";
    let statusHilalServer = ""; // TAMBAHAN: Menyimpan status balasan server (success, processing, inactive, error)
    let hilalPollingTimer = null;

    const urutan = ["Imsak", "Subuh", "Terbit", "Dzuhur", "Ashar", "Maghrib", "Isya"];

    // ==========================================
    // 0. DOM CACHING (Efisiensi CPU)
    // ==========================================
    const UI = {
        // Area Jam & Tanggal Utama
        jam: document.getElementById('jam'),
        tglMasehi: document.getElementById('tgl-masehi'),
        tglHijri: document.getElementById('tgl-hijri'),
        tglJawa: document.getElementById('tgl-jawa'),
        infoMetode: document.getElementById('info-metode'),
        infoKurup: document.getElementById('info-kurup'),
        adzanCountdown: document.getElementById('adzan-countdown'),
        
        // Area Info & Layar Penuh
        infoDisplay: document.getElementById('info-display-container'),
        calendarContainer: document.getElementById('calendar-container'),
        fullscreenOverlay: document.getElementById('fullscreen-overlay'),
        overlayContent: document.getElementById('overlay-content'),
        layarBlackout: document.getElementById('layar-blackout'),

        // Tambahan Cache Overlay Spesifik
        gerhanaTakeover: document.getElementById('gerhana-takeover'),
        gerhanaJudul: document.getElementById('gerhana-judul'),
        gerhanaIkon: document.getElementById('gerhana-ikon'),
        gerhanaCountdown: document.getElementById('gerhana-countdown'),

        rashdulTakeover: document.getElementById('rashdul-takeover'),
        rashdulInstruksi: document.getElementById('rashdul-instruksi'),
        rashdulCountdown: document.getElementById('rashdul-countdown'),

        // dome: document.querySelector('.kompas-lingkaran'),
        dome: document.querySelector('.sky-dome'),
        teksRashdul: document.getElementById('teks-waktu-rashdul')
    };

    // Cache khusus untuk Kartu Jadwal (agar tidak dicari ulang setiap detik)
    const UI_Kartu = {
        Imsak: { box: document.getElementById('kartu-Imsak'), jam: document.getElementById('Imsak'), selisih: document.querySelector('#kartu-Imsak .selisih') },
        Subuh: { box: document.getElementById('kartu-Subuh'), jam: document.getElementById('Subuh'), selisih: document.querySelector('#kartu-Subuh .selisih') },
        Terbit:{ box: document.getElementById('kartu-Terbit'),jam: document.getElementById('Terbit'),selisih: document.querySelector('#kartu-Terbit .selisih') },
        Dzuhur:{ box: document.getElementById('kartu-Dzuhur'),jam: document.getElementById('Dzuhur'),selisih: document.querySelector('#kartu-Dzuhur .selisih') },
        Ashar: { box: document.getElementById('kartu-Ashar'), jam: document.getElementById('Ashar'), selisih: document.querySelector('#kartu-Ashar .selisih') },
        Maghrib:{ box: document.getElementById('kartu-Maghrib'),jam: document.getElementById('Maghrib'),selisih: document.querySelector('#kartu-Maghrib .selisih') },
        Isya:  { box: document.getElementById('kartu-Isya'),  jam: document.getElementById('Isya'),  selisih: document.querySelector('#kartu-Isya .selisih') }
    };

    // Helper: Mengecek apakah waktu sekarang (Date) berada di dalam rentang "HH:MM" - "HH:MM"
    function isTimeInRange(timeStrStart, timeStrEnd, dateObj) {
        const currentMenitTotal = dateObj.getHours() * 60 + dateObj.getMinutes();
        
        let [startH, startM] = timeStrStart.split(':').map(Number);
        let startTotal = startH * 60 + startM;
        
        let [endH, endM] = timeStrEnd.split(':').map(Number);
        let endTotal = endH * 60 + endM;

        if (startTotal <= endTotal) {
            return currentMenitTotal >= startTotal && currentMenitTotal < endTotal;
        } else {
            // Logika khusus jika rentang melewati tengah malam (misal 22:00 ke 03:30)
            return currentMenitTotal >= startTotal || currentMenitTotal < endTotal;
        }
    }

    async function loadAllExternalData() {
        const now = getWaktuSekarang();
        const v = now.getTime();
        const tahunYangDicari = now.getFullYear();
        
        const loadingOverlay = document.getElementById('loading-overlay');
        const loadingText = document.getElementById('loading-text');
        
        // 1. TAMPILKAN LAYAR LOADING
        if (loadingOverlay && loadingText) {
            let teksMetode = metodeKalenderAktif.replace(/_/g, ' '); 
            let namaKota = document.getElementById('info-kota')?.innerText || "Lokasi Masjid";
            
            loadingText.innerHTML = `Sedang menghitung data Kalender Hijriah tahun <b>${tahunYangDicari} M</b><br>
                                    Metode hisab: <b style="color: #00ff88;">${teksMetode}</b><br>
                                    Lokasi: <b style="color: #00ff88;">${namaKota}</b><br><br>
                                    <span style="font-size: 2vmin; color: #888;">(Proses hisab 12 bulan memakan waktu)</span>`;
            loadingOverlay.style.display = "flex"; 
        }

        try {
            const urlJangkar = `/api/kalender_jangkar/${tahunYangDicari}?v=${v}`;

            // 2. JALANKAN FETCH SECARA PARALEL
            const [rEvent, rJangkar] = await Promise.all([
                fetch(`/static/json/event.json?v=${v}`).then(r => r.json()),
                fetch(urlJangkar).then(async (response) => {
                    // CEK JIKA BACKGROUND WORKER SEDANG BEKERJA (STATUS 202)
                    if (response.status === 202) {
                        const resJson = await response.json();
                        if (loadingText) {
                            loadingText.innerHTML = `<b style="color: #ffaa00; font-size: 4vmin;">SISTEM SEDANG PEMELIHARAAN</b><br><br>
                                                    ${resJson.msg}<br><br>
                                                    <span style="font-size: 2.5vmin; color: #aaa;">TV Kiosk akan aktif otomatis setelah data siap.</span>`;
                        }
                        throw new Error("WAIT_FOR_WORKER");
                    }
                    if (!response.ok) throw new Error("Gagal memuat jangkar");
                    return response.json();
                })
            ]);
            
            // 3. SIMPAN DATA JIKA BERHASIL
            dataEvent = rEvent;
            dataJangkarGlobal = rJangkar;

            console.log("✅ Data JSON Inti & Jangkar berhasil dimuat");
            fetchDailyData(); 
            jalankanRollingInfo();

        } catch (e) {
            if (e.message === "WAIT_FOR_WORKER") {
                console.warn("⚠️ Menunggu komputasi latar belakang selesai (Status 202)...");
                // Cek lagi setiap 5 menit (300.000 ms)
                setTimeout(() => loadAllExternalData(), 300000); 
                return; // EXIT: Biarkan layar loading tetap terbuka
            }
            
            console.error("❌ Gagal memuat data:", e);
            if (loadingText) loadingText.innerHTML = "Gagal memuat data sistem.<br>Periksa koneksi atau berkas konfigurasi.";
        } finally {
            // 4. TUTUP LOADING HANYA JIKA TIDAK SEDANG MENUNGGU WORKER
            const isWaiting = loadingText && loadingText.innerText.includes("PEMELIHARAAN");
            if (!isWaiting) {
                setTimeout(() => {
                    if (loadingOverlay) loadingOverlay.style.display = "none";
                }, 800);
            }
        }
    }


    // ==========================================
    // MESIN WAKTU (REMOTE CONTROL RECEIVER)
    // ==========================================
    let stateSimulasi = { aktif: false, waktu_mulai_real: 0, waktu_mulai_simulasi: 0, kecepatan: 1 };
    let lastNextTrigger = 0;
    let isMediaPaused = false;

    function pantauMesinWaktu() {
        fetch('/api/simulasi')
            .then(res => res.json())
            .then(data => {
                // --- LOGIKA REFRESH ---
                if (data.refresh_timestamp && data.refresh_timestamp > localLoadTime) {
                    console.log("🔄 Perintah Refresh dari Admin diterima! Memuat ulang...");
                    window.location.reload(true);
                    return; // Hentikan eksekusi lain karena halaman akan mati
                }
                // ----------------------------------------
                const statusSebelumnya = stateSimulasi.aktif; // Catat status lama
                stateSimulasi = data;

                const waktuSim = getWaktuKiosk();
                // Gunakan format YYYY-MM-DD agar lompat bulan/tahun tetap terdeteksi
                const tglStrSim = `${waktuSim.getFullYear()}-${waktuSim.getMonth()}-${waktuSim.getDate()}`;

                // Deteksi 3 kondisi loncatan waktu:
                const isMulai = (stateSimulasi.aktif && !statusSebelumnya);
                const isStop = (!stateSimulasi.aktif && statusSebelumnya);
                const isLoncat = (stateSimulasi.aktif && tglStrSim !== lastSimulatedDateStr);

                if (isMulai || isStop || isLoncat) {
                    lastSimulatedDateStr = tglStrSim;
                    console.log("[Simulasi] 🚀 Loncatan waktu terdeteksi, sinkronisasi UI...");

                    statusHilalServer = ""; // <--- TAMBAHAN: Reset status agar bisa ngecek di tanggal baru
                    
                    // 1. Panggil update Kalender & Jadwal Shalat
                    fetchDailyData(); 
                    
                    // 2. Panggil ulang data Astronomi
                    fetchLaporanHilal(); 
                    if (typeof pantauRashdulQiblah === 'function') pantauRashdulQiblah(waktuSim);
                    if (typeof pantauGerhana === 'function') pantauGerhana(waktuSim);
                    
                    // 3. Paksa putaran slide kembali ke Kalender agar layar langsung berubah
                    rollingStep = 0;
                    if (rollingTimer) { clearTimeout(rollingTimer); rollingTimer = null; }
                    jalankanRollingInfo();
                }

                isMediaPaused = (data.media_status === 'pause');
                
                // Jika tombol NEXT ditekan di HP Admin
                if (data.media_next_trigger > lastNextTrigger) {
                    lastNextTrigger = data.media_next_trigger;
                    if (rollingTimer) { clearTimeout(rollingTimer); rollingTimer = null; }
                    jalankanRollingInfo(); // Paksa pindah slide!
                }
            })
            .catch(err => console.log("Gagal memantau Simulasi", err));
    }
    setInterval(pantauMesinWaktu, 2000); // Cek tiap 2 detik
    pantauMesinWaktu(); // Panggil sekali saat pertama buka

    function getWaktuKiosk() {
        // 1. Ambil waktu TV lalu tambahkan/kurangi dengan selisih server
        const waktuAkuratMs = Date.now() + AmalUtils.serverTimeOffset;

        if (stateSimulasi && stateSimulasi.aktif) {
            const selisihReal = waktuAkuratMs - stateSimulasi.waktu_mulai_real;
            const simulatedTimeMs = stateSimulasi.waktu_mulai_simulasi + (selisihReal * stateSimulasi.kecepatan);
            return new Date(simulatedTimeMs);
        }
        // Jika tidak ada simulasi, kembalikan waktu dunia nyata
        return new Date(waktuAkuratMs);
    }

    // ==========================================
    // FUNGSI CEK FASE SETIAP DETIK (AKTIF, PRA_ADZAN, ADZAN, IQOMAH, SHALAT)
    // ==========================================
    function updateSystemPhase() {
        if (!jadwalShalat || Object.keys(jadwalShalat).length === 0) return;

        const sekarang = getWaktuSekarang(); 
        const jamMenitSekarang = sekarang.getHours() * 3600 + sekarang.getMinutes() * 60 + sekarang.getSeconds();

        let newPhase = "AKTIF";
        let shalatTarget = "";
        let diff = 0;

        const fardhu = ["Subuh", "Dzuhur", "Ashar", "Maghrib", "Isya"];
        const DURASI_ADZAN = 240; // 4 menit waktu standar untuk mengumandangkan Adzan (dalam detik)

        for (let s of fardhu) {
            if (!jadwalShalat[s]) continue;
            
            const [h, m] = jadwalShalat[s].split(':').map(Number);
            const waktuAdzan = h * 3600 + m * 60;

            // AMBIL PENGATURAN IQOMAH (Jika Jumat, Iqomah dinolkan karena ada Khutbah)
            let menitIqomah = (isHariJumat && s === "Dzuhur") ? 0 : (dataIqomah[s.toLowerCase()] || 10);
            let durasiIqomahDetik = menitIqomah * 60;
            
            // HITUNG BATAS WAKTU (MATEMATIKA DINAMIS)
            const batasAdzan = waktuAdzan + DURASI_ADZAN;
            const batasIqomah = batasAdzan + durasiIqomahDetik;
            
            // Durasi Layar Redup: 45 Menit untuk Jumat (Khutbah), 10 Menit untuk shalat biasa
            const durasiJumatDetik = (window.jumatConfig.durasi_menit || 45) * 60;
            const durasiShalatDetik = (isHariJumat && s === "Dzuhur") ? durasiJumatDetik : 600; 
            const batasShalat = batasIqomah + durasiShalatDetik;

            // 1. Cek Pra-Adzan (10 menit sebelum adzan)
            if (jamMenitSekarang >= waktuAdzan - 600 && jamMenitSekarang < waktuAdzan) {
                newPhase = "PRA_ADZAN"; shalatTarget = s; diff = waktuAdzan - jamMenitSekarang; break;
            }
            // 2. Cek Adzan (Durasi 4 menit)
            else if (jamMenitSekarang >= waktuAdzan && jamMenitSekarang < batasAdzan) {
                newPhase = "ADZAN"; shalatTarget = s; break;
            }
            // 3. Cek Menunggu Iqomah (Dilewati jika hari Jumat)
            else if (jamMenitSekarang >= batasAdzan && jamMenitSekarang < batasIqomah && menitIqomah > 0) {
                newPhase = "IQOMAH"; shalatTarget = s; diff = batasIqomah - jamMenitSekarang; break;
            }
            // 4. Cek Shalat / Khutbah (Layar Redup + Jam Melayang)
            else if (jamMenitSekarang >= batasIqomah && jamMenitSekarang < batasShalat) {
                newPhase = "SHALAT"; shalatTarget = s; break;
            }
        }

        if (newPhase !== currentPhase || shalatTarget !== activeShalatName) {
            currentPhase = newPhase;
            activeShalatName = shalatTarget;
            handlePhaseChange(); 
        }
        countdownSeconds = diff;
    }
    
    function handlePhaseChange() {
        // const overlay = document.getElementById('fullscreen-overlay');
        const mainContainer = document.querySelector('.container'); 

        if (currentPhase === "AKTIF" || currentPhase === "PRA_ADZAN") {
            // Kembali ke tampilan normal (Pra-adzan hanya muncul di kotak tengah)
            UI.fullscreenOverlay.style.display = "none";
            mainContainer.style.filter = "none";
            if (rollingTimer === null) jalankanRollingInfo(); // Pastikan rolling jalan
        } else {
            // Fullscreen Mode
            UI.fullscreenOverlay.style.display = "block";
            // Matikan rolling agar tidak memakan memori di latar belakang
            if (rollingTimer) {
                clearTimeout(rollingTimer);
                rollingTimer = null;
            }
            renderFullscreenContent();
        }
    }

    // ==========================================
    // FUNGSI RENDER KONTEN FULLSCREEN BERDASARKAN FASE
    // ==========================================
    function renderFullscreenContent() {
        // const content = document.getElementById('overlay-content');
        if (!UI.overlayContent) return;

        if (currentPhase === "ADZAN") {
            let namaTampil = activeShalatName;
            if (isHariJumat && namaTampil === "Dzuhur") namaTampil = "Jumat";
            
            UI.overlayContent.innerHTML = `
                <div class="fs-adzan">
                    <h1>ADZAN ${namaTampil.toUpperCase()}</h1>
                    <p>Waktunya Berhenti Sejenak dan Menjawab Adzan</p>
                </div>
            `;
        } else if (currentPhase === "IQOMAH") {
            let menit = Math.floor(countdownSeconds / 60);
            let detik = countdownSeconds % 60;
            UI.overlayContent.innerHTML = `
                <div class="fs-iqomah">
                    <h2>MENUNGGU IQOMAH</h2>
                    <h1>${menit}:${detik < 10 ? '0' + detik : detik}</h1>
                    <p>Luruskan dan Rapatkan Shaf</p>
                </div>
            `;
        } else if (currentPhase === "SHALAT") {
            /* let clockEl = document.getElementById('floating-clock');
            
            if (!clockEl) {
                UI.overlayContent.innerHTML = `
                    <div id="floating-clock" class="floating-clock">
                        ${getWaktuSekarang().toLocaleTimeString('id-ID', {hour12: false})}
                    </div>
                `;
                
                if (pantulFrameId) cancelAnimationFrame(pantulFrameId);
                mulaiAnimasiPantul(); 
            } else {
                clockEl.innerText = getWaktuSekarang().toLocaleTimeString('id-ID', {hour12: false});
            } */

           // 1. Cek dari memori cache kita, JANGAN gunakan getElementById di sini
            if (!cachedFloatingClock || !document.contains(cachedFloatingClock)) {
                
                // Jika di memori kosong, ciptakan elemennya ke layar
                UI.overlayContent.innerHTML = `
                    <div id="floating-clock" class="floating-clock">
                        ${AmalUtils.getAccurateTime().toLocaleTimeString('id-ID', {hour12: false})}
                    </div>
                `;
                
                // 2. KUNCI! Sesaat setelah diciptakan, simpan ke memori agar detik berikutnya tidak perlu dicari lagi
                cachedFloatingClock = document.getElementById('floating-clock');
                
                if (pantulFrameId) cancelAnimationFrame(pantulFrameId);
                mulaiAnimasiPantul(); 
            } else {
                // 3. Di detik-detik berikutnya, cukup ubah isi dari elemen yang sudah ada di memori! (Sangat cepat & ringan)
                cachedFloatingClock.innerText = AmalUtils.getAccurateTime().toLocaleTimeString('id-ID', {hour12: false});
            }
        }
    }

    // ==========================================
    // MESIN ANIMASI JAM MEMANTUL (SCREENSAVER)
    // ==========================================
    let pantulFrameId = null;
    let pantulX = 0; 
    let pantulY = 0;
    
    // --- ATUR KECEPATAN DI SINI ---
    // Coba angka 0.3 atau 0.5.
    let kecepatan = 0.5; 
    
    let arahX = kecepatan; 
    let arahY = kecepatan; 

    function mulaiAnimasiPantul() {
        const el = document.getElementById('floating-clock');
        if (!el) return;

        // 1. Reset posisi CSS dasar ke pojok kiri atas
        el.style.left = "0px";
        el.style.top = "0px";

        // 2. Tentukan titik mulai dari tengah layar
        const winW = window.innerWidth;
        const winH = window.innerHeight;
        pantulX = (winW - el.offsetWidth) / 2;
        pantulY = (winH - el.offsetHeight) / 2;

        // 3. Acak arah awal
        arahX = Math.random() > 0.5 ? kecepatan : -kecepatan;
        arahY = Math.random() > 0.5 ? kecepatan : -kecepatan;

        function gerak() {
            const clock = document.getElementById('floating-clock');
            if (!clock) {
                cancelAnimationFrame(pantulFrameId);
                return;
            }

            const w = window.innerWidth;
            const h = window.innerHeight;
            const clockLebar = clock.offsetWidth;
            const clockTinggi = clock.offsetHeight;

            // Pantulan Kanan & Kiri
            if (pantulX + clockLebar >= w) {
                pantulX = w - clockLebar; // Koreksi anti-nyangkut
                arahX = -kecepatan; 
            } else if (pantulX <= 0) {
                pantulX = 0; // Koreksi anti-nyangkut
                arahX = kecepatan;  
            }

            // Pantulan Bawah & Atas
            if (pantulY + clockTinggi >= h) {
                pantulY = h - clockTinggi;
                arahY = -kecepatan; 
            } else if (pantulY <= 0) {
                pantulY = 0;
                arahY = kecepatan;  
            }

            // Tambahkan posisi
            pantulX += arahX;
            pantulY += arahY;

            if (!el.style.willChange) el.style.willChange = "transform";

            // Gunakan translate3d di dalam fungsi gerak() (angka 0 di belakang adalah sumbu Z)
            clock.style.transform = `translate3d(${pantulX}px, ${pantulY}px, 0px)`;

            // Looping ke frame berikutnya
            pantulFrameId = requestAnimationFrame(gerak);
        }

        gerak();
    }

    // ==========================================
    // fungsi cek waktu sekarang dengan simulasi (jika ada) untuk updateSystemPhase
    // ==========================================    
    function getWaktuSekarang() {
        // Langsung arahkan ke Mesin Waktu Remote Control
        return getWaktuKiosk();
    }

    // ==========================================
    // . FUNGSI ROLLING INFO (KALENDER, PENGUMUMAN, KUTIPAN)
    // ==========================================

    function processWeightAndDeadline(bobotDasar, deadline, identifier, type) {
        if (!deadline) return bobotDasar;

        const hariH = new Date(deadline);
        const hariIni = new Date();
        hariH.setHours(0,0,0,0);
        hariIni.setHours(0,0,0,0);

        const selisihMs = hariH - hariIni;
        const selisihHari = Math.ceil(selisihMs / (1000 * 60 * 60 * 24));

        if (selisihHari < 0) {
            console.warn(`Konten kedaluwarsa dideteksi: ${identifier}. Mengarsipkan...`);
            fetch('/archive_expired', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    type: type,
                    filename: type === 'image' ? identifier : null,
                    isi: type === 'json' ? identifier : null
                })
            });
            return 0; 
        }

        if (selisihHari <= 2) return bobotDasar * 4;
        if (selisihHari <= 7) return bobotDasar * 2;
        return bobotDasar;
    }

    async function refreshMasterPool() {
        console.log("🔄 Memperbarui Antrean Konten...");
        const v = new Date().getTime();
        
        try {
            const [resAnnounce, resQuote, resImages] = await Promise.all([
                fetch(`/static/json/pengumuman.json?v=${v}`).then(r => r.json()),
                fetch(`/static/json/kutipan.json?v=${v}`).then(r => r.json()),
                fetch(`/get_assets?v=${v}`).then(r => r.json())
            ]);

            let newPool = [];

            resAnnounce.forEach(item => {
                if (item.aktif === false) return; // ABAIKAN JIKA DISEMBUNYIKAN
                let finalWeight = processWeightAndDeadline(item.bobot || 1, item.deadline, item.isi, 'json');
                for(let i=0; i < finalWeight; i++) {
                    newPool.push({ tipe: 'teks_pengumuman', data: item });
                }
            });

            resImages.forEach(filename => {
                let bobot = 1, deadline = null, isAktif = true;
                if (filename.includes('__')) {
                    const parts = filename.split('__');
                    parts.forEach(p => {
                        if (p.startsWith('W')) bobot = parseInt(p.substring(1)) || 1;
                        if (p.startsWith('D')) deadline = p.substring(1);
                        if (p.startsWith('A')) isAktif = (p.substring(1) === '1'); // Deteksi A1/A0
                    });
                }
                if (!isAktif) return; // ABAIKAN JIKA DISEMBUNYIKAN
                
                // Hanya parse jika ada tanda '__'
                if (filename.includes('__')) {
                    const parts = filename.split('__');
                    parts.forEach(p => {
                        if (p.startsWith('W')) {
                            let b = parseInt(p.substring(1));
                            if (!isNaN(b) && b > 0) bobot = b; // Gunakan angka jika valid
                        }
                        if (p.startsWith('D')) deadline = p.substring(1);
                    });
                }

                let finalWeight = processWeightAndDeadline(bobot, deadline, filename, 'image');
                for(let i=0; i < finalWeight; i++) {
                    newPool.push({ tipe: 'gambar_pengumuman', data: filename });
                }
            });

            resQuote.forEach(q => {
                if (q.aktif === false) return; // ABAIKAN JIKA DISEMBUNYIKAN
                newPool.push({ tipe: 'kutipan', data: q });
            });

            if (window.dataKeuangan && window.dataKeuangan.tampilkan) {
                newPool.push({ tipe: 'kas_masjid', data: window.dataKeuangan });
                console.log("✅ Kas Masjid BERHASIL didorong ke antrean!");
            }else {
                console.log("❌ Kas Masjid diabaikan (Tampilkan = False atau data kosong)");
            }
            newPool.sort(() => Math.random() - 0.5);

            console.group("📋 Isi Antrean Baru (Master Pool)");
            newPool.forEach((item, index) => {
                console.log(`${index + 1}. ${item.tipe}`);
            });
            console.groupEnd();
            
            masterPool = newPool;
            currentPoolIndex = 0;
            console.log(`✅ Master Pool siap: ${masterPool.length} item.`);
        } catch (e) {
            console.error("Gagal refresh pool:", e);
        }
    }

    console.log("🛠️ Script Rolling Info dimuat!");

    function jalankanRollingInfo() {
        // --- TAMBAHKAN BARIS INI UNTUK MENCEGAH SLIDE JALAN SAAT ADZAN/SHALAT ---
        if (currentPhase !== "AKTIF" && currentPhase !== "PRA_ADZAN") {
            if (rollingTimer) clearTimeout(rollingTimer);
            return; // Hentikan fungsi jika sedang Adzan, Iqomah, atau Shalat
        }

        // 1. CEGAH ROTASI JIKA TAKEOVER/PAUSE
        if (isRashdulTakeover || isGerhanaTakeover || isMediaPaused) {
            console.log("%c[Rolling] Terhenti: Takeover/Pause Aktif", "color: #ff4444");
            if (rollingTimer) clearTimeout(rollingTimer);
            rollingTimer = setTimeout(jalankanRollingInfo, 5000);
            return; 
        }

        if (rollingTimer) clearTimeout(rollingTimer);

        // --- SISTEM ANTREAN MINI ASTRONOMI ---
        // Kumpulkan mana saja slide astro yang sedang ADA ISINYA
        let activeAstroSlides = [];
        if (kontenSlideRashdul !== "") activeAstroSlides.push(kontenSlideRashdul);
        if (kontenSlideGerhana !== "") activeAstroSlides.push(kontenSlideGerhana);
        if (kontenSlideHilal !== "") activeAstroSlides.push(kontenSlideHilal);
        
        const adaKontenAstro = activeAstroSlides.length > 0;

        // --- MONITORING LOG ---
        console.group("📊 Status Antrean Slide");
        console.log("Gigi (Step) Saat Ini:", rollingStep);
        console.log("Jumlah Slide Astro Aktif:", activeAstroSlides.length);
        console.groupEnd();

        // ==========================================
        // GIGI 0: SIKLUS KALENDER
        // ==========================================
        if (rollingStep === 0) {
            console.log("%c[Slide] 🗓️ Menampilkan KALENDER", "color: #0be881; font-weight: bold;");
            UI.calendarContainer.style.display = "flex";
            UI.infoDisplay.style.display = "none";
            
            // Tentukan gigi selanjutnya
            if (masterPool.length > 0) {
                rollingStep = 1; // Ke Pengumuman
            } else if (adaKontenAstro) {
                rollingStep = 2; // Lompat ke Astro
            } else {
                rollingStep = 0; // Tetap di Kalender
            }
            
            if (currentPoolIndex >= masterPool.length) refreshMasterPool();
            rollingTimer = setTimeout(jalankanRollingInfo, 20000); 
            return;
        }
        
        // ==========================================
        // GIGI 1: SIKLUS PENGUMUMAN & KUTIPAN
        // ==========================================
        if (rollingStep === 1) {
            if (masterPool.length > 0) {
                const content = masterPool[currentPoolIndex];
                console.log(`%c[Slide] 📢 KONTEN: ${content.tipe.toUpperCase()} (${currentPoolIndex + 1}/${masterPool.length})`, "color: #ffd700; font-weight: bold;");
                
                UI.calendarContainer.style.display = "none";
                UI.infoDisplay.style.display = "flex";
                renderContent(content, UI.infoDisplay);

                currentPoolIndex++;
                
                if (currentPoolIndex >= masterPool.length) {
                    // currentPoolIndex = 0; 
                    rollingStep = adaKontenAstro ? 2 : 0; 
                }
                
                rollingTimer = setTimeout(jalankanRollingInfo, 15000); 
                return;
            } else {
                rollingStep = adaKontenAstro ? 2 : 0;
                jalankanRollingInfo(); 
                return;
            }
        }

        // ==========================================
        // GIGI 2: SIKLUS ASTRONOMI (ROTASI BERGANTIAN)
        // ==========================================
        if (rollingStep === 2) {
            // Toleransi Loading Server (Khusus Simulasi Cepat)
            const skrg = getWaktuKiosk();
            const tgl = skrg.getDate();
            
            // JANGAN MENUNGGU JIKA SERVER SUDAH BILANG 'INACTIVE' ATAU 'ERROR'
            const isSedangMenungguServer = (statusHilalServer === "" || statusHilalServer === "processing");
            
            if (stateSimulasi.aktif && (tgl >= 28 && tgl <= 29) && kontenSlideHilal === "" && isSedangMenungguServer) {
                console.log("⏳ [Slide] Menunggu data Hilal dari server simulasi...");
                
                // Jangan panggil API berulang-ulang jika status sudah processing (karena sudah ada polling sendiri)
                if (statusHilalServer !== "processing") {
                    fetchLaporanHilal(); 
                }
                
                rollingTimer = setTimeout(jalankanRollingInfo, 2000); 
                return;
            }

            // PASTIKAN ULANG ada konten astro setelah loading
            // (Karena bisa jadi data hilal baru masuk setelah ditunggu 2 detik di atas)
            activeAstroSlides = [];
            if (kontenSlideRashdul !== "") activeAstroSlides.push(kontenSlideRashdul);
            if (kontenSlideGerhana !== "") activeAstroSlides.push(kontenSlideGerhana);
            if (kontenSlideHilal !== "") activeAstroSlides.push(kontenSlideHilal);

            if (activeAstroSlides.length > 0) {
                console.log(`%c[Slide] 🌌 Menampilkan INFO ASTRONOMI (${currentAstroIndex + 1}/${activeAstroSlides.length})`, "color: #0fbcf9; font-weight: bold;");
                UI.calendarContainer.style.display = 'none';
                UI.infoDisplay.style.display = 'flex';
                
                // Jika index sudah melewati batas jumlah slide, kembali ke 0
                if (currentAstroIndex >= activeAstroSlides.length) {
                    currentAstroIndex = 0;
                }
                
                // Tampilkan slide sesuai giliran
                UI.infoDisplay.innerHTML = activeAstroSlides[currentAstroIndex];
                
                // Tambah index untuk giliran putaran berikutnya
                currentAstroIndex++; 
                
                rollingStep = 0; // Setelah Astro, PASTI kembali ke Kalender (Gigi 0)
                rollingTimer = setTimeout(jalankanRollingInfo, 20000); 
                return;
            } else {
                rollingStep = 0;
                jalankanRollingInfo();
                return;
            }
        }
    }

    function renderContent(item, container) {
        container.innerHTML = "";
        
        if (item.tipe === 'teks_pengumuman') {
            container.innerHTML = `
                <div class="slide-pengumuman">
                    <div class="bg-icon">🕌</div>
                    <div class="tag">📢 Informasi Masjid</div>
                    <div class="teks">${item.data.isi}</div>
                </div>
            `;
        } 
        else if (item.tipe === 'gambar_pengumuman') {
            container.innerHTML = `
                <div class="slide-gambar">
                    <img src="/static/img/pengumuman/${item.data}">
                </div>
            `;
        } 
        else if (item.tipe === 'kutipan') {
            container.innerHTML = `
                <div class="slide-kutipan">
                    <div class="bg-quote">"</div>
                    <div class="tag">✨ Mutiara Hikmah</div>
                    <div class="arab">${item.data.arab}</div>
                    <div class="arti">"${item.data.arti}"</div>
                    <div class="sumber">— ${item.data.sumber}</div>
                </div>
            `;
        }
        else if (item.tipe === 'kas_masjid') {
            const k = item.data;
            const formatRp = (angka) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(angka);
            const sAwal = parseInt(k.saldo_awal) || 0;
            const sMasuk = parseInt(k.pemasukan) || 0;
            const sKeluar = parseInt(k.pengeluaran) || 0;
            const sAkhir = sAwal + sMasuk - sKeluar;

            container.innerHTML = `
                <div class="slide-kas">
                    <div style="font-size: 5vmin; margin-bottom: 10px;">🕌</div>
                    <h2>LAPORAN KAS MASJID</h2>
                    <p>Per ${k.tanggal_laporan || '-'}</p>
                    
                    <table>
                        <tr class="row-border">
                            <td class="text-left">Saldo Sebelumnya</td>
                            <td class="text-right" style="color: #ccc;">${formatRp(sAwal)}</td>
                        </tr>
                        <tr class="row-border">
                            <td class="text-left">Pemasukan Baru</td>
                            <td class="text-right" style="color: #00ff88;">+ ${formatRp(sMasuk)}</td>
                        </tr>
                        <tr class="row-total">
                            <td class="text-left">Pengeluaran (Operasional)</td>
                            <td class="text-right" style="color: #ff4444;">- ${formatRp(sKeluar)}</td>
                        </tr>
                        <tr>
                            <td class="text-left" style="font-weight: bold; font-size: 4vmin;">SALDO AKHIR</td>
                            <td class="text-right" style="font-weight: bold; font-size: 4.5vmin; color: #ffd700;">${formatRp(sAkhir)}</td>
                        </tr>
                    </table>
                </div>
            `;
        }
    }


    // ==========================================
    // 3. FUNGSI UPDATE TAMPILAN & CLOCK
    // ==========================================

    function formatSelisih(ms, isPlus) {
        let totalDetik = Math.floor(Math.abs(ms) / 1000);
        let jam = String(Math.floor(totalDetik / 3600)).padStart(2, '0');
        let menit = String(Math.floor((totalDetik % 3600) / 60)).padStart(2, '0');
        let detik = String(totalDetik % 60).padStart(2, '0');
        return `${isPlus ? '+' : '-'} ${jam}:${menit}:${detik}`;
    }

    function updateClock() {
        const now = getWaktuSekarang();

        pantauRashdulQiblah(now);
        pantauGerhana(now);

        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        const s = String(now.getSeconds()).padStart(2, '0');
        const nowStr = `${h}:${m}`;
        
        // if (!UI.jam) return;
        if (UI.jam) {
            UI.jam.innerHTML = `${h}:${m}<span class="detik">:${s}</span>`;
        }

        // --- LOGIKA ALERT RASHDUL QIBLAH HARIAN ---
        // const kompasWrapper = document.querySelector('.kompas-wrapper');
        const teksWaktuR = document.getElementById('teks-waktu-rashdul'); // Tangkap elemen teksnya
        
        // if (kompasWrapper && waktuRashdulHariIni) {
        //     const parts = waktuRashdulHariIni.split(':');
        //     const rashdulTotalMenit = parseInt(parts[0]) * 60 + parseInt(parts[1]);
        //     const nowTotalMenit = now.getHours() * 60 + now.getMinutes();
        //     const selisihMenit = nowTotalMenit - rashdulTotalMenit;

        //     // Toleransi: awalnya Nyala mulai dari 2 menit SEBELUM puncak, hingga 3 menit SESUDAH puncak, karena kesepakatan seperitnya +-5 menit bisa diedit
        //     if (selisihMenit >= -5 && selisihMenit <= 5) {
        //         // 1. Nyalakan pendaran kompas
        //         kompasWrapper.classList.add('sedang-rashdul');
                
        //         // 2. Nyalakan pendaran teks & ubah kalimat darurat
        //         if (teksWaktuR) {
        //             teksWaktuR.classList.add('teks-sedang-rashdul');
                    
        //             // Simpan teks asli ("Pukul 13:51") jika belum disimpan
        //             if (!teksWaktuR.dataset.teksAsli) {
        //                 teksWaktuR.dataset.teksAsli = teksWaktuR.innerText;
        //             }
        //             // Ubah teks menjadi peringatan darurat
        //             teksWaktuR.innerText = "CEK BAYANGAN KIBLAT SEKARANG!";
        //         }
        //     } else {
        //         // 1. Matikan pendaran kompas
        //         kompasWrapper.classList.remove('sedang-rashdul');
                
        //         // 2. Matikan pendaran teks & kembalikan ke teks jadwal
        //         if (teksWaktuR) {
        //             teksWaktuR.classList.remove('teks-sedang-rashdul');
                    
        //             // Kembalikan ke teks aslinya ("Pukul 13:51") jika sudah lewat
        //             if (teksWaktuR.dataset.teksAsli) {
        //                 teksWaktuR.innerText = teksWaktuR.dataset.teksAsli;
        //                 delete teksWaktuR.dataset.teksAsli; // Hapus dari memori
        //             }
        //         }
        //     }
        // }
        renderRashdul(waktuRashdulHariIni);
        // ------------------------------------------

        if (UI.tglMasehi) {
            const namaHari = now.toLocaleDateString('id-ID', { weekday: 'long' });
            const pasaran = AmalUtils.getPasaranJawa(now); 
            const tglFull = now.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
            
            pasaranDasar = pasaran; 
            // UI.tglMasehi.innerText = `${namaHari} ${pasaran}, ${tglFull}`;
            if (window.tampilkanJawa) {
                UI.tglMasehi.innerText = `${namaHari} ${pasaran}, ${tglFull}`;
            } else {
                UI.tglMasehi.innerText = `${namaHari}, ${tglFull}`;
            }
        }

        // --- BLOK TANGGAL HIJRIAH, BULAN, & JAWA ---
        // const tglHijriEl = document.getElementById('tgl-hijri');
        // const tglJawaEl = document.getElementById('tgl-jawa');
        const moonContainer = document.getElementById('moon-container');
        
        if (dataJangkarGlobal) {
            const h = AmalUtils.getHijriahFromJangkar(now, dataJangkarGlobal, metodeKalenderAktif);
            if (h) {
                hijriahDasar = `${h.tgl} ${h.bulan}`; 
                if (UI.tglHijri) UI.tglHijri.innerText = hijriahDasar;
                // Ikon Bulan di atas
                if (moonContainer) {
                    // Panggil fungsi dengan mengirimkan ukuran 7vmin secara langsung
                    let moonIcon = AmalUtils.getMoonPhaseIcon(h.tgl, "7vmin"); 
                    moonContainer.innerHTML = `<span style="filter: drop-shadow(0 0 10px rgba(255, 215, 0, 0.8)); display: inline-block; text-align: center; justify-content: center; align-items: center;">${moonIcon}</span>`;
                }
            }
        }

        // Tanggal Jawa di bawah Hijriah
        if (UI.tglJawa && window.KalenderJawa) {
            const infoJawa = window.KalenderJawa.getInfoUrfi(now);
            if (infoJawa && !infoJawa.error) {
                UI.tglJawa.innerText = `${infoJawa.tanggal} ${infoJawa.sasi} ${infoJawa.tahunAngka} J`;
            }
        }
        
        if (UI.tglJawa && window.KalenderJawa) {
            const infoJawa = window.KalenderJawa.getInfoUrfi(now);
            if (infoJawa && !infoJawa.error) {
                // Tulis Tanggal Utama
                UI.tglJawa.innerText = `${infoJawa.tanggal} ${infoJawa.sasi} ${infoJawa.tahunAngka} J`;
                
                // Tulis Info Warsa & Kurup
                if (UI.infoKurup) {
                    // Ambil kata pertama saja dari Kurup (misal: "Asapon" dari "Asapon (Selasa Pon)")
                    let kurupPendek = infoJawa.kurup.split(' ')[0]; 
                    UI.infoKurup.innerText = `Warsa ${infoJawa.tahunNama} • Kurup ${kurupPendek}`;
                }
            }
        }

        // --- BLOK COUNTDOWN PRA_ADZAN TERPISAH ---
        // const adzanCountdownEl = document.getElementById('adzan-countdown');
        if (UI.adzanCountdown) {
            if (currentPhase === "PRA_ADZAN") {
                let menit = Math.floor(countdownSeconds / 60);
                let detik = countdownSeconds % 60;
                let namaTampilSidebar = activeShalatName;
                if (isHariJumat && activeShalatName === "Dzuhur") {
                    namaTampilSidebar = "Jumat";
                }
                UI.adzanCountdown.innerHTML = `ADZAN ${namaTampilSidebar.toUpperCase()} <br> -${menit}:${detik < 10 ? '0'+detik : detik}`;
                UI.adzanCountdown.style.display = "block";
                document.getElementsByClassName('sidebar-footer')[0].style.display = "none";
            } else {
                UI.adzanCountdown.style.display = "none";
                // Tampilkan kembali footer saat fase PRA_ADZAN selesai
                if (document.getElementsByClassName('sidebar-footer')[0]) {
                    document.getElementsByClassName('sidebar-footer')[0].style.display = "block";
                }
            }
        }
        // -------------------------------------------------

        // const metodeEl = document.getElementById('info-metode');
        let teksRapi = metodeKalenderAktif.replace('_', ' ');
        UI.infoMetode.innerText = `Metode: ${teksRapi}`;

        // --- UBAH BLOK INI: Gunakan format String ---
        const nowTglStr = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
        if (nowTglStr !== lastDateString) {
            lastDateString = nowTglStr;
            fetchDailyData(); // Otomatis me-refresh Kalender!
        }
        // ------------------------------------------
        
        if (Object.keys(jadwalShalat).length > 0) {
            kalkulasiKartu(now);
        }

        const phaseSebelumnya = currentPhase;
        updateSystemPhase(); 

        if (currentPhase !== phaseSebelumnya) {
            console.log(`%c ⚡ PERUBAHAN FASE: ${phaseSebelumnya} ➡️ ${currentPhase}`, "color: #00ff88; font-weight: bold; font-size: 12px;");
            handlePhaseChange();             
        }

        if (currentPhase !== "AKTIF" && currentPhase !== "PRA_ADZAN") {
            renderFullscreenContent();
        }

        // ==========================================
        // EKSEKUSI TRI-STATE DISPLAY (STATE MACHINE)
        // ==========================================
        // const blackoutEl = document.getElementById('layar-blackout');
        // const overlayEl = document.getElementById('fullscreen-overlay');
        
        // Ambil data dari window.configLayar yang sudah di-fetch di awal
        let isTriStateAktif = window.configLayar && window.configLayar.tri_state_enabled;

        // 1. CEK OVERRIDE TERTINGGI: Shalat/Adzan/Iqomah
        // PERBAIKAN: Kecualikan PRA_ADZAN agar tidak ikut diblokir layar hitam
        if (currentPhase !== "AKTIF" && currentPhase !== "PRA_ADZAN") {
            if (UI.layarBlackout) UI.layarBlackout.style.display = "none";
            // PERBAIKAN: Gunakan "block" bukan "flex" agar teks kembali ke tengah layar
            if (UI.fullscreenOverlay) UI.fullscreenOverlay.style.display = "block"; 
        } 
        else if (!isTriStateAktif) {
            // SAKLAR DIMATIKAN: Layar dipaksa selalu Active
            if (UI.layarBlackout) UI.layarBlackout.style.display = "none";
            if (UI.fullscreenOverlay) UI.fullscreenOverlay.style.display = "none";
            UI.overlayContent.innerHTML = "";
            if (typeof pantulFrameId !== 'undefined' && pantulFrameId) cancelAnimationFrame(pantulFrameId);
        }
        else {
            // 2. SAKLAR MENYALA: Jalankan State Machine berdasarkan config.json
            let statusLayarPilihan = "ACTIVE"; 
            
            // Gunakan window.configLayar, BUKAN jadwalLayar lagi
            let arrBlackout = window.configLayar.blackout || [];
            let arrScreensaver = window.configLayar.screensaver || [];
            
            for (let rentang of arrBlackout) {
                if (isTimeInRange(rentang.start, rentang.end, now)) {
                    statusLayarPilihan = "BLACKOUT"; 
                    break;
                }
            }
            
            if (statusLayarPilihan !== "BLACKOUT") {
                for (let rentang of arrScreensaver) {
                    if (isTimeInRange(rentang.start, rentang.end, now)) {
                        statusLayarPilihan = "SCREENSAVER"; 
                        break;
                    }
                }
            }

            // 3. TERAPKAN VISUALNYA
            if (statusLayarPilihan === "BLACKOUT") {
                if (UI.layarBlackout) UI.layarBlackout.style.display = "block"; // Layar mati total
                if (UI.fullscreenOverlay) UI.fullscreenOverlay.style.display = "none";
                if (typeof pantulFrameId !== 'undefined' && pantulFrameId) cancelAnimationFrame(pantulFrameId); 
            } 
            else if (statusLayarPilihan === "SCREENSAVER") {
                if (UI.layarBlackout) UI.layarBlackout.style.display = "none";
                // PERBAIKAN: Gunakan "block" agar jam melayang beroperasi di kanvas penuh
                if (UI.fullscreenOverlay) UI.fullscreenOverlay.style.display = "block"; 
                
                let clockEl = document.getElementById('floating-clock');
                if (!clockEl) {
                    UI.overlayContent.innerHTML = `
                        <div id="floating-clock" style="position: absolute; font-size: 10vmin; color: #555; white-space: nowrap; opacity: 0.8; will-change: transform;">
                            ${getWaktuSekarang().toLocaleTimeString('id-ID', {hour12: false})}
                        </div>
                    `;
                    if (typeof pantulFrameId !== 'undefined' && pantulFrameId) cancelAnimationFrame(pantulFrameId);
                    if (typeof mulaiAnimasiPantul === 'function') mulaiAnimasiPantul(); 
                } else {
                    clockEl.innerText = getWaktuSekarang().toLocaleTimeString('id-ID', {hour12: false});
                }
            } 
            else {
                // ACTIVE (Dashboard Normal)
                if (UI.layarBlackout) UI.layarBlackout.style.display = "none";
                if (UI.fullscreenOverlay) UI.fullscreenOverlay.style.display = "none";
                UI.overlayContent.innerHTML = ""; 
                if (typeof pantulFrameId !== 'undefined' && pantulFrameId) cancelAnimationFrame(pantulFrameId);
            }
        }
    }

    function kalkulasiKartu(now) {
        let shalatSelanjutnya = null;
        let shalatSebelumnya = null;
        let jadwalHariIni = [];

        urutan.forEach(nama => {
            if (jadwalShalat[nama]) {
                let [jam, menit] = jadwalShalat[nama].split(':');
                jadwalHariIni.push({
                    nama: nama,
                    waktu: new Date(now.getFullYear(), now.getMonth(), now.getDate(), jam, menit, 0)
                });
            }
        });

        for (let i = 0; i < jadwalHariIni.length; i++) {
            if (now < jadwalHariIni[i].waktu) {
                shalatSelanjutnya = jadwalHariIni[i];
                shalatSebelumnya = (i > 0) ? jadwalHariIni[i-1] : null;
                break;
            }
        }

        if (!shalatSebelumnya && shalatSelanjutnya) {
            let [j, m] = (jadwalShalat["Isya"] || "00:00").split(':');
            shalatSebelumnya = { nama: "Isya", waktu: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, j, m, 0) };
        }
        if (!shalatSelanjutnya) {
            shalatSebelumnya = jadwalHariIni[jadwalHariIni.length - 1]; 
            let [j, m] = (jadwalShalat["Imsak"] || "00:00").split(':');
            shalatSelanjutnya = { nama: "Imsak", waktu: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, j, m, 0) };
        }

        let namaAktif = null;
        if (shalatSebelumnya) {
            let selisihMs = now - shalatSebelumnya.waktu;
            if (selisihMs >= 0 && (selisihMs <= (durasiAktifMenit * 60 * 1000) || selaluAktif)) {
                namaAktif = shalatSebelumnya.nama;
            }
        }

        urutan.forEach(nama => {
            let card = document.getElementById(`kartu-${nama}`);
            if (!card) return;
            let titleEl = card.querySelector('.title');
            let selisihEl = card.querySelector('.selisih');

            card.className = "kartu";
            if (nama === namaAktif) {
                card.classList.add('active');
                titleEl.innerText = "Saat ini";
                selisihEl.innerText = formatSelisih(now - shalatSebelumnya.waktu, true);
            } 
            else if (nama === shalatSelanjutnya.nama) {
                card.classList.add('next');
                if (currentPhase === "PRA_ADZAN" && nama === activeShalatName) {
                    card.classList.add('pra-adzan');
                    titleEl.innerText = "Menjelang";
                } else {
                    titleEl.innerText = "Selanjutnya";
                }
                selisihEl.innerText = formatSelisih(shalatSelanjutnya.waktu - now, false);
            } else {
                // titleEl.innerText = nama;
                titleEl.innerText = "";
                selisihEl.innerText = "";
            }
        });
    }

    // ==========================================
    // 4. API FETCH (BACKEND COMMUNICATION)
    // ==========================================
    // function fetchDailyData1(callback) {

    //     // Ambil tanggal dari Mesin Waktu (Bukan waktu nyata dari browser)
    //     const d = getWaktuSekarang();
    //     const y = d.getFullYear();
    //     const m = String(d.getMonth() + 1).padStart(2, '0');
    //     const day = String(d.getDate()).padStart(2, '0');
    //     const hh = String(d.getHours()).padStart(2, '0');
    //     const mm = String(d.getMinutes()).padStart(2, '0');
    //     let paramTime = `time=${hh}:${mm}`;
        
    //     let url = `/get_data?date=${y}-${m}-${day}&${paramTime}`;

    //     fetch(url)
    //         .then(r => r.json())
    //         .then(data => {
    //             selaluAktif = (data.selalu_aktif === true);
    //             durasiAktifMenit = parseInt(data.durasi_aktif) || 15;
    //             metodeKalenderAktif = data.metode || "NASIONAL_MABIMS";
    //             pasaranDasar = data.pasaran;

    //             // Tangkap data iqomah dan status hari
    //             dataIqomah = data.iqomah || {};
    //             isHariJumat = data.is_jumat || false;

    //             // Ubah Visual Kartu Dzuhur menjadi Jumat jika hari ini Jumat
    //             const kartuDzuhur = document.getElementById('kartu-Dzuhur');
    //             if (kartuDzuhur && isHariJumat) {
    //                 kartuDzuhur.querySelector('.title').innerText = "Jumat";
    //                 kartuDzuhur.querySelector('.nama-shalat').innerText = "Jumat";
    //             } else if (kartuDzuhur) {
    //                 kartuDzuhur.querySelector('.title').innerText = "Dzuhur";
    //                 kartuDzuhur.querySelector('.nama-shalat').innerText = "Dzuhur";
    //             }

    //             // --- TAMBAHAN: Tangkap Pengaturan Layar dari app.py ---
    //             window.configLayar = data.display_settings;
    //             window.dataKeuangan = data.keuangan;
    //             console.log("🪙 Radar Kas Masjid:", window.dataKeuangan);
    //             window.tampilkanJawa = data.tampilkan_jawa !== false;
                
    //             // LOGIKA HIDE/SHOW DI SIDEBAR KIRI
    //             // const elTglJawa = document.getElementById('tgl-jawa');
    //             //const elInfoKurup = document.getElementById('info-kurup');
    //             if (UI.tglJawa) UI.tglJawa.style.display = window.tampilkanJawa ? "block" : "none";
    //             if (UI.infoKurup) UI.infoKurup.style.display = window.tampilkanJawa ? "block" : "none";
                
    //             document.getElementById('nama-masjid').innerText = data.nama_masjid;
    //             document.getElementById('alamat-masjid').innerText = data.alamat_masjid;
    //             document.getElementById('info-kota').innerText = data.lokasi.nama;
    //             document.getElementById('info-lokasi').innerText = data.lokasi.koordinat;


    //             // =======================================================
    //             // UPDATE VISUAL RASHDUL QIBLAH HARIAN (TEATER MATAHARI)
    //             // =======================================================
    //             const kiblatUtara = data.lokasi.kiblat;
    //             // Konversi derajat kompas (Utara=-90deg, Kanan/Timur=0deg dalam CSS Math)
    //             const rotasiCSS = kiblatUtara - 90; 
                
    //             const kabahEl = document.getElementById('ikon-kabah-rashdul');
    //             const wadahMatahari = document.getElementById('wadah-matahari-bayangan');
    //             const teksKiblat = document.getElementById('teks-kiblat');
    //             const teksWaktuR = document.getElementById('teks-waktu-rashdul');

    //             if (teksKiblat) teksKiblat.innerText = `Arah Kiblat: ${parseFloat(kiblatUtara).toFixed(1)}°`;

    //             if (kabahEl) {
    //                 // Letakkan Kabah di radius 6vmin (pinggir), pastikan ikon tetap tegak
    //                 kabahEl.style.transform = `rotate(${rotasiCSS}deg) translate(7vmin, 0) rotate(-${rotasiCSS}deg)`;
    //             }

    //             if (data.lokasi.rashdul_harian) {
    //                 const rh = data.lokasi.rashdul_harian;
    //                 waktuRashdulHariIni = rh.waktu;
    //                 if (teksWaktuR) teksWaktuR.innerText = `Rashdul Qiblah harian pukul ${rh.waktu}`;
                    
    //                 if (wadahMatahari) {
    //                     wadahMatahari.style.opacity = 1;
                        
    //                     if (rh.tipe === "bayangan_menuju") {
    //                         // Matahari membelakangi Kabah (+180 derajat)
    //                         wadahMatahari.style.transform = `rotate(${rotasiCSS + 180}deg)`;
    //                     } else {
    //                         // Matahari sejajar dengan Kabah
    //                         wadahMatahari.style.transform = `rotate(${rotasiCSS}deg)`;
    //                     }
    //                 }
    //             } else {
    //                 if (teksWaktuR) teksWaktuR.innerText = "Tidak terjadi hari ini";
    //                 if (wadahMatahari) wadahMatahari.style.opacity = 0; // Sembunyikan Matahari/Bayangan
    //             }                
    //             // =======================================================
                
    //             // =======================================================
    //             // UPDATE PLANETARIUM MINI (REAL-TIME POSISI PLANET)
    //             // =======================================================
    //             if (data.lokasi.planetarium) {
    //                 const plan = data.lokasi.planetarium;
    //                 const wadahMat = document.getElementById('planetarium-matahari');
    //                 const wadahBul = document.getElementById('planetarium-bulan');
                    
    //                 if (wadahMat && wadahMat.firstElementChild) {
    //                     // Konversi Ketinggian ke Jari-jari (Radius)
    //                     // Ketinggian 90° = radius 0vmin (tengah kompas)
    //                     // Ketinggian 0° = radius 7vmin (pinggir cakrawala)
    //                     let altMat = Math.max(0, plan.alt_matahari || 0); // Cegah nilai minus saat tenggelam
    //                     let radiusMat = 7 * ((90 - altMat) / 90);
                        
    //                     wadahMat.style.opacity = plan.matahari_terbit ? 1 : 0.1; 
    //                     wadahMat.style.transform = `rotate(${plan.matahari - 90}deg)`;
    //                     wadahMat.firstElementChild.style.left = `${radiusMat}vmin`; 
    //                 }
                    
    //                 if (wadahBul && wadahBul.firstElementChild) {
    //                     let altBul = Math.max(0, plan.alt_bulan || 0);
    //                     let radiusBul = 7 * ((90 - altBul) / 90);
                        
    //                     wadahBul.style.opacity = plan.bulan_terbit ? 1 : 0.1;
    //                     wadahBul.style.transform = `rotate(${plan.bulan - 90}deg)`;
    //                     wadahBul.firstElementChild.style.left = `${radiusBul}vmin`;
    //                 }
    //             }
    //             // =======================================================

    //             jadwalShalat = data.jadwal;
    //             for (const [key, value] of Object.entries(data.jadwal)) {
    //                 if (document.getElementById(key)) document.getElementById(key).innerText = value;
    //             }

    //             window.jumatConfig = data.jumat_config || { durasi_menit: 45 };

    //             const rt1 = document.getElementById('running-text-1');
    //             const rt2 = document.getElementById('running-text-2');
    //             if (rt1) {
    //                 // SEKARANG RUNNING TEXT MENGGUNAKAN LOGIKA LOKAL
    //                 let pesan = generateRunningText(getWaktuSekarang(), data.nama_masjid, data.alamat_masjid);
    //                 rt1.innerText = rt2.innerText = (pesan + "\u00A0".repeat(15));
    //             }

    //             updateClock();
    //             if (callback) callback();
    //             if (UI.calendarContainer &&UI.calendarContainer.style.display !== "none") fetchCalendar();
    //         });
    // }

    // ----------------------------------------------------------
    // memecah fetchDailyData menjadi fungsi terpisah
    function fetchDailyData(callback) {
        const d = getWaktuSekarang();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');

        let url = `/get_data?date=${y}-${m}-${day}&time=${hh}:${mm}`;

        fetch(url)
            .then(r => r.json())
            .then(data => {
                applyDailyData(data, callback);
            });
    }
    
    function applyDailyData(data, callback) {

        applyState(data);

        renderBasicInfo(data);
        renderDzuhurJumat(data);
        renderKiblat(data);
        renderPlanetarium(data);
        renderJadwal(data);
        renderRunningText(data);

        finalizeRender(callback);

        // === DATA RASHDUL ===
        if (data.lokasi.rashdul_harian) {
            const rh = data.lokasi.rashdul_harian;
            waktuRashdulHariIni = rh;
            console.log("data Rashdul Hari ini: " + waktuRashdulHariIni);
        }
        else {
            waktuRashdulHariIni = null; // Reset ke null jika data tidak ditemukan
            console.log("data tidak ada");
        }

        console.log("applayDailyData selesai");

    }

    function applyState(data) {
        selaluAktif = (data.selalu_aktif === true);
        durasiAktifMenit = parseInt(data.durasi_aktif) || 15;
        metodeKalenderAktif = data.metode || "NASIONAL_MABIMS";
        pasaranDasar = data.pasaran;

        dataIqomah = data.iqomah || {};
        isHariJumat = data.is_jumat || false;

        window.configLayar = data.display_settings;
        window.dataKeuangan = data.keuangan;
        window.tampilkanJawa = data.tampilkan_jawa !== false;

        window.jumatConfig = data.jumat_config || { durasi_menit: 45 };
        jadwalShalat = data.jadwal;

        console.log("🪙 Radar Kas Masjid:", window.dataKeuangan);
    }

    function renderBasicInfo(data) {
        if (UI.tglJawa) UI.tglJawa.style.display = window.tampilkanJawa ? "block" : "none";
        if (UI.infoKurup) UI.infoKurup.style.display = window.tampilkanJawa ? "block" : "none";

        document.getElementById('nama-masjid').innerText = data.nama_masjid;
        document.getElementById('alamat-masjid').innerText = data.alamat_masjid;
        document.getElementById('info-kota').innerText = data.lokasi.nama;
        document.getElementById('info-lokasi').innerText = data.lokasi.koordinat;
    }

    function renderDzuhurJumat(data) {
        const kartuDzuhur = document.getElementById('kartu-Dzuhur');

        if (!kartuDzuhur) return;

        if (isHariJumat) {
            kartuDzuhur.querySelector('.title').innerText = "Jumat";
            kartuDzuhur.querySelector('.nama-shalat').innerText = "Jumat";
        } else {
            kartuDzuhur.querySelector('.title').innerText = "Dzuhur";
            kartuDzuhur.querySelector('.nama-shalat').innerText = "Dzuhur";
        }
    }

    function renderKiblat(data) {
        const kiblatUtara = data.lokasi.kiblat;
        const rotasiCSS = kiblatUtara - 90;

        // const kabahEl = document.getElementById('ikon-kabah-rashdul');
        const kabahEl = document.getElementById('ikon-kabah');
        const teksKiblat = document.getElementById('teks-kiblat');
        // const teksWaktuR = document.getElementById('teks-waktu-rashdul');

        // === TEKS KIBLAT ===
        if (teksKiblat) {
            teksKiblat.innerText = `Arah Kiblat: ${parseFloat(kiblatUtara).toFixed(1)}°`;
        }

        // === IKON KABAH ===
        if (kabahEl) {
            kabahEl.style.transform =
                `rotate(${rotasiCSS}deg) translate(7vmin, 0) rotate(-${rotasiCSS}deg) `;
        }
    }

    function renderPlanetarium(data) {
        if (!data.lokasi.planetarium) return;

        const plan = data.lokasi.planetarium;
        const kiblat = data.lokasi.kiblat;

        renderSkyDome(plan);
        renderSunRay(plan);
        renderShadow(plan, data);

        // renderRashdul(data.lokasi.rashdul_harian);
    }


    function altAzToXY(alt, az, radiusMax) {
        const r = radiusMax * ((90 - alt) / 90);
        // konversi azimuth ke radian (0° = utara → CSS perlu shift)
        const theta = (az - 90) * Math.PI / 180;
        return {
            x: r * Math.cos(theta),
            y: r * Math.sin(theta)
        };
    }

    // function renderSkyDome(plan) {
    //     const dome = document.getElementById('sky-dome');
    //     if (!dome) return;

    //     const R = dome.clientWidth / 2;

    //     const sun = document.getElementById('obj-sun');
    //     const moon = document.getElementById('obj-moon');

    //     // === MATAHARI ===
    //     let altSun = Math.max(0, plan.alt_matahari || 0);
    //     let posSun = altAzToXY(altSun, plan.matahari, R);

    //     sun.style.left = `${50 + (posSun.x / R) * 50}%`;
    //     sun.style.top  = `${50 + (posSun.y / R) * 50}%`;
    //     sun.style.opacity = plan.matahari_terbit ? 1 : 0.15;

    //     // === BULAN ===
    //     let altMoon = Math.max(0, plan.alt_bulan || 0);
    //     let posMoon = altAzToXY(altMoon, plan.bulan, R);

    //     moon.style.left = `${50 + (posMoon.x / R) * 50}%`;
    //     moon.style.top  = `${50 + (posMoon.y / R) * 50}%`;
    //     moon.style.opacity = plan.bulan_terbit ? 1 : 0.15;
    // }

    // Fungsi untuk mencampur dua warna (HEX) berdasarkan persentase (0-1)
    function interpolateColor(color1, color2, factor) {
        const r1 = parseInt(color1.substring(1, 3), 16);
        const g1 = parseInt(color1.substring(3, 5), 16);
        const b1 = parseInt(color1.substring(5, 7), 16);

        const r2 = parseInt(color2.substring(1, 3), 16);
        const g2 = parseInt(color2.substring(3, 5), 16);
        const b2 = parseInt(color2.substring(5, 7), 16);

        const r = Math.round(r1 + factor * (r2 - r1));
        const g = Math.round(g1 + factor * (g2 - g1));
        const b = Math.round(b1 + factor * (b2 - b1));

        return `rgb(${r}, ${g}, ${b})`;
    }
    function renderSkyDome(plan) {
        const dome = document.getElementById('sky-dome');
        const sun = document.getElementById('obj-sun');
        const moon = document.getElementById('obj-moon');
        const sunRay = document.getElementById('sun-ray');
        if (!dome || !sun || !moon) return;

        const R = dome.clientWidth / 2;

        // ===  matahari === //
        let altSun = plan.alt_matahari || 0;
        let azSun = plan.matahari || 0;
        let posSun = altAzToXY(Math.max(0, altSun), azSun, R);
        let sunXPercent = 50 + (posSun.x / R) * 50;
        let sunYPercent = 50 + (posSun.y / R) * 50;

        sun.style.left = `${sunXPercent}%`;
        sun.style.top  = `${sunYPercent}%`;
        sun.style.opacity = plan.matahari_terbit ? 1 : 0.15;

        // ===  bulan === //
        let altMoon = plan.alt_bulan || 0;
        let azMoon = plan.bulan || 0;
        let posMoon = altAzToXY(Math.max(0, altMoon), azMoon, R);
        let moonXPercent = 50 + (posMoon.x / R) * 50;
        let moonYPercent = 50 + (posMoon.y / R) * 50;

        moon.style.left = `${moonXPercent}%`;
        moon.style.top  = `${moonYPercent}%`;
        moon.style.opacity = plan.bulan_terbit ? 1 : 0.15;
        const tglAngka = hijriahDasar.split(' ')[0];
        const moonIcon = AmalUtils.getMoonPhaseIcon(tglAngka, "1.3vmin", "sky"); 

        if (moon.innerHTML !== moonIcon) {
            moon.innerHTML = moonIcon;
        }

        // Di dalam fungsi renderSkyDome, setelah mengatur posisi moon
        if (plan.alt_matahari > 0) {
            // Siang hari: Beri kontras tinggi agar tidak "tenggelam" di warna biru
            moon.style.filter = "brightness(2) drop-shadow(0 0 8px white)";
            moon.style.opacity = "0.7"; // Jangan terlalu transparan
        } else {
            // Malam hari: Kembali ke tampilan normal yang lembut
            moon.style.filter = "brightness(1.2) drop-shadow(0 0 10px rgba(200,220,255,0.4))";
            moon.style.opacity = "1";
        }

        // --- LOGIKA INTERPOLASI WARNA ---
        let finalSkyColor;
        let glowColor = "rgba(255, 215, 0, 0)"; // Default transparan

        // const colorDay    = "#4A90E2"; // Biru Siang
        const colorDay    = "#6aacf7"; // Biru Siang
        const colorGolden = "#F9A825"; // Kuning/Oranye Golden Hour
        const colorNight  = "#0A0F1A"; // Hitam Malam

        if (altSun > 12) {
            // Full Siang
            finalSkyColor = colorDay;
        } 
        else if (altSun > 0) {
            // Transisi Siang ke Golden Hour (Altitude 0 sampai 12)
            // factor 1 = Full Golden, factor 0 = Full Siang
            let factor = 1 - (altSun / 12); 
            finalSkyColor = interpolateColor(colorDay, colorGolden, factor);
            
            // Tambahkan pendaran cahaya (glow) saat matahari rendah
            glowColor = `rgba(255, 215, 0, ${factor * 0.6})`;
        } 
        else if (altSun > -6) {
            // Transisi Golden Hour ke Malam (Twilight)
            let factor = 1 - (Math.abs(altSun) / 6);
            finalSkyColor = interpolateColor(colorNight, colorGolden, factor);
        } 
        else {
            // Malam
            finalSkyColor = colorNight;
        }

        // Terapkan ke Background Langit
        dome.style.background = `radial-gradient(circle at ${sunXPercent}% ${sunYPercent}%, ${glowColor} 0%, ${finalSkyColor} 70%)`;

        // // --- LOGIKA BERKAS CAHAYA (SUN RAY) ---
        // if (sunRay) {
        //     // Muncul hanya saat altitude 0 - 10 derajat
        //     let rayOpacity = 0;
        //     if (altSun > 0 && altSun < 10) {
        //         rayOpacity = (10 - altSun) / 10; 
        //     }
        //     sunRay.style.opacity = rayOpacity;
        //     // sunRay.style.left = `${sunXPercent}%`;
        //     // sunRay.style.top = `${sunYPercent}%`;
        //     sunRay.style.transform = `rotate(${azSun + 180}deg)`;
        // }
    }

    function renderShadow(plan, data) {
        const shadow = document.getElementById('shadow-line');
        const dome = document.getElementById('sky-dome'); // Perlu referensi ke dome
        if (!shadow || !dome) return;

        if (!plan.matahari_terbit) {
            shadow.style.opacity = 0;
            return;
        }

        // 1. Hitung Rotasi (Berlawanan arah matahari)
        let azShadow = (plan.matahari + 180) % 360;
        const rot = azShadow - 90;

        // 2. Hitung Panjang (Sama seperti logika SunRay)
        const R = dome.clientWidth / 2;
        const alt = Math.max(0, plan.alt_matahari || 0);
        
        // Logika: Semakin rendah matahari (alt dekat 0), bayangan semakin panjang
        // Menggunakan rumus yang sama agar sinkron dengan titik matahari di dome
        const r = R * ((90 - alt) / 90);
        const percent = (r / R) * 50;

        // 3. Terapkan Style
        shadow.style.opacity = 0.75; // Sesuaikan opasitas bayangan
        shadow.style.width = `${percent}%`; // Panjang mengikuti posisi
        shadow.style.height = `${1 + 5 * (alt / 90)}px`;
        shadow.style.transform = `translateY(-50%) rotate(${rot}deg)`;
    }

    function renderSunRay(plan) {
        const ray = document.getElementById('sun-ray');
        const dome = document.getElementById('sky-dome');
        if (!ray || !dome) return;

        if (!plan.matahari_terbit) {
            ray.style.opacity = 0;
            return;
        }

        const R = dome.clientWidth / 2;

        // hitung radius berdasarkan altitude (SAMA seperti sky dome)
        const alt = Math.max(0, plan.alt_matahari || 0);
        const r = R * ((90 - alt) / 90);

        // ubah jadi persen terhadap width
        const percent = (r / R) * 50;

        const rot = plan.matahari - 90;

        ray.style.opacity = 0.4 + 0.6 * (alt / 90);
        ray.style.height = `${1 + 5 * (alt / 90)}px`;
        ray.style.width = `${percent}%`;
        ray.style.transform = `translateY(-50%) rotate(${rot}deg)`;
    }

        // function renderSunRay(plan) {
        //     const ray = document.getElementById('sun-ray');
        //     const dome = document.getElementById('sky-dome');
            
        //     if (!ray || !dome) return;

        //     const alt = plan.alt_matahari || 0;
        //     const az = plan.matahari || 0;

        //     // 1. Pastikan matahari di atas ufuk
        //     if (alt <= 0) {
        //         ray.style.opacity = 0;
        //         return;
        //     }

        //     const rect = dome.getBoundingClientRect();
        //     // const R = dome.clientWidth / 2;
        //     const R = rect.width / 2;
        //     const posSun = altAzToXY(alt, az, R);
        //     // Hitung posisi absolut dalam piksel
        //     const sunX = R + posSun.x;
        //     const sunY = R + posSun.y;

        //     // Lebar ray (jarak dari matahari ke pusat dome)
        //     const distanceToCenter = Math.sqrt(posSun.x ** 2 + posSun.y ** 2);

        //     // 2. Panjang Berkas
        //     // r adalah jarak matahari dari pusat. Persentase lebar ray menuju pusat.
        //     const r = R * ((90 - alt) / 90);
        //     const percent = (r / R) * 50;

        //     // 3. Logika Opacity (Kita buat lebih longgar agar selalu tampak)
        //     // Jika ingin efek kuning, opacity tinggi saat altitude rendah.
        //     let intensity = 0.5 + (0.5 * (1 - alt / 90)); 

        //     // 4. Koreksi Rotasi
        //     // Pakai az - 90 jika sistem koordinat Anda Utara = 0.
        //     // Tambahkan 180 jika ray harus menunjuk ke arah tengah lingkaran.
        //     const rot = az - 90 + 180;

        //     // 5. Terapkan Style
        //     ray.style.opacity = intensity;
        //     ray.style.height = `${1 + 5 * (alt / 90)}px`;
        //     ray.style.width = `${percent}%`;
        //     ray.style.left = `${50 + (posSun.x / R) * 50}%`;
        //     ray.style.top  = `${50 + (posSun.y / R) * 50}%`;
            
        //     // PENTING: Urutan rotate dulu baru translate atau sebaliknya bisa krusial
        //     ray.style.transform = `rotate(${rot}deg) translateY(-50%)`;
        // }

    // rashdul qiblah dipanggil pada updateClock

    function renderRashdul(waktuRashdulHariIni) {
        const teksWaktuR = document.getElementById('teks-waktu-rashdul');
        const dome = document.getElementById('sky-dome');
        if (!teksWaktuR) return;

        const sekarang = getWaktuSekarang();
        const tglSekarang = sekarang.toISOString().split('T')[0]; // Format "YYYY-MM-DD"
        
        let waktuFinal = null;
        let tipeFinal = "bayangan_menuju"; // Default untuk global
        let isGlobal = false;

        // 1. CEK APAKAH HARI INI ADA RASHDUL GLOBAL (Mei/Juli)
        if (dataRashdul) {
            // Cek tanggal Mei dan Juli dari API
            const tglMei = dataRashdul.mei ? dataRashdul.mei.split(' ')[0] : null;
            const tglJuli = dataRashdul.juli ? dataRashdul.juli.split(' ')[0] : null;

            if (tglSekarang === tglMei || tglSekarang === tglJuli) {
                const fullWaktu = tglSekarang === tglMei ? dataRashdul.mei : dataRashdul.juli;
                // Ambil jam:menit saja dari string "YYYY-MM-DD HH:mm:ss"
                waktuFinal = fullWaktu.split(' ')[1].substring(0, 5); 
                tipeFinal = "matahari_diatas_kabah";
                isGlobal = true;
                console.log("Menggunakan Rashdul Qiblah Global: " + waktuFinal);
            }
        }

        // 2. JIKA BUKAN GLOBAL, GUNAKAN HARIAN
        if (!isGlobal && waktuRashdulHariIni) {
            waktuFinal = waktuRashdulHariIni.waktu;
            tipeFinal = waktuRashdulHariIni.tipe;
        }

        // 3. RENDER KE UI
        if (waktuFinal) {
            const [jamR, menitR] = waktuFinal.split(':').map(Number);
            const menitSekarang = (sekarang.getHours() * 60) + sekarang.getMinutes();
            const menitRashdul = (jamR * 60) + menitR;
            const selisih = menitSekarang - menitRashdul;

            if (selisih >= -3 && selisih <= 3) {
                if (isGlobal) {
                    teksWaktuR.innerText = "Matahari tepat di atas Ka'bah! Luruskan Kiblat!";
                } else if (tipeFinal === "bayangan_menuju") {
                    teksWaktuR.innerText = "Bayangan menunjuk arah Kiblat sekarang!";
                } else {
                    teksWaktuR.innerText = "Matahari searah Kiblat sekarang!";
                }
                teksWaktuR.classList.add('teks-sedang-rashdul');
                dome.classList.add('animasi-pendar');
            } else {
                const label = isGlobal ? "Rashdul Qiblah Global" : "Rashdul Qiblah harian";
                teksWaktuR.innerText = `${label} pukul ${waktuFinal}`;
                teksWaktuR.classList.remove('teks-sedang-rashdul');
                dome.classList.remove('animasi-pendar');
            }
        } else {
            teksWaktuR.innerText = "Tidak terjadi hari ini";
            dome.classList.remove('animasi-pendar');
        }
    }
    // // ----------------------------------------------------------

    function renderJadwal(data) {
        for (const [key, value] of Object.entries(data.jadwal)) {
            const el = document.getElementById(key);
            if (el) el.innerText = value;
        }
    }

    function renderRunningText(data) {
        const rt1 = document.getElementById('running-text-1');
        const rt2 = document.getElementById('running-text-2');

        if (!rt1) return;

        let pesan = generateRunningText(
            getWaktuSekarang(),
            data.nama_masjid,
            data.alamat_masjid
        );

        rt1.innerText = rt2.innerText = (pesan + "\u00A0".repeat(15));
    }

    function finalizeRender(callback) {
        updateClock();

        if (callback) callback();

        if (UI.calendarContainer && UI.calendarContainer.style.display !== "none") {
            fetchCalendar();
        }
    }
    
    // ---------------------------------------------------------
    
    async function fetchRashdulQiblah() {
        try {
            const res = await fetch('/api/rashdul_qiblah');
            const json = await res.json();
            if(json.status === 'success') {
                dataRashdul = json.peristiwa;
                console.log("🔭 Data Rashdul Qiblah dimuat:", dataRashdul);
                // Paksa kalender menggambar ulang agar event Rashdul langsung muncul
                const now = getWaktuSekarang();
                if (typeof fetchCalendar === 'function') {
                    fetchCalendar(now.getFullYear(), now.getMonth());
                }
                // ---------------------------
            }
        } catch(err) {
            console.error("Gagal memuat Rashdul Qiblah", err);
        }
    }

    function pantauRashdulQiblah(now) {
        if (!dataRashdul) return;

        // PERBAIKAN: Tambahkan replace agar format tanggal bisa dibaca semua browser
        const evtMei = new Date(dataRashdul.mei.replace(' ', 'T'));
        const evtJuli = new Date(dataRashdul.juli.replace(' ', 'T'));

        let target = null;
        if (now < new Date(evtMei.getTime() + 10 * 60000)) { 
            target = evtMei; 
        } else if (now < new Date(evtJuli.getTime() + 10 * 60000)) {
            target = evtJuli; 
        }

        if (!target) {
            pesanRashdulH3 = ""; 
            kontenSlideRashdul = "";
            return; 
        }

        const diffMs = target - now;
        const diffMenit = diffMs / 60000;
        const diffHari = diffMs / (1000 * 60 * 60 * 24);

        const takeoverEl = UI.rashdulTakeover;
        const countdownEl = UI.rashdulCountdown;
        const instruksiEl = UI.rashdulInstruksi;

        // SKENARIO A: BLOKING LAYAR (H-15 Menit sampai H+5 Menit)
        if (diffMenit <= 15 && diffMenit >= -5) {
            isRashdulTakeover = true; // Kunci sistem rotasi!

            // Paksa kalender muncul ke depan dan sembunyikan poster pengumuman
            // const calContainer = document.getElementById('calendar-container');
            // const infoContainer = document.getElementById('info-display-container');
            if (UI.calendarContainer) UI.calendarContainer.style.display = 'flex';
            if (UI.infoDisplay) UI.infoDisplay.style.display = 'none';

            if (takeoverEl && takeoverEl.style.display !== 'flex') {
                takeoverEl.style.display = 'flex'; 
            }
            
            if (takeoverEl) {
                if (diffMenit > 0) {
                    let m = Math.floor(diffMs / 60000);
                    let s = Math.floor((diffMs % 60000) / 1000);
                    countdownEl.innerHTML = `-${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
                    countdownEl.style.color = "#00ff88";
                } else {
                    countdownEl.innerHTML = "TANDAI BAYANGAN<br>SEKARANG!";
                    countdownEl.style.fontSize = "3.5em";
                    countdownEl.style.color = "#ff4444";
                    instruksiEl.innerHTML = "Garis bayangan benda tegak lurus saat ini adalah arah kiblat yang paling akurat. (Toleransi 5 menit)";
                }
            }
            pesanRashdulH3 = ""; 
        } 
        // SKENARIO B: NORMAL KEMBALI
        else {
            isRashdulTakeover = false; // Buka kembali kunci rotasi

            if (takeoverEl && takeoverEl.style.display === 'flex') {
                takeoverEl.style.display = 'none'; 
                countdownEl.style.fontSize = "5em"; 
            }

            if (diffHari <= 3 && diffHari >= 0 && diffMenit > 15) {
                let tglStr = target.toLocaleDateString('id-ID', { day: 'numeric', month: 'long' });
                let jamStr = target.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                
                // 1. Untuk Teks Berjalan (Bawah)
                pesanRashdulH3 = `🔭 PERSIAPAN RASHDUL QIBLAH: Tanggal ${tglStr} pukul ${jamStr} WIB, Matahari tepat di atas Ka'bah.`;
                
                // 2. Untuk Slide Rolling Info (Tarik dari Template)
                let tmpl = document.getElementById('tmpl-slide-rashdul').innerHTML;
                kontenSlideRashdul = tmpl
                    .replace(/\{\{TGL\}\}/g, tglStr)
                    .replace(/\{\{JAM\}\}/g, jamStr);
            } else {
                pesanRashdulH3 = "";
                kontenSlideRashdul = ""; // Kosongkan jika bukan H-3
            }
        }
    }

    async function fetchGerhana() {
        try {
            const res = await fetch('/api/gerhana');
            const json = await res.json();
            if(json.status === 'success') {
                dataGerhana = json.data;
                console.log("🌒 Data Gerhana dimuat:", dataGerhana);
                
                // Gambar ulang kalender
                if (typeof fetchCalendar === 'function') {
                    const now = getWaktuSekarang();
                    fetchCalendar(now.getFullYear(), now.getMonth());
                }
            }
        } catch(err) { console.error("Gagal memuat Gerhana", err); }
    }

    function pantauGerhana(now) {
        if (!dataGerhana || dataGerhana.length === 0) return;

        // Cari gerhana terdekat di tahun ini yang belum lewat
        let targetEvent = null;
        let targetDate = null;

        for (let i = 0; i < dataGerhana.length; i++) {
            let evtDate = new Date(dataGerhana[i].waktu.replace(' ', 'T'));
            // Jika waktu sekarang masih kurang dari Waktu Gerhana + 10 menit
            if (now < new Date(evtDate.getTime() + 10 * 60000)) {
                targetEvent = dataGerhana[i];
                targetDate = evtDate;
                break; // Berhenti mencari karena sudah ketemu yang paling dekat
            }
        }

        if (!targetEvent) {
            pesanGerhanaH3 = "";
            kontenSlideGerhana = "";
            return;
        }

        const diffMs = targetDate - now;
        const diffMenit = diffMs / 60000;
        const diffHari = diffMs / (1000 * 60 * 60 * 24);

        const takeoverEl = UI.gerhanaTakeover;
        const judulEl = UI.gerhanaJudul;
        const countdownEl = UI.gerhanaCountdown;
        const namaShalatEl = UI.gerhanaNamaShalat;
        const ikonEl = UI.gerhanaIkon;

        // SKENARIO A: BLOKING LAYAR (H-15 Menit sampai H+5 Menit)
        if (diffMenit <= 15 && diffMenit >= -5) {
            isGerhanaTakeover = true;

            // const UI.calendarContainer = document.getElementById('calendar-container');
            // const infoContainer = document.getElementById('info-display-container');
            if (UI.calendarContainer) UI.calendarContainer.style.display = 'flex';
            if (UI.infoDisplay) UI.infoDisplay.style.display = 'none';

            if (takeoverEl && takeoverEl.style.display !== 'flex') {
                takeoverEl.style.display = 'flex';
                judulEl.innerText = `Gerhana ${targetEvent.jenis} ${targetEvent.tipe}`;
                namaShalatEl.innerText = targetEvent.jenis === "Matahari" ? "Shalat Kusuf" : "Shalat Khusuf";
                ikonEl.innerText = targetEvent.jenis === "Matahari" ? "🌞 🌑" : "🌕 🌖 🌗";
            }

            if (takeoverEl) {
                if (diffMenit > 0) {
                    let m = Math.floor(diffMs / 60000);
                    let s = Math.floor((diffMs % 60000) / 1000);
                    countdownEl.innerHTML = `-${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
                    countdownEl.style.color = "#ffd700";
                } else {
                    countdownEl.innerHTML = "GERHANA SEDANG<br>BERLANGSUNG";
                    countdownEl.style.fontSize = "3.5em";
                    countdownEl.style.color = "#ff4444";
                }
            }
            pesanGerhanaH3 = ""; 
        } 
        // SKENARIO B: NORMAL & PENGUMUMAN H-3
        else {
            isGerhanaTakeover = false;

            if (takeoverEl && takeoverEl.style.display === 'flex') {
                takeoverEl.style.display = 'none';
                countdownEl.style.fontSize = "5em";
            }

            if (diffHari <= 3 && diffHari >= 0 && diffMenit > 15) {
                let tglStr = targetDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'long' });
                let jamStr = targetDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                let shalatStr = targetEvent.jenis === "Matahari" ? "Kusuf (Matahari)" : "Khusuf (Bulan)";
                let ikonAstro = targetEvent.jenis === "Matahari" ? "🌞 🌑" : "🌕 🌖 🌗";
                
                // 1. Untuk Teks Berjalan
                pesanGerhanaH3 = `🌒 PERINGATAN: Akan terjadi Gerhana ${targetEvent.jenis} ${targetEvent.tipe} pada ${tglStr} pkl ${jamStr} WIB.`;
                
                // 2. Untuk Slide Rolling Info (Tarik dari Template)
                let tmpl = document.getElementById('tmpl-slide-gerhana').innerHTML;
                kontenSlideGerhana = tmpl
                    .replace(/\{\{IKON\}\}/g, ikonAstro)
                    .replace(/\{\{JENIS\}\}/g, targetEvent.jenis)
                    .replace(/\{\{TGL\}\}/g, tglStr)
                    .replace(/\{\{JAM\}\}/g, jamStr)
                    .replace(/\{\{SHALAT\}\}/g, shalatStr);
            } else {
                pesanGerhanaH3 = "";
                kontenSlideGerhana = "";
            }
        }
    }

    function fetchLaporanHilal() {
        console.log("[AMaL] 📡 Mengirim request status Hilal ke server...");
        // --- TAMBAHAN: Kirimkan tanggal mesin waktu ---
        const waktuKiosk = getWaktuSekarang();
        const y = waktuKiosk.getFullYear();
        const m = String(waktuKiosk.getMonth() + 1).padStart(2, '0');
        const d = String(waktuKiosk.getDate()).padStart(2, '0');
        const tglSimulasi = `${y}-${m}-${d}`;
        // ----------------------------------------------
        
        // Tambahkan &date=... ke URL
        fetch(`/api/hilal?t=${new Date().getTime()}&date=${tglSimulasi}`)
            .then(response => response.json())
            .then(res => {
                const waktuKiosk = getWaktuSekarang(); 
                
                console.log(`[AMaL] 📥 Balasan Server: ${res.status.toUpperCase()}`);
                statusHilalServer = res.status; // <--- TAMBAHAN: Simpan statusnya
                
                if (res.status === 'success') {
                    dataHilal = res.data;
                    console.log("[AMaL] ✅ Laporan Hilal SIAP dan dimuat.");
                    pantauHilal(waktuKiosk); 
                } 

                else if (res.status === 'processing') {
                    console.log("[AMaL] ⏳ Mesin sedang merender peta... Cek 15 detik lagi.");
                    if (hilalPollingTimer) clearTimeout(hilalPollingTimer); // Hapus antrean lama
                    hilalPollingTimer = setTimeout(fetchLaporanHilal, 15000); // Buat antrean baru tunggal
                }
                else if (res.status === 'inactive') {
                    dataHilal = null;
                    console.log("[AMaL] 💤 Server membalas 'inactive' (Dianggap bukan masa rukyat).");
                    pantauHilal(waktuKiosk); 
                }
            })
            .catch(err => {
                console.error("[AMaL] ❌ Gagal menghubungi API Hilal", err);
                statusHilalServer = "error"; // <--- TAMBAHAN: Cegah loop jika error jaringan
                dataHilal = null;
                pantauHilal(getWaktuSekarang()); 
            });
    }

    function pantauHilal(now) {
        if (!dataHilal) {
            console.log("[Pantau Hilal] 🛑 Dibatalkan: dataHilal kosong/null.");
            kontenSlideHilal = "";
            return;
        }

        // Ambil tanggal pengamatan dari JSON
        let tglPengamatan = new Date(dataHilal.metadata.tanggal_pengamatan);
        tglPengamatan.setHours(0,0,0,0);
        
        let hariIni = new Date(now);
        hariIni.setHours(0,0,0,0);
        
        // Hitung selisih hari
        let diffHari = Math.round((tglPengamatan - hariIni) / (1000 * 60 * 60 * 24));

        console.log(`[Pantau Hilal] 📅 Tgl Server: ${tglPengamatan.toLocaleDateString()}, Tgl Kiosk: ${hariIni.toLocaleDateString()}`);
        console.log(`[Pantau Hilal] 🕒 Selisih Hari: ${diffHari}`);

        // Beri toleransi -1 hari juga jaga-jaga beda zona waktu
        if (diffHari >= -5 && diffHari <= 5) {
        // if (diffHari === 0 || diffHari === 1 || diffHari === -1) {
            console.log("[Pantau Hilal] 🌟 MASUK MASA RUKYAT! Mengaktifkan Slide...");
            
            let dl = dataHilal.data_lokal;
            let dn = dataHilal.data_nasional;
            let dg = dataHilal.data_global;
            
            let iLokMabims = dl.status_mabims === "Memenuhi" ? "✅" : "❌";
            let cLokMabims = dl.status_mabims === "Memenuhi" ? "#0be881" : "#ff4444";
            
            let iLokWh = dl.status_wh === "Wujud" ? "✅" : "❌";
            let cLokWh = dl.status_wh === "Wujud" ? "#0be881" : "#ffdd59";
            
            let tNasMabims = dn.mabims_sukses ? "Memenuhi" : "Belum";
            let iNasMabims = dn.mabims_sukses ? "✅" : "❌";
            let cNasMabims = dn.mabims_sukses ? "#0be881" : "#ff4444";

            let tNasWh = dn.wh_sukses ? "Wujud" : "Belum";
            let iNasWh = dn.wh_sukses ? "✅" : "❌";
            let cNasWh = dn.wh_sukses ? "#0be881" : "#ffdd59";

            let tKhgt = dg.khgt_sukses ? "Memenuhi" : "Belum";
            let iKhgt = dg.khgt_sukses ? "✅" : "❌";
            let cKhgt = dg.khgt_sukses ? "#0fbcf9" : "#ff4444";
            
            let imgUrl = `static/images/peta_hilal_current.png?t=${new Date().getTime()}`;

            let tmpl = document.getElementById('tmpl-slide-hilal').innerHTML;
            kontenSlideHilal = tmpl
                .replace(/\{\{IMG_URL\}\}/g, imgUrl)
                .replace(/\{\{TGL_PENGAMATAN\}\}/g, dataHilal.metadata.tanggal_pengamatan)
                .replace(/\{\{TINGGI\}\}/g, dl.tinggi_hilal)
                .replace(/\{\{ELONGASI\}\}/g, dl.elongasi)
                .replace(/\{\{C_LOK_MABIMS\}\}/g, cLokMabims)
                .replace(/\{\{I_LOK_MABIMS\}\}/g, iLokMabims)
                .replace(/\{\{S_LOK_MABIMS\}\}/g, dl.status_mabims)
                .replace(/\{\{C_LOK_WH\}\}/g, cLokWh)
                .replace(/\{\{I_LOK_WH\}\}/g, iLokWh)
                .replace(/\{\{S_LOK_WH\}\}/g, dl.status_wh)
                .replace(/\{\{C_NAS_MABIMS\}\}/g, cNasMabims)
                .replace(/\{\{I_NAS_MABIMS\}\}/g, iNasMabims)
                .replace(/\{\{S_NAS_MABIMS\}\}/g, tNasMabims)
                .replace(/\{\{C_NAS_WH\}\}/g, cNasWh)
                .replace(/\{\{I_NAS_WH\}\}/g, iNasWh)
                .replace(/\{\{S_NAS_WH\}\}/g, tNasWh)
                .replace(/\{\{C_KHGT\}\}/g, cKhgt)
                .replace(/\{\{I_KHGT\}\}/g, iKhgt)
                .replace(/\{\{S_KHGT\}\}/g, tKhgt);
        } else {
            console.log("[Pantau Hilal] 🛑 Dibatalkan: Tanggal pengamatan sudah lewat atau masih jauh.");
            kontenSlideHilal = ""; 
        }
    }

    function fetchCalendar() {
        const grid = document.getElementById('calendar-grid');
        if (!grid) return;
        
        if (!dataJangkarGlobal) {
            console.warn("Data Jangkar belum siap, menunda render kalender...");
            return;
        }

        grid.innerHTML = ""; 

        // const dateObj = tglSimulasi ? new Date(tglSimulasi) : new Date();
        const dateObj = getWaktuKiosk();
        const year = dateObj.getFullYear();
        const month = dateObj.getMonth();
        const todayDate = dateObj.getDate();
        const isThisMonth = true; // Karena pakai Mesin Waktu, Kiosk selalu menganggap ini adalah bulan berjalan

        const namaBulanIndo = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
        
        document.getElementById('cal-masehi-title').innerText = `${namaBulanIndo[month]} ${year}`;

        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const firstDayOfMonth = new Date(year, month, 1).getDay();

        for (let i = 0; i < firstDayOfMonth; i++) {
            grid.appendChild(document.createElement('div'));
        }

        let firstHijriMonth = "";
        let lastHijriMonth = "";
        let currentHijriYear = "";
        let firstJawaMonth = "";
        let lastJawaMonth = "";
        let currentJawaYear = "";
        let infoJawaBulanIni = null; // Menyimpan info siklus windu

        for (let day = 1; day <= daysInMonth; day++) {
            const currentDayDate = new Date(year, month, day);
            const hariKe = currentDayDate.getDay();
            
            const pasaran = AmalUtils.getPasaranJawa(currentDayDate);
            const infoHijriah = AmalUtils.getHijriahFromJangkar(currentDayDate, dataJangkarGlobal, metodeKalenderAktif);

            const infoJawa = window.KalenderJawa ? window.KalenderJawa.getInfoUrfi(currentDayDate) : null;

            let textJawa = "";
            if (window.tampilkanJawa && infoJawa && !infoJawa.error) {
                if (day === 1) {
                    firstJawaMonth = infoJawa.sasi;
                    currentJawaYear = infoJawa.tahunAngka;
                }
                if (day === 15) {
                    infoJawaBulanIni = infoJawa;
                }
                if (day === daysInMonth) {
                    lastJawaMonth = infoJawa.sasi;
                    if(!infoJawaBulanIni) infoJawaBulanIni = infoJawa;
                }
                textJawa = `<div class="tgl-jawa">${infoJawa.tanggal} ${infoJawa.sasi.substring(0,3)}</div>`;
            }

            // Sembunyikan teks pasaran (Legi, Pahing) dari angka Masehi
            let pasaranHtml = window.tampilkanJawa ? `<span class="pasaran">${pasaran}</span>` : "";

            const dayDiv = document.createElement('div');
            dayDiv.className = 'calendar-day';
            
            if (hariKe === 0) dayDiv.classList.add('ahad');
            else if (hariKe === 5) dayDiv.classList.add('jumat');
            else if (hariKe === 6) dayDiv.classList.add('sabtu');
            
            if (isThisMonth && day === todayDate) dayDiv.classList.add('today');

            let htmlEvent = "";
            let textHijriAstro = "";

            // Format Key untuk Masehi Rutin & Insidentil
            const tglMasehiKey = `${String(day).padStart(2, '0')} ${namaBulanIndo[month]}`;
            const tglInsidentilKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

            // Fungsi pembantu untuk merender event (mendukung teks biasa maupun Array)
            const addEventHtml = (val) => {
                if (Array.isArray(val)) {
                    val.forEach(v => htmlEvent += `<div class="event-text">${v}</div>`);
                } else if (val) {
                    htmlEvent += `<div class="event-text">${val}</div>`;
                }
            };

            // 1. Cek & Masukkan Masehi Rutin
            if (dataEvent.masehi_rutin && dataEvent.masehi_rutin[tglMasehiKey]) {
                addEventHtml(dataEvent.masehi_rutin[tglMasehiKey]);
            }

            // 2. Cek & Masukkan Insidentil Spesifik
            if (dataEvent.insidentil_spesifik && dataEvent.insidentil_spesifik[tglInsidentilKey]) {
                addEventHtml(dataEvent.insidentil_spesifik[tglInsidentilKey]);
            }

            if (infoHijriah) {
                let namaBulanHijriBersih = infoHijriah.bulan.replace(/\s\d{4}\sH/g, '').trim();

                if (day === 1) {
                    firstHijriMonth = namaBulanHijriBersih;
                    currentHijriYear = infoHijriah.tahun;
                }
                if (day === daysInMonth) {
                    lastHijriMonth = namaBulanHijriBersih;
                }

                // 3. Cek & Masukkan Hijriah Rutin
                const tglHijriKey = `${infoHijriah.tgl} ${namaBulanHijriBersih}`;
                if (dataEvent.hijriah_rutin && dataEvent.hijriah_rutin[tglHijriKey]) {
                    addEventHtml(dataEvent.hijriah_rutin[tglHijriKey]);
                }

                textHijriAstro = `${infoHijriah.tgl} ${AmalUtils.singkatBulanHijriah(namaBulanHijriBersih)}`;
            } else {
                textHijriAstro = "-"; 
            }

            // ========================================================
            // --- DETEKSI RASHDUL QIBLAH DI KALENDER ---
            // ========================================================
            if (dataRashdul) {
                const evtMei = new Date(dataRashdul.mei.replace(' ', 'T'));
                const evtJuli = new Date(dataRashdul.juli.replace(' ', 'T'));
                
                // Cek Bulan Mei
                if (currentDayDate.getFullYear() === evtMei.getFullYear() && 
                    currentDayDate.getMonth() === evtMei.getMonth() && 
                    currentDayDate.getDate() === evtMei.getDate()) {
                    let jam = evtMei.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                    addEventHtml(`🔭 Rashdul Qiblah (${jam})`);
                }
                
                // Cek Bulan Juli
                if (currentDayDate.getFullYear() === evtJuli.getFullYear() && 
                    currentDayDate.getMonth() === evtJuli.getMonth() && 
                    currentDayDate.getDate() === evtJuli.getDate()) {
                    let jam = evtJuli.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                    addEventHtml(`🔭 Rashdul Qiblah (${jam})`);
                }
            }
            // ========================================================

            // ========================================================
            // --- DETEKSI GERHANA DI KALENDER ---
            // ========================================================
            if (dataGerhana && dataGerhana.length > 0) {
                for (let i = 0; i < dataGerhana.length; i++) {
                    let evtDate = new Date(dataGerhana[i].waktu.replace(' ', 'T'));
                    
                    if (currentDayDate.getFullYear() === evtDate.getFullYear() && 
                        currentDayDate.getMonth() === evtDate.getMonth() && 
                        currentDayDate.getDate() === evtDate.getDate()) {
                        
                        let jam = evtDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                        let ikon = dataGerhana[i].jenis === "Matahari" ? "🌞" : "🌘";
                        addEventHtml(`${ikon} Gerhana ${dataGerhana[i].jenis} (${jam})`);
                    }
                }
            }
            // ========================================================

            // Ambil ikon bulan berdasarkan tanggal hijriah hari itu
            let moonIconCal = infoHijriah ? AmalUtils.getMoonPhaseIcon(infoHijriah.tgl, "20px") : "";
            
            // --- DETEKSI SIMBOL PUASA RUTIN (VERSI FIQH CERDAS) ---
            let curDatePuasa = new Date(year, month, day);
            let hariMasehiPuasa = curDatePuasa.getDay();
            let isPuasa = false;

            if (infoHijriah) {
                let tglH = parseInt(infoHijriah.tgl);
                let blnH = infoHijriah.bulan.toLowerCase();

                // 1. FILTER HARAM PUASA (Idul Fitri, Idul Adha, Tasyrik)
                let isHaram = false;
                if (blnH.includes("syawal") && tglH === 1) isHaram = true;
                if (blnH.includes("dzulhijjah") && tglH >= 10 && tglH <= 13) isHaram = true;

                if (!isHaram) {
                    // 2. JIKA RAMADHAN (Tiap hari puasa wajib)
                    if (blnH.includes("ramadhan")) {
                        isPuasa = true; 
                    } 
                    // 3. JIKA BUKAN RAMADHAN & BUKAN HARAM (Cek Sunnah)
                    else {
                        if (hariMasehiPuasa === 1 || hariMasehiPuasa === 4) isPuasa = true; // Senin/Kamis
                        if (tglH >= 13 && tglH <= 15) isPuasa = true; // Ayyamul Bidh
                        if (blnH.includes("dzulhijjah") && tglH === 9) isPuasa = true; // Arafah
                        if (blnH.includes("muharram") && (tglH === 9 || tglH === 10)) isPuasa = true; // Tasu'a & Asyura
                    }
                }
            }

            // Gunakan ikon titik hijau menyala. Anda bisa menggantinya dengan 🍽️ atau 🟢 atau ●
            // let ikonPuasa = isPuasa ? `<span style="color: #00ff88; font-size: 0.6em; margin-left: 6px; filter: drop-shadow(0 0 5px #00ff88);" title="Hari Puasa Sunnah">🍽️</span>` : "";
            let ikonPuasa = isPuasa ? `<span style="color: #eb4236; font-size: 0.6em; margin-left: 6px; filter: drop-shadow(0 0 5px #eb4236);" title="Hari Puasa Sunnah">🍽️</span>` : "";
            // let ikonPuasa = isPuasa ? `<span style="font-size: 0.6em; margin-left: 6px; filter: drop-shadow(0 0 3px rgba(255,255,255,0.5));" title="Hari Puasa Sunnah">🍽️</span>` : "";
            // ----------------------------------

            dayDiv.innerHTML = `
                <div class="tgl-masehi" style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <span>${day} <span class="pasaran">${pasaran}</span> ${ikonPuasa}</span>                
                    <span class="tgl-moonicon">${moonIconCal}</span>
                </div>
                <div class="event-container">${htmlEvent}</div>
                <div class="tgl-hijri-astro">${textHijriAstro}</div>
                <div class="tgl-jawa">${textJawa}</div>
            `;
            grid.appendChild(dayDiv);
        }

        let judulHijriah = firstHijriMonth;
        if (firstHijriMonth !== lastHijriMonth) {
            judulHijriah += ` - ${lastHijriMonth}`;
        }
        judulHijriah += ` ${currentHijriYear}`;
        
        const calHijriTitle = document.getElementById('cal-hijri-title');
        if(calHijriTitle) {
            calHijriTitle.innerText = judulHijriah;
        }

        let judulJawa = firstJawaMonth;
        if (firstJawaMonth !== lastJawaMonth && lastJawaMonth !== "") {
            judulJawa += ` - ${lastJawaMonth}`;
        }
        judulJawa += ` ${currentJawaYear} J`;

        const calJawaTitle = document.getElementById('cal-jawa-title');
        const calJawaInfo = document.getElementById('cal-jawa-info');

        if (!window.tampilkanJawa) {
            if (calJawaTitle) calJawaTitle.style.display = "none";
            if (calJawaInfo) calJawaInfo.style.display = "none";
        } else {
            if (calJawaTitle) {
                calJawaTitle.style.display = "block";
                calJawaTitle.innerText = judulJawa;
            }
            if (calJawaInfo && infoJawaBulanIni) {
                calJawaInfo.style.display = "block";
                calJawaInfo.innerText = `Warsa ${infoJawaBulanIni.tahunNama} • Windu ${infoJawaBulanIni.namaWindu}, Lambang ${infoJawaBulanIni.lambangWindu} • Kurup ${infoJawaBulanIni.kurup.split(' ')[0]}`;
            }
        }
    }

    // ==========================================
    // FUNGSI PEMBUAT RUNNING TEXT (HARI BESAR LOKAL)
    // ==========================================
    function generateRunningText(now, namaMasjid, alamatMasjid) {
        if (!dataEvent || (!dataEvent.masehi_rutin && !dataEvent.hijriah_rutin && !dataEvent.insidentil_spesifik)) {
            return `${namaMasjid} - ${alamatMasjid}`;
        }

        const namaBulanIndo = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

        function cekEventTanggal(targetDate, isBesok) {
            let events = [];
            const d = targetDate.getDate();
            const m = targetDate.getMonth();
            const y = targetDate.getFullYear();
            const hariMasehi = targetDate.getDay(); // 0:Minggu, 1:Senin, ... 4:Kamis
            
            // Format Key
            const tglMasehiKey = `${String(d).padStart(2, '0')} ${namaBulanIndo[m]}`;
            const tglInsidentilKey = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            
            const addEvent = (val) => {
                if (Array.isArray(val)) events.push(...val);
                else if (val) events.push(val);
            };

            // 1. Cek Masehi Rutin & Insidentil
            if (dataEvent.masehi_rutin && dataEvent.masehi_rutin[tglMasehiKey]) addEvent(dataEvent.masehi_rutin[tglMasehiKey]);
            if (dataEvent.insidentil_spesifik && dataEvent.insidentil_spesifik[tglInsidentilKey]) addEvent(dataEvent.insidentil_spesifik[tglInsidentilKey]);

            // --- LOGIKA PUASA OTOMATIS (VERSI FIQH CERDAS) ---
            let teksPuasa = "";

            if (dataJangkarGlobal) {
                const infoH = AmalUtils.getHijriahFromJangkar(targetDate, dataJangkarGlobal, metodeKalenderAktif);
                if (infoH) {
                    let namaBulanHijriBersih = infoH.bulan.replace(/\s\d{4}\sH/g, '').trim();
                    const tglHijriKey = `${infoH.tgl} ${namaBulanHijriBersih}`;
                    let tglH = parseInt(infoH.tgl);
                    let blnH = infoH.bulan.toLowerCase();

                    // EVENT HIJRIAH RUTIN DARI ADMIN
                    if (dataEvent.hijriah_rutin && dataEvent.hijriah_rutin[tglHijriKey]) {
                        addEvent(dataEvent.hijriah_rutin[tglHijriKey]);
                    }

                    // FILTER HARAM PUASA
                    let isHaram = false;
                    if (blnH.includes("syawal") && tglH === 1) isHaram = true;
                    if (blnH.includes("dzulhijjah") && tglH >= 10 && tglH <= 13) isHaram = true;

                    if (!isHaram) {
                        if (blnH.includes("ramadhan")) {
                            teksPuasa = "🌙 Puasa Wajib Ramadhan";
                        } else {
                            let listPuasa = [];
                            if (hariMasehi === 1) listPuasa.push("Senin");
                            if (hariMasehi === 4) listPuasa.push("Kamis");
                            if (tglH >= 13 && tglH <= 15) listPuasa.push("Ayyamul Bidh");
                            if (blnH.includes("dzulhijjah") && tglH === 9) listPuasa.push("Arafah");
                            if (blnH.includes("muharram") && tglH === 9) listPuasa.push("Tasu'a");
                            if (blnH.includes("muharram") && tglH === 10) listPuasa.push("Asyura");
                            
                            if (listPuasa.length > 0) {
                                teksPuasa = "Puasa Sunnah " + listPuasa.join(" & ");
                            }
                        }
                    }
                }
            }

            if (teksPuasa) addEvent(teksPuasa);
            // ------------------------------------

            // --- TAMBAHAN DETEKSI RASHDUL QIBLAH UNTUK KALENDER ---
            if (dataRashdul) {
                const evtMei = new Date(dataRashdul.mei.replace(' ', 'T'));
                const evtJuli = new Date(dataRashdul.juli.replace(' ', 'T'));
                
                // Cek apakah targetDate adalah hari Rashdul Qiblah (Bulan Mei)
                if (targetDate.getFullYear() === evtMei.getFullYear() && 
                    targetDate.getMonth() === evtMei.getMonth() && 
                    targetDate.getDate() === evtMei.getDate()) {
                    
                    let jam = evtMei.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                    events.push(`🔭 Rashdul Qiblah (${jam})`);
                }
                
                // Cek apakah targetDate adalah hari Rashdul Qiblah (Bulan Juli)
                if (targetDate.getFullYear() === evtJuli.getFullYear() && 
                    targetDate.getMonth() === evtJuli.getMonth() && 
                    targetDate.getDate() === evtJuli.getDate()) {
                    
                    let jam = evtJuli.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                    events.push(`🔭 Rashdul Qiblah (${jam})`);
                }
            }
            // ------------------------------------------------------

            if (isBesok && events.length > 0) {
                return events.map(ev => `Besok: ${ev}`);
            }
            return events;
        }

        // Cari event hari ini dan besok (H-1)
        let eventHariIni = cekEventTanggal(now, false);
        
        let besok = new Date(now);
        besok.setDate(besok.getDate() + 1);
        let eventBesok = cekEventTanggal(besok, true);

        let semuaEvent = eventHariIni.concat(eventBesok);
        semuaEvent = semuaEvent.concat(`AMaL (Anjungan Masjid Libre)`);

        if (pesanRashdulH3 !== "") {
            // unshift berfungsi memasukkan pesan ke urutan paling depan!
            semuaEvent.unshift(pesanRashdulH3); 
        }
        if (pesanGerhanaH3 !== "") semuaEvent.unshift(pesanGerhanaH3); // <--- Tambahkan baris ini

        if (semuaEvent.length > 0) {
            return "✦ " + semuaEvent.join(" ✦ ") + " ✦ ";
        } else {
            return `✦ ${namaMasjid} - ${alamatMasjid} ✦ AMaL (Anjungan Masjid Libre) ✦`;
        }
    }

    // ==========================================
    // FUNGSI MENAMPILKAN AUDIO YANG DIPUTAR
    // ==========================================
    // Variabel untuk melacak status terakhir agar tidak merender ulang DOM terus-menerus
    let isAudioCurrentlyPlaying = false;

    function fetchAudioState() {
        fetch('/api/audio_state')
            .then(response => response.json())
            .then(data => {
                const widget = document.getElementById('widget-now-playing');
                const teksSurat = document.getElementById('np-surat-ayat');

                if (data.is_playing) {
                    // Update teksnya
                    teksSurat.innerText = data.surat_ayat;
                    
                    // Jika sebelumnya mati, sekarang munculkan widget-nya
                    if (!isAudioCurrentlyPlaying) {
                        widget.style.top = "30px"; // Munculkan di kanan atas
                        widget.style.right = "50px";
                        isAudioCurrentlyPlaying = true;
                    }
                } else {
                    // Jika sedang tidak ada audio yang diputar, sembunyikan widget
                    if (isAudioCurrentlyPlaying) {
                        widget.style.top = "-100px"; // Naikkan hingga sembunyi
                        isAudioCurrentlyPlaying = false;
                    }
                }
            })
            .catch(error => console.error("Gagal mengambil state audio:", error));
    }
    // Jalankan polling setiap 1 detik (1000 milidetik)
    setInterval(fetchAudioState, 1000);
    
    // ==========================================
    // 5. RUN
    // ==========================================
    AmalUtils.syncServerTime();
    // loadAllExternalData(); 
    fetchDailyData(() => {
        loadAllExternalData();
        fetchRashdulQiblah();
        fetchGerhana();
        // 1. Panggilan Pertama (Saat Kiosk baru nyala)
        fetchLaporanHilal(); 
        // 2. Polling Rutin Hilal setiap 15 Menit (WAJIB ADA)
        setInterval(fetchLaporanHilal, 900000);
    });
    setInterval(updateClock, 1000);
    setInterval(fetchDailyData, 600000); 
    setInterval(AmalUtils.syncServerTime, 3600000); // Sinkron ulang setiap 1 jam (3600000 ms)

});