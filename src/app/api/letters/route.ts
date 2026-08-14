import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mapOutgoingLetter } from "@/lib/data";
import { can, getSessionUser } from "@/lib/auth";
import { LETTER_DEPTS } from "@/lib/letters";
import type { LetterDept } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Surat keluar: satu tindakan saja — terbitkan nomor untuk sebuah departemen.
 *
 * Nomornya TIDAK dihitung di sini. Trigger database yang membentuknya dalam
 * transaksi yang sama dengan penyisipan baris, sehingga dua permintaan yang
 * datang bersamaan mustahil memperoleh nomor kembar.
 */

async function sesi() {
  const supabase = await createClient();
  if (!supabase) return { error: NextResponse.json({ error: "unavailable" }, { status: 503 }) };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  return { supabase, user };
}

export async function POST(req: Request) {
  const { supabase, user, error } = await sesi();
  if (error) return error;

  const me = await getSessionUser();
  if (!can(me, "letters.manage") && !can(me, "employees.manage")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { department?: LetterDept };
  if (!body.department || !LETTER_DEPTS.includes(body.department)) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const { data, error: dbError } = await supabase
    .from("outgoing_letters")
    .insert({
      department: body.department,
      created_by: user!.id,
      created_by_name: me?.name ?? null,
    })
    .select("*")
    .single();

  if (dbError || !data) {
    return NextResponse.json({ error: dbError?.message ?? "insert_failed" }, { status: 500 });
  }
  return NextResponse.json({ letter: mapOutgoingLetter(data) }, { status: 201 });
}

/**
 * Batalkan nomor yang salah terbit (mis. departemen keliru).
 *
 * Nomornya sengaja TIDAK didaur ulang: pencacah tidak diturunkan. Nomor surat
 * yang pernah muncul harus tetap menunjuk satu surat saja seumur hidup arsip,
 * jadi lebih baik ada nomor yang bolong daripada ada nomor yang dipakai dua kali.
 */
export async function DELETE(req: Request) {
  const { supabase, error } = await sesi();
  if (error) return error;

  const me = await getSessionUser();
  if (!can(me, "letters.manage") && !can(me, "employees.manage")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const { error: dbError } = await supabase.from("outgoing_letters").delete().eq("id", id);
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
