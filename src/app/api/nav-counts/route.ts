import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getActionCounts, getUnreadNotifCount } from "@/lib/data";

export const runtime = "nodejs";

/**
 * Angka badge nav + notifikasi, diambil klien setelah shell tampil → tidak
 * memblok paint pertama (splash PWA cepat hilang). Tidak pernah melempar error
 * ke klien; balas nol bila belum login.
 */
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ unread: 0, counts: {} });
    const [unread, ac] = await Promise.all([getUnreadNotifCount(), getActionCounts(user)]);
    return NextResponse.json({
      unread,
      counts: { "/leave": ac.leave, "/overtime": ac.overtime, "/attendance": ac.attendance },
    });
  } catch {
    return NextResponse.json({ unread: 0, counts: {} });
  }
}
