import Link from "next/link";
import { CloudOff } from "lucide-react";
import { Logo } from "@/components/layout/logo";

export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <div className="grain flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <Logo />
      <span className="mt-10 flex h-16 w-16 items-center justify-center rounded-2xl bg-forest-100 text-forest-700">
        <CloudOff className="h-8 w-8" />
      </span>
      <h1 className="mt-5 font-display text-xl font-bold text-ink">Anda sedang offline</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">
        Koneksi internet tidak tersedia. Halaman yang pernah dibuka tetap bisa diakses, dan
        perubahan akan tersinkron saat Anda kembali online.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex h-11 items-center rounded-xl bg-forest-600 px-5 text-sm font-medium text-cream transition-colors hover:bg-forest-700"
      >
        Coba lagi
      </Link>
    </div>
  );
}
