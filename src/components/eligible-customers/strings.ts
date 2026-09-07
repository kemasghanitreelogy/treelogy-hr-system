import type { Locale } from "@/lib/i18n";

/* Satu kamus untuk seluruh modul. Kalimatnya panjang karena menjelaskan alur
   yang punya akibat nyata di toko (customer sungguhan dibuat di Shopify, dan
   eligibility diskon yang bisa hilang diam-diam kalau langkahnya setengah). */

export const STR: Record<Locale, Record<string, string>> = {
  id: {
    // — ringkasan —
    statTotal: "Pelanggan di-grant",
    statSeeded: "Sudah eligible",
    statSeededSub: "DB app + metafield terisi",
    statPending: "Belum di-seed",
    statPendingSub: "backend belum dikonfigurasi",
    statFailed: "Gagal seeding",
    statFailedSub: "perlu diulang — lihat alasannya",

    // — aksi —
    add: "Tambah pelanggan",
    importBtn: "Impor CSV / XLSX",
    retryPending: "Ulangi yang belum eligible",
    regrantAll: "Grant ulang semua",
    regrantAllTitle: "Grant ulang semua pelanggan?",
    regrantAllBody:
      "Dipakai setelah merchant membuat campaign BARU. Backfill app tidak pernah menemukan pelanggan buatan admin (mereka tidak punya first_order_date), jadi entry campaign barunya harus ditulis lewat sini. Aman diulang: customer yang sudah ada tidak dibuat ganda, dan tanggal seed yang lebih awal tidak tertimpa.",
    regrantAllYes: "Ya, grant ulang semuanya",
    retryOne: "Ulangi",
    retrying: "Mengulang…",
    verify: "Periksa",
    verifying: "Membaca…",
    verified: "Metafield dibaca ulang ✓",
    mfLabel: "Metafield",
    mfEmpty: "metafield belum tertulis",
    mfNoFirst: "firstPurchaseAt kosong",
    mfUnchecked: "belum diperiksa",
    mfChecked: "dicek",
    mfUses: "dipakai",
    seedMissingWithToken:
      "Token app Combined Discount sudah ada (metafield bisa DIBACA untuk verifikasi), tapi endpoint seeding belum aktif: isi COMBINED_DISCOUNT_ADMIN_SECRET di sini dan ADMIN_API_SECRET di Fly, lalu deploy route api.admin.customers. Menulis metafield langsung dari sini sengaja tidak dilakukan — tanpa row CustomerPurchaseFact, order pertama akan menimpanya.",

    // — kesiapan —
    shopifyMissing:
      "Kredensial Shopify (STORE_NAME / ADMIN_API_KEY) kosong di server — pelanggan tidak bisa dibuat.",
    seedMissing:
      "Backend Combined Discount belum dikonfigurasi (COMBINED_DISCOUNT_API_URL / COMBINED_DISCOUNT_ADMIN_SECRET). Pelanggan tetap dibuat di Shopify, tapi eligibility diskonnya BELUM di-seed — statusnya akan \"belum di-seed\" sampai variabelnya diisi, lalu tekan \"Ulangi yang belum eligible\".",

    // — cara kerja —
    howTitle: "Cara kerjanya",
    how1:
      "Pelanggan dibuat (atau ditemukan) di Shopify lewat token Admin API toko, diberi tag admin-created.",
    how2:
      "Backend app Combined Discount menulis firstPurchaseAt = 2000-01-01 ke tabel CustomerPurchaseFact DAN ke metafield $app:combined-discount-state. Dua-duanya wajib — tanpa row DB, order pertama akan menimpa tanggalnya dan eligibility hilang.",
    how3:
      "Pelanggan harus LOGIN di storefront dengan email yang sama persis (toko ini memakai akun pelanggan baru: kode OTP ke email, tanpa undangan, tanpa password). Mengetik email di checkout tanpa login = diblokir, bukan bug.",
    how4:
      "Campaign untuk pelanggan buatan admin sebaiknya memakai requireQualifyingProducts = false. Kalau tidak, setiap campaign baru butuh \"Grant ulang semua\".",

    // — daftar —
    search: "Cari email / nama…",
    filterAll: "Semua",
    filterSeeded: "Eligible",
    filterPending: "Belum di-seed",
    filterFailed: "Gagal",
    empty: "Belum ada pelanggan yang di-grant dari sini.",
    emptyFiltered: "Tidak ada yang cocok dengan saringan ini.",
    createdHere: "dibuat dari sini",
    existed: "sudah ada di Shopify",
    campaigns: "campaign",
    noCampaign: "tanpa entry campaign",
    seedDateLabel: "firstPurchaseAt",
    grantedBy: "oleh",
    openShopify: "Buka di Shopify",
    viaImport: "impor",
    viaManual: "manual",
    statusSeeded: "Eligible",
    statusPending: "Belum di-seed",
    statusFailed: "Gagal seeding",

    // — formulir satuan —
    addTitle: "Tambah pelanggan eligible",
    addLead:
      "Satu pelanggan. Emailnya harus sama persis dengan yang dipakai pelanggan untuk login di toko.",
    email: "Email",
    firstName: "Nama depan",
    lastName: "Nama belakang",
    submit: "Buat & grant",
    submitting: "Memproses…",
    savedSeeded: "Pelanggan dibuat dan sudah eligible ✓",
    savedExistingSeeded: "Email sudah ada di Shopify — eligibility di-seed ke customer lama ✓",
    savedPending: "Pelanggan dibuat di Shopify, tapi eligibility belum di-seed:",
    savedFailed: "Pelanggan ada di Shopify, tapi seeding gagal:",
    retried: "Grant diulang ✓",

    // — impor —
    importTitle: "Impor pelanggan dari CSV / XLSX",
    importLead:
      "Berkas diurai di perangkat ini dan dikirim per 25 baris. Baris bermasalah ditandai dulu — tidak ada customer yang dibuat sebelum kamu menekan Proses.",
    pickFile: "Pilih berkas",
    dropHint: "CSV, XLSX. Kolom yang dikenali: email (wajib), nama_depan, nama_belakang atau nama.",
    template: "Unduh contoh CSV",
    parsing: "Membaca berkas…",
    parseEmpty: "Berkas kosong.",
    parseNoEmail: "Tidak ada kolom email. Tambahkan judul kolom \"email\" di baris pertama.",
    parseUnsupported: "Format tidak didukung. Simpan sebagai .xlsx atau .csv (bukan .xls).",
    parseFailed: "Berkas tidak bisa dibaca.",
    previewTitle: "Pratinjau",
    previewValid: "siap diproses",
    previewInvalid: "email tidak valid",
    previewDup: "kembar",
    previewLine: "baris",
    problemInvalid: "email tidak valid",
    problemDup: "kembar di berkas",
    process: "Proses",
    rows: "baris",
    changeFile: "Ganti berkas",
    running: "Memproses…",
    runningHint: "Tiap baris = 2–3 panggilan Shopify + 1 ke backend. Biarkan tab ini terbuka.",
    progress: "diproses",
    doneTitle: "Selesai",
    resSeeded: "eligible",
    resPending: "belum di-seed",
    resFailedSeed: "seeding gagal",
    resError: "gagal dibuat",
    close: "Tutup",
    downloadReport: "Unduh laporan CSV",
    importDone: "Impor selesai",
  },
  en: {
    statTotal: "Customers granted",
    statSeeded: "Eligible",
    statSeededSub: "app DB + metafield written",
    statPending: "Not seeded yet",
    statPendingSub: "backend not configured",
    statFailed: "Seeding failed",
    statFailedSub: "needs a retry — see the reason",

    add: "Add customer",
    importBtn: "Import CSV / XLSX",
    retryPending: "Retry non-eligible",
    regrantAll: "Re-grant everyone",
    regrantAllTitle: "Re-grant every customer?",
    regrantAllBody:
      "Use this after the merchant creates a NEW campaign. The app's backfill never finds admin-created customers (they have no first_order_date), so the new campaign entry has to be written from here. Safe to repeat: existing customers aren't duplicated and an earlier seed date is never overwritten.",
    regrantAllYes: "Yes, re-grant everyone",
    retryOne: "Retry",
    retrying: "Retrying…",
    verify: "Check",
    verifying: "Reading…",
    verified: "Metafield re-read ✓",
    mfLabel: "Metafield",
    mfEmpty: "metafield not written yet",
    mfNoFirst: "firstPurchaseAt empty",
    mfUnchecked: "not checked yet",
    mfChecked: "checked",
    mfUses: "used",
    seedMissingWithToken:
      "The Combined Discount app token is present (the metafield can be READ for verification), but the seeding endpoint isn't live: set COMBINED_DISCOUNT_ADMIN_SECRET here and ADMIN_API_SECRET on Fly, then deploy the api.admin.customers route. Writing the metafield directly from here is deliberately not done — without a CustomerPurchaseFact row the first order would overwrite it.",

    shopifyMissing:
      "Shopify credentials (STORE_NAME / ADMIN_API_KEY) are empty on the server — customers can't be created.",
    seedMissing:
      "The Combined Discount backend isn't configured (COMBINED_DISCOUNT_API_URL / COMBINED_DISCOUNT_ADMIN_SECRET). Customers are still created in Shopify, but discount eligibility is NOT seeded — they stay \"not seeded\" until the variables are set; then press \"Retry non-eligible\".",

    howTitle: "How it works",
    how1: "The customer is created (or found) in Shopify with the store's Admin API token and tagged admin-created.",
    how2:
      "The Combined Discount backend writes firstPurchaseAt = 2000-01-01 to the CustomerPurchaseFact table AND to the $app:combined-discount-state metafield. Both are required — without the DB row the first order overwrites the date and eligibility is lost.",
    how3:
      "The customer must LOG IN on the storefront with exactly this email (this store uses new customer accounts: OTP code by email, no invite, no password). Typing the email at checkout without logging in = blocked, not a bug.",
    how4:
      "Campaigns aimed at admin-created customers should use requireQualifyingProducts = false. Otherwise every new campaign needs \"Re-grant everyone\".",

    search: "Search email / name…",
    filterAll: "All",
    filterSeeded: "Eligible",
    filterPending: "Not seeded",
    filterFailed: "Failed",
    empty: "No customers granted from here yet.",
    emptyFiltered: "Nothing matches this filter.",
    createdHere: "created here",
    existed: "already in Shopify",
    campaigns: "campaigns",
    noCampaign: "no campaign entry",
    seedDateLabel: "firstPurchaseAt",
    grantedBy: "by",
    openShopify: "Open in Shopify",
    viaImport: "import",
    viaManual: "manual",
    statusSeeded: "Eligible",
    statusPending: "Not seeded",
    statusFailed: "Seeding failed",

    addTitle: "Add eligible customer",
    addLead: "One customer. The email must match exactly what they use to log in to the store.",
    email: "Email",
    firstName: "First name",
    lastName: "Last name",
    submit: "Create & grant",
    submitting: "Processing…",
    savedSeeded: "Customer created and eligible ✓",
    savedExistingSeeded: "Email already existed in Shopify — eligibility seeded onto that customer ✓",
    savedPending: "Customer created in Shopify, but eligibility isn't seeded yet:",
    savedFailed: "Customer exists in Shopify, but seeding failed:",
    retried: "Grant retried ✓",

    importTitle: "Import customers from CSV / XLSX",
    importLead:
      "The file is parsed on this device and sent 25 rows at a time. Problem rows are flagged first — no customer is created until you press Process.",
    pickFile: "Choose file",
    dropHint: "CSV, XLSX. Recognised columns: email (required), first_name, last_name or name.",
    template: "Download sample CSV",
    parsing: "Reading file…",
    parseEmpty: "The file is empty.",
    parseNoEmail: "No email column found. Add an \"email\" header in the first row.",
    parseUnsupported: "Unsupported format. Save as .xlsx or .csv (not .xls).",
    parseFailed: "The file couldn't be read.",
    previewTitle: "Preview",
    previewValid: "ready",
    previewInvalid: "invalid email",
    previewDup: "duplicates",
    previewLine: "row",
    problemInvalid: "invalid email",
    problemDup: "duplicate in file",
    process: "Process",
    rows: "rows",
    changeFile: "Change file",
    running: "Processing…",
    runningHint: "Each row = 2–3 Shopify calls + 1 backend call. Keep this tab open.",
    progress: "processed",
    doneTitle: "Done",
    resSeeded: "eligible",
    resPending: "not seeded",
    resFailedSeed: "seeding failed",
    resError: "not created",
    close: "Close",
    downloadReport: "Download CSV report",
    importDone: "Import finished",
  },
};
