# Task brief: katalog `/tools` ambil semua data + pagination server-side

Owner: omp (pane 11). Repo FE: `/Users/kyomel/Learning-Process/sweg-ai` (branch dasar `develop/kyomel`).
Repo BE: `/Users/kyomel/go/src/sweg-ai` (branch dasar `feat/magic-link-login` @ `3c078c3`).

## 1. Gejala yang dilaporkan user

`https://ai-sweg.my.id/tools/` hanya menampilkan sebagian data katalog. User benar: data dari
backend tidak semua diambil, dan batasnya tidak terlihat oleh user.

## 2. Diagnosis (sudah diverifikasi, jangan diulang)

Bukti yang sudah dikumpulkan:

```text
live HTML /tools/            -> 50 baris (data-tool-id), count "50 tools"
live HTML /tools/            -> teks "loading the full catalog..." (island belum selesai)
dist/tools/index.html (build lokal, API prod 502) -> 0 baris, count "0 tools"
```

Penyebab, bertingkat:

1. **Build time hanya mengambil 50 baris.** `src/pages/tools.astro` ambil `perPage: 50`.
   Sisa katalog hanya muncul kalau request runtime island sukses.
2. **API prod mati.** `https://api.ai-sweg.my.id/healthz` -> `502` sejak 2026-10-19. Service panic
   saat boot karena `/etc/sweg-ai/env` prod kurang `JETEMAIL_API_KEY`, `MAIL_FROM`,
   `MAGIC_LINK_BASE_URL`. Island gagal, jadi user hanya melihat 50 baris bake-an.
3. **CORS bisa memblokir.** Kalau `CORS_ORIGINS` di env prod tidak memuat
   `https://ai-sweg.my.id`, response API tidak punya header `Access-Control-Allow-Origin` dan
   browser membuang response-nya. Diverifikasi lokal: origin yang tidak ada di allowlist ->
   `HTTP 200` tanpa header `Access-Control-Allow-Origin`. Origin yang ada -> header +
   `Vary: Origin` (+ `Allow-Methods: GET, HEAD, POST, PUT, DELETE, OPTIONS`).
4. **State degraded tidak terlihat.** Di `src/components/ToolsCatalog.tsx`, blok error hanya
   dirender kalau `rows.length === 0`. Kalau runtime fetch gagal tapi 50 baris bake-an masih ada,
   tabel tetap tampil dan count tetap menulis "50 tools" tanpa satu pun peringatan. Ini
   pemotongan senyap yang=user laporkan.
5. **Belum ada pagination.** Island mengambil SEMUA halaman (`while (page <= totalPages)`) lalu
   filter/sort di browser. Kalau request runtime gagal, tidak ada fallback paging. Kalau data
   banyak, unduhan dan memori browser tumbuh linear.

Backend sudah benar dan tidak perlu diubah untuk paging: `GET /tools` sudah punya
`page`, `per_page` (1..100, default 20), dan envelope `{data, meta:{page, per_page, total,
total_pages}}`. Diuji lokal dengan `cmd/memserver` (`:8790`): 275 baris total
(providers 164, coding-agents 56, ade 55), `per_page=100` -> 3 halaman (100/100/75),
`page=4` -> 0 baris dengan `meta.total=275` (tidak error).

## 3. Keputusan desain (sudah dipilih, kerjakan sesuai ini)

Opsi yang dipertimbangkan:

```text
A. Pagination server-side (offset)   + pakai kontrak API yang sudah ada, skala tanpa batas
                                      - island jadi butuh API saat runtime
B. Prerender penuh katalog ke JSON statis
                                      + tanpa dependency runtime, tanpa CORS, search instan
                                      - payload grows with katalog; butuh trigger build harian
C. Gabungan A+B (dua jalur data)      + tahan API mati, tetap skala
                                      - dua jalur, dua sumber kebenaran untuk pager
```

**Pick: A.** Alasan: kontrak `page`/`per_page`/`meta` sudah ada di BE, jadi tidak ada churn
kontrak publik. Search harus pindah ke server supaya hasil + pagination konsisten. B tidak
punya pagination sama sekali (payload ikut tumbuh, dan tidak ada trigger build harian di repo ini
sehingga katalog bisa basi). C menambah dua jalur data untuk masalah yang A + state degraded
yang jujur sudah selesaikan.

