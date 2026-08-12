import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mapOutgoingLetter } from "@/lib/data";
import {
  LETTER_CATEGORIES, LETTER_DELIVERIES, LETTER_EXTS, LETTER_STATUSES, LETTER_URGENCIES,
} from "@/lib/letters";
import { isValidUploadedPath } from "@/lib/storage-path";
import type { OutgoingLetter } from "@/lib/types";

export const runtime = "nodejs";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Semua berkas surat hidup di satu folder — record id belum ada saat upload. */
const FILE_FOLDER = "letters";

interface LetterPayload {
  id?: string;
  letterNumber?: string | null;
  letterDate?: string;
  recipient?: string;
  recipientAddress?: string | null;
  subject?: string;
  category?: OutgoingLetter["category"];
  urgency?: OutgoingLetter["urgency"];
  signer?: string | null;
  delivery?: OutgoingLetter["delivery"];
  status?: OutgoingLetter["status"];
  sentDate?: string | null;
  filePath?: string | null;
  note?: string | null;
}

async function auth() {
  const supabase = await createClient();
  if (!supabase) return { error: NextResponse.json({ error: "unavailable" }, { status: 503 }) };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  return { supabase };
}

/** `partial` = PATCH: hanya field yang dikirim yang divalidasi. */
function validate(body: LetterPayload, partial: boolean): string | null {
  if (!partial || body.recipient !== undefined) {
    if (!body.recipient?.trim()) return "recipient_required";
  }
  if (!partial || body.subject !== undefined) {
    if (!body.subject?.trim()) return "subject_required";
  }
  if (!partial || body.letterDate !== undefined) {
    if (!body.letterDate || !ISO_DATE.test(body.letterDate)) return "invalid_date";
  }
  if (!partial || body.category !== undefined) {
    if (!body.category || !LETTER_CATEGORIES.includes(body.category)) return "invalid_category";
  }
  if (body.urgency !== undefined && (!body.urgency || !LETTER_URGENCIES.includes(body.urgency))) {
    return "invalid_input";
  }
  if (body.status !== undefined && (!body.status || !LETTER_STATUSES.includes(body.status))) {
    return "invalid_status";
  }
  if (body.delivery != null && !LETTER_DELIVERIES.includes(body.delivery)) return "invalid_input";
  if (body.sentDate && !ISO_DATE.test(body.sentDate)) return "invalid_date";
  // Terkirim tanpa tanggal kirim membuat agenda tidak bisa dipertanggungjawabkan.
  if (body.status === "terkirim" && body.sentDate === null) return "sent_date_required";
  if (body.filePath && !isValidUploadedPath(body.filePath, FILE_FOLDER, LETTER_EXTS)) {
    return "invalid_path";
  }
  return null;
}

const trimOrNull = (v: string | null | undefined) => {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
};

function toRow(body: LetterPayload): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (body.letterNumber !== undefined) row.letter_number = trimOrNull(body.letterNumber);
  if (body.letterDate !== undefined) row.letter_date = body.letterDate;
  if (body.recipient !== undefined) row.recipient = body.recipient!.trim();
  if (body.recipientAddress !== undefined) row.recipient_address = trimOrNull(body.recipientAddress);
  if (body.subject !== undefined) row.subject = body.subject!.trim();
  if (body.category !== undefined) row.category = body.category;
  if (body.urgency !== undefined) row.urgency = body.urgency;
  if (body.signer !== undefined) row.signer = trimOrNull(body.signer);
  if (body.delivery !== undefined) row.delivery = body.delivery || null;
  if (body.status !== undefined) {
    row.status = body.status;
    // Status bukan "terkirim" → tanggal kirim ikut dikosongkan supaya tidak ada
    // sisa data yang bertentangan dengan statusnya.
    if (body.status !== "terkirim") row.sent_date = null;
  }
  if (body.sentDate !== undefined && body.status !== "draft" && body.status !== "dibatalkan") {
    row.sent_date = body.sentDate || null;
  }
  if (body.filePath !== undefined) row.file_path = body.filePath || null;
  if (body.note !== undefined) row.note = trimOrNull(body.note);
  return row;
}

// ---- Catat surat keluar ----
// Nomor agenda TIDAK dikirim client: database yang membuatnya (sequence +
// default), jadi mustahil duplikat walau dua staf mencatat bersamaan.
export async function POST(req: Request) {
  let body: LetterPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const invalid = validate(body, false);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const { supabase, error: authErr } = await auth();
  if (authErr) return authErr;

  const { data, error } = await supabase!.from("outgoing_letters").insert(toRow(body)).select("*").single();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  return NextResponse.json({ ok: true, letter: mapOutgoingLetter(data) });
}

// ---- Ubah surat ----
export async function PATCH(req: Request) {
  let body: LetterPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  const invalid = validate(body, true);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const row = toRow(body);
  if (Object.keys(row).length === 0) return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });

  const { supabase, error: authErr } = await auth();
  if (authErr) return authErr;

  const { data, error } = await supabase!
    .from("outgoing_letters")
    .update(row)
    .eq("id", body.id)
    .select("*")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  return NextResponse.json({ ok: true, letter: mapOutgoingLetter(data) });
}

// ---- Hapus surat ----
export async function DELETE(req: Request) {
  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id_required" }, { status: 400 });

  const { supabase, error: authErr } = await auth();
  if (authErr) return authErr;

  const { data, error } = await supabase!
    .from("outgoing_letters")
    .delete()
    .eq("id", body.id)
    .select("id")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
