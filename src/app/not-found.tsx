import Link from "next/link";
import { Logo } from "@/components/layout/logo";

export default function NotFound() {
  return (
    <div className="grain flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <Logo />
      <p className="mt-10 font-display text-6xl font-bold text-forest-600">404</p>
      <h1 className="mt-2 font-display text-xl font-bold text-ink">Halaman tidak ditemukan</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">
        Halaman yang Anda cari tidak ada atau telah dipindahkan.
      </p>
      <Link
        href="/dashboard"
        className="mt-6 inline-flex h-11 items-center rounded-xl bg-forest-600 px-5 text-sm font-medium text-cream transition-colors hover:bg-forest-700"
      >
        Kembali ke Dashboard
      </Link>
    </div>
  );
}
