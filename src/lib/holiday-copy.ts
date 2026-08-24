import type { Holiday, Religion } from "./types";

/* ============================================================
   Copywriting email pengingat hari libur — dikirim H-1 PAGI.

   Satu email per karyawan, sehari sebelum tiap hari libur. Nilainya dobel:
   pengingat praktis ("besok tidak usah berangkat") datang saat masih sempat
   dipakai untuk berencana, dan sapaan hangatnya tiba justru saat orang
   sedang menantikan liburnya — bukan setelah ia bangun kesiangan di hari-H.

   Karena itu SEMUA naskah di sini berbingkai "besok". Menulis "hari ini kita
   merayakan…" pada email H-1 bukan kehangatan, tapi salah tanggal.

   Aturan nada:
     • "kamu", bukan "Anda" — mengikuti nada email OTP yang sudah ada.
     • Dua–tiga paragraf pendek. Email sambutan, bukan artikel.
     • Tidak ada tombol/CTA. Menjelang libur bukan saatnya membuka aplikasi.
     • Ditutup "Keluarga Treelogy" — bukan "Manajemen", bukan "Tim HR".

   Semantik penerima (mengikuti aturan sistem di types.ts):
     • 'public'    → semua karyawan aktif libur → semua diingatkan.
     • 'religious' → HANYA karyawan seagama yang libur → hanya mereka yang
       menerima. Mengirim "besok kamu libur" ke orang yang besok justru
       masuk kerja bukan kehangatan, tapi keteledoran.
   ============================================================ */

export interface HolidayEmailCopy {
  subject: string;
  /** Baris kecil di atas judul — konteks pengingat. */
  intro: string;
  /** Kalimat pengingat pembuka — "besok, Senin …, libur …". */
  reminder: string;
  heading: string;
  /** Paragraf naskah hari rayanya; kalimat utuh, belum ber-HTML. */
  paragraphs: string[];
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Nama depan untuk sapaan — nama lengkap terasa seperti surat tilang. */
export function firstName(fullName: string): string {
  return (fullName || "").trim().split(/\s+/)[0] || "rekan";
}

/** "Senin, 25 Agustus 2026" menurut WITA. */
export function tanggalPanjang(dateIso: string): string {
  return new Date(dateIso + "T00:00:00+08:00").toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
    timeZone: "Asia/Makassar",
  });
}

interface Tmpl {
  /** Kata kunci pada nama libur (huruf kecil). Urutan daftar = prioritas. */
  match: string[];
  build: (nama: string) => Pick<HolidayEmailCopy, "subject" | "heading" | "paragraphs">;
}

/**
 * Naskah per hari raya. Urutan penting: "tahun baru islam" dan "imlek" harus
 * dicek SEBELUM "tahun baru" polos, kalau tidak 1 Muharram akan diberi ucapan
 * tahun baru masehi lengkap dengan kembang apinya.
 */
