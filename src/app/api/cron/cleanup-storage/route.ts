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

  return NextResponse.json({ ok: true, bucket: BUCKET, retentionDays: RETENTION_DAYS, deleted });
}
