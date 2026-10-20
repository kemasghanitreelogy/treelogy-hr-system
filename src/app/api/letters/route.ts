import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mapOutgoingLetter } from "@/lib/data";
import { can, getSessionUser } from "@/lib/auth";
import { LETTER_DEPTS } from "@/lib/letters";
import { isValidUploadedPath } from "@/lib/storage-path";
import { createAdminClient } from "@/lib/supabase/admin";
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
 * Arsipkan surat: judul + foto surat fisik.
 *
 * Fotonya diunggah langsung dari browser ke bucket privat `letter-files`
 * (lib/upload.ts) di folder milik nomor surat ini; yang sampai ke sini hanya
 * path-nya, dan bentuknya divalidasi supaya tidak bisa menunjuk berkas surat
 * lain. Nomor, departemen, dan urutannya tidak ikut berubah — database pun
 * hanya membuka kolom arsip untuk UPDATE (migration 0086).
 */
export async function PATCH(req: Request) {
  const { supabase, error } = await sesi();
  if (error) return error;

  const me = await getSessionUser();
  if (!can(me, "letters.manage") && !can(me, "employees.manage")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { id?: string; title?: string; photoPath?: string | null };
  const id = typeof body.id === "string" ? body.id : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!id) return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  if (!title || title.length > 200) return NextResponse.json({ error: "title_required" }, { status: 400 });

  const { data: lama } = await supabase.from("outgoing_letters").select("photo_path").eq("id", id).maybeSingle();
  if (!lama) return NextResponse.json({ error: "letter_not_found" }, { status: 404 });

  // Foto baru opsional saat menyunting; tanpa foto baru, foto lama dipertahankan.
  let photoPath = (lama.photo_path as string | null) ?? null;
  if (body.photoPath != null && body.photoPath !== photoPath) {
    if (!isValidUploadedPath(body.photoPath, id, ["webp", "jpg", "jpeg", "png", "heic"])) {
      return NextResponse.json({ error: "invalid_path" }, { status: 400 });
    }
    photoPath = body.photoPath;
  }
  if (!photoPath) return NextResponse.json({ error: "photo_required" }, { status: 400 });

  const { data, error: dbError } = await supabase
    .from("outgoing_letters")
    .update({ title, photo_path: photoPath, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  // Foto yang diganti dibuang supaya tidak menumpuk berkas yatim. Best-effort:
  // arsipnya sudah benar walau penghapusan ini gagal.
  if (lama.photo_path && lama.photo_path !== photoPath) {
    try {
      await createAdminClient()?.storage.from("letter-files").remove([String(lama.photo_path)]);
    } catch {
      /* abaikan */
    }
  }

  return NextResponse.json({ letter: mapOutgoingLetter(data) });
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