const TEMPLATES: Tmpl[] = [
  {
    match: ["kemerdekaan", "proklamasi", "17 agustus"],
    build: () => ({
      subject: "Besok libur — Dirgahayu Republik Indonesia! 🇮🇩",
      heading: "Besok kita merayakan kemerdekaan. Merdeka!",
      paragraphs: [
        "Besok bendera dikibarkan untuk negeri yang sama-sama kita tinggali dan kita banggakan — dan kamu bebas merayakannya tanpa memikirkan pekerjaan.",
        "Dari kebun kelor sampai meja packing, semua yang kita kerjakan di Treelogy adalah bagian kecil dari Indonesia yang terus tumbuh. Terima kasih sudah jadi bagian dari perjalanan itu.",
        "Mau ikut lomba di kampung, kumpul keluarga, atau sekadar rebahan sambil dengar lagu kebangsaan — semuanya sah. Selamat menyambut hari kemerdekaan! 🇮🇩",
      ],
    }),
  },
  {
    match: ["idul fitri", "lebaran"],
    build: () => ({
      subject: "Besok Idul Fitri 🌙✨ — selamat merayakan!",
      heading: "Besok hari kemenangan tiba. Selamat Idul Fitri!",
      paragraphs: [
        "Setelah sebulan penuh menahan diri, besok hari kemenangan itu datang. Taqabbalallahu minna wa minkum — selamat Hari Raya Idul Fitri, mohon maaf lahir dan batin.",
        "Kalau selama setahun ini ada tutur atau tingkah dari kami yang kurang berkenan, dengan tulus kami mohon dimaafkan. Semoga silaturahmi besok menghangatkan hatimu.",
        "Nikmati ketupat, opor, dan pelukan orang-orang tersayang. Sampai jumpa lagi dengan hati yang baru. ✨",
      ],
    }),
  },
  {
    match: ["idul adha", "kurban", "qurban"],
    build: () => ({
      subject: "Besok Idul Adha 🐐 — selamat merayakan!",
      heading: "Besok Hari Raya Idul Adha",
      paragraphs: [
        "Besok kita diingatkan tentang keikhlasan dan berbagi — dua hal yang membuat rezeki terasa lebih berarti ketika sampai juga ke tangan orang lain.",
        "Semoga semangat berkurban membawa keberkahan untukmu dan keluargamu — dan satenya cukup untuk semua. 😄",
        "Selamat menyambut hari raya, selamat beristirahat besok.",
      ],
    }),
  },
  {
    match: ["maulid"],
    build: () => ({
      subject: "Besok libur Maulid Nabi Muhammad SAW 🌙",
      heading: "Besok kita memperingati Maulid Nabi Muhammad SAW",
      paragraphs: [
        "Besok kita mengenang kelahiran sosok yang paling banyak diteladani sepanjang sejarah — dalam kejujurannya, kesabarannya, dan kelembutannya kepada sesama.",
        "Semoga sedikit dari teladan itu ikut hidup dalam keseharian kita: di rumah, di kebun, di pabrik, dan di setiap urusan dengan orang lain.",
        "Rencanakan besokmu dengan tenang — tidak ada alarm kerja, hanya waktu bersama orang-orang terdekat. 🌙",
      ],
    }),
  },
  {
    match: ["isra", "mikraj", "mi'raj"],
    build: () => ({
      subject: "Besok libur Isra Mikraj 🌌",
      heading: "Besok kita memperingati Isra Mikraj",
      paragraphs: [
        "Peristiwa yang diperingati besok adalah pengingat bahwa dalam perjalanan yang paling berat sekalipun selalu ada pertolongan dan arah pulang.",
        "Semoga liburmu besok memberi waktu untuk menenangkan pikiran dan menyegarkan niat — hal yang jarang sempat dilakukan di hari kerja.",
        "Selamat menyambut harinya. 🌌",
      ],
    }),
  },
  {
    match: ["tahun baru islam", "muharram", "hijriah", "hijriyah"],
    build: () => ({
      subject: "Besok Tahun Baru Islam 🌙",
      heading: "Besok kita menyambut Tahun Baru Hijriah",
      paragraphs: [
        "Tahun baru hijriah dimulai dari sebuah perjalanan hijrah — meninggalkan yang lama menuju yang lebih baik. Semoga tahun yang datang membawa versi terbaik dari kita masing-masing.",
        "Terima kasih untuk setahun kebersamaan yang sudah lewat, dan selamat menyambut lembaran baru besok.",
        "Selamat beristirahat. 🌙",
      ],
    }),
  },
  {
    match: ["nyepi", "saka"],
    build: () => ({
      subject: "Besok Nyepi 🌺 — rahajeng, dan bersiaplah dari hari ini",
      heading: "Besok Bali hening — Rahajeng Rahina Nyepi",
      paragraphs: [
        "Besok seluruh Bali berhenti: tanpa bepergian, tanpa keramaian, tanpa cahaya. Siapkan keperluanmu hari ini — belanja, isi daya, dan semua urusan luar rumah — karena begitu matahari terbit, pulau ini benar-benar diam.",
        "Dalam senyap itu ada kesempatan langka untuk berhenti dan mendengar diri sendiri. Semoga catur brata penyepian membawa kejernihan untukmu dan keluarga, dan tahun baru Saka membuka lembaran yang lebih terang.",
        "Rahajeng rahina Nyepi. 🌺",
      ],
    }),
  },
  {
    match: ["galungan"],
    build: () => ({
      subject: "Besok Galungan 🎋 — Rahajeng!",
      heading: "Besok Rahina Galungan",
      paragraphs: [
        "Penjor sudah berdiri di sepanjang jalan — besok hari kemenangan dharma atas adharma dirayakan. Rahajeng Rahina Galungan untukmu dan keluarga.",
        "Semoga kebaikan yang dirayakan besok ikut menetap di rumah, di banjar, dan di hati.",
        "Selamat menyiapkan sembahyang dan berkumpul bersama keluarga. 🎋",
      ],
    }),
  },
  {
    match: ["kuningan"],
    build: () => ({
      subject: "Besok Kuningan 💛 — Rahajeng!",
      heading: "Besok Rahina Kuningan",
      paragraphs: [
        "Rangkaian Galungan ditutup besok dengan Kuningan — ucapan terima kasih dan penghormatan kepada leluhur atas berkah yang mengalir sampai hari ini.",
        "Semoga nasi kuning di tebog besok pagi membawa kemakmuran dan perlindungan untukmu sekeluarga.",
        "Rahajeng rahina Kuningan. 💛",
      ],
    }),
  },
  {
    match: ["waisak", "vesak"],
    build: () => ({
      subject: "Besok Waisak 🪷 — selamat merayakan",
      heading: "Besok Hari Trisuci Waisak",
      paragraphs: [
        "Besok memperingati tiga peristiwa suci dalam satu purnama: kelahiran, pencerahan, dan wafatnya Sang Buddha.",
        "Semoga ketenangan dan welas asih yang diajarkan-Nya menyertai langkahmu — besok dan seterusnya.",
        "Sabbe sattā bhavantu sukhitattā — semoga semua makhluk berbahagia. 🪷",
      ],
    }),
  },
  {
    match: ["natal"],
    build: () => ({
      subject: "Besok Natal 🎄 — selamat merayakan!",
      heading: "Besok Hari Natal!",
      paragraphs: [
        "Damai di bumi, damai di hati. Besok saatnya merayakan Natal bersama orang-orang yang kamu kasihi — tanpa satu pun urusan kantor.",
        "Semoga sukacita dan terang Natal menghangatkan rumahmu, dan kasih yang dirayakan besok terbawa jauh melewati bulan Desember.",
        "Selamat menyiapkan pohon, kado, dan kue-kuenya. 🎄",
      ],
    }),
  },
  {
    match: ["kenaikan isa", "kenaikan yesus", "kenaikan tuhan"],
    build: () => ({
      subject: "Besok libur Kenaikan Isa Almasih ✝️",
      heading: "Besok kita memperingati Kenaikan Isa Almasih",
      paragraphs: [
        "Semoga peringatan besok menguatkan iman dan pengharapanmu, serta membawa damai bagi keluargamu.",
        "Nikmati liburmu besok dengan orang-orang terdekat. Tuhan memberkati. ✝️",
      ],
    }),
  },
  {
    match: ["wafat isa", "jumat agung", "paskah"],
    build: () => ({
      subject: "Besok libur Jumat Agung ✝️",
      heading: "Besok kita memperingati Wafat Isa Almasih",
      paragraphs: [
        "Besok adalah hari perenungan tentang kasih yang rela berkorban — kasih yang paling besar dari semuanya.",
        "Semoga keheningannya membawa damai di hatimu dan keluargamu, menyongsong sukacita Paskah.",
        "Selamat beribadah. ✝️",
      ],
    }),
  },
  {
    match: ["imlek", "tahun baru cina", "sincia"],
    build: () => ({
      subject: "Besok Imlek 🧧 — Gong Xi Fa Cai!",
      heading: "Besok Tahun Baru Imlek — Gong Xi Fa Cai!",
      paragraphs: [
        "Besok tahun baru dimulai! Semoga membawa hoki, kesehatan, dan rezeki yang mengalir deras untukmu sekeluarga.",
        "Siapkan kue keranjang, jeruk mandarin, dan amplop merahnya — dan semoga yang dinanti-nanti tahun ini benar-benar datang.",
        "Gong xi fa cai, wan shi ru yi! 🧧",
      ],
    }),
  },
  {
    // Setelah semua "tahun baru" yang spesifik — sisanya berarti masehi.
    match: ["tahun baru"],
    build: () => ({
      subject: "Besok libur Tahun Baru! 🎆",
      heading: "Besok lembaran baru dibuka",
      paragraphs: [
        "Terima kasih untuk semua kerja keras, tawa, dan kebersamaan sepanjang tahun ini — kamu bagian penting dari semuanya.",
        "Apa pun resolusimu untuk tahun depan (atau kalau belum sempat bikin, itu juga sah), semoga tahun yang baru baik kepadamu.",
        "Selamat menutup tahun malam ini, dan selamat beristirahat besok. 🎆",
      ],
    }),
  },
  {
    match: ["buruh", "pekerja"],
    build: () => ({
      subject: "Besok Hari Buruh — besok tentang kamu 💪",
      heading: "Besok Hari Buruh Internasional",
      paragraphs: [
        "Besok dunia berhenti sejenak untuk merayakan orang-orang yang menggerakkannya — dan itu termasuk kamu.",
        "Semua yang tumbuh di Treelogy tumbuh karena tangan-tangan yang bekerja setiap hari: di kebun, di pabrik, dan di balik layar. Terima kasih, sungguh.",
        "Besok kerjaanmu satu saja: istirahat. 💪",
      ],
    }),
  },
  {
    match: ["pancasila"],
    build: () => ({
      subject: "Besok libur Hari Lahir Pancasila 🦅",
      heading: "Besok Hari Lahir Pancasila",
      paragraphs: [
        "Lima sila yang lahir di tanggal itu menjadi rumah bagi kita semua — yang berbeda keyakinan, suku, dan bahasa, tapi bekerja di ladang yang sama.",
        "Di Treelogy, keberagaman itu bukan slogan; ia terasa di setiap ruangan. Semoga terus begitu.",
        "Selamat menikmati liburmu besok. 🦅",
      ],
    }),
  },
  {
    match: ["cuti bersama"],
    build: (n) => ({
      subject: "Besok cuti bersama — siap-siap santai 🌿",
      heading: `Besok ${n}`,
      paragraphs: [
        "Besok kantor ikut hening: cuti bersama. Tidak ada rapat, tidak ada tenggat, tidak ada notifikasi yang perlu dibalas.",
        "Pakai harinya untuk hal-hal yang sering kalah oleh kesibukan — tidur cukup, masakan rumah, atau jalan pagi yang tidak terburu-buru.",
        "Selamat menyambut hari santaimu. 🌿",
      ],
    }),
  },
];

