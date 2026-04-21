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

        dome: document.querySelector('.kompas-lingkaran'),
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

    