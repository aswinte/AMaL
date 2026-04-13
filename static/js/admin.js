document.addEventListener('DOMContentLoaded', () => {
    let offsetAdmin = 0;
    // Sinkronisasi ringan untuk Admin
    fetch('/api/sync_waktu').then(r=>r.json()).then(d => {
        offsetAdmin = d.server_time - Date.now();
    }).catch(e=>console.log("Admin sync gagal"));

    function getWaktuAdminAkurat() {
        return new Date(Date.now() + offsetAdmin);
    }

    // Ambil semua tombol menu dan semua panel konten
    // LOGIKA PANEL 1: NAVIGASI TAB
    const menuLinks = document.querySelectorAll('.nav-menu a');
    const panels = document.querySelectorAll('.panel, .admin-panel');

    menuLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault(); // Jangan pindah halaman
            
            // 1. Hapus status 'active' dari semua tombol menu
            menuLinks.forEach(item => item.classList.remove('active'));
            
            // 2. Berikan status 'active' pada tombol yang diklik
            this.classList.add('active');
            
            // 3. Ambil target panel yang ingin dibuka (misal: panel-masjid)
            const targetId = this.getAttribute('data-target');
            
            // 4. Sembunyikan semua panel
            panels.forEach(panel => {
                panel.style.display = 'none';
                panel.classList.remove('active');
            });
            
            // 5. Tampilkan panel yang dituju
            const targetPanel = document.getElementById(targetId);
            if (targetPanel) {
                targetPanel.style.display = 'block';
                targetPanel.classList.add('active');
            }
        });
        // --- TAMBAHKAN DUA BARIS INI UNTUK AUTO-KLIK MENU PERTAMA ---
        const menuPertama = document.querySelector('.nav-menu a');
        if (menuPertama) menuPertama.click();
        // -----------------------------------------------------------
    });

    // ==========================================
    // LOGIKA PANEL 2: PROFIL MASJID & CONFIG
    // ==========================================
    const formConfig = document.getElementById('form-config');
    const modeSelect = document.getElementById('cfg-mode');
    const sectionKota = document.getElementById('section-kota');
    const sectionManual = document.getElementById('section-manual');
    const pesanConfig = document.getElementById('cfg-pesan');
    const selectKota = document.getElementById('cfg-kota');

    // 1. Toggling Mode Lokasi
    if (modeSelect) {
        modeSelect.addEventListener('change', (e) => {
            if (e.target.value === 'kota') {
                sectionKota.style.display = 'block';
                sectionManual.style.display = 'none';
            } else {
                sectionKota.style.display = 'none';
                sectionManual.style.display = 'block';
            }
        });
    }

    // 2. Mengambil daftar kota dari cities.json
    async function loadCities() {
        try {
            const res = await fetch('/api/cities');
            if (!res.ok) return;
            const cities = await res.json();
            
            selectKota.innerHTML = ''; // Bersihkan loading...
            
            for (const [cityName, data] of Object.entries(cities)) {
                // Jika lat 0 dan lon 0 (baris keterangan), LEWATI SAJA
                if (data.lat === 0 && data.lon === 0) {
                    continue; 
                }

                const opt = document.createElement('option');
                opt.value = cityName;
                opt.innerText = cityName;
                selectKota.appendChild(opt);
            }
        } catch (e) {
            console.error("Gagal memuat kota", e);
        }
    }

    // 3. Mengambil Data Config dari Backend
    async function loadConfigData() {
        try {
            const res = await fetch('/api/config');
            if (!res.ok) return;
            const data = await res.json();

            document.getElementById('cfg-nama').value = data.nama_masjid || '';
            document.getElementById('cfg-alamat').value = data.alamat_masjid || '';
            document.getElementById('cfg-metode').value = data.metode_kalender || 'NASIONAL_MABIMS';
            document.getElementById('cfg-mode').value = data.mode || 'kota';
            
            // Set kota setelah daftar kota dimuat
            if (data.pilihan_kota) selectKota.value = data.pilihan_kota;
            
            document.getElementById('cfg-lat').value = data.manual_lat || '';
            document.getElementById('cfg-lon').value = data.manual_lon || '';
            document.getElementById('cfg-tz').value = data.manual_tz || 7;
            document.getElementById('cfg-offset').value = data.offset_hijri || 0;
            document.getElementById('cfg-durasi').value = data.durasi_aktif || 60;
            document.getElementById('cfg-selalu-aktif').checked = data.selalu_aktif === true;
            const cbJawa = document.getElementById('cfg-tampilkan-jawa');
            if (cbJawa) cbJawa.checked = data.tampilkan_jawa !== false;
            document.getElementById('cfg-debug').checked = data.debug_mode === true;
            
            // ==========================================
            // TAMBAHAN: Tarik Data Tri-State ke Form Admin
            // ==========================================
            const displaySet = data.display_settings || {};
            
            // Atur Saklar Utama (Default True jika kosong)
            const isTriActive = displaySet.tri_state_enabled !== false; 
            const toggleEl = document.getElementById('toggle-tristate');
            if (toggleEl) toggleEl.checked = isTriActive;

            // Bersihkan daftar sebelum diisi ulang
            const listBO = document.getElementById('list-blackout');
            const listSS = document.getElementById('list-screensaver');
            if (listBO) listBO.innerHTML = '';
            if (listSS) listSS.innerHTML = '';

            // Gambar baris Blackout
            if (displaySet.blackout && displaySet.blackout.length > 0) {
                displaySet.blackout.forEach(b => {
                    // Panggil fungsi tambahBarisWaktu yang sudah Anda buat
                    if (typeof tambahBarisWaktu === 'function') tambahBarisWaktu('list-blackout', b.start, b.end);
                });
            }
            // Gambar baris Screensaver
            if (displaySet.screensaver && displaySet.screensaver.length > 0) {
                displaySet.screensaver.forEach(s => {
                    if (typeof tambahBarisWaktu === 'function') tambahBarisWaktu('list-screensaver', s.start, s.end);
                });
            }
            // ==========================================

            modeSelect.dispatchEvent(new Event('change'));
        } catch (e) {
            console.error("Gagal memuat config:", e);
        }
    }

    // 4. Menyimpan Data ke Backend
    if (formConfig) {
        formConfig.addEventListener('submit', async (e) => {
            e.preventDefault();
            pesanConfig.innerText = "Menyimpan...";
            pesanConfig.style.color = "yellow";

            const payload = {
                nama_masjid: document.getElementById('cfg-nama').value,
                alamat_masjid: document.getElementById('cfg-alamat').value,
                metode_kalender: document.getElementById('cfg-metode').value,
                mode: document.getElementById('cfg-mode').value,
                pilihan_kota: selectKota.value, // Ambil dari dropdown
                manual_lat: parseFloat(document.getElementById('cfg-lat').value) || 0,
                manual_lon: parseFloat(document.getElementById('cfg-lon').value) || 0,
                manual_tz: parseInt(document.getElementById('cfg-tz').value) || 7,
                offset_hijri: parseInt(document.getElementById('cfg-offset').value) || 0,
                durasi_aktif: parseInt(document.getElementById('cfg-durasi').value) || 60,
                selalu_aktif: document.getElementById('cfg-selalu-aktif').checked,
                debug_mode: document.getElementById('cfg-debug').checked, // Simpan nilai debug,
                tampilkan_jawa: document.getElementById('cfg-tampilkan-jawa').checked
            };

            try {
                const res = await fetch('/api/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await res.json();
                
                pesanConfig.style.color = res.ok ? "#00ff88" : "#ef4444";
                pesanConfig.innerText = result.msg;

                if (res.ok) setTimeout(() => { pesanConfig.innerText = ""; }, 3000);
            } catch (err) {
                pesanConfig.style.color = "#ef4444";
                pesanConfig.innerText = "Gagal menghubungi server.";
            }
        });
    }

    // Eksekusi Berurutan: Muat list kota dulu, baru muat config agar dropdown bisa 'terpilih'
    async function initializePanelMasjid() {
        await loadCities();
        await loadConfigData();
    }    
    initializePanelMasjid();

    // ==========================================
    // LOGIKA PANEL 4: MUTIARA HIKMAH (KUTIPAN)
    // ==========================================
    let kutipanData = []; // Array untuk menyimpan data lokal
    const tabelKutipan = document.getElementById('tabel-kutipan-body');
    const formKutipan = document.getElementById('form-kutipan');
    const pesanKutipan = document.getElementById('pesan-kutipan');
    const editIndexKutipan = document.getElementById('edit-index-kutipan');
    const judulFormKutipan = document.getElementById('judul-form-kutipan');
    const btnSubmitKutipan = document.getElementById('btn-submit-kutipan');
    const btnBatalKutipan = document.getElementById('btn-batal-kutipan');

    // 1. Mengambil data dari server
    async function loadKutipan() {
        try {
            const res = await fetch('/api/json_data/kutipan');
            if (res.ok) {
                kutipanData = await res.json();
                renderTabelKutipan();
            }
        } catch (e) {
            console.error("Gagal memuat kutipan:", e);
        }
    }

    // 2. Menggambar tabel ke HTML
    function renderTabelKutipan() {
        tabelKutipan.innerHTML = '';
        if (kutipanData.length === 0) {
            tabelKutipan.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px; color: #888;">Belum ada kutipan tersimpan.</td></tr>';
            return;
        }

        kutipanData.forEach((item, index) => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
            
            // Perhatikan tambahan tombol Edit berwarna kuning/hijau di sini
            tr.innerHTML = `
                <td style="padding: 12px; text-align: right; font-size: 18px; color: #ffd700;" dir="rtl">${item.arab || '-'}</td>
                <td style="padding: 12px; color: #ddd;">${item.arti}</td>
                <td style="padding: 12px; color: #888; font-size: 13px;">${item.sumber}</td>
                <td style="padding: 12px; text-align: center;">
                    <button onclick="editKutipan(${index})" style="background: transparent; border: 1px solid #00ff88; color: #00ff88; padding: 5px 8px; border-radius: 4px; cursor: pointer; margin-right: 5px; font-size: 12px;">Edit</button>
                    <button onclick="hapusKutipan(${index})" style="background: #ef4444; color: white; border: none; padding: 5px 8px; border-radius: 4px; cursor: pointer; font-size: 12px;">Hapus</button>
                </td>
            `;
            tabelKutipan.appendChild(tr);
        });
    }

    // 3. Menyimpan Array ke Server (POST)
    async function simpanKutipanKeServer() {
        pesanKutipan.innerText = "Menyimpan...";
        pesanKutipan.style.color = "yellow";
        try {
            const res = await fetch('/api/json_data/kutipan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(kutipanData) // Kirim seluruh array
            });
            const result = await res.json();
            pesanKutipan.style.color = res.ok ? "#00ff88" : "#ef4444";
            pesanKutipan.innerText = result.msg;
            if (res.ok) setTimeout(() => { pesanKutipan.innerText = ""; }, 3000);
        } catch (e) {
            pesanKutipan.style.color = "#ef4444";
            pesanKutipan.innerText = "Gagal menghubungi server.";
        }
    }

    // 4. Tambah / Simpan Edit Kutipan
    if (formKutipan) {
        formKutipan.addEventListener('submit', (e) => {
            e.preventDefault();
            const arabBaru = document.getElementById('kutipan-arab').value;
            const artiBaru = document.getElementById('kutipan-arti').value;
            const sumberBaru = document.getElementById('kutipan-sumber').value;
            const idx = parseInt(editIndexKutipan.value);

            if (idx === -1) {
                // Mode Tambah Baru
                kutipanData.push({ arab: arabBaru, arti: artiBaru, sumber: sumberBaru, aktif: document.getElementById('kutipan-aktif').checked });
            } else {
                // Mode Edit Data Lama
                kutipanData[idx] = { arab: arabBaru, arti: artiBaru, sumber: sumberBaru, aktif: document.getElementById('kutipan-aktif').checked };
                batalEditKutipan(); // Kembalikan form ke mode normal
            }
            
            // Kosongkan form, gambar ulang tabel, simpan ke server
            formKutipan.reset();
            renderTabelKutipan();
            simpanKutipanKeServer();
        });
    }

    // 5. Fungsi Pemicu Edit (Tarik data dari array ke dalam form)
    window.editKutipan = function(index) {
        const item = kutipanData[index];

        document.getElementById('kutipan-aktif').checked = item.aktif !== false;
        
        // Isi form dengan data yang dipilih
        document.getElementById('kutipan-arab').value = item.arab || '';
        document.getElementById('kutipan-arti').value = item.arti || '';
        document.getElementById('kutipan-sumber').value = item.sumber || '';
        
        // Ubah UI Form untuk menandakan sedang mode edit
        editIndexKutipan.value = index;
        judulFormKutipan.innerText = "✏️ Edit Kutipan";
        judulFormKutipan.style.color = "#f59e0b"; // Ganti warna jadi oranye
        btnSubmitKutipan.innerText = "Simpan Perubahan";
        btnSubmitKutipan.style.background = "#f59e0b";
        btnBatalKutipan.style.display = "inline-block"; // Munculkan tombol batal
        
        // Scroll ke atas (ke form)
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // 6. Fungsi Batal Edit
    window.batalEditKutipan = function() {
        formKutipan.reset();
        editIndexKutipan.value = -1;
        judulFormKutipan.innerText = "+ Tambah Kutipan Baru";
        judulFormKutipan.style.color = "#00ff88";
        btnSubmitKutipan.innerText = "Tambah & Simpan";
        btnSubmitKutipan.style.background = "#00ff88";
        btnBatalKutipan.style.display = "none";
    };

    // 7. Hapus Kutipan (Terkoneksi ke tombol Hapus di tabel)
    window.hapusKutipan = function(index) {
        if (confirm("Yakin ingin menghapus kutipan ini?")) {
            // Jika user sedang mengedit data yang tiba-tiba dihapus, batalkan editnya
            if (parseInt(editIndexKutipan.value) === index) {
                batalEditKutipan();
            }
            kutipanData.splice(index, 1); // Hapus 1 item dari array
            renderTabelKutipan();
            simpanKutipanKeServer();
        }
    };

    // Jalankan pertama kali
    loadKutipan();

    // ==========================================
    // LOGIKA PANEL 3: PENGUMUMAN (TEKS & GAMBAR)
    // ==========================================
    
    // --- A. TEKS PENGUMUMAN ---
    let teksData = [];
    const tabelTeks = document.getElementById('tabel-teks-body');
    const formTeks = document.getElementById('form-teks');
    const pesanTeks = document.getElementById('pesan-teks');
    
    // Variabel baru untuk fitur edit
    const editIndexTeks = document.getElementById('edit-index-teks');
    const btnSubmitTeks = document.getElementById('btn-submit-teks');
    const btnBatalTeks = document.getElementById('btn-batal-teks');

    async function loadTeks() {
        try {
            const res = await fetch('/api/json_data/pengumuman');
            if (res.ok) { teksData = await res.json(); renderTabelTeks(); }
        } catch (e) { console.error("Gagal muat teks", e); }
    }

    function renderTabelTeks() {
        tabelTeks.innerHTML = '';
        if (teksData.length === 0) {
            tabelTeks.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 15px; color:#888;">Tidak ada teks pengumuman.</td></tr>';
            return;
        }

        teksData.forEach((item, index) => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
            tr.innerHTML = `
                <td style="padding: 10px; color: #ddd;">${item.isi}</td>
                <td style="padding: 10px; text-align: center;">
                    <div style="font-size: 14px; font-weight: bold; margin-bottom: 3px;">${item.bobot || 1}</div>
                    ${item.aktif === false ? '<span style="background: rgba(239,68,68,0.1); color:#ef4444; font-size:10px; padding: 2px 6px; border-radius: 4px;">Sembunyi</span>' : '<span style="background: rgba(0,255,136,0.1); color:#00ff88; font-size:10px; padding: 2px 6px; border-radius: 4px;">Aktif</span>'}
                </td>
                <td style="padding: 10px; text-align: center; color: #888; font-size: 12px;">${item.deadline || '-'}</td>
                <td style="padding: 10px; text-align: center; white-space: nowrap;">
                    <button onclick="editTeks(${index})" style="background: transparent; border: 1px solid #00ff88; color: #00ff88; padding: 4px 8px; border-radius: 4px; cursor: pointer; margin-right: 5px;">Edit</button>
                    <button onclick="hapusTeks(${index})" style="background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">Hapus</button>
                </td>
            `;
            tabelTeks.appendChild(tr);
        });
    }

    async function simpanTeksKeServer() {
        try {
            await fetch('/api/json_data/pengumuman', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(teksData)
            });
        } catch (e) { console.error(e); }
    }

    if (formTeks) {
        formTeks.addEventListener('submit', (e) => {
            e.preventDefault();
            const baru = {
                isi: document.getElementById('teks-isi').value,
                bobot: parseInt(document.getElementById('teks-bobot').value) || 1,
                aktif: document.getElementById('teks-aktif').checked
            };
            const dl = document.getElementById('teks-deadline').value;
            if (dl) baru.deadline = dl;

            const idx = parseInt(editIndexTeks.value);
            if (idx === -1) {
                // Tambah baru
                teksData.push(baru);
            } else {
                // Simpan editan
                teksData[idx] = baru;
                batalEditTeks();
            }

            formTeks.reset(); 
            document.getElementById('teks-bobot').value = 1;
            renderTabelTeks(); 
            simpanTeksKeServer();
        });
    }

    // Fungsi menarik data ke form
    window.editTeks = function(index) {
        const item = teksData[index];
        document.getElementById('teks-isi').value = item.isi || '';
        document.getElementById('teks-bobot').value = item.bobot || 1;
        document.getElementById('teks-deadline').value = item.deadline || '';
        document.getElementById('teks-aktif').checked = item.aktif !== false;

        editIndexTeks.value = index;
        btnSubmitTeks.innerText = "Simpan Perubahan";
        btnSubmitTeks.style.background = "#f59e0b"; // Warna oranye
        btnBatalTeks.style.display = "inline-block";
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Fungsi membatalkan edit
    window.batalEditTeks = function() {
        formTeks.reset();
        document.getElementById('teks-bobot').value = 1;
        editIndexTeks.value = -1;
        btnSubmitTeks.innerText = "+ Tambah Teks";
        btnSubmitTeks.style.background = ""; // Kembali ke warna asal CSS
        btnBatalTeks.style.display = "none";
    };

    window.hapusTeks = function(index) {
        if (confirm("Hapus teks pengumuman ini?")) {
            if (parseInt(editIndexTeks.value) === index) {
                batalEditTeks(); // Batalkan edit jika data yang sedang diedit dihapus
            }
            teksData.splice(index, 1);
            renderTabelTeks(); simpanTeksKeServer();
        }
    };

    // --- B. GAMBAR PENGUMUMAN ---
    const galeriGambar = document.getElementById('galeri-gambar');
    const formGambar = document.getElementById('form-gambar');
    const pesanGambar = document.getElementById('pesan-gambar');
    
    // Elemen untuk fitur Preview & Edit
    const editFilenameGambar = document.getElementById('edit-filename-gambar');
    const fileInputGambar = document.getElementById('gambar-file');
    const groupFileGambar = document.getElementById('group-gambar-file');
    const previewContainer = document.getElementById('preview-container');
    const previewImg = document.getElementById('gambar-preview');
    const btnSubmitGambar = document.getElementById('btn-submit-gambar');
    const btnBatalGambar = document.getElementById('btn-batal-gambar');

    // Memicu Preview saat User memilih file (Mode Upload Baru)
    fileInputGambar.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                previewImg.src = e.target.result;
                previewContainer.style.display = 'block';
            }
            reader.readAsDataURL(file);
        } else {
            previewContainer.style.display = 'none';
            previewImg.src = '';
        }
    });

    async function loadGambar() {
        try {
            const res = await fetch('/api/gambar_pengumuman');
            if (!res.ok) return;
            const files = await res.json();
            
            galeriGambar.innerHTML = '';
            if (files.length === 0) {
                galeriGambar.innerHTML = '<p style="text-align:center; color:#888;">Belum ada poster gambar.</p>';
                return;
            }

            files.forEach(filename => {
                let bobot = 1, dl = "", aktif = true, namaMurni = filename;
                if (filename.includes('__')) {
                    const parts = filename.split('__');
                    namaMurni = parts[parts.length - 1];
                    parts.forEach(p => {
                        if (p.startsWith('W')) bobot = parseInt(p.substring(1)) || 1;
                        else if (p.startsWith('D')) dl = p.substring(1);
                        else if (p.startsWith('A')) aktif = p.substring(1) === '1'; // Deteksi A1 atau A0
                    });
                }

                // --- 1. BUAT BADGE STATUS ---
                const badgeStatus = aktif 
                    ? '<span style="background: rgba(0,255,136,0.1); color:#00ff88; padding: 2px 6px; border-radius: 4px; font-size: 10px;">Aktif</span>' 
                    : '<span style="background: rgba(239,68,68,0.1); color:#ef4444; padding: 2px 6px; border-radius: 4px; font-size: 10px;">Sembunyi</span>';

                const card = document.createElement('div');
                card.style.cssText = 'background: rgba(0,0,0,0.3); border-radius: 6px; padding: 10px; display: flex; align-items: center; gap: 15px; border-left: 3px solid #00ff88;';
                
                // --- 2. MASUKKAN BADGE KE DALAM HTML ---
                card.innerHTML = `
                    <img src="/static/img/pengumuman/${filename}" style="width: 80px; height: 60px; object-fit: cover; border-radius: 4px; border: 1px solid #555;">
                    <div style="flex: 1;">
                        <div style="font-weight: bold; color: #fff; font-size: 14px; word-break: break-all;">${namaMurni}</div>
                        <div style="font-size: 12px; color: #888; margin-top: 4px;">Bobot: <span style="color:#ffd700">${bobot}</span> | Deadline: <span style="color:#ef4444">${dl || '-'}</span></div>
                        <div style="margin-top: 6px;">${badgeStatus}</div>
                    </div>
                    <button onclick="editGambar('${filename}')" style="background: transparent; border: 1px solid #00ff88; color: #00ff88; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; margin-right: 5px;">Edit</button>
                    <button onclick="hapusGambar('${filename}')" style="background: #ef4444; color: white; border: none; padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;">Hapus</button>
                `;
                galeriGambar.appendChild(card);
            });
        } catch (e) { console.error("Gagal muat gambar", e); }
    }

    // Fungsi menarik data ke form (Mode Edit)
    window.editGambar = function(filename) {
        let bobot = 1, dl = "", aktif = true, namaMurni = filename;
            if (filename.includes('__')) {
                const parts = filename.split('__');
                namaMurni = parts[parts.length - 1];
                parts.forEach(p => {
                    if (p.startsWith('W')) bobot = parseInt(p.substring(1)) || 1;
                    else if (p.startsWith('D')) dl = p.substring(1);
                    else if (p.startsWith('A')) aktif = p.substring(1) === '1'; // Deteksi A1 atau A0
                });
            }

        // Isi form
        editFilenameGambar.value = filename;
        document.getElementById('gambar-bobot').value = bobot;
        document.getElementById('gambar-deadline').value = dl;
        document.getElementById('gambar-aktif').checked = aktif;

        // Tampilkan Preview Gambar dari server
        previewImg.src = `/static/img/pengumuman/${filename}`;
        previewContainer.style.display = 'block';

        // Sembunyikan input file (Karena cuma edit bobot/deadline)
        groupFileGambar.style.display = 'none';
        fileInputGambar.removeAttribute('required');

        // Ubah tampilan tombol
        btnSubmitGambar.innerText = "Simpan Perubahan";
        btnSubmitGambar.style.background = "#f59e0b";
        btnBatalGambar.style.display = "inline-block";

        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // Fungsi Batal Edit
    window.batalEditGambar = function() {
        formGambar.reset();
        editFilenameGambar.value = "";
        document.getElementById('gambar-bobot').value = 1;

        // Sembunyikan preview & Kembalikan input file
        previewContainer.style.display = 'none';
        previewImg.src = '';
        groupFileGambar.style.display = 'block';
        fileInputGambar.setAttribute('required', 'true');

        // Kembalikan tampilan tombol
        btnSubmitGambar.innerText = "⬆️ Upload Gambar";
        btnSubmitGambar.style.background = "";
        btnBatalGambar.style.display = "none";
    };

    if (formGambar) {
        formGambar.addEventListener('submit', async (e) => {
            e.preventDefault();
            pesanGambar.style.color = "yellow"; pesanGambar.innerText = "Memproses...";

            const editFilename = editFilenameGambar.value;

            if (editFilename) {
                // MODE EDIT (Ganti Nama File di Server pakai PUT)
                const payload = {
                    filename_lama: editFilename,
                    bobot: document.getElementById('gambar-bobot').value,
                    deadline: document.getElementById('gambar-deadline').value,
                    aktif: document.getElementById('gambar-aktif').checked
                };

                try {
                    const res = await fetch('/api/gambar_pengumuman', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    const result = await res.json();
                    
                    pesanGambar.style.color = res.ok ? "#00ff88" : "#ef4444";
                    pesanGambar.innerText = result.msg;
                    
                    if (res.ok) {
                        batalEditGambar();
                        loadGambar();
                    }
                } catch (err) {
                    pesanGambar.style.color = "#ef4444"; pesanGambar.innerText = "Gagal edit data.";
                }

            } else {
                // MODE UPLOAD BARU (pakai POST)
                const formData = new FormData();
                formData.append('file', fileInputGambar.files[0]);
                formData.append('bobot', document.getElementById('gambar-bobot').value);
                formData.append('deadline', document.getElementById('gambar-deadline').value);
                formData.append('aktif', document.getElementById('gambar-aktif').checked);

                try {
                    const res = await fetch('/api/gambar_pengumuman', { method: 'POST', body: formData });
                    const result = await res.json();
                    
                    pesanGambar.style.color = res.ok ? "#00ff88" : "#ef4444";
                    pesanGambar.innerText = result.msg;
                    
                    if (res.ok) {
                        batalEditGambar(); // Reset form & hilangkan preview
                        loadGambar(); 
                    }
                } catch (err) {
                    pesanGambar.style.color = "#ef4444"; pesanGambar.innerText = "Gagal upload.";
                }
            }
            setTimeout(() => { pesanGambar.innerText = ""; }, 3000);
        });
    }

    // Fungsi hapus
    window.hapusGambar = async function(filename) {
        if (confirm("Hapus poster gambar ini permanen?")) {
            if (editFilenameGambar.value === filename) batalEditGambar();
            try {
                const res = await fetch('/api/gambar_pengumuman', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename: filename })
                });
                if (res.ok) loadGambar();
            } catch (e) { console.error(e); }
        }
    };

    // Jalankan pertama kali
    loadTeks();
    loadGambar();

    // --- C. MANAJEMEN ARSIP PENGUMUMAN ---
    let arsipTeksData = [];
    const tabelArsipTeks = document.getElementById('tabel-arsip-teks');
    const galeriArsipGambar = document.getElementById('galeri-arsip-gambar');

    // 1. Muat & Gambar Arsip Teks
    async function loadArsipTeks() {
        try {
            const res = await fetch('/api/json_data/archive_pengumuman');
            if (res.ok) { arsipTeksData = await res.json(); renderArsipTeks(); }
        } catch (e) { console.error("Gagal muat arsip teks", e); }
    }

    function renderArsipTeks() {
        tabelArsipTeks.innerHTML = '';
        if (arsipTeksData.length === 0) {
            tabelArsipTeks.innerHTML = '<tr><td style="text-align:center; padding: 10px; color:#555;">Arsip teks kosong.</td></tr>';
            return;
        }

        arsipTeksData.forEach((item, index) => {
            const tr = document.createElement('tr');
            tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
            tr.innerHTML = `
                <td style="padding: 10px; color: #999;"><del>${item.isi || item}</del></td>
                <td style="padding: 10px; text-align: right;">
                    <button onclick="hapusArsipTeks(${index})" style="background: transparent; border: 1px solid #ef4444; color: #ef4444; padding: 4px 8px; border-radius: 4px; cursor: pointer;">Hapus Permanen</button>
                </td>
            `;
            tabelArsipTeks.appendChild(tr);
        });
    }

    window.hapusArsipTeks = async function(index) {
        if (confirm("Hapus arsip teks ini selamanya?")) {
            arsipTeksData.splice(index, 1);
            renderArsipTeks();
            try {
                await fetch('/api/json_data/archive_pengumuman', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(arsipTeksData)
                });
            } catch (e) { console.error(e); }
        }
    };

    // 2. Muat & Gambar Arsip Poster
    async function loadArsipGambar() {
        try {
            const res = await fetch('/api/gambar_arsip');
            if (!res.ok) return;
            const files = await res.json();
            
            galeriArsipGambar.innerHTML = '';
            if (files.length === 0) {
                galeriArsipGambar.innerHTML = '<p style="text-align:center; color:#555;">Arsip gambar kosong.</p>';
                return;
            }

            files.forEach(filename => {
                let namaMurni = filename.split('__').pop(); // Ambil bagian paling akhir saja
                const card = document.createElement('div');
                card.style.cssText = 'background: rgba(0,0,0,0.2); border-radius: 6px; padding: 8px; display: flex; align-items: center; gap: 15px; border-left: 2px solid #555;';
                card.innerHTML = `
                    <img src="/static/img/pengumuman/archive/${filename}" style="width: 60px; height: 45px; object-fit: cover; border-radius: 4px; opacity: 0.5; filter: grayscale(100%);">
                    <div style="flex: 1; color: #888; font-size: 13px; text-decoration: line-through;">${namaMurni}</div>
                    <button onclick="hapusArsipGambar('${filename}')" style="background: transparent; border: 1px solid #ef4444; color: #ef4444; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px;">Hapus</button>
                `;
                galeriArsipGambar.appendChild(card);
            });
        } catch (e) { console.error("Gagal muat arsip gambar", e); }
    }

    window.hapusArsipGambar = async function(filename) {
        if (confirm("Hapus arsip gambar ini secara permanen dari server?")) {
            try {
                const res = await fetch('/api/gambar_arsip', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename: filename })
                });
                if (res.ok) loadArsipGambar();
            } catch (e) { console.error(e); }
        }
    };

    // Panggil fungsinya saat halaman dimuat
    loadArsipTeks();
    loadArsipGambar();


    // ==========================================
    // LOGIKA PANEL 5: AUDIT LOG (CATATAN AKTIFITAS)
    // ==========================================
    const tabelLog = document.getElementById('tabel-log-body');

    window.loadLogs = async function() {
        if (!tabelLog) return;
        tabelLog.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px; color: #00ff88;">Mencari jejak aktifitas...</td></tr>';
        
        try {
            const res = await fetch('/api/logs');
            if (!res.ok) throw new Error("Gagal akses API");
            const logs = await res.json();
            
            tabelLog.innerHTML = '';
            if (logs.length === 0) {
                tabelLog.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px; color:#888;">Belum ada catatan aktifitas.</td></tr>';
                return;
            }

            logs.forEach(log => {
                // Beri warna khusus untuk setiap lencana kategori
                let badgeColor = "#555";
                if (log.kategori === "AUTH") badgeColor = "#3b82f6"; // Biru
                else if (log.kategori === "KONTEN") badgeColor = "#eab308"; // Kuning
                else if (log.kategori === "CONFIG") badgeColor = "#ef4444"; // Merah
                else if (log.kategori === "SISTEM") badgeColor = "#10b981"; // Hijau

                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                tr.style.transition = 'background-color 0.2s';
                
                // Efek hover (sorot baris saat mouse di atasnya)
                tr.addEventListener('mouseenter', () => tr.style.backgroundColor = 'rgba(255,255,255,0.02)');
                tr.addEventListener('mouseleave', () => tr.style.backgroundColor = 'transparent');

                tr.innerHTML = `
                    <td style="padding: 10px; color: #888; font-family: monospace; font-size: 13px;">${log.waktu}</td>
                    <td style="padding: 10px; color: #fff; font-weight: bold;">@${log.user}</td>
                    <td style="padding: 10px; text-align: center;">
                        <span style="background: ${badgeColor}; color: white; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; letter-spacing: 0.5px;">${log.kategori}</span>
                    </td>
                    <td style="padding: 10px; color: #ddd;">${log.aksi}</td>
                `;
                tabelLog.appendChild(tr);
            });
        } catch (e) {
            tabelLog.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px; color:#ef4444;">Gagal memuat log dari server.</td></tr>';
        }
    };

    // Jalankan pertama kali saat halaman dimuat
    loadLogs();

    // ==========================================
    // LOGIKA PANEL 6: MANAJEMEN AKUN
    // ==========================================
    
    // 1. Logika Ganti Password (Berlaku untuk semua user)
    const formGantiPass = document.getElementById('form-ganti-password');
    const pesanPass = document.getElementById('pesan-pass');
    const togglePass = document.getElementById('toggle-pass');

    // Fitur Checkbox Show/Hide Password
    if (togglePass) {
        togglePass.addEventListener('change', function() {
            const tipe = this.checked ? 'text' : 'password';
            document.getElementById('pass-baru').type = tipe;
            document.getElementById('pass-baru-konfirm').type = tipe;
        });
    }

    if (formGantiPass) {
        formGantiPass.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const passBaru = document.getElementById('pass-baru').value;
            const passKonfirm = document.getElementById('pass-baru-konfirm').value;

            // Validasi: Cek apakah kedua password baru diketik sama persis
            if (passBaru !== passKonfirm) {
                pesanPass.style.color = "#ef4444"; // Merah
                pesanPass.innerText = "Konfirmasi password tidak cocok! Silakan periksa kembali.";
                return; // Hentikan eksekusi, jangan kirim data ke server
            }

            pesanPass.style.color = "yellow"; pesanPass.innerText = "Memeriksa...";
            
            const payload = {
                password_lama: document.getElementById('pass-lama').value,
                password_baru: passBaru
            };

            try {
                const res = await fetch('/api/ganti_password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await res.json();
                
                pesanPass.style.color = res.ok ? "#00ff88" : "#ef4444";
                pesanPass.innerText = result.msg;
                
                if (res.ok) {
                    formGantiPass.reset();
                    // Kembalikan kotak input menjadi sensor titik-titik (password)
                    document.getElementById('pass-baru').type = 'password';
                    document.getElementById('pass-baru-konfirm').type = 'password';
                }
                setTimeout(() => { pesanPass.innerText = ""; }, 4000);
            } catch (err) {
                pesanPass.style.color = "#ef4444"; pesanPass.innerText = "Gagal menghubungi server.";
            }
        });
    }

    // 2. Logika Kelola User (Hanya dieksekusi jika elemennya ada di HTML / Superadmin)
    const formUser = document.getElementById('form-user');
    const tabelUsers = document.getElementById('tabel-users-body');
    const pesanUser = document.getElementById('pesan-user');

    if (formUser && tabelUsers) {
        // Fungsi Muat Daftar User
        window.loadUsers = async function() {
            try {
                const res = await fetch('/api/users');
                if (!res.ok) return;
                const users = await res.json();
                
                tabelUsers.innerHTML = '';
                for (const [username, info] of Object.entries(users)) {
                    // Beri warna lencana sesuai role
                    let warnaRole = info.role === 'superadmin' ? '#ef4444' : (info.role === 'admin_konten' ? '#eab308' : '#3b82f6');
                    
                    const tr = document.createElement('tr');
                    tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                    tr.innerHTML = `
                        <td style="padding: 10px; color: #fff; font-weight: bold;">@${username}</td>
                        <td style="padding: 10px; color: #ddd;">${info.nama_lengkap}</td>
                        <td style="padding: 10px; text-align: center;">
                            <span style="background: ${warnaRole}; padding: 3px 8px; border-radius: 4px; font-size: 11px; color: white; font-weight: bold;">${info.role.toUpperCase()}</span>
                        </td>
                        <td style="padding: 10px; text-align: center;">
                            <button onclick="editUser('${username}', '${info.nama_lengkap}', '${info.role}')" style="background: transparent; border: 1px solid #00ff88; color: #00ff88; padding: 4px 8px; border-radius: 4px; cursor: pointer; margin-right: 5px;">Edit</button>
                            <button onclick="hapusUser('${username}')" style="background: #ef4444; border: none; color: white; padding: 5px 8px; border-radius: 4px; cursor: pointer;">Hapus</button>
                        </td>
                    `;
                    tabelUsers.appendChild(tr);
                }
            } catch (e) { console.error("Gagal muat users", e); }
        };

        // Fungsi Simpan (Tambah/Edit) User
        formUser.addEventListener('submit', async (e) => {
            e.preventDefault();
            pesanUser.style.color = "yellow"; pesanUser.innerText = "Menyimpan...";
            
            const payload = {
                username: document.getElementById('u-username').value,
                nama_lengkap: document.getElementById('u-nama').value,
                role: document.getElementById('u-role').value,
                password: document.getElementById('u-pass').value
            };

            try {
                const res = await fetch('/api/users', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await res.json();
                
                pesanUser.style.color = res.ok ? "#00ff88" : "#ef4444";
                pesanUser.innerText = result.msg;
                
                if (res.ok) {
                    formUser.reset();
                    document.getElementById('u-username').readOnly = false; // Kembalikan ke normal jika sehabis edit
                    document.getElementById('form-user-title').innerText = "+ Tambah User Baru";
                    loadUsers();
                }
                setTimeout(() => { pesanUser.innerText = ""; }, 3000);
            } catch (err) {
                pesanUser.style.color = "#ef4444"; pesanUser.innerText = "Gagal upload.";
            }
        });

        // Fungsi Masukkan Data ke Form untuk Diedit
        window.editUser = function(username, nama, role) {
            document.getElementById('form-user-title').innerText = "✏️ Edit Profil User";
            const uField = document.getElementById('u-username');
            uField.value = username;
            uField.readOnly = true; // Username tidak boleh diubah, hanya bisa dihapus
            
            document.getElementById('u-nama').value = nama;
            document.getElementById('u-role').value = role;
            document.getElementById('u-pass').value = ""; // Kosongkan password
            document.getElementById('u-pass').placeholder = "Abaikan jika tak ingin ganti pass";
        };

        // Fungsi Hapus User
        window.hapusUser = async function(username) {
            if (confirm(`Yakin ingin MENGHAPUS PERMANEN user @${username}?`)) {
                try {
                    const res = await fetch('/api/users', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username: username })
                    });
                    const result = await res.json();
                    if (res.ok) {
                        loadUsers();
                    } else {
                        alert(result.msg); // Muncul jika mencoba menghapus diri sendiri
                    }
                } catch (e) { console.error(e); }
            }
        };

        // Panggil pertama kali
        loadUsers();
    }

    // ==========================================
    // LOGIKA PANEL 7: PUSAT KOMANDO EVENT
    // ==========================================
    let eventData = { masehi_rutin: {}, hijriah_rutin: {}, insidentil_spesifik: {} };

    async function loadEvents() {
        try {
            const res = await fetch('/api/json_data/event');
            if (res.ok) {
                eventData = await res.json();
                if(!eventData.masehi_rutin) eventData = { masehi_rutin: {}, hijriah_rutin: {}, insidentil_spesifik: {} };
                renderEventTable('masehi_rutin', 'tabel-ev-masehi');
                renderEventTable('hijriah_rutin', 'tabel-ev-hijri');
                renderEventTable('insidentil_spesifik', 'tabel-ev-insidentil');
            }
        } catch (e) { console.error("Gagal muat event", e); }
    }

    function renderEventTable(kategori, tableId) {
        const tbody = document.getElementById(tableId);
        if (!tbody) return;
        tbody.innerHTML = '';
        
        const dataObj = eventData[kategori] || {};
        let keys = Object.keys(dataObj);
        
        const bobotMasehi = {
            "Januari": 1, "Februari": 2, "Maret": 3, "April": 4, "Mei": 5, "Juni": 6,
            "Juli": 7, "Agustus": 8, "September": 9, "Oktober": 10, "November": 11, "Desember": 12
        };
        const bobotHijriah = {
            "Muharram": 1, "Safar": 2, "Rabi'ul Awwal": 3, "Rabi'ul Akhir": 4,
            "Jumadil Ula": 5, "Jumadil Akhira": 6, "Rajab": 7, "Sya'ban": 8,
            "Ramadhan": 9, "Syawal": 10, "Dzulqa'dah": 11, "Dzulhijjah": 12
        };

        keys.sort((a, b) => {
            if (kategori === 'insidentil_spesifik') return a.localeCompare(b);
            let [tglA, ...blnArrA] = a.split(' ');
            let [tglB, ...blnArrB] = b.split(' ');
            let blnA = blnArrA.join(' '), blnB = blnArrB.join(' ');
            let nilaiBulanA = kategori === 'masehi_rutin' ? bobotMasehi[blnA] : bobotHijriah[blnA];
            let nilaiBulanB = kategori === 'masehi_rutin' ? bobotMasehi[blnB] : bobotHijriah[blnB];
            if (nilaiBulanA === nilaiBulanB) return parseInt(tglA) - parseInt(tglB);
            return (nilaiBulanA || 0) - (nilaiBulanB || 0);
        });
        
        if (keys.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#888;">Belum ada data</td></tr>';
            return;
        }

        keys.forEach(key => {
            let val = dataObj[key];
            // Jika nilainya array, kita pisah jadi baris sendiri-sendiri agar mudah diedit
            let valArray = Array.isArray(val) ? val : [val];

            valArray.forEach(itemVal => {
                // Mengamankan string dari petik tunggal agar tidak error di HTML onClick
                let safeKey = key.replace(/'/g, "\\'");
                let safeVal = itemVal.replace(/'/g, "\\'");

                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                tr.innerHTML = `
                    <td style="padding: 8px; color: #00ff88; font-weight: bold; width: 35%;">${key}</td>
                    <td style="padding: 8px; color: #ddd;">${itemVal}</td>
                    <td style="padding: 8px; text-align: right; width: 25%; white-space: nowrap;">
                        <button onclick="editEvent('${kategori}', '${safeKey}', '${safeVal}')" style="background: transparent; color: #f59e0b; border: 1px solid #f59e0b; border-radius: 4px; padding: 2px 6px; cursor: pointer; font-size: 11px; margin-right: 4px;">Edit</button>
                        <button onclick="hapusEvent('${kategori}', '${safeKey}', '${safeVal}')" style="background: transparent; color: #ef4444; border: 1px solid #ef4444; border-radius: 4px; padding: 2px 6px; cursor: pointer; font-size: 11px;">X</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        });
    }

    async function simpanEventKeServer() {
        try {
            await fetch('/api/json_data/event', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(eventData)
            });
        } catch (e) { console.error(e); }
    }

    // Fungsi Hapus yang Dimodifikasi (Hanya menghapus value spesifik jika bentuknya Array)
    window.hapusEvent = function(kategori, key, specificVal) {
        if (confirm(`Hapus event "${specificVal}" pada ${key}?`)) {
            let existing = eventData[kategori][key];
            if (Array.isArray(existing)) {
                // Filter out yang dihapus
                eventData[kategori][key] = existing.filter(v => v !== specificVal);
                // Bersihkan jika kosong, jadikan string jika tinggal 1
                if (eventData[kategori][key].length === 0) delete eventData[kategori][key];
                else if (eventData[kategori][key].length === 1) eventData[kategori][key] = eventData[kategori][key][0];
            } else {
                delete eventData[kategori][key];
            }
            
            // Penentuan ID Tabel yang Akurat
            let tableId = kategori === 'masehi_rutin' ? 'tabel-ev-masehi' : (kategori === 'hijriah_rutin' ? 'tabel-ev-hijri' : 'tabel-ev-insidentil');
            renderEventTable(kategori, tableId);
            simpanEventKeServer();
        }
    };

    // Fungsi Menarik Data ke Form (Mode Edit)
    window.editEvent = function(kategori, key, specificVal) {
        let prefix = kategori === 'masehi_rutin' ? 'mas' : (kategori === 'hijriah_rutin' ? 'hij' : 'ins');

        // Simpan data lama ke hidden input
        document.getElementById(`edit-old-key-${prefix}`).value = key;
        document.getElementById(`edit-old-val-${prefix}`).value = specificVal;
        
        // Isi form input
        document.getElementById(`ev-${prefix}-nama`).value = specificVal;

        if (kategori === 'insidentil_spesifik') {
            document.getElementById(`ev-ins-tgl`).value = key;
        } else {
            let parts = key.split(' ');
            let tgl = parts[0];
            let bln = parts.slice(1).join(' ');
            document.getElementById(`ev-${prefix}-tgl`).value = parseInt(tgl);
            document.getElementById(`ev-${prefix}-bln`).value = bln;
        }

        // Ubah tampilan UI Tombol
        const btnSubmit = document.getElementById(`btn-submit-${prefix}`);
        const btnBatal = document.getElementById(`btn-batal-${prefix}`);
        btnSubmit.innerText = "💾";
        btnSubmit.style.background = "#f59e0b";
        btnBatal.style.display = "inline-block";
    };

    // Fungsi Membatalkan Edit
    window.batalEditEvent = function(kategori) {
        let prefix = '';
        let formId = '';

        if (kategori === 'masehi_rutin') {
            prefix = 'mas';
            formId = 'form-ev-masehi';
        } else if (kategori === 'hijriah_rutin') {
            prefix = 'hij';
            formId = 'form-ev-hijri';
        } else {
            prefix = 'ins';
            formId = 'form-ev-insidentil';
        }
        
        // 1. Reset form dengan aman
        const formEl = document.getElementById(formId);
        if (formEl) formEl.reset();
        
        // 2. Kosongkan hidden input
        const keyEl = document.getElementById(`edit-old-key-${prefix}`);
        const valEl = document.getElementById(`edit-old-val-${prefix}`);
        if (keyEl) keyEl.value = "";
        if (valEl) valEl.value = "";

        // 3. Kembalikan tampilan tombol
        const btnSubmit = document.getElementById(`btn-submit-${prefix}`);
        const btnBatal = document.getElementById(`btn-batal-${prefix}`);
        
        if (btnSubmit) {
            btnSubmit.innerText = "+";
            btnSubmit.style.background = ""; 
        }
        if (btnBatal) {
            btnBatal.style.display = "none";
        }
    };

    // Fungsi Submit (Menangani Tambah Baru & Simpan Editan)
    function handleAddEvent(formId, kategori, inputTglId, inputNamaId, inputBlnId = null) {
        const form = document.getElementById(formId);
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                
                let prefix = kategori === 'masehi_rutin' ? 'mas' : (kategori === 'hijriah_rutin' ? 'hij' : 'ins');
                let oldKey = document.getElementById(`edit-old-key-${prefix}`).value;
                let oldVal = document.getElementById(`edit-old-val-${prefix}`).value;

                // JIKA SEDANG MODE EDIT: Hapus data lamanya terlebih dahulu
                if (oldKey && oldVal) {
                    let existing = eventData[kategori][oldKey];
                    if (Array.isArray(existing)) {
                        eventData[kategori][oldKey] = existing.filter(v => v !== oldVal);
                        if (eventData[kategori][oldKey].length === 0) delete eventData[kategori][oldKey];
                        else if (eventData[kategori][oldKey].length === 1) eventData[kategori][oldKey] = eventData[kategori][oldKey][0];
                    } else {
                        delete eventData[kategori][oldKey];
                    }
                }

                // LANJUTKAN PROSES SIMPAN / TAMBAH SEPERTI BIASA
                let tglVal = document.getElementById(inputTglId).value.trim();
                let nama = document.getElementById(inputNamaId).value.trim();
                let tglFinal = "";

                if (kategori === 'masehi_rutin') {
                    let bln = document.getElementById(inputBlnId).value;
                    tglFinal = String(tglVal).padStart(2, '0') + " " + bln;
                } else if (kategori === 'hijriah_rutin') {
                    let bln = document.getElementById(inputBlnId).value;
                    tglFinal = tglVal + " " + bln;
                } else {
                    tglFinal = tglVal;
                }

                if (!eventData[kategori]) eventData[kategori] = {};
                
                // Masukkan data baru
                if (eventData[kategori][tglFinal]) {
                    let existing = eventData[kategori][tglFinal];
                    if (Array.isArray(existing)) existing.push(nama);
                    else eventData[kategori][tglFinal] = [existing, nama];
                } else {
                    eventData[kategori][tglFinal] = nama;
                }

                batalEditEvent(kategori); // Reset form & tutup mode edit
                
                // Penentuan ID Tabel yang Akurat
                let tableId = kategori === 'masehi_rutin' ? 'tabel-ev-masehi' : (kategori === 'hijriah_rutin' ? 'tabel-ev-hijri' : 'tabel-ev-insidentil');
                renderEventTable(kategori, tableId);
                
                simpanEventKeServer();
            });
        }
    }

    handleAddEvent('form-ev-masehi', 'masehi_rutin', 'ev-mas-tgl', 'ev-mas-nama', 'ev-mas-bln');
    handleAddEvent('form-ev-hijri', 'hijriah_rutin', 'ev-hij-tgl', 'ev-hij-nama', 'ev-hij-bln');
    handleAddEvent('form-ev-insidentil', 'insidentil_spesifik', 'ev-ins-tgl', 'ev-ins-nama');

    loadEvents();

    // ==========================================
    // PENGATURAN WAKTU SHALAT (HISAB, IHTIYATI, IQOMAH)
    // ==========================================
    const presetShalat = {
        "KEMENAG": { subuh: 20.0, isya: 18.0, interval: 0 },
        "MUHAMMADIYAH": { subuh: 18.0, isya: 18.0, interval: 0 },
        "MWL": { subuh: 18.0, isya: 17.0, interval: 0 },
        "ISNA": { subuh: 15.0, isya: 15.0, interval: 0 },
        "EGYPT": { subuh: 19.5, isya: 17.5, interval: 0 },
        "UMM_AL_QURA": { subuh: 18.5, isya: 0, interval: 90 }
    };

    const wtPreset = document.getElementById('wt-preset');
    const wtSubuh = document.getElementById('wt-sudut-subuh');
    const wtIsya = document.getElementById('wt-sudut-isya');
    const wtInterval = document.getElementById('wt-isya-interval');

    // Jika Dropdown dipilih, otomatis isi angka
    if (wtPreset) {
        wtPreset.addEventListener('change', (e) => {
            let val = e.target.value;
            if (presetShalat[val]) {
                wtSubuh.value = presetShalat[val].subuh;
                wtIsya.value = presetShalat[val].isya;
                wtInterval.value = presetShalat[val].interval;
            }
        });
    }

    // Jika angka diketik manual, ubah Dropdown jadi "CUSTOM"
    function checkCustom() {
        let currentVal = wtPreset.value;
        if (currentVal !== "CUSTOM" && presetShalat[currentVal]) {
            if (parseFloat(wtSubuh.value) !== presetShalat[currentVal].subuh ||
                parseFloat(wtIsya.value) !== presetShalat[currentVal].isya ||
                parseInt(wtInterval.value) !== presetShalat[currentVal].interval) {
                wtPreset.value = "CUSTOM";
            }
        }
    }
    if(wtSubuh) wtSubuh.addEventListener('input', checkCustom);
    if(wtIsya) wtIsya.addEventListener('input', checkCustom);
    if(wtInterval) wtInterval.addEventListener('input', checkCustom);

    // Fungsi Load Data saat buka halaman
    async function loadConfigWaktu() {
        try {
            const res = await fetch('/api/config_waktu');
            const data = await res.json();
            
            // Load Hisab
            if (wtPreset) {
                wtPreset.value = data.metode_aktif;
                wtSubuh.value = data.parameter_kustom.sudut_subuh;
                wtIsya.value = data.parameter_kustom.sudut_isya;
                wtInterval.value = data.parameter_kustom.isya_menit_setelah_maghrib;
                document.getElementById('wt-mazhab').value = data.parameter_kustom.mazhab_ashar;
                
                // Load Ihtiyati
                document.getElementById('ih-imsak').value = data.ihtiyati_menit.imsak;
                document.getElementById('ih-subuh').value = data.ihtiyati_menit.subuh;
                document.getElementById('ih-terbit').value = data.ihtiyati_menit.terbit;
                document.getElementById('ih-dzuhur').value = data.ihtiyati_menit.dzuhur;
                document.getElementById('ih-ashar').value = data.ihtiyati_menit.ashar;
                document.getElementById('ih-maghrib').value = data.ihtiyati_menit.maghrib;
                document.getElementById('ih-isya').value = data.ihtiyati_menit.isya;

                // Load Iqomah
                document.getElementById('iq-subuh').value = data.iqomah_menit.subuh;
                document.getElementById('iq-dzuhur').value = data.iqomah_menit.dzuhur;
                document.getElementById('iq-ashar').value = data.iqomah_menit.ashar;
                document.getElementById('iq-maghrib').value = data.iqomah_menit.maghrib;
                document.getElementById('iq-isya').value = data.iqomah_menit.isya;

                // Load Pengaturan Jumat
                if (data.jumat) {
                    document.getElementById('jm-gunakan-waktu-tetap').checked = data.jumat.gunakan_waktu_tetap;
                    document.getElementById('jm-waktu-tetap').value = data.jumat.waktu_tetap || "12:00";
                    document.getElementById('jm-durasi').value = data.jumat.durasi_menit || 45;
                }
            }
        } catch (err) { console.error("Gagal load config waktu", err); }
    }

    // Panggil saat halaman diload
    loadConfigWaktu();

    // Submit Form
    const formWaktu = document.getElementById('form-waktu');
    if (formWaktu) {
        formWaktu.addEventListener('submit', async (e) => {
            e.preventDefault();
            const payload = {
                metode_aktif: wtPreset.value,
                parameter_kustom: {
                    sudut_subuh: parseFloat(wtSubuh.value),
                    sudut_isya: parseFloat(wtIsya.value),
                    isya_menit_setelah_maghrib: parseInt(wtInterval.value) || 0,
                    mazhab_ashar: document.getElementById('wt-mazhab').value
                },
                ihtiyati_menit: {
                    imsak: parseInt(document.getElementById('ih-imsak').value),
                    subuh: parseInt(document.getElementById('ih-subuh').value),
                    terbit: parseInt(document.getElementById('ih-terbit').value),
                    dzuhur: parseInt(document.getElementById('ih-dzuhur').value),
                    ashar: parseInt(document.getElementById('ih-ashar').value),
                    maghrib: parseInt(document.getElementById('ih-maghrib').value),
                    isya: parseInt(document.getElementById('ih-isya').value)
                },
                iqomah_menit: {
                    subuh: parseInt(document.getElementById('iq-subuh').value),
                    dzuhur: parseInt(document.getElementById('iq-dzuhur').value),
                    ashar: parseInt(document.getElementById('iq-ashar').value),
                    maghrib: parseInt(document.getElementById('iq-maghrib').value),
                    isya: parseInt(document.getElementById('iq-isya').value)
                },
                // TAMBAHKAN INI DI BAWAH iqomah_menit:
                jumat: {
                    gunakan_waktu_tetap: document.getElementById('jm-gunakan-waktu-tetap').checked,
                    waktu_tetap: document.getElementById('jm-waktu-tetap').value,
                    durasi_menit: parseInt(document.getElementById('jm-durasi').value) || 45
                }
            };

            try {
                const res = await fetch('/api/config_waktu', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const out = await res.json();
                const msgEl = document.getElementById('wt-pesan');
                msgEl.innerText = out.msg;
                setTimeout(() => msgEl.innerText = "", 3000);
            } catch (err) { alert("Gagal menyimpan"); }
        });
    }
    

    // ==========================================
    // FUNGSI MESIN WAKTU (SIMULASI KIOSK)
    // ==========================================
    window.kirimPerintahSimulasi = async function(aksi) {
        let payload = { aksi: aksi };

        if (aksi === 'mulai') {
            const inputWaktu = document.getElementById('sim-waktu').value;
            if (!inputWaktu) {
                alert("Pilih tanggal dan jam simulasi terlebih dahulu!");
                return;
            }
            payload.target_timestamp = new Date(inputWaktu).getTime();
            payload.kecepatan = parseInt(document.getElementById('sim-speed').value);
        }

        try {
            const res = await fetch('/api/simulasi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            updateLabelSimulasi(data.state);
        } catch (err) {
            console.error("Gagal mengirim perintah simulasi", err);
        }
    };

    window.updateLabelSimulasi = function(state) {
        const badge = document.getElementById('status-simulasi');
        const mediaBadge = document.getElementById('status-media');
        if (state.aktif) {
            badge.style.background = '#f59e0b';
            badge.style.color = '#121212';
            badge.innerText = `🔴 SIMULASI AKTIF (${state.kecepatan}x)`;
        } else {
            badge.style.background = '#555';
            badge.style.color = 'white';
            badge.innerText = 'Status: NONAKTIF (Waktu Nyata)';
        }
        if (mediaBadge) {
            if (state.media_status === 'pause') {
                mediaBadge.style.display = 'inline-block';
                console.log("[Admin] Slide sedang dijeda.");
            } else {
                mediaBadge.style.display = 'none';
            }
        }
    };

    // Fungsi Skenario Cepat (Preset)
    window.setSkenario = async function(jenis) {
        // let targetDate = new Date(); // Default hari ini
        let targetDate = getWaktuAdminAkurat(); // Menggunakan jam server
        let speed = 5;

        try {
            if (jenis === 'dzuhur') {
                // 1. Ambil data dari /get_data
                const res = await fetch('/get_data');
                const data = await res.json();
                
                const jadwal = data.jadwal; 
                const dzuhurStr = jadwal.Dzuhur; // Menggunakan D besar sesuai JSON Anda
                
                if (dzuhurStr) {
                    const [jam, menit] = dzuhurStr.split(':');
                    targetDate.setHours(parseInt(jam), parseInt(menit), 0);
                    targetDate.setMinutes(targetDate.getMinutes() - 10);
                    speed = 10;
                } else {
                    alert("Gagal membaca jam Dzuhur dari server."); return;
                }
            } 
            else if (jenis === 'hilal') {
                const res = await fetch('/api/hilal');
                const out = await res.json();
                
                if (out.status === "success" && out.data && out.data.metadata) {
                    const tgl = out.data.metadata.tanggal_pengamatan;
                    targetDate = new Date(`${tgl}T17:35:00`);
                } 
                else if (out.status === "processing" || out.status === "inactive") {
                    if (out.status === "processing") alert("Peta Hilal sedang dilukis di latar belakang.");
                    else alert("Melompat menembus waktu ke tanggal Rukyatul Hilal berikutnya...");
                    
                    let tglFallback = out.target_date;
                    targetDate = new Date(`${tglFallback}T17:35:00`);
                } 
                else {
                    alert("Laporan Hilal belum siap."); return;
                }
            }
            else if (jenis === 'gerhana') {
                // 3. Ambil dari /api/gerhana
                const res = await fetch('/api/gerhana');
                const json = await res.json();
                
                if (json.status === "success" && json.data && json.data.length > 0) {
                    const g = json.data[0]; // Ambil gerhana terdekat di array data
                    targetDate = new Date(g.waktu.replace(' ', 'T'));
                    targetDate.setMinutes(targetDate.getMinutes() - 6);
                } else {
                    alert("Tidak ada jadwal gerhana terdekat di tahun ini."); return;
                }
            } 
            else if (jenis === 'rashdul') {
                // 4. Ambil dari /api/rashdul_qiblah
                const res = await fetch('/api/rashdul_qiblah');
                const json = await res.json();
                
                if (json.status === "success" && json.peristiwa) {
                    const dMei = new Date(json.peristiwa.mei.replace(' ', 'T'));
                    const dJuli = new Date(json.peristiwa.juli.replace(' ', 'T'));
                    // const now = new Date();
                    const now = getWaktuAdminAkurat();
                    
                    targetDate = (dMei > now) ? dMei : dJuli;
                    if (dMei < now && dJuli > now) targetDate = dJuli;
                    
                    targetDate.setMinutes(targetDate.getMinutes() - 6);
                } else {
                    alert("Gagal menarik data Rashdul Qiblah."); return;
                }
            }

            // --- TERAPKAN KE UI DAN SERVER ---
            const tzOffset = targetDate.getTimezoneOffset() * 60000; 
            const localISOTime = (new Date(targetDate - tzOffset)).toISOString().slice(0,16);
            document.getElementById('sim-waktu').value = localISOTime;
            document.getElementById('sim-speed').value = speed;
            document.getElementById('sim-speed-label').innerText = speed + 'x';
            
            // Tembak perintah ke Mesin Waktu Server
            if (typeof kirimPerintahSimulasi === 'function') {
                kirimPerintahSimulasi('mulai');
            } else {
                console.error("Fungsi kirimPerintahSimulasi tidak ditemukan!");
            }

        } catch (err) {
            console.error("Gagal menarik data skenario:", err);
            alert("Terjadi kesalahan jaringan saat menarik data dari server.");
        }
    };

    // Minta status awal saat halaman admin dibuka
    fetch('/api/simulasi').then(res => res.json()).then(data => updateLabelSimulasi(data));

    // ==========================================
    // LOGIKA PANEL 8: KALENDER JANGKAR
    // ==========================================
    const tabelJangkar = document.getElementById('tabel-jangkar-body');
    const inputTahunJangkar = document.getElementById('jangkar-tahun');
    const pesanJangkar = document.getElementById('jangkar-pesan');

    // Set default ke tahun berjalan saat ini
    if (inputTahunJangkar) {
        inputTahunJangkar.value = new Date().getFullYear();
    }

    // Fungsi utama menarik dan menggambar tabel
    window.muatDataJangkar = async function(forceRebuild = false) {
        if (!tabelJangkar || !inputTahunJangkar) return;
        
        const tahun = inputTahunJangkar.value;
        if (!tahun) { alert("Masukkan tahun terlebih dahulu!"); return; }

        if (forceRebuild) {
            const konfirmasi = confirm(`PERINGATAN!\n\nMenghitung ulang basis data Astronomi (Ephemeris) untuk 12 bulan di tahun ${tahun} akan memakan tenaga CPU server dan butuh waktu 10-30 detik.\n\nKiosk TV di depan mungkin akan sedikit lambat selama proses ini. Lanjutkan?`);
            if (!konfirmasi) return;
        }

        pesanJangkar.style.color = "yellow";
        pesanJangkar.innerHTML = forceRebuild ? `⏳ Engine Astronomi sedang merender ulang data ${tahun}. Memakan waktu 10-30 detik, mohon bersabar...` : `⏳ Menarik data kalender ${tahun} dari server...`;
        tabelJangkar.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 40px; font-size: 16px; color:#ffd700;">⚙️ Memproses perhitungan benda langit...</td></tr>';

        try {
            // 1. MULAI STOPWATCH
            const waktuMulai = performance.now(); 

            const url = `/api/kalender_jangkar/${tahun}${forceRebuild ? '?force=true' : ''}`;
            const res = await fetch(url);
            
            if (!res.ok) throw new Error("Gagal mengambil/membuat file kalender.");
            
            const data = await res.json();
            
            // 2. HENTIKAN STOPWATCH
            const waktuSelesai = performance.now(); 
            
            // 3. HITUNG DURASI (Konversi milidetik ke detik dengan 2 angka di belakang koma)
            const durasiDetik = ((waktuSelesai - waktuMulai) / 1000).toFixed(2);
            
            // 4. BUAT LABEL EDUKASI (Warna berbeda untuk baca vs hitung ulang)
            const labelDurasi = forceRebuild 
                ? `<span style="color: #fb923c; font-size: 12px; margin-left: 10px; border: 1px solid #fb923c; padding: 2px 6px; border-radius: 4px;">⏱️ Dihitung dalam: ${durasiDetik} detik</span>`
                : `<span style="color: #9ca3af; font-size: 12px; margin-left: 10px;">⚡ Dimuat dalam: ${durasiDetik} dtk</span>`;

            if (!data || !data.jangkar_bulan) throw new Error("Format JSON tidak valid.");

            pesanJangkar.style.color = "#00ff88";
            pesanJangkar.innerHTML = `✅ Data Kalender ${tahun} berhasil dimuat. (Koordinat Acuan: ${data.lokasi_masjid?.kota || 'Sistem'}) ${labelDurasi}`;

            tabelJangkar.innerHTML = '';
            
            data.jangkar_bulan.forEach(item => {
                const kep = item.keputusan_metode;
                
                // 1. Ambil tanggal mentah HANYA untuk logika kesepakatan (If/Else)
                const mbm_date = kep['NASIONAL_MABIMS']?.tgl_1 || '-';
                const wh_date = kep['NASIONAL_WH']?.tgl_1 || '-';
                const khgt_date = kep['GLOBAL_KHGT']?.tgl_1 || '-';

                // 2. Fungsi Perakit Micro-Typography (Tanggal + Umur Bulan + Tooltip)
                const renderSel = (dataMetode) => {
                    if (!dataMetode || !dataMetode.tgl_1) return '-';
                    
                    // Membuat Tooltip (Teks saat di-hover) dari backend JSON
                    let tooltipText = `Status: ${dataMetode.status}`;
                    if (dataMetode.detail) tooltipText += `\nDetail: ${dataMetode.detail}`;
                    
                    // Tanggal diberi garis bawah putus-putus kecil sebagai tanda bisa di-hover
                    let html = `<div style="font-size: 14px; cursor: help; border-bottom: 1px dotted #888; display: inline-block;" title="${tooltipText}">${dataMetode.tgl_1}</div>`;
                    
                    if (dataMetode.umur_bulan) {
                        let ikon = dataMetode.umur_bulan === 30 ? '🌕' : '🌙';
                        let warnaTeks = dataMetode.umur_bulan === 30 ? '#ffd700' : '#00ff88'; // Emas untuk 30, Hijau untuk 29
                        
                        // HILANGKAN TEKS ISTIKMAL DI SINI, CUKUP ANGKA HARINYA SAJA
                        html += `<div style="font-size: 11.5px; margin-top: 4px; color: #888; font-weight: normal; letter-spacing: 0.5px;">
                                    <span style="color: ${warnaTeks}; opacity: 0.8;">${ikon}</span> ${dataMetode.umur_bulan} hari
                                 </div>`;
                    }
                    return html;
                };

                // Rakit HTML untuk masing-masing kolom
                const mbm_html = renderSel(kep['NASIONAL_MABIMS']);
                const wh_html = renderSel(kep['NASIONAL_WH']);
                const khgt_html = renderSel(kep['GLOBAL_KHGT']);

                // --- 3. LOGIKA IJTIMA & RUKYAT (KOLOM BARU) ---
                const ijtimaUTC = item.data_astronomi?.ijtima_utc;
                let ijtimaHtml = '-';
                
                if (ijtimaUTC) {
                    // Beri tahu JS bahwa ini adalah waktu UTC dengan menambahkan 'Z' di belakangnya
                    const d = new Date(ijtimaUTC.replace(' ', 'T') + 'Z');
                    
                    // Format output menjadi bahasa Indonesia (Contoh: 20 Des 2025)
                    const tglLokal = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
                    // Format jam dan menit (Contoh: 08:43)
                    const jamLokal = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

                    ijtimaHtml = `
                        <div style="font-size: 13px; font-weight: bold; color: #a855f7;">${tglLokal}</div>
                        <div style="font-size: 11.5px; margin-top: 4px; color: #888;">
                            🔭 Jam ${jamLokal}
                        </div>
                    `;
                }

                // --- DETEKSI KESEPAKATAN CERDAS (Menggunakan mbm_date murni, bukan HTML) ---
                let isSepakatLokal = (mbm_date === wh_date && mbm_date !== '-'); 
                let isSepakatGlobal = (isSepakatLokal && wh_date === khgt_date); 

                let badgeSepakat = '';
                if (isSepakatGlobal) {
                    badgeSepakat = '<span style="background: rgba(16,185,129,0.2); color: #10b981; border: 1px solid #10b981; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: bold;">✅ SEPAKAT BERSAMA</span>';
                } else if (isSepakatLokal) {
                    badgeSepakat = '<span style="background: rgba(59,130,246,0.2); color: #3b82f6; border: 1px solid #3b82f6; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: bold;">☑️ SEPAKAT NASIONAL</span>';
                } else {
                    badgeSepakat = '<span style="background: rgba(239,68,68,0.2); color: #ef4444; border: 1px solid #ef4444; padding: 4px 10px; border-radius: 12px; font-size: 11px; font-weight: bold;">⚠️ POTENSI BEDA</span>';
                }

                // --- HIGHLIGHT MERAH JIKA BEDA DENGAN MABIMS ---
                const styleWH = (wh_date !== mbm_date) ? 'color: #ef4444; font-weight: bold; background: rgba(239,68,68,0.1);' : 'color: #ddd;';
                const styleKHGT = (khgt_date !== mbm_date) ? 'color: #ef4444; font-weight: bold; background: rgba(239,68,68,0.1);' : 'color: #ddd;';

                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                tr.innerHTML = `
                    <td style="padding: 10px; color: #00ff88; font-weight: bold; font-size: 15px; vertical-align: top;">${item.bulan_hijriah}</td>
                    <td style="padding: 10px; border-left: 1px solid #333; color: #ddd; vertical-align: top;">${mbm_html}</td>
                    <td style="padding: 10px; border-left: 1px solid #333; vertical-align: top; ${styleWH}">${wh_html}</td>
                    <td style="padding: 10px; border-left: 1px solid #333; vertical-align: top; ${styleKHGT}">${khgt_html}</td>
                    
                    <td style="padding: 10px; border-left: 1px solid #333; vertical-align: top;">${ijtimaHtml}</td>
                    
                    <td style="padding: 10px; text-align: center; border-left: 1px solid #333; vertical-align: middle;">${badgeSepakat}</td>
                `;
                tabelJangkar.appendChild(tr);
            });

        } catch (e) {
            pesanJangkar.style.color = "#ef4444";
            pesanJangkar.innerHTML = `❌ Gagal: ${e.message}`;
            tabelJangkar.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px; color:#888;">Terjadi kesalahan saat menghubungi server.</td></tr>';
        }
    };

    // Auto-click "Muat Data" saat tab Kalender Jangkar dibuka pertama kali
    document.querySelector('a[data-target="panel-jangkar"]')?.addEventListener('click', () => {
        if (tabelJangkar && tabelJangkar.innerHTML.includes('Silakan klik')) {
            muatDataJangkar(false);
        }
    });

    // ==========================================
    // LOGIKA PANEL EXTRA: PRATINJAU KALENDER KIOSK
    // ==========================================
    let adminCalYear = new Date().getFullYear();
    let adminCalMonth = new Date().getMonth();
    let adminCalJangkar = null;
    let adminCalEvents = { masehi_rutin: {}, hijriah_rutin: {}, insidentil_spesifik: {} };

    // Saat menu Pratinjau Kalender diklik, muat data
    document.querySelector('a[data-target="panel-kalender-kiosk"]')?.addEventListener('click', () => {
        loadAdminCalendarData();
    });

    // Event Tombol Geser Bulan
    document.getElementById('btn-prev-month')?.addEventListener('click', () => {
        adminCalMonth--;
        if (adminCalMonth < 0) { adminCalMonth = 11; adminCalYear--; adminCalJangkar = null; }
        loadAdminCalendarData();
    });

    document.getElementById('btn-next-month')?.addEventListener('click', () => {
        adminCalMonth++;
        if (adminCalMonth > 11) { adminCalMonth = 0; adminCalYear++; adminCalJangkar = null; }
        loadAdminCalendarData();
    });

    // Fungsi Pembuat Ikon Fase Bulan (Diadaptasi dari script.js)
    function getMoonPhaseIcon(hijriDateNum) {
        const d = parseInt(hijriDateNum);
        if (isNaN(d) || d < 1 || d > 30) return "";

        const size = 16; // Diperkecil sedikit untuk admin panel (Kiosk pakai 20)
        let phase = d / 30.0; 
        let sweep = "";
        let mag = Math.cos(2 * Math.PI * phase); 

        if (phase <= 0.5) {
            sweep = `M 50,0 A 50,50 0 0,0 50,100 A ${Math.abs(mag * 50)},50 0 0,${mag < 0 ? 0 : 1} 50,0`;
        } else {
            sweep = `M 50,0 A 50,50 0 0,1 50,100 A ${Math.abs(mag * 50)},50 0 0,${mag < 0 ? 1 : 0} 50,0`;
        }

        // ID Unik agar tidak bentrok antar sel kalender
        const uniqueId = `moonMask-admin-${d}-${Math.floor(Math.random() * 10000)}`;

        return `
            <svg width="${size}" height="${size}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0px 0px 4px rgba(255,255,255,0.3));">
                <defs>
                    <mask id="${uniqueId}">
                        <path d="${sweep}" fill="white" />
                    </mask>
                </defs>
                <image href="/static/images/moon200.png" width="100" height="100" opacity="0.15" />
                <image href="/static/images/moon200.png" width="100" height="100" mask="url(#${uniqueId})" />
            </svg>
        `;
    }

    async function loadAdminCalendarData() {
        const grid = document.getElementById('admin-calendar-wrapper');
        if (!grid) return;
        grid.innerHTML = '<div style="grid-column: span 7; text-align: center; padding: 40px; color: #00ff88;">Memuat data Astronomi...</div>';

        try {
            // Muat Event
            const resEvent = await fetch('/api/json_data/event');
            if (resEvent.ok) adminCalEvents = await resEvent.json();

            // Muat Jangkar Tahun tersebut (Hanya fetch jika tahun berganti / belum ada)
            if (!adminCalJangkar || adminCalJangkar.tahun_masehi !== adminCalYear) {
                const resJangkar = await fetch(`/api/kalender_jangkar/${adminCalYear}`);
                if (resJangkar.ok) adminCalJangkar = await resJangkar.json();
            }

            renderAdminCalendar();
        } catch (e) {
            console.error("Gagal muat pratinjau kalender", e);
            grid.innerHTML = '<div style="grid-column: span 7; text-align: center; color: red;">Gagal memuat data.</div>';
        }
    }

    function renderAdminCalendar() {
        const grid = document.getElementById('admin-calendar-wrapper');
        grid.innerHTML = "";

        const namaBulanIndo = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
        document.getElementById('admin-cal-masehi').innerText = `${namaBulanIndo[adminCalMonth]} ${adminCalYear}`;

        const daysInMonth = new Date(adminCalYear, adminCalMonth + 1, 0).getDate();
        const firstDayOfMonth = new Date(adminCalYear, adminCalMonth, 1).getDay();

        // Slot kosong di awal bulan
        for (let i = 0; i < firstDayOfMonth; i++) {
            const emptyDiv = document.createElement('div');
            grid.appendChild(emptyDiv);
        }

        let firstHijri = "", lastHijri = "", currentHijriYear = "";
        let firstJawa = "", lastJawa = "", currentJawaYear = "";
        let infoJawaAdmin = null;
        const now = new Date();
        const isThisMonth = (now.getFullYear() === adminCalYear && now.getMonth() === adminCalMonth);

        for (let day = 1; day <= daysInMonth; day++) {
            const currentDate = new Date(adminCalYear, adminCalMonth, day);
            const hariKe = currentDate.getDay();
            
            // 1. Ambil Pasaran (Pakai logika UTC agar aman)
            const pasaran = (function(d) {
                const pasaranArr = ["Legi", "Pahing", "Pon", "Wage", "Kliwon"];
                const utcMidnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());        
                return pasaranArr[(Math.floor(utcMidnight / 86400000) + 3) % 5];
            })(currentDate);

            // 2. Ambil Hijriah
            let infoH = null;
            if (adminCalJangkar) {
                // Gunakan pencarian sederhana
                for (let i = 0; i < adminCalJangkar.jangkar_bulan.length - 1; i++) {
                    let d1_str = adminCalJangkar.jangkar_bulan[i].keputusan_metode["NASIONAL_MABIMS"].tgl_1;
                    let d2_str = adminCalJangkar.jangkar_bulan[i+1].keputusan_metode["NASIONAL_MABIMS"].tgl_1;
                    let d1 = new Date(d1_str); d1.setHours(0,0,0,0);
                    let d2 = new Date(d2_str); d2.setHours(0,0,0,0);
                    
                    if (currentDate >= d1 && currentDate < d2) {
                        let tglH = Math.round((currentDate - d1) / 86400000) + 1;
                        let blnH = adminCalJangkar.jangkar_bulan[i].bulan_hijriah.replace(/\s\d{4}\sH/g, '').trim();
                        let thnH = "1447 H";
                        let matchTahun = adminCalJangkar.jangkar_bulan[i].bulan_hijriah.match(/\d{4}\sH/);
                        if (matchTahun) thnH = matchTahun[0];
                        
                        infoH = { tgl: tglH, bulan: blnH, tahun: thnH };
                        break;
                    }
                }
            }

            // Catat Header Hijriah
            if (infoH) {
                if (day === 1) { firstHijri = infoH.bulan; currentHijriYear = infoH.tahun; }
                if (day === daysInMonth) lastHijri = infoH.bulan;
            }

            // 3. Gabungkan Event
            let htmlEvent = "";
            const tglMasehiKey = `${String(day).padStart(2, '0')} ${namaBulanIndo[adminCalMonth]}`;
            const tglInsidentilKey = `${adminCalYear}-${String(adminCalMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            const addEv = (val, color="#3b82f6") => {
                if(Array.isArray(val)) val.forEach(v => htmlEvent += `<div class="admin-event" style="color:${color}; border-left:2px solid ${color};">${v}</div>`);
                else if(val) htmlEvent += `<div class="admin-event" style="color:${color}; border-left:2px solid ${color};">${val}</div>`;
            };

            if (adminCalEvents.masehi_rutin) addEv(adminCalEvents.masehi_rutin[tglMasehiKey]);
            if (adminCalEvents.insidentil_spesifik) addEv(adminCalEvents.insidentil_spesifik[tglInsidentilKey], "#eab308");
            
            let isPuasa = false;
            if (infoH) {
                const tglHijriKey = `${infoH.tgl} ${infoH.bulan}`;
                if (adminCalEvents.hijriah_rutin) addEv(adminCalEvents.hijriah_rutin[tglHijriKey], "#10b981");

                // Cek Puasa Sunnah/Wajib untuk UI
                let blnLC = infoH.bulan.toLowerCase();
                let isHaram = (blnLC.includes("syawal") && infoH.tgl === 1) || (blnLC.includes("dzulhijjah") && infoH.tgl >= 10 && infoH.tgl <= 13);
                if (!isHaram) {
                    if (blnLC.includes("ramadhan")) isPuasa = true;
                    else if (hariKe === 1 || hariKe === 4 || (infoH.tgl >= 13 && infoH.tgl <= 15) || (blnLC.includes("dzulhijjah") && infoH.tgl === 9) || (blnLC.includes("muharram") && (infoH.tgl===9||infoH.tgl===10))) isPuasa = true;
                }
            }

            let ikonPuasa = isPuasa ? `<span style="color: #eb4236; font-size: 10px; margin-left: 4px;">🍽️</span>` : "";
            let textHijri = infoH ? `${infoH.tgl} ${infoH.bulan.substring(0,3)}` : "-";
            let iconBulanHtml = infoH ? getMoonPhaseIcon(infoH.tgl) : "";

            const infoJawa = window.KalenderJawa ? window.KalenderJawa.getInfoUrfi(currentDate) : null;
            let textJawa = "-";

            if (infoJawa && !infoJawa.error) {
                if (day === 1) { firstJawa = infoJawa.sasi; currentJawaYear = infoJawa.tahunAngka; }
                if (day === 15) { infoJawaAdmin = infoJawa; }
                if (day === daysInMonth) { lastJawa = infoJawa.sasi; if(!infoJawaAdmin) infoJawaAdmin = infoJawa; }
                
                textJawa = `${infoJawa.tanggal} ${infoJawa.sasi.substring(0,3)}`;
            }

            // Buat Elemen DOM
            const dayDiv = document.createElement('div');
            dayDiv.className = 'admin-cal-day';
            if (hariKe === 0) dayDiv.classList.add('ahad');
            if (hariKe === 5) dayDiv.classList.add('jumat');
            if (isThisMonth && day === now.getDate()) dayDiv.classList.add('today');

            dayDiv.innerHTML = `
                <div class="admin-tgl-masehi">
                    <span>${day} <span class="admin-pasaran">${pasaran}</span> ${ikonPuasa}</span> <span style="margin-top: -2px;">${iconBulanHtml}</span>
                </div>
                <div style="flex-grow: 1; margin-top: 5px;">${htmlEvent}</div>
                <div style="display: flex; justify-content: space-between; margin-top: 5px; align-items: flex-end;">
                    <div class="admin-tgl-hijri">${textHijri}</div>
                    <div class="admin-tgl-jawa">${textJawa}</div>
                </div>
            `;
            grid.appendChild(dayDiv);
        }

        // Update Judul Hijriah Atas
        let judulH = firstHijri;
        if (firstHijri !== lastHijri) judulH += ` - ${lastHijri}`;
        document.getElementById('admin-cal-hijri').innerText = `${judulH} ${currentHijriYear}`;

        // --- TAMBAHAN UPDATE HEADER JAWA ---
        let judulJawa = firstJawa;
        if (firstJawa !== lastJawa && lastJawa !== "") judulJawa += ` - ${lastJawa}`;
        judulJawa += ` ${currentJawaYear} J`;

        const elJawa = document.getElementById('admin-cal-jawa');
        if (elJawa) elJawa.innerText = judulJawa;

        const elJawaInfo = document.getElementById('admin-cal-jawa-info');
        if (elJawaInfo && infoJawaAdmin) {
            elJawaInfo.innerText = `Warsa ${infoJawaAdmin.tahunNama} • Windu ${infoJawaAdmin.namaWindu}, Lambang ${infoJawaAdmin.lambangWindu} • Kurup ${infoJawaAdmin.kurup.split(' ')[0]}`;
        }
    }

    // ==========================================
    // LOGIKA PANEL TRI-STATE DISPLAY (ADMIN)
    // ==========================================
    
    // Fungsi menggambar input waktu HTML
    window.tambahBarisWaktu = function(containerId, startVal = "00:00", endVal = "00:00") {
        const container = document.getElementById(containerId);
        if (!container) return;

        const row = document.createElement('div');
        row.style.display = "flex";
        row.style.gap = "10px";
        row.style.alignItems = "center";
        
        row.innerHTML = `
            <input type="time" class="time-input start-time" value="${startVal}" style="padding: 8px; border-radius: 5px; border: 1px solid #334155; background: #1e293b; color: white;">
            <span>s/d</span>
            <input type="time" class="time-input end-time" value="${endVal}" style="padding: 8px; border-radius: 5px; border: 1px solid #334155; background: #1e293b; color: white;">
            <button onclick="this.parentElement.remove()" style="background: #ef4444; color: white; border: none; padding: 8px; border-radius: 5px; cursor: pointer; font-weight: bold;">X</button>
        `;
        container.appendChild(row);
    };

    // Fungsi pengumpul data dari form untuk disave
    function kumpulkanDataWaktu(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return [];
        const rows = container.querySelectorAll('div');
        let data = [];
        rows.forEach(row => {
            const start = row.querySelector('.start-time').value;
            const end = row.querySelector('.end-time').value;
            if (start && end) data.push({ start: start, end: end });
        });
        return data;
    }

    // Aksi saat tombol "Simpan Pengaturan Layar" ditekan
    const btnSaveDisplay = document.getElementById('btn-save-display');
    if (btnSaveDisplay) {
        btnSaveDisplay.addEventListener('click', async function() {
            const isEnabled = document.getElementById('toggle-tristate').checked;
            const blackoutData = kumpulkanDataWaktu('list-blackout');
            const screensaverData = kumpulkanDataWaktu('list-screensaver');

            const displayConfig = {
                tri_state_enabled: isEnabled,
                blackout: blackoutData,
                screensaver: screensaverData
            };

            const pesanEl = document.getElementById('pesan-tristate');
            if (pesanEl) { pesanEl.style.color = "yellow"; pesanEl.innerText = "Menyimpan..."; }

            try {
                // Tembak langsung ke API Config di app.py
                const res = await fetch('/api/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ display_settings: displayConfig })
                });
                
                if (pesanEl) {
                    pesanEl.style.color = res.ok ? "#00ff88" : "#ef4444";
                    pesanEl.innerText = res.ok ? "✅ Pengaturan layar berhasil disimpan!" : "❌ Gagal menyimpan.";
                    setTimeout(() => { pesanEl.innerText = ""; }, 3000);
                }
            } catch (e) {
                if (pesanEl) { pesanEl.style.color = "#ef4444"; pesanEl.innerText = "❌ Terjadi kesalahan jaringan."; }
            }
        });
    }

    // ==========================================
    // LOGIKA PANEL KEUANGAN MASJID
    // ==========================================
    const formKas = document.getElementById('form-keuangan');
    if (formKas) {
        // Load data saat halaman dibuka
        fetch('/api/config').then(r => r.json()).then(data => {
            if(data.keuangan) {
                document.getElementById('kas-tampilkan').checked = data.keuangan.tampilkan;
                document.getElementById('kas-tanggal').value = data.keuangan.tanggal_laporan || '';
                document.getElementById('kas-awal').value = data.keuangan.saldo_awal || 0;
                document.getElementById('kas-masuk').value = data.keuangan.pemasukan || 0;
                document.getElementById('kas-keluar').value = data.keuangan.pengeluaran || 0;
            }
        });

        // Simpan data
        formKas.addEventListener('submit', async (e) => {
            e.preventDefault();
            const msgKas = document.getElementById('pesan-kas');
            msgKas.style.color = "yellow"; msgKas.innerText = "Menyimpan...";
            
            const payload = {
                keuangan: {
                    tampilkan: document.getElementById('kas-tampilkan').checked,
                    tanggal_laporan: document.getElementById('kas-tanggal').value,
                    saldo_awal: parseInt(document.getElementById('kas-awal').value) || 0,
                    pemasukan: parseInt(document.getElementById('kas-masuk').value) || 0,
                    pengeluaran: parseInt(document.getElementById('kas-keluar').value) || 0
                }
            };

            try {
                const res = await fetch('/api/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                msgKas.style.color = res.ok ? "#00ff88" : "#ef4444";
                msgKas.innerText = res.ok ? "Laporan berhasil disimpan!" : "Gagal menyimpan.";
                setTimeout(() => msgKas.innerText = "", 3000);
            } catch (err) {
                msgKas.style.color = "#ef4444"; msgKas.innerText = "Kesalahan jaringan.";
            }
        });
    }

    // ==========================================
    // LOGIKA TOMBOL REFRESH LAYAR TV
    // ==========================================
    const btnRefresh = document.getElementById('btn-refresh-tv');
    
    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
            btnRefresh.innerText = "⏳ Memerintahkan TV...";
            btnRefresh.disabled = true;
            
            // Gunakan fungsi yang sudah ada untuk menembak /api/simulasi
            kirimPerintahSimulasi('refresh_layar');

            setTimeout(() => {
                btnRefresh.innerText = "✅ Perintah Terkirim! (TV akan berkedip)";
                btnRefresh.style.background = "#00ff88";
                btnRefresh.style.color = "#121212";
                
                // Kembalikan ke warna asli (misal oranye) setelah 3 detik
                setTimeout(() => {
                    btnRefresh.innerText = "🔄 Refresh Layar TV";
                    btnRefresh.style.background = "#f59e0b";
                    btnRefresh.style.color = "white";
                    btnRefresh.disabled = false;
                }, 3000);
            }, 500);
        });
    }

    // ==========================================
    // DETAK JANTUNG & PENDETEKSI TENDANGAN SUPERADMIN
    // ==========================================
    setInterval(async () => {
        try {
            const res = await fetch('/api/heartbeat', { method: 'POST' });
            if (!res.ok) {
                const data = await res.json();
                if (data.status === "kicked") {
                    // Munculkan popup keras dan usir ke halaman login
                    alert("⚠️ PERINGATAN DARURAT!\n\nSesi Anda telah diputus karena Superadmin masuk ke dalam sistem dari perangkat lain.");
                    window.location.href = '/login?kicked=1';
                }
            }
        } catch (e) {
            // Abaikan jika hanya error jaringan sesaat (misal wifi putus 1 detik)
            console.log("Heartbeat terlewat...");
        }
    }, 10000); // Berdetak setiap 10 detik

    loadQariList();

    fetch('/api/list_qari') // list_qari tidak cukup, kita butuh config. Kita bisa intip lewat API lain atau buat baru
    .then(() => {
        // Karena config.json sudah dikirim lewat template Flask (biasanya), 
        // Anda bisa langsung mengambilnya jika app.py mengirimkan variabel config.
        // Jika tidak, kita bisa tambahkan fetch config di sini.
    });

});

// Fungsi untuk memuat daftar Qari dari server
// Memuat daftar Qari dengan tombol Pilih/Aktif
async function loadQariList() {
    try {
        const response = await fetch('/api/list_qari');
        const data = await response.json();
        const tbody = document.getElementById('list-qari-body');
        if(!tbody) return;
        tbody.innerHTML = '';

        data.forEach(qari => {
            const statusClass = qari.has_metadata ? 'status-ok' : 'status-warning';
            const statusText = qari.has_metadata ? '✓ Ready' : '⚠ Perlu Proses';
            
            // Logika tombol aktif
            const activeBtnClass = qari.is_active ? 'btn-active-now' : 'btn-select';
            const activeBtnText = qari.is_active ? '✓ Aktif' : 'Pilih';
            const activeDisabled = qari.is_active ? 'disabled' : '';

            tbody.innerHTML += `
                <tr>
                    <td><strong>${qari.name}</strong></td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                    <td>
                        <button onclick="handleSetActiveQari('${qari.name}')" class="btn-action ${activeBtnClass}" ${activeDisabled}>${activeBtnText}</button>
                        <button onclick="handleProcessMetadata('${qari.name}')" class="btn-action btn-process">Proses Metadata</button>
                        <button onclick="handleDeleteQari('${qari.name}')" class="btn-action btn-delete">Hapus</button>
                    </td>
                </tr>
            `;
        });
    } catch (e) {
        console.error("Gagal memuat daftar Qari", e);
    }
}

// Fungsi untuk menentukan Qari Aktif
async function handleSetActiveQari(qariName) {
    try {
        const response = await fetch('/api/update_config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                audio_settings: { qari_aktif: qariName } 
            })
        });
        const res = await response.json();
        if(res.status === 'success') {
            loadQariList(); // Segarkan tabel
        }
    } catch (e) {
        alert("Gagal mengaktifkan Qari.");
    }
}

