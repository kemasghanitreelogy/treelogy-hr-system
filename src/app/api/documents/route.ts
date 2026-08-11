import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mapCompanyDocument } from "@/lib/data";
import { DOC_CATEGORIES, DOC_EXTS } from "@/lib/documents";
import { isValidUploadedPath } from "@/lib/storage-path";
import type { CompanyDocument } from "@/lib/types";

export const runtime = "nodejs";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Semua berkas dokumen hidup di satu folder — record id belum ada saat upload. */
const FILE_FOLDER = "files";

interface DocPayload {
  id?: string;
  name?: string;
  category?: CompanyDocument["category"];
  docNumber?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
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
function validate(body: DocPayload, partial: boolean): string | null {
  if (!partial || body.name !== undefined) {
    if (!body.name?.trim()) return "name_required";
  }
  if (!partial || body.category !== undefined) {
    if (!body.category || !DOC_CATEGORIES.includes(body.category)) return "invalid_category";
  }
  if (body.issueDate && !ISO_DATE.test(body.issueDate)) return "invalid_date";
  if (body.expiryDate && !ISO_DATE.test(body.expiryDate)) return "invalid_date";
  if (body.filePath && !isValidUploadedPath(body.filePath, FILE_FOLDER, DOC_EXTS)) {
    return "invalid_path";
  }
  return null;
}

const trimOrNull = (v: string | null | undefined) => {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
};

function toRow(body: DocPayload): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (body.name !== undefined) row.name = body.name!.trim();
  if (body.category !== undefined) row.category = body.category;
  if (body.docNumber !== undefined) row.doc_number = trimOrNull(body.docNumber);
  if (body.issueDate !== undefined) row.issue_date = body.issueDate || null;
  if (body.expiryDate !== undefined) row.expiry_date = body.expiryDate || null;
  if (body.filePath !== undefined) row.file_path = body.filePath || null;
  if (body.note !== undefined) row.note = trimOrNull(body.note);
  return row;
}

// ---- Tambah dokumen ----
// Kode dokumen TIDAK dikirim client: database yang membuatnya (sequence +
// default), jadi mustahil duplikat walau dua HR menyimpan bersamaan.
export async function POST(req: Request) {
  let body: DocPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const invalid = validate(body, false);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const { supabase, error: authErr } = await auth();
  if (authErr) return authErr;

  const { data, error } = await supabase!.from("company_documents").insert(toRow(body)).select("*").single();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  return NextResponse.json({ ok: true, doc: mapCompanyDocument(data) });
}

// ---- Ubah dokumen ----
export async function PATCH(req: Request) {
  let body: DocPayload;
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
    .from("company_documents")
    .update(row)
    .eq("id", body.id)
    .select("*")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  return NextResponse.json({ ok: true, doc: mapCompanyDocument(data) });
}

// ---- Hapus dokumen ----
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
    .from("company_documents")
    .delete()
    .eq("id", body.id)
    .select("id")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
