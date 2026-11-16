# ThreadScout — Universal Intent Finder (Chrome Extension MV3)

Ekstensi Chrome (Manifest V3) untuk membantu penjual produk atau penyedia jasa apa pun menemukan calon pembeli/klien yang sedang aktif mencari kebutuhan mereka di **Threads** cukup dengan memasukkan **Prompt Konteks Jualan** dalam satu `textarea`.

---

## Fitur Utama

1. **Input Prompt Universal (`textarea`):**
   - Cukup ketik bebas apa yang sedang kamu jual dan siapa target pembelinya (misal: *Jasa pembuatan website UMKM*, *Fotografer Wedding*, *Jual MacBook second COD*, *Properti/Rumah*, *Katering Harian*, dll).
   - Dilengkapi tombol **Contoh Cepat** untuk inspirasi satu klik.
2. **Skoring Intent Transparan (0–100 Poin / 5 Dimensi):**
   - **Intent & Kecocokan Topik (35 poin):** Mendeteksi kalimat pencarian aktif (*"lagi cari"*, *"butuh rekomendasi"*, *"siap bayar"*) yang bersinggungan dengan kata kunci dari prompt kamu + penalti otomatis untuk postingan iklan/kompetitor.
   - **Spesifisitas & Kriteria Prompt (25 poin):** Menghitung kecocokan berlapis dari kata kunci prompt, penyebutan budget, spesifikasi, atau lokasi.
   - **Recency / Kebaruan (20 poin):** Prioritas untuk post `< 24 jam`.
   - **Kualitas Profil (10 poin):** Memastikan akun personal dan link diskusi dapat diakses.
   - **Urgensi & Pain (10 poin):** Mendeteksi kebutuhan mendesak (*"butuh cepat"*, *"deadline mepet"*, *"langsung DM"*).
3. **Generator Draft Reply & DM Dinamis:**
   - Otomatis merangkai pesan balasan publik dan DM konsultatif berdasarkan ringkasan penawaran di prompt kamu serta mengutip detail spesifik dari postingan calon pembeli.
4. **Simulasi Demo Adaptif:**
   - Tombol **⚡ Simulasi Demo** otomatis membuat sampel postingan yang relevan dengan isi `textarea` prompt kamu saat itu juga.

---

## Cara Memasang / Memperbarui di Chrome

1. Buka `chrome://extensions/` di Google Chrome.
2. Jika sebelumnya sudah terpasang, klik tombol **Reload (🔄)** pada kartu ekstensi **ThreadScout** (atau klik **Load unpacked** dan pilih folder `/Users/elviskudo/Sites/sosmed-scout`).
3. Buka **Side Panel** ThreadScout, ketik apa pun yang ingin kamu jual di `textarea` Prompt, lalu klik **🔍 Cari Lead di Halaman Ini** atau **⚡ Simulasi Demo**.