Konsekuensi yang harus diterima: `/tools` butuh API hidup saat runtime. Itu обя,/tools harus
punya state degraded yang JELAS, dan env prod harus benar (lihat bagian 7).

Teori: vault `learning/pagination.md` - offset paging untuk data kecil/stabil, cursor untuk data
besar/hot. Katalog tools adalah snapshot read-only yang diganti atomik sekali sehari, jadi
halaman tidak bergeser di bawah klien. `meta.total_pages` + tie-break id sudah menjaga order
total, jadi batas halaman tidak pernah mengulang atau melewatkan baris.

## 4. Subgraph yang harus diimplementasikan

### 4.1 BE: `q` harus mencari field yang sama dengan pencarian lama di browser

Hari iniFE island mencari di `[name, website_label, status, min_spend, ...ai_features]`
(gabung dengan spasi, lowercase, substring). BE hanya mencari di `tool.Name`. Kalau paging
pindah ke server tanpa menyamakan field, hasil search jadi tidak lengkap - itu bug, bukan
pilihan desain.

Yang harus berubah:

- `internal/tools/store_memory.go`: filter `q` memakai haystack yang sama seperti FE lama
  (name, website_label, status, min_spend, ai_features), lowercase, needle di-trim dan
  di-lowercase. Query tetap substring, case-insensitive.
- `api/openapi.yaml`: deskripsi parameter `q` pada `GET /tools` harus menyebut field yang
  dicakup, bukan hanya "name".
- Kontrak yang TIDAK boleh berubah: `page` >= 1, `per_page` 1..100, nilai di luar jangkauan ->
  400 (bukan clamp diam-diam), `meta` selalu ada (termasuk saat 0 baris), `group`/`category`
  alias tetap jalan, `sort`/`order` tetap `name`/`updated` x `asc`/`desc`.
- Test baru di `internal/tools/`:
  - `q` cocok lewat `website_label` (mis. "anthropic"), lewat `status`, lewat `min_spend`,
    lewat `ai_features` (kategori ade), dan lewat `name` seperti sebelumnya.
  - `q` case-insensitive dan needle di-trim.
  - `q` yang tidak cocok -> `data` kosong, `meta.total = 0`, `meta.total_pages = 0`.
  - `q` + `group` + `page` dipakai bersama: `meta.total` = jumlah baris yang cocok filter,
    `meta.total_pages` = ceil(total/per_page), halaman terakhir berisi sisa baris.
  - `per_page=0` / `per_page=101` / `page=0` -> 400.

### 4.2 FE: island jadi satu halaman per request

`src/components/ToolsCatalog.tsx` - ganti loop "ambil semua halaman" dengan satu request per
halaman. URL adalah satu-satunya sumber state: `q`, `group`, `sort`, `order`, `page`.

- `PAGE_SIZE = 50` (sama dengan jumlah baris yang di-prerender, dan di bawah batas API 100).
- Fetch: `fetchTools({ q, group, sort, order, page, perPage: PAGE_SIZE })` -> `data` + `meta`.
- Mount: baca param URL -> set state -> fetch.
- Ganti filter (`q`, `group`, `sort`): `page` reset ke 1 lalu fetch.
- Ganti halaman: fetch halaman itu, lalu `history.pushState` supaya tombol back bekerja.
- `popstate`: baca URL lagi -> set state -> fetch.
- Input search: debounce 250 ms, lalu fetch. Request yang sudah berjalan dibatalkan
  (AbortController) supaya respons lama tidak menimpa respons baru.
- Count line: "50 of 275 tools" (baris halaman ini dari total terfilter). Kalau ada filter
  aktif, tambahkan "matching ..." seperti sekarang.
- Pager: prev/next + nomor halaman (jendela nomor, mis. `1 ... 4 5 6 ... 12`). Nomor halaman
  adalah `<a href="?q=...&group=...&sort=...&page=N">` supaya bisa dipakai tanpa JS dan bisa
  disalin. Halaman aktif ditandai `aria-current="page"`. Prev/next nonaktif di batas.
