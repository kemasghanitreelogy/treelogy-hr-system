import { NextResponse } from "next/server";
import { can, getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Tandai review sudah masuk sebuah berkas ekspor.
 *
 * Berkasnya sendiri dibuat di browser dari data yang sudah ada di layar — jadi
 * route ini hanya memindahkan satu penanda. Itu penting: penanda baru ditulis
 * SESUDAH berkasnya benar-benar tersimpan, sehingga unduhan yang gagal di
 * tengah tidak membuat review hilang dari daftar "belum diekspor".
 *
 * Menandai ulang baris yang sudah pernah ditandai TIDAK menggeser tanggalnya —
 * yang dicatat adalah kapan sebuah review pertama kali ikut terkirim.
 */
export async function POST(req: Request) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(me, "reviews.view")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { feedbackIds?: unknown };
  const ids = Array.isArray(body.feedbackIds)
    ? body.feedbackIds.filter((v): v is string => typeof v === "string" && v.length > 0)
    : [];
  if (!ids.length) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  const now = new Date().toISOString();
  let marked = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase
      .from("tokopedia_reviews")
      .update({ exported_at: now })
      .in("feedback_id", ids.slice(i, i + 200))
      .is("exported_at", null)
      .select("feedback_id");
    if (error) return NextResponse.json({ error: "save_failed" }, { status: 500 });
    marked += data?.length ?? 0;
  }

  return NextResponse.json({ marked });
}

/**
 * Batalkan penandaan — untuk saat berkasnya ternyata tidak jadi diimport.
 *
 * Tanpa ini, satu unduhan percobaan akan menyembunyikan review itu selamanya
 * dari daftar "belum diekspor", dan satu-satunya jalan pulih adalah menyunting
 * database langsung.
 */
export async function DELETE(req: Request) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!can(me, "reviews.view")) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { feedbackIds?: unknown };
  const ids = Array.isArray(body.feedbackIds)
    ? body.feedbackIds.filter((v): v is string => typeof v === "string" && v.length > 0)
    : [];
  if (!ids.length) return NextResponse.json({ error: "invalid_input" }, { status: 400 });

  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await supabase
      .from("tokopedia_reviews")
      .update({ exported_at: null })
      .in("feedback_id", ids.slice(i, i + 200));
    if (error) return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
