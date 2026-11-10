# Jejak Kerja

Tracker kerjaan pribadi dalam satu file HTML (`index.html`). Tidak ada instalasi, tidak ada build, tidak ada server.

Isinya:

- Task dengan langkah-langkah (Review 1, Review 2, Draft report, dst), masing-masing punya status sendiri: Belum mulai, Berjalan, Hold, Selesai.
- Prioritas (proyek mana duluan) dan hasil penilaian akhir (Low / Medium / High).
- Kalender bulanan, tanggal mulai dan selesai, catatan harian.
- Kartu "Terakhir selesai" dan "Berikutnya" di tab Ringkas.

## Cara membuka (paling mudah)

1. Simpan `index.html` di folder mana saja, mis. `Documents/jejak-kerja/`.
2. Klik dua kali `index.html`. Halaman terbuka di browser (Chrome, Edge, Firefox, atau Safari).
3. Klik **+ Task baru**.

Tips: buka dengan **Ctrl+D** (Cmd+D di Mac) untuk bookmark, supaya gampang dicari.

Butuh internet? Hanya untuk font dari Google Fonts. Tanpa internet halaman tetap jalan dengan font bawaan sistem.

## Cara membuka lewat server lokal (opsional)

Kalau punya Python, buka terminal di folder ini lalu:

```bash
python3 -m http.server 8000
```

Buka `http://localhost:8000` di browser. Hentikan dengan Ctrl+C.

Catatan: data tersimpan per alamat. Data di `file:///...index.html` dan di `http://localhost:8000` tidak saling terlihat.

## Cara menaruh di GitHub Pages (biar bisa dibuka dari mana saja)

Lewat web, tanpa terminal:

1. Di GitHub, klik **New repository**, beri nama `jejak-kerja`, pilih **Public**, klik **Create repository**.
2. Klik **uploading an existing file**, tarik `index.html` (dan `README.md`), lalu **Commit changes**.
3. Buka **Settings → Pages**. Di bagian *Build and deployment*, pilih **Deploy from a branch**, branch `main`, folder `/ (root)`, klik **Save**.
4. Tunggu 1 sampai 2 menit. Alamatnya: `https://USERNAME.github.io/jejak-kerja/` (ganti `USERNAME` dengan nama akun GitHub kamu).

Lewat terminal:

```bash
cd jejak-kerja
git init
git add index.html README.md
git commit -m "Jejak Kerja"
git branch -M main
git remote add origin https://github.com/USERNAME/jejak-kerja.git
git push -u origin main
```

Lalu lanjut ke langkah 3 di atas.

Soal privasi: yang publik hanya kodenya. Task yang kamu isi tetap tersimpan di browser kamu sendiri dan tidak dikirim ke mana pun. Jadi jangan menulis password atau data rahasia langsung di kodenya. Repository private biasanya butuh paket GitHub berbayar agar Pages bisa aktif.

## Di mana data tersimpan

Di `localStorage` browser, dengan kunci `jejak-kerja-v1`.

- Data hanya ada di browser dan perangkat yang kamu pakai. Pindah browser atau perangkat, datanya tidak ikut.
- Kalau kamu menghapus data situs atau cache browser, task ikut hilang.
- Versi ini tidak punya fitur upload lampiran. Fitur itu hanya ada di versi yang dihosting di Claude.

### Backup dan pindah data (manual)

Buka halaman Jejak Kerja, tekan F12, buka tab **Console**, lalu:

Ambil data (hasilnya masuk clipboard, tempel ke file teks sebagai cadangan):

```js
copy(localStorage.getItem('jejak-kerja-v1'))
```

Kembalikan data di browser lain (ganti `...` dengan isi cadangan, tetap di dalam tanda petik tunggal), lalu muat ulang halaman:

```js
localStorage.setItem('jejak-kerja-v1', '...')
```

Cadangan rutin disarankan, misalnya seminggu sekali.

## Struktur kode

Semua ada di satu file `index.html`, urutannya:

1. `<style>`: warna di blok `:root` paling atas (ada versi terang dan gelap), lalu gaya tiap bagian.
2. Kerangka halaman: header, tab, area `#view`.
3. `<script>`:
   - Helper tanggal dan teks.
   - Konstanta pilihan: `ST` (status), `KIND` (jenis), `PRI` (prioritas), `RES` (hasil penilaian). Ubah label atau tambah pilihan di sini.
   - Penyimpanan: `put`, `patch`, `del`, `localLoad`, `localSave`. Kalau nanti mau ganti penyimpanan ke server atau database, ubah bagian ini dan `init()` di bagian bawah.
   - Logika task dan langkah (`aggStatus`, `stepsPatch`, `lastDone`).
   - Tampilan: `viewHome`, `viewList`, `viewCal`, lalu `openModal` untuk form detail task.
   - Event handler di bagian paling bawah.

## Struktur data satu task

```json
{
  "id": "t1abc",
  "title": "Laporan evaluasi vendor",
  "kind": "report",
  "status": "doing",
  "priority": "high",
  "result": "mid",
  "planStart": "2026-11-03",
  "planEnd": "2026-11-20",
  "startedAt": "2026-11-03T02:00:00.000Z",
  "doneAt": "",
  "nextNote": "Meeting dulu, lalu detil temuan, lalu draft report.",
  "notes": "",
  "steps": [
    { "id": "s1", "title": "Review 1", "status": "done", "startedAt": "...", "doneAt": "..." }
  ],
  "log": [{ "t": "2026-11-04T09:00:00.000Z", "text": "Catatan", "auto": false }],
  "files": []
}
```

Kalau sebuah task punya langkah, status task dihitung otomatis dari status langkah-langkahnya.