/** Ucapan generik per agama — jaring pengaman untuk hari raya yang belum
 *  punya naskah khusus (mis. Siwaratri, Cap Go Meh bila dijadikan libur). */
const RELIGIOUS_FALLBACK: Record<Religion, (nama: string) => Pick<HolidayEmailCopy, "subject" | "heading" | "paragraphs">> = {
  islam: (n) => ({
    subject: `Besok libur ${n} 🌙`,
    heading: `Besok kita memperingati ${n}`,
    paragraphs: [
      `Semoga ${n} besok membawa keberkahan dan kedamaian untukmu dan keluargamu.`,
      "Nikmati liburmu bersama orang-orang terdekat. 🌙",
    ],
  }),
  kristen: (n) => ({
    subject: `Besok libur ${n} ✝️`,
    heading: `Besok kita merayakan ${n}`,
    paragraphs: [
      `Semoga ${n} besok membawa damai sejahtera dan sukacita bagi kamu dan keluargamu.`,
      "Selamat beribadah. Tuhan memberkati. ✝️",
    ],
  }),
  katolik: (n) => ({
    subject: `Besok libur ${n} ✝️`,
    heading: `Besok kita merayakan ${n}`,
    paragraphs: [
      `Semoga ${n} besok membawa damai sejahtera dan berkat bagi kamu dan keluargamu.`,
      "Selamat beribadah. Tuhan memberkati. ✝️",
    ],
  }),
  hindu: (n) => ({
    subject: `Besok ${n} 🌺 — Rahajeng!`,
    heading: `Besok Hari Raya ${n}`,
    paragraphs: [
      `Semoga ${n} besok membawa kedamaian, keseimbangan, dan kebahagiaan untukmu sekeluarga.`,
      "Selamat menyiapkan sembahyang. 🌺",
    ],
  }),
  buddha: (n) => ({
    subject: `Besok libur ${n} 🪷`,
    heading: `Besok kita merayakan ${n}`,
    paragraphs: [
      `Semoga ${n} besok membawa ketenangan dan kebahagiaan bagi kamu dan keluargamu.`,
      "Semoga semua makhluk berbahagia. 🪷",
    ],
  }),
  konghucu: (n) => ({
    subject: `Besok libur ${n} 🏮`,
    heading: `Besok kita merayakan ${n}`,
    paragraphs: [
      `Semoga ${n} besok membawa harmoni dan keberuntungan untukmu sekeluarga.`,
      "Selamat merayakan bersama keluarga. 🏮",
    ],
  }),
};