- Jumlah per chip group: ambil dari `GET /tools/categories` (sudah ada di `src/lib/api.ts`:
  `fetchToolCategories()`), bukan dari data halaman. "all" = jumlahkan.
- Hapus filter/sorting client-side. Setelah pindah ke server, filter browser hanya akan
  Filter chip "all" (yang berarti "no group filter") TETAP memakai `value: ''`; jangan ubah
  nilainya jadi 'all' karena API memakai string kosong sebagai "tanpa filter".
- Tombol "clear filters" tetap ada.

### 4.3 FE: state degraded harus terlihat

- Fetch runtime gagal -> baris bake-an tetap tampil, TAPI ada notice di atas tabel:
 Ry "the live catalog is unavailable - showing the first N rows from the last build" +
  tombol "try again".
- Notice error harus dirender juga ketika `rows.length > 0` (bug sekarang: blok error cuma
  muncul kalau tabel kosong).
- Fetch runtime gagal -> tampilkan baris bake-an (50) + notice + "try again", BUKAN tabel kosong
  tanpa penjelasan.
- Hapus status `partial` yang tidak bisa terjadi lagi kalau hanya satu request per halaman.
  Kalau memang masih dipakai, perilakunya harus jelas.

### 4.4 FE: shell statis dan build

- `src/pages/tools.astro`: prerender halaman 1 dengan `perPage: 50` (sama dengan PAGE_SIZE
  island) supaya HTML statis punya isi sebelum hydration, dan render pager + count line secara
  server-side juga (tautan `?page=2` harus ada di HTML statis).
- Build harus tetap aman kalau API mati saat build: `try/catch` yang ada dipakai, lalu tampilkan
  state "catalog unavailable at build time" (bukan 0 baris tanpa penjelasan).
- Ganti placeholder "loading the full catalog..." dengan teks yang sesuai dengan state baru.

### 4.5 FE: client API

- `src/lib/api.ts`: `fetchTools` menerima `signal` opsional supaya request yang basi bisa
  dibatalkan. `apiFetch` sudah mendukung `opts.signal`; cukup teruskan. Tanpa dependensi baru.
- `ToolQuery` yang ada sudah punya `group`, `q`, `sort`, `order`, `page`, `perPage`. Jangan
  tambah field yang tidak dipakai server.

### 4.6 FE: CSS dan docs

- `src/styles/style.css`: tambah kelas pager yang minimal (mis. `.pager`, `.pager a`,
  `.pager [aria-current="page"]`) dengan gaya yang sama seperti `.rows` / `.chip` (font kecil,
  border tipis, warna token yang sudah ada). JANGAN bikin sistem kelas paralel. Pakai token CSS
  yang sudah ada (`--line`, `--muted`, `--accent`, `--surface`).
- `AGENTS.md` (repo FE): update bagian "Architecture & Data Flow" (alur `/tools` berubah) dan
  daftar kosakata CSS (tambah `.pager`).
- `README.md` (repo BE): kalau dia mendokumentasikan endpoint `/tools`, samakan dengan kontrak
  baru (field `q`).

## 5. Yang tidak boleh disentuh

- Halaman lain (`/`, `/news`, `/s/[slug]`, `/search`, `/entry`, `/submit`, `/login`,
  `/profile`, `/wanted`, `/change-password`) dan semua kode auth/magic-link.
- Bahasa visual situs: tabel polos, hairline abu-abu, tanpa dekorasi. Pager harus cocok dengan
  gaya itu, bukan resembles UI kit.
- `src/lib/api.ts` schema yang sudah ada (`ToolSchema`, `PageMetaSchema`) - kontrak wire tidak
  berubah.
- Dependensi: tidak boleh ada `bun add` / `go get` baru.
- Tanpa em dash di teks yang kamu tulis. Komentar kode dalam bahasa Inggris, gaya repo.
- Jangan ubah `.env`, jangan sentuh database, jangan jalankan migrasi.

## 6. Verifikasi (wajib, ukur sendiri, jangan klaim tanpa bukti)

Backend (repo BE):

