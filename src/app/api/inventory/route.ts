import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mapInventoryItem } from "@/lib/data";
import { CATEGORIES, CONDITIONS, STATUSES } from "@/lib/inventory";
import { isValidUploadedPath } from "@/lib/storage-path";
import type { InventoryItem } from "@/lib/types";

export const runtime = "nodejs";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PHOTO_EXTS = ["jpg", "jpeg", "png", "webp"];
/** Semua foto barang hidup di satu folder — item id belum ada saat upload. */
const PHOTO_FOLDER = "items";

interface ItemPayload {
  id?: string;
  name?: string;
  category?: InventoryItem["category"];
  brand?: string | null;
  serialNo?: string | null;
  quantity?: number;
  unit?: string;
  condition?: InventoryItem["condition"];
  status?: InventoryItem["status"];
  location?: string | null;
  assignedTo?: string | null;
  purchaseDate?: string | null;
  purchasePrice?: number;
  photoPath?: string | null;
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
function validate(body: ItemPayload, partial: boolean): string | null {
  if (!partial || body.name !== undefined) {
    if (!body.name?.trim()) return "name_required";
  }
  if (!partial || body.category !== undefined) {
    if (!body.category || !CATEGORIES.includes(body.category)) return "invalid_category";
  }
  if (body.condition !== undefined && (!body.condition || !CONDITIONS.includes(body.condition))) {
    return "invalid_condition";
  }
  if (body.status !== undefined && (!body.status || !STATUSES.includes(body.status))) {
    return "invalid_status";
  }
  if (body.quantity !== undefined) {
    const q = Number(body.quantity);
    if (!Number.isFinite(q) || q < 0 || q > 1_000_000) return "invalid_quantity";
  }
  if (body.purchasePrice !== undefined) {
    const p = Number(body.purchasePrice);
    if (!Number.isFinite(p) || p < 0) return "invalid_price";
  }
  if (body.purchaseDate) {
    if (!ISO_DATE.test(body.purchaseDate)) return "invalid_date";
  }
  if (body.photoPath && !isValidUploadedPath(body.photoPath, PHOTO_FOLDER, PHOTO_EXTS)) {
    return "invalid_path";
  }
  return null;
}

const trimOrNull = (v: string | null | undefined) => {
  const s = (v ?? "").trim();
  return s === "" ? null : s;
};

function toRow(body: ItemPayload): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (body.name !== undefined) row.name = body.name!.trim();
  if (body.category !== undefined) row.category = body.category;
  if (body.brand !== undefined) row.brand = trimOrNull(body.brand);
  if (body.serialNo !== undefined) row.serial_no = trimOrNull(body.serialNo);
  if (body.quantity !== undefined) row.quantity = Math.floor(Number(body.quantity));
  if (body.unit !== undefined) row.unit = trimOrNull(body.unit) ?? "unit";
  if (body.condition !== undefined) row.condition = body.condition;
  if (body.status !== undefined) row.status = body.status;
  if (body.location !== undefined) row.location = trimOrNull(body.location);
  if (body.assignedTo !== undefined) row.assigned_to = body.assignedTo || null;
  if (body.purchaseDate !== undefined) row.purchase_date = body.purchaseDate || null;
  if (body.purchasePrice !== undefined) row.purchase_price = Math.max(0, Number(body.purchasePrice) || 0);
  if (body.photoPath !== undefined) row.photo_path = body.photoPath || null;
  if (body.note !== undefined) row.note = trimOrNull(body.note);
  return row;
}

/** Postgres 23505 = unique_violation (kode aset bentrok). */
function isCodeConflict(code?: string): boolean {
  return code === "23505";
}

// ---- Tambah barang ----
// Kode aset TIDAK dikirim client: database yang membuatnya (sequence + default),
// jadi mustahil duplikat walau dua HR menyimpan bersamaan.
export async function POST(req: Request) {
  let body: ItemPayload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const invalid = validate(body, false);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const { supabase, error: authErr } = await auth();
  if (authErr) return authErr;

  const { data, error } = await supabase!.from("inventory_items").insert(toRow(body)).select("*").single();
  if (error || !data) {
    if (isCodeConflict(error?.code)) return NextResponse.json({ error: "code_conflict" }, { status: 409 });
    return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  }
  return NextResponse.json({ ok: true, item: mapInventoryItem(data) });
}

// ---- Ubah barang ----
export async function PATCH(req: Request) {
  let body: ItemPayload;
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
    .from("inventory_items")
    .update(row)
    .eq("id", body.id)
    .select("*")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  return NextResponse.json({ ok: true, item: mapInventoryItem(data) });
}

// ---- Hapus barang ----
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
    .from("inventory_items")
    .delete()
    .eq("id", body.id)
    .select("id")
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: "forbidden_or_failed" }, { status: 403 });
  return NextResponse.json({ ok: true });
}