/**
 * Naskah H-1 untuk satu hari libur. Selalu mengembalikan sesuatu yang layak
 * kirim — libur tak dikenal jatuh ke pengingat hangat yang umum, bukan error.
 */
export function holidayCopy(holiday: Pick<Holiday, "name" | "date" | "type" | "religion">): HolidayEmailCopy {
  const nama = holiday.name.trim();
  const kunci = nama.toLowerCase();
  const tanggal = tanggalPanjang(holiday.date);
  const intro = "Pengingat hari libur · dikirim H-1";
  // "kamu libur" untuk libur keagamaan: kantornya sendiri tetap beroperasi,
  // yang libur adalah orangnya — kalimatnya harus jujur soal itu.
  const reminder =
    holiday.type === "religious"
      ? `Pengingat kecil: besok, ${tanggal}, kamu libur untuk ${nama}.`
      : `Pengingat kecil: besok, ${tanggal}, kantor libur — ${nama}.`;

  for (const t of TEMPLATES) {
    if (t.match.some((k) => kunci.includes(k))) return { intro, reminder, ...t.build(nama) };
  }
  if (holiday.type === "religious" && holiday.religion && RELIGIOUS_FALLBACK[holiday.religion]) {
    return { intro, reminder, ...RELIGIOUS_FALLBACK[holiday.religion](nama) };
  }
  return {
    intro,
    reminder,
    subject: `Besok libur: ${nama} 🌿`,
    heading: `Besok waktunya menepi sebentar`,
    paragraphs: [
      "Pakai harinya untuk hal yang membuatmu segar kembali: keluarga, hobi, atau sekadar tidur siang yang layak.",
      "Selamat menyambut hari liburmu. 🌿",
    ],
  };
}

