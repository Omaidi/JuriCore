# JURI PRO 2.0 (Redesigned)

Aplikasi penilaian lomba online dengan desain premium dan koneksi Realtime Firebase.

## Cara Menjalankan
1. Pastikan internet aktif (untuk memuat Firebase & Font).
2. Klik 2x pada file `start_app.bat`.
3. Browser akan otomatis terbuka.

## Fitur Baru
- **Desain Glassmorphism**: Tampilan modern dan elegan.
- **Sistem Modul**: Kode lebih rapi dan cepat.
- **Login Tabs**: Pemisahan jelas antara Admin dan Juri.
- **Realtime Sync**: Nilai langsung terupdate tanpa refresh.
- **PDF Export**: Download klasemen otomatis.

## Konfigurasi
Akses database masih menggunakan konfigurasi lama Anda (Firebase juripro-c9713).
Jangan mengubah file `assets/js/firebase-config.js` kecuali Anda pindah database.

## Troubleshooting
Jika browser tidak menampilkan apa-apa, pastikan Anda menjalankannya melalui `start_app.bat` (Localhost), bukan klik kanan open file (File Protocol), karena browser modern memblokir Module Script pada protokol file biasa.
