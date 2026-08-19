import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * Pembersihan storage terjadwal (Vercel Cron, harian).
 * Selfie absensi hanyalah bukti verifikasi harian — setelah RETENTION_DAYS
 * tidak lagi dibutuhkan (payroll periode itu sudah lama ditutup), jadi
 * dihapus agar bucket tidak tumbuh tanpa batas. Bukti cuti/lembur/tabungan
 * TIDAK disentuh: itu dokumen yang melekat pada pengajuan.
 */
const RETENTION_DAYS = 90;
const BUCKET = "attendance-selfies";
const BATCH = 500;
const MAX_BATCHES = 4; // batas aman per run; sisa akan terhapus run berikutnya

export async function GET(req: Request) {
  // Vercel Cron menyertakan header ini otomatis saat env CRON_SECRET di-set.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 86_400_000).toISOString();
  let deleted = 0;

  for (let i = 0; i < MAX_BATCHES; i++) {
    const { data, error } = await admin
      .schema("storage")
      .from("objects")
      .select("name")
      .eq("bucket_id", BUCKET)
      .lt("created_at", cutoff)
      .limit(BATCH);
    if (error) {
      return NextResponse.json({ error: "list_failed", detail: error.message }, { status: 500 });
    }
    const names = (data ?? []).map((r) => String(r.name));
    if (names.length === 0) break;

    const { error: rmErr } = await admin.storage.from(BUCKET).remove(names);
    if (rmErr) {
      return NextResponse.json(
        { error: "remove_failed", deleted, detail: rmErr.message },
        { status: 500 },
      );
    }
    deleted += names.length;
    if (names.length < BATCH) break;
  }

  // Sapuan kedua: berkas singgah Receipt Sales.
  //
  // Berkas di bucket itu semestinya hidup beberapa detik saja — diunggah,
  // dibaca, lalu dihapus pada permintaan yang sama. Sapuan ini hanya jaring
  // pengaman untuk permintaan yang mati di tengah jalan, dan karena itu
  // ambangnya jam, bukan hari.
  const temp = await sweepTempReceipts(admin);

  return NextResponse.json({
    ok: true,
    bucket: BUCKET,
    retentionDays: RETENTION_DAYS,
    deleted,
    receiptTempDeleted: temp,
  });
}

const TEMP_BUCKET = "receipt-temp";
const TEMP_MAX_AGE_HOURS = 1;

/* eslint-disable @typescript-eslint/no-explicit-any */
async function sweepTempReceipts(admin: any): Promise<number> {
  const cutoff = new Date(Date.now() - TEMP_MAX_AGE_HOURS * 3_600_000).toISOString();
  try {
    const { data, error } = await admin
      .schema("storage")
      .from("objects")
      .select("name")
      .eq("bucket_id", TEMP_BUCKET)
      .lt("created_at", cutoff)
      .limit(BATCH);
    if (error) return 0;
    const names = (data ?? []).map((r: { name: string }) => String(r.name));
    if (!names.length) return 0;
    const { error: rmErr } = await admin.storage.from(TEMP_BUCKET).remove(names);
    return rmErr ? 0 : names.length;
  } catch {
    // Pembersihan tambahan tidak boleh menggagalkan pembersihan utama.
    return 0;
  }
}
