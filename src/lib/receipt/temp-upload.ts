"use client";

/**
 * Unggah PDF resi ke bucket singgah, langsung dari browser.
 *
 * Dipakai HANYA pada jalur cadangan — saat perangkat tidak sanggup membaca PDF
 * sendiri dan berkasnya terlalu besar untuk dikirim lewat body API (platform
 * menolak di atas ±4,5MB). Mengunggah langsung ke bucket melewati batas itu,
 * dan RLS-nya tetap berlaku karena klien membawa sesi penggunanya sendiri.
 *
 * Berkasnya dihapus server begitu selesai dibaca; bucket ini bukan arsip.
 */

import { createClient } from "@/lib/supabase/client";

const BUCKET = "receipt-temp";

export async function uploadReceiptTemp(file: File): Promise<string> {
  const supabase = createClient();
  if (!supabase) throw new Error("unavailable");

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");

  // Folder = id pengguna. Kebijakan bucket mengikat ke folder itu, sehingga
  // berkas singgah satu orang tidak bisa disentuh orang lain.
  const path = `${user.id}/${crypto.randomUUID()}.pdf`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (error) throw new Error("upload_failed");
  return path;
}