/** Rakit HTML final — sapaan nama + pengingat + naskah + salam Keluarga Treelogy. */
export function holidayEmailHtml(copy: HolidayEmailCopy, recipientName: string): string {
  const sapaan = esc(firstName(recipientName));
  const body = copy.paragraphs
    .map((p) => `<p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151">${esc(p)}</p>`)
    .join("");
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f2421">
    <h2 style="margin:0 0 4px;font-size:20px;color:#2f5a2f">Treelogy Workspace</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px">${esc(copy.intro)}</p>
    <h3 style="margin:0 0 14px;font-size:17px;line-height:1.4">${esc(copy.heading)}</h3>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151">Halo ${sapaan},</p>
    <p style="margin:0 0 14px;font-size:14px;line-height:1.7;color:#374151;background:#eef3ee;border-radius:12px;padding:12px 14px">${esc(copy.reminder)}</p>
    ${body}
    <p style="margin:20px 0 0;font-size:14px;line-height:1.7;color:#374151">Salam hangat,<br/><strong style="color:#2f5a2f">Keluarga Treelogy</strong> 🌿</p>
    <p style="margin:24px 0 0;color:#9ca3af;font-size:12px">© Treelogy · Premium Organic Moringa</p>
  </div>`;
}

/** Versi teks polos — untuk klien email yang tidak merender HTML. */
export function holidayEmailText(copy: HolidayEmailCopy, recipientName: string): string {
  return [
    `Halo ${firstName(recipientName)},`,
    "",
    copy.reminder,
    "",
    ...copy.paragraphs,
    "",
    "Salam hangat,",
    "Keluarga Treelogy 🌿",
  ].join("\n");
}
