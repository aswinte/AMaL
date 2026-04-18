/**
 * AMaL Shared Utilities (Alat Bantu Global)
 * Berisi fungsi-fungsi yang dipakai bersama oleh Halaman Kiosk (script.js) dan Halaman Admin (admin.js)
 */

const AmalUtils = {
    // 1. Menghitung Pasaran Jawa Murni (UTC Safe)
    getPasaranJawa: function(dateMasehi) {
        const daftarPasaran = ["Legi", "Pahing", "Pon", "Wage", "Kliwon"];
        const year = dateMasehi.getUTCFullYear();
        const month = dateMasehi.getUTCMonth();
        const day = dateMasehi.getUTCDate();        
        const utcMidnight = Date.UTC(year, month, day);        
        const selisihHari = Math.floor(utcMidnight / (24 * 60 * 60 * 1000));
        return daftarPasaran[(selisihHari + 3) % 5];
    },

    // 2. Mengekstrak Tanggal Hijriah dari JSON Jangkar
    getHijriahFromJangkar: function(dateMasehi, dataJangkar, metode = "NASIONAL_MABIMS") {
        if (!dataJangkar || !dataJangkar.jangkar_bulan) return null;

        const target = new Date(dateMasehi);
        target.setHours(0,0,0,0);

        for (let i = 0; i < dataJangkar.jangkar_bulan.length - 1; i++) {
            const infoSekarang = dataJangkar.jangkar_bulan[i].keputusan_metode[metode];
            const infoBerikutnya = dataJangkar.jangkar_bulan[i+1].keputusan_metode[metode];
            
            if (!infoSekarang || !infoBerikutnya) continue;

            const [y1, m1, d1_str] = infoSekarang.tgl_1.split('-');
            const d1 = new Date(y1, m1 - 1, d1_str);
            d1.setHours(0,0,0,0); 

            const [y2, m2, d2_str] = infoBerikutnya.tgl_1.split('-');
            const d2 = new Date(y2, m2 - 1, d2_str);
            d2.setHours(0,0,0,0); 

            if (target >= d1 && target < d2) {
                const selisihHari = Math.round((target - d1) / (24 * 60 * 60 * 1000));
                
                let tahunHijri = "1447 H"; // Fallback
                const matchTahun = dataJangkar.jangkar_bulan[i].bulan_hijriah.match(/\d{4}\sH/);
                if (matchTahun) tahunHijri = matchTahun[0];

                return {
                    tgl: selisihHari + 1,
                    bulan: dataJangkar.jangkar_bulan[i].bulan_hijriah,
                    tahun: tahunHijri 
                };
            }
        }
        return null;
    },

    // 3. Menggambar Ikon Fase Bulan (SVG)
    getMoonPhaseIcon: function(hijriDateNum, customSize = "20px", uidPrefix = "moon") {
        const d = parseInt(hijriDateNum);
        if (isNaN(d) || d < 1 || d > 30) return "";

        let phase = d / 30.0; 
        let sweep = "";
        let mag = Math.cos(2 * Math.PI * phase); 

        if (phase <= 0.5) {
            sweep = `M 50,0 A 50,50 0 0,0 50,100 A ${Math.abs(mag * 50)},50 0 0,${mag < 0 ? 0 : 1} 50,0`;
        } else {
            sweep = `M 50,0 A 50,50 0 0,1 50,100 A ${Math.abs(mag * 50)},50 0 0,${mag < 0 ? 1 : 0} 50,0`;
        }

        const uniqueId = `mask-${uidPrefix}-${d}-${Math.floor(Math.random() * 10000)}`;

        return `
            <svg width="${customSize}" height="${customSize}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0px 0px 8px rgba(255,255,255,0.3));">
                <defs>
                    <mask id="${uniqueId}">
                        <path d="${sweep}" fill="white" />
                    </mask>
                </defs>
                <image href="/static/images/moon200.png" width="100" height="100" opacity="0.28" />
                <image href="/static/images/moon200.png" width="100" height="100" mask="url(#${uniqueId})" />
            </svg>
        `;
    },

    // 4. Sinkronisasi Waktu Server
    serverTimeOffset: 0,
    
    syncServerTime: async function() {
        try {
            const res = await fetch('/api/sync_waktu');
            if (res.ok) {
                const data = await res.json();
                this.serverTimeOffset = data.server_time - Date.now();
                console.log(`⏱️ [AmalUtils] Sinkronisasi Waktu Berhasil! Offset: ${this.serverTimeOffset} ms`);
            }
        } catch (err) {
            console.error("[AmalUtils] Gagal sinkronisasi waktu", err);
        }
    },

    getAccurateTime: function() {
        return new Date(Date.now() + this.serverTimeOffset);
    },

    // 5. Pemformat Teks Bulan Hijriah
    singkatBulanHijriah: function(namaBulan) {
        if (!namaBulan) return "";
        const mapping = {
            "Muharram": "Muh", "Safar": "Saf", "Rabi'ul Awwal": "R.Awl",
            "Rabi'ul Akhir": "R.Akh", "Jumadil Ula": "J.Ula", "Jumadil Akhira": "J.Akh",
            "Rajab": "Raj", "Sya'ban": "Sya", "Ramadhan": "Ram", "Syawal": "Syw",
            "Dzulqa'dah": "Dzk", "Dzulhijjah": "Dzh"
        };
        let bersih = namaBulan.replace(/\s\d{4}\sH/g, '').trim(); // Bersihkan embel-embel tahun "1447 H" jika ada
        return mapping[bersih] ? mapping[bersih] : String(bersih).substring(0, 3);
    }
};

window.AmalUtils = AmalUtils;