```sh
cd /Users/kyomel/go/src/sweg-ai
gofmt -l . && go vet ./... && go test ./...
go run ./cmd/memserver &   # :8790, sudah ada yang jalan: pakai yang sudah hidup
curl -s 'http://127.0.0.1:8790/tools?per_page=100&page=1' | head -c 300
curl -s 'http://127.0.0.1:8790/tools?q=anthropic&per_page=100'   # harus lewat website_label
curl -s 'http://127.0.0.1:8790/tools?per_page=101'               # harus 400
curl -s 'http://127.0.0.1:8790/tools?q=zzz-not-a-tool'           # total 0
```

Frontend (repo FE):

```sh
cd /Users/kyomel/Learning-Process/sweg-ai
bunx astro check          # 0 error
bun run build             # semua page jadi, dist/tools/index.html berisi 50 baris
PUBLIC_SWEG_API_BASE=http://127.0.0.1:8790 bun run dev   # cek di browser
```

Cek browser (dev server :4321, dev proxy `/api` -> :8790):

1. `/tools` -> 50 baris, count "50 of 275 tools", pager tampil dengan 6 halaman.
2. `/tools?page=3` -> baris 201-250, URL tetap, tombol back kembali ke halaman 2.
3. Ketik "cursor" di search -> request ke server (Network: 1 request, `?q=cursor`), hasil
   dari server, count berubah, page reset ke 1.
4. Chip "providers" -> request `?group=provider`, baris hanya providers, jumlah chip dari
   `/tools/categories`.
5. Matikan API (hentikan memserver) -> muat ulang /tools: notice degraded terlihat, 50 baris
   bake-an tetap ada, tombol "try again" ada. INI yang dulu senyap.
6. Sort "name a-z" -> `?sort=name&order=asc`, baris terurut naik.

CORS (untuk laporan, env prod belum bisa diubah dari laptop):

```sh
curl -s -i -H 'Origin: https://ai-sweg.my.id' http://127.0.0.1:8790/tools | grep -i access-control
```

## 7. Yang tidak bisa dikerjakan dari laptop (untuk laporan, jangan claiming)

- API prod `https://api.ai-sweg.my.id` 502. Service panic saat boot karena env prod kurang
  `JETEMAIL_API_KEY`, `MAIL_FROM`, `MAGIC_LINK_BASE_URL`. Perbaikan butuh akses root VPS.
- `CORS_ORIGINS=https://ai-sweg.my.id` juga harus ada di env prod, kalau tidak browser
  membuang response API dan `/tools` kembali ke 50 baris.
- Jadi verifikasi live tidak bisa dilakukan sekarang. Verifikasi lokal (memserver) yang
  menjadi bukti.

## 8. Definition of done

- [ ] BE: `q` mencari name + website_label + status + min_spend + ai_features; test baru hijau.
- [ ] BE: `api/openapi.yaml`Deskripsi `q` sesuai.
- [ ] FE: island fetch satu halaman per request; URL menyimpan q/group/sort/order/page; back
      button jalan; search debounce 250 ms + request dibatalkan.
- [ ] FE: pager prev/next + nomor halaman sebagai link; count line benar; jumlah chip dari
      `/tools/categories`.
- [ ] FE: state degraded terlihat saat API mati (notice + try again), tidak ada pemotongan
      senyap.
- [ ] FE: `bunx astro check` 0 error; `bun run build` sukses; 50 baris di HTML statis.
- [ ] FE: `AGENTS.md` (FE) + CSS vocabulary ikut diperbarui.
- [ ] FE: `plans/tools-pagination.md` (file ini) tetap di repo sebagai bukti keputusan.
- [ ] Tidak ada file lain yang berubah di luar daftar di atas.

## 9. Alur commit

- FE: branch baru dari `develop/kyomel` (basis `5fe8036`), nama `feat/tools-server-pagination`.
- BE: branch baru dari `feat/magic-link-login` @ `3c078c3`, nama `feat/tools-search-fields`.
- Commit per repo, push branchnya ke origin. JANGAN merge ke main. JANGAN buka PR (user yang
  buka). JANGAN force-push. JANGAN tambah co-author di commit message.
- Di akhir, kirim laporan dengan: grafik yang diimplementasikan (file + fungsi), output
  verifikasi di atas, dan daftar file yang berubah per repo.
