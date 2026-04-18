document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 1A. KONSTANTA GLOBAL (Tidak Akan Berubah)
    // ==========================================
    const URUTAN_SHALAT = ["Imsak", "Subuh", "Terbit", "Dzuhur", "Ashar", "Maghrib", "Isya"];

    // ==========================================
    // 1B. STATE (Gudang Data Dinamis)
    // ==========================================
    const State = {
        // --- Sistem & Pengaturan Kiosk ---
        localLoadTime: Date.now() / 1000,
        durasiAktifMenit: 15,
        selaluAktif: true,
        metodeKalenderAktif: "NASIONAL_MABIMS",
        offsetHijri: 0,
        
        // --- Data Dasar Shalat & Waktu ---
        jadwalShalat: {},
        dataIqomah: {},
        isHariJumat: false,
        hijriahDasar: "",
        lastDateString: "",
        lastSimulatedDateStr: "",
        
        // --- Status Fase Kiosk Saat Ini ---
        currentPhase: "AKTIF", // Pilihan: AKTIF, PRA_ADZAN, ADZAN, IQOMAH, SHALAT
        activeShalatName: "",
        countdownSeconds: 0,
        
        // --- Pengatur UI & Rotasi Layar ---
        rollingStep: 0, // 0: Kalender, 1: Pengumuman, 2: Kutipan
        rollingTimer: null,
        masterPool: [],
        currentAstroIndex: 0,
        currentPoolIndex: 0,
        
        // --- Data Event & Astronomi (API) ---
        dataEvent: { masehi: {}, hijriah: {} },
        dataJangkarGlobal: null,
        dataRashdul: null,
        waktuRashdulHariIni: null,
        dataGerhana: [],
        dataHilal: null,
        
        // --- Status Polling & Takeover Layar ---
        statusHilalServer: "", 
        hilalPollingTimer: null,
        isRashdulTakeover: false,
        isGerhanaTakeover: false,
        
        // --- Teks & Konten Pre-Render ---
        pesanRashdulH3: "",
        pesanGerhanaH3: "",
        kontenSlideRashdul: "",
        kontenSlideGerhana: "",
        kontenSlideHilal: ""
    };

    // ==========================================
    // 1C. DOM CACHE (Gudang Elemen HTML)
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

        // Tambahan Cache Overlay Gerhana
        gerhanaTakeover: document.getElementById('gerhana-takeover'),
        gerhanaJudul: document.getElementById('gerhana-judul'),
        gerhanaIkon: document.getElementById('gerhana-ikon'),
        gerhanaCountdown: document.getElementById('gerhana-countdown'),

        // // Tambahan Cache Overlay Rashdul
        rashdulTakeover: document.getElementById('rashdul-takeover'),
        rashdulInstruksi: document.getElementById('rashdul-instruksi'),
        rashdulCountdown: document.getElementById('rashdul-countdown'),

        cachedFloatingClock: null
    };

    // ==========================================
    // 2. DATA LAYER (Urusan API & Fetch)
    // ==========================================
    const KioskAPI = {
        
        fetchDailyData: async function(callback) {
            try {
                const res = await fetch('/api/get_jadwal');
                const data = await res.json();
                
                // INGAT: Gunakan awalan State.
                State.jadwalShalat = data.jadwal;
                State.hijriahDasar = data.hijriah;
                State.metodeKalenderAktif = data.config.metode_kalender;
                // ... (masukkan sisa data config lainnya di sini)
                
                if(callback) callback();
            } catch (e) {
                console.error("Gagal ambil data harian", e);
            }
        },

        fetchRashdulQiblah: async function() {
            // Pindahkan isi fungsi fetchRashdulQiblah lama ke sini
            // Simpan datanya ke State.dataRashdul = ...
        },

        fetchGerhana: async function() {
            // Pindahkan isi fungsi fetchGerhana lama ke sini
            // Simpan datanya ke State.dataGerhana = ...
        },

        fetchLaporanHilal: async function() {
            // Pindahkan isi fungsi fetchLaporanHilal lama ke sini
            // Simpan datanya ke State.dataHilal = ...
        }

    };

    // ==========================================
    // 3. UI RENDERER (Urusan Tampilan Visual)
    // ==========================================
    const KioskUI = {
        updateClockDisplay: function(now) {
            const h = String(now.getHours()).padStart(2, '0');
            const m = String(now.getMinutes()).padStart(2, '0');
            const s = String(now.getSeconds()).padStart(2, '0');
            if (UI.jam) UI.jam.innerHTML = `${h}.${m}<span class="detik">.${s}</span>`;
        },

        updateJadwalHighlight: function() {
            // Logika mewarnai kartu shalat (active, next, pra-adzan)
            // Menggunakan UI_Kartu[nama].box.classList.add(...)
        },

        renderFullscreen: function() {
            // Logika renderFullscreenContent (Adzan, Iqomah, Shalat)
        }
    };

    // ==========================================
    // 4. AUDIO CONTROLLER (Urusan Suara)
    // ==========================================
    const KioskAudio = {
        player: new Audio(),
        playAdzan: function(file) {
            this.player.src = file;
            this.player.play();
        },
        stopAll: function() {
            this.player.pause();
            this.player.currentTime = 0;
        }
    };

    // ==========================================
    // 5. CORE ENGINE (Otak & Logika Utama)
    // ==========================================
    const KioskEngine = {
        tick: function() {
            const now = AmalUtils.getAccurateTime();
            
            // 1. Update Jam (UI)
            KioskUI.updateClockDisplay(now);
            
            // 2. Cek Logika Fase (Logika)
            this.processPhaseLogic(now);
            
            // 3. Update Kartu & Rolling (UI)
            if (now.getSeconds() % 10 === 0) KioskUI.updateJadwalHighlight();
        },

        processPhaseLogic: function(now) {
            // Pindahkan logika IF/ELSE besar dari updateClock ke sini
            // Misal: IF jam === waktuAdzan -> Ganti State -> Panggil Audio -> Panggil UI
        }
    };

    // ==========================================
    // 6. INITIALIZATION (Menyalakan Sistem)
    // ==========================================
    async function startApp() {
        await AmalUtils.syncServerTime();
        await KioskAPI.fetchDailyData();
        
        // Mulai detak jantung sistem
        setInterval(() => KioskEngine.tick(), 1000);
    }

    startApp();
});