import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mapContract } from "@/lib/data";
import { isValidUploadedPath } from "@/lib/storage-path";

export const runtime = "nodejs";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TYPES = ["probation", "pkwt", "pkwtt", "magang", "harian"];
const DOC_EXTS = ["pdf", "jpg", "jpeg", "png", "webp"];

// --- Contract document upload (private `contract-docs` bucket; PDF or image) ---
const DOC_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const DOC_MAX_BYTES = 10 * 1024 * 1024;
type SbClient = NonNullable<Awaited<ReturnType<typeof createClient>>>;

function parseDataUrl(dataUrl?: string): { mime: string; buffer: Buffer } | null {
  if (!dataUrl) return null;
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) return null;
  return { mime: m[1], buffer: Buffer.from(m[2], "base64") };
}

/** Upload a signed contract to `contract-docs/<employeeId>/...`. Returns path or an error response. */
async function uploadDoc(supabase: SbClient, employeeId: string, dataUrl: string): Promise<string | NextResponse> {
  const file = parseDataUrl(dataUrl);
  if (!file || !DOC_EXT[file.mime]) return NextResponse.json({ error: "invalid_doc_type" }, { status: 400 });
  if (file.buffer.length > DOC_MAX_BYTES) return NextResponse.json({ error: "doc_too_large" }, { status: 400 });
  const path = `${employeeId}/${crypto.randomUUID()}.${DOC_EXT[file.mime]}`;
  const { error } = await supabase.storage.from("contract-docs").upload(path, file.buffer, { contentType: file.mime, upsert: false });
  if (error) return NextResponse.json({ error: "doc_upload_failed" }, { status: 403 });
  return path;
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

export async function POST(req: Request) {
  let body: { employeeId?: string; type?: string; startDate?: string; endDate?: string | null; status?: string; note?: string; docFile?: string; docPath?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.employeeId) return NextResponse.json({ error: "employee_required" }, { status: 400 });
  if (!body.type || !TYPES.includes(body.type)) return NextResponse.json({ error: "invalid_type" }, { status: 400 });
  if (!body.startDate || !ISO_DATE.test(body.startDate)) return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  if (body.endDate && !ISO_DATE.test(body.endDate)) return NextResponse.json({ error: "invalid_date" }, { status: 400 });

  const { supabase, error: authErr } = await auth();
  if (authErr) return authErr;

  let docPath: string | null = null;
  if (body.docPath) {
    // Client uploaded straight to storage — just validate & store the path.
    if (!isValidUploadedPath(body.docPath, body.employeeId, DOC_EXTS)) {
      return NextResponse.json({ error: "invalid_path" }, { status: 400 });
    }
    docPath = body.docPath;
  } else if (body.docFile) {
    const path = await uploadDoc(supabase!, body.employeeId, body.docFile);
    if (path instanceof NextResponse) return path;
    docPath = path;
  }

  const { data, error } = await supabase!
    .from("employee_contracts")
    .insert({
      employee_id: body.employeeId,
      type: body.type,
      start_date: body.startDate,
      end_date: body.endDate || null,
      status: body.status === "ended" ? "ended" : "active",
      note: body.note?.trim() || null,
      doc_path: docPath,
    })
    .select("*")
    .single();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  return NextResponse.json({ ok: true, contract: mapContract(data) });
}

export async function PATCH(req: Request) {
  let body: { id?: string; type?: string; startDate?: string; endDate?: string | null; status?: string; note?: string; docFile?: string; docPath?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  if (body.type !== undefined && !TYPES.includes(body.type)) return NextResponse.json({ error: "invalid_type" }, { status: 400 });
  if (body.startDate !== undefined && !ISO_DATE.test(body.startDate)) return NextResponse.json({ error: "invalid_date" }, { status: 400 });
  if (body.endDate && !ISO_DATE.test(body.endDate)) return NextResponse.json({ error: "invalid_date" }, { status: 400 });

  const { supabase, error: authErr } = await auth();
  if (authErr) return authErr;

  const updates: Record<string, unknown> = {};
  if (body.type !== undefined) updates.type = body.type;
  if (body.startDate !== undefined) updates.start_date = body.startDate;
  if (body.endDate !== undefined) updates.end_date = body.endDate || null;
  if (body.status !== undefined) updates.status = body.status === "ended" ? "ended" : "active";
  if (body.note !== undefined) updates.note = body.note?.trim() || null;

  if (body.docPath || body.docFile) {
    // The storage path is keyed by employee; fetch it from the existing row.
    const { data: row } = await supabase!.from("employee_contracts").select("employee_id").eq("id", body.id).maybeSingle();
    if (!row) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
    if (body.docPath) {
      if (!isValidUploadedPath(body.docPath, String(row.employee_id), DOC_EXTS)) {
        return NextResponse.json({ error: "invalid_path" }, { status: 400 });
      }
      updates.doc_path = body.docPath;
    } else {
      const path = await uploadDoc(supabase!, String(row.employee_id), body.docFile!);
      if (path instanceof NextResponse) return path;
      updates.doc_path = path;
    }
  }

  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });

  const { data, error } = await supabase!.from("employee_contracts").update(updates).eq("id", body.id).select("*").maybeSingle();
  // RLS filters non-HR writes to 0 rows (no error) — treat as forbidden.
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  return NextResponse.json({ ok: true, contract: mapContract(data) });
}

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

  const { data, error } = await supabase!.from("employee_contracts").delete().eq("id", body.id).select("id").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