// Fungsi Unggah Berkas ZIP
async function handleUploadQari() {
    const nameInput = document.getElementById('input-qari-name');
    const zipInput = document.getElementById('input-qari-zip');
    const statusDiv = document.getElementById('upload-status');

    if (!nameInput.value || !zipInput.files[0]) {
        alert("Mohon isi nama Qari dan pilih file ZIP.");
        return;
    }

    const formData = new FormData();
    formData.append('qari_name', nameInput.value);
    formData.append('file', zipInput.files[0]);

    statusDiv.innerText = "⏳ Sedang mengunggah dan mengekstrak... Mohon tunggu.";
    
    try {
        const response = await fetch('/api/upload_qari', {
            method: 'POST',
            body: formData
        });
        const res = await response.json();
        
        if (res.status === 'success') {
            statusDiv.innerText = "✅ " + res.msg;
            nameInput.value = '';
            zipInput.value = '';
            loadQariList();
        } else {
            statusDiv.innerText = "❌ " + res.msg;
        }
    } catch (e) {
        statusDiv.innerText = "❌ Terjadi kesalahan jaringan.";
    }
}

// Memicu pembangunan master JSON untuk Qari
async function handleProcessMetadata(qariName) {
    if (!confirm(`Bangun ulang metadata untuk ${qariName}? Ini akan memindai durasi setiap ayat.`)) return;

    try {
        const response = await fetch('/api/proses_metadata_qari', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ qari_name: qariName })
        });
        const res = await response.json();
        alert(res.msg);
        loadQariList();
    } catch (e) {
        alert("Gagal memproses metadata.");
    }
}

// Sinkronisasi Pengaturan ke config.json
async function updateAudioSettings() {
    const settings = {
        tarhim_aktif: document.getElementById('audio-tarhim-aktif').value === 'true',
        target_durasi_menit: parseInt(document.getElementById('audio-target-durasi').value),
        toleransi_tamat_menit: parseInt(document.getElementById('audio-toleransi-tamat').value)
    };

    // Kita gunakan endpoint update_config yang sudah ada di app.py Anda
    try {
        await fetch('/api/update_config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audio_settings: settings })
        });
        console.log("Audio settings updated");
    } catch (e) {
        console.error("Gagal update config", e);
    }
}

// Panggil saat halaman dimuat
document.addEventListener('DOMContentLoaded', () => {
    loadQariList();
});