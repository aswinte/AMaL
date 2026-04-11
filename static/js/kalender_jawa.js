/**
 * Modul Mesin Waktu Kalender Jawa (Urfi/Aritmetika)
 * Terkalibrasi secara historis dengan Titik Nol: 8 Juli 1633 M (1 Sura 1555 J)
 */

const KalenderJawa = {
    // Array Data Dasar
    pasaran: ["Legi", "Pahing", "Pon", "Wage", "Kliwon"],
    wuku: ["Sinta", "Landep", "Wukir", "Kurantil", "Tolu", "Gumbreg", "Warigalit", "Warigagung", "Julungwangi", "Sungsang", "Galungan", "Kuningan", "Langkir", "Mandasiya", "Julungpujut", "Pahang", "Kuruwelut", "Marakeh", "Tambir", "Medangkungan", "Maktal", "Wuye", "Manahil", "Prangbakat", "Bala", "Wugu", "Wayang", "Kulawu", "Dukut", "Watugunung"],
    sasi: ["Sura", "Sapar", "Mulud", "Bakdamulud", "Jumadilawal", "Jumadilakir", "Rejeb", "Ruwah", "Pasa", "Sawal", "Dulkangidah", "Besar"],
    tahunWindu: ["Alip", "Ehe", "Jimawal", "Je", "Dal", "Be", "Wawu", "Jimakir"],
    namaWindu: ["Adi", "Kuntara", "Sengara", "Sancaya"],
    lambangWindu: ["Kulawu", "Langkir", "Kulawu", "Langkir"],
    
    // Siklus Pawukon Ekstra
    sadwara: ["Aryang", "Wurukung", "Paningron", "Uwas", "Mawulu", "Tungle"],
    hastawara: ["Sri", "Indra", "Guru", "Yama", "Rudra", "Brama", "Kala", "Uma"],
    sangawara: ["Dangu", "Jagur", "Gigis", "Kerangan", "Nohan", "Wogan", "Tulus", "Wurung", "Dadi"],
    
    // --- TAMBAHAN SIKLUS WATAK HARI (WETONAN) ---
    // Neptu Standar (Untuk Paarasan & Rakam)
    neptuDina: { "Minggu": 5, "Senen": 4, "Selasa": 3, "Rebo": 7, "Kemis": 8, "Jemuwah": 6, "Setu": 9 },
    neptuPasaran: { "Legi": 5, "Pahing": 9, "Pon": 7, "Wage": 4, "Kliwon": 8 },
    
    // Neptu Khusus Pancasuda (Nilai hari berbeda dari standar!)
    neptuPancasudaDina: { "Minggu": 6, "Senen": 4, "Selasa": 3, "Rebo": 6, "Kemis": 5, "Jemuwah": 7, "Setu": 8 },

    // Paarasan (Dihitung dari Total Neptu Standar: 7 s/d 18)
    paarasanMap: {
        7: "Bumi Kapetak", 8: "Lakuning Geni", 9: "Lakuning Angin", 10: "Aras Pepet",
        11: "Aras Tuding", 12: "Aras Kembang", 13: "Lakuning Lintang", 14: "Lakuning Rembulan",
        15: "Lakuning Srengenge", 16: "Lakuning Banyu", 17: "Bumi Kapetak", 18: "Paripurna"
    },

    // Rakam dan Pancasuda sangat spesifik terhadap ke-35 kombinasi Weton.
    getWatakWeton: function(dinaJawa, pasaranJawa) {
        // 1. Hitung Neptu Standar
        const neptuD = this.neptuDina[dinaJawa] || 0;
        const neptuP = this.neptuPasaran[pasaranJawa] || 0;
        const totalNeptu = neptuD + neptuP;

        // 2. Hitung Neptu Pancasuda
        const neptuPancasudaD = this.neptuPancasudaDina[dinaJawa] || 0;
        const totalNeptuPancasuda = neptuPancasudaD + neptuP;

        // Paarasan
        const paarasan = this.paarasanMap[totalNeptu] || "-";

        // Rakam (Modulus 6 dari Neptu Standar)
        // Urutan absolut sisa bagi: 1, 2, 3, 4, 5, 0
        const rakamArray = ["Mantri Sinaroja", "Macan Ketawang", "Nuju Pati", "Kala Tinantang", "Demang Kandhuwuran", "Sanggar Waringin"];
        const idxRakam = totalNeptu % 6;

        // Pancasuda (Modulus 7 dari Neptu Khusus Pancasuda)
        // Urutan absolut sisa bagi: 1, 2, 3, 4, 5, 6, 0
        const pancasudaArray = ["Lebu Katiup Angin", "Wasesa Segara", "Tunggak Semi", "Satriya Wibawa", "Sumur Sinaba", "Satrya Wirang", "Bumi Kapetak"];
        const idxPancasuda = totalNeptuPancasuda % 7;

        return {
            neptu: totalNeptu,
            paarasan: paarasan,
            rakam: rakamArray[idxRakam] || "-",
            pancasuda: pancasudaArray[idxPancasuda] || "-"
        };
    },

    // MASTER DATA SEJARAH (Multi-Jangkar Epoch)
    eraHistoris: [
        { namaKurup: "A'ahgi (Jumat Legi)", mulaiTahunJawa: 1555, mulaiMasehi: Date.UTC(1633, 6, 8) },
        { namaKurup: "Amiswon (Kamis Kliwon)", mulaiTahunJawa: 1675, mulaiMasehi: Date.UTC(1749, 11, 14) },
        { namaKurup: "Aboge (Rebo Wage)", mulaiTahunJawa: 1749, mulaiMasehi: Date.UTC(1821, 9, 23) },
        { namaKurup: "Asapon (Selasa Pon)", mulaiTahunJawa: 1867, mulaiMasehi: Date.UTC(1936, 2, 24) },
        { namaKurup: "Asnening (Senen Pahing)", mulaiTahunJawa: 1987, mulaiMasehi: Date.UTC(2052, 7, 26) },
        { namaKurup: "Aminggi (Minggu Legi)", mulaiTahunJawa: 2107, mulaiMasehi: Date.UTC(2169, 1, 28) }
    ],

    // Titik Nol Absolut Siklus Kontinu (8 Juli 1633 = Jumat Legi, Kulawu)
    anchorAbsolute: Date.UTC(1633, 6, 8),
    anchorSunday: Date.UTC(1633, 6, 3), // Hari Minggu sebelum 8 Juli 1633 untuk Wuku

    getSiklusKontinu: function(utcDate) {
        const selisihHari = Math.floor((utcDate - this.anchorAbsolute) / 86400000);
        
        // 1. Pasaran (8 Jul 1633 = Legi / Index 0)
        let idxPasaran = selisihHari % 5;
        if (idxPasaran < 0) idxPasaran += 5;

        // 2. Wuku (Kulawu = Index 27)
        const selisihHariMinggu = Math.floor((utcDate - this.anchorSunday) / 86400000);
        const weeks = Math.floor(selisihHariMinggu / 7);
        let idxWuku = (weeks + 27) % 30;
        if (idxWuku < 0) idxWuku += 30;

        // 3. Sadwara (8 Jul 1633 = Wurukung / Index 1)
        let idxSadwara = (selisihHari + 1) % 6;
        if (idxSadwara < 0) idxSadwara += 6;

        // 4. Hastawara (8 Jul 1633 = Sri / Index 0)
        let idxHastawara = selisihHari % 8;
        if (idxHastawara < 0) idxHastawara += 8;

        // 5. Sangawara (8 Jul 1633 = Wogan / Index 5)
        let idxSangawara = (selisihHari + 5) % 9;
        if (idxSangawara < 0) idxSangawara += 9;

        return {
            pasaran: this.pasaran[idxPasaran],
            wuku: this.wuku[idxWuku],
            sadwara: this.sadwara[idxSadwara],
            hastawara: this.hastawara[idxHastawara],
            sangawara: this.sangawara[idxSangawara]
        };
    },

    getPranataMangsa: function(dateMasehi) {
        // Pranata Mangsa murni berbasis kalender Masehi/Surya (Dekrit PB VII 1856)
        const m = dateMasehi.getMonth() + 1;
        const d = dateMasehi.getDate();

        if ((m === 6 && d >= 22) || (m === 8 && d <= 1)) return "Kasa (Kartika)";
        if ((m === 8 && d >= 2) || (m === 8 && d <= 24)) return "Karo (Pusa)";
        if ((m === 8 && d >= 25) || (m === 9 && d <= 17)) return "Katiga (Manggasri)";
        if ((m === 9 && d >= 18) || (m === 10 && d <= 12)) return "Kapat (Sitra)";
        if ((m === 10 && d >= 13) || (m === 11 && d <= 8)) return "Kalima (Manggala)";
        if ((m === 11 && d >= 9) || (m === 12 && d <= 21)) return "Kanem (Naya)";
        if ((m === 12 && d >= 22) || (m === 2 && d <= 2)) return "Kapitu (Palguna)";
        if ((m === 2 && d >= 3) || (m === 2 && d <= 29)) return "Kawalu (Wisaka)"; // Handle leap year
        if ((m === 3 && d >= 1) || (m === 3 && d <= 25)) return "Kasanga (Jita)";
        if ((m === 3 && d >= 26) || (m === 4 && d <= 18)) return "Kadasa (Srawana)";
        if ((m === 4 && d >= 19) || (m === 5 && d <= 11)) return "Desta (Padrawana)";
        if ((m === 5 && d >= 12) || (m === 6 && d <= 21)) return "Sada (Asuji)";
        return "-";
    },

    getInfoUrfi: function(dateMasehi) {
        const targetUTC = Date.UTC(dateMasehi.getFullYear(), dateMasehi.getMonth(), dateMasehi.getDate());
        
        // 1. CARI JANGKAR ERA
        let eraAktif = this.eraHistoris[0]; 
        for (let i = this.eraHistoris.length - 1; i >= 0; i--) {
            if (targetUTC >= this.eraHistoris[i].mulaiMasehi) {
                eraAktif = this.eraHistoris[i];
                break;
            }
        }

        const selisihHari = Math.floor((targetUTC - eraAktif.mulaiMasehi) / 86400000);
        
        // Cek jika Masehi sebelum dekrit Sultan Agung (1633)
        if (selisihHari < 0) {
            return { error: "Tanggal mendahului berdirinya Kalender Sultan Agung (Sebelum 8 Juli 1633)." };
        }

        // 2. SIKLUS WINDU & TAHUN
        const winduKe = Math.floor(selisihHari / 2835);
        let sisaHariWindu = selisihHari % 2835;

        const panjangTahun = [354, 355, 354, 354, 355, 354, 354, 355];
        let tahunKe = 0;
        let sisaHariTahun = sisaHariWindu;
        
        for (let i = 0; i < 8; i++) {
            if (sisaHariTahun >= panjangTahun[i]) {
                sisaHariTahun -= panjangTahun[i];
                tahunKe++;
            } else { break; }
        }

        // 3. SIKLUS BULAN & TANGGAL
        const isWuntu = (panjangTahun[tahunKe] === 355);
        const panjangBulan = [30, 29, 30, 29, 30, 29, 30, 29, 30, 29, 30, isWuntu ? 30 : 29];

        let bulanKe = 0;
        let sisaHariBulan = sisaHariTahun;

        for (let i = 0; i < 12; i++) {
            if (sisaHariBulan >= panjangBulan[i]) {
                sisaHariBulan -= panjangBulan[i];
                bulanKe++;
            } else { break; }
        }

        // 4. PERAKITAN DATA
        const tglJawa = sisaHariBulan + 1;
        const tahunJawaAktual = eraAktif.mulaiTahunJawa + (winduKe * 8) + tahunKe;
        
        // Kalibrasi Lambang Windu (+21 offset agar 1555 jatuh di indeks 1 / Kuntara)
        const siklus32 = Math.floor(((tahunJawaAktual + 21) % 32) / 8);
        
        const kontinu = this.getSiklusKontinu(targetUTC);
        const mangsa = this.getPranataMangsa(dateMasehi);

        // 5. AMBIL DATA DINA (HARI JAWA) DAN WATAK WETON
        const hariJawaArray = ["Minggu", "Senen", "Selasa", "Rebo", "Kemis", "Jemuwah", "Setu"];
        const dinaJawa = hariJawaArray[dateMasehi.getDay()];
        const watak = this.getWatakWeton(dinaJawa, kontinu.pasaran);

        return {
            tanggal: tglJawa,
            sasi: this.sasi[bulanKe],
            tahunAngka: tahunJawaAktual,
            tahunNama: this.tahunWindu[tahunKe],
            namaWindu: this.namaWindu[siklus32],
            lambangWindu: this.lambangWindu[siklus32],
            kurup: eraAktif.namaKurup,
            dina: dinaJawa,            // Tambahan: Hari dalam bahasa Jawa
            pasaran: kontinu.pasaran,
            wuku: kontinu.wuku,
            sadwara: kontinu.sadwara,
            hastawara: kontinu.hastawara,
            sangawara: kontinu.sangawara,
            mangsa: mangsa,
            neptu: watak.neptu,        // Tambahan: Nilai Neptu
            paarasan: watak.paarasan,  // Tambahan: Paarasan
            rakam: watak.rakam,        // Tambahan: Rakam
            pancasuda: watak.pancasuda // Tambahan: Pancasuda
        };
    }    
};

window.KalenderJawa = KalenderJawa;