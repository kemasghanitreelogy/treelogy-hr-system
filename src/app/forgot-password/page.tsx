"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Mail, MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const target = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      setError("Masukkan alamat email yang valid.");
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      if (!supabase) {
        setError("Fitur ini butuh Supabase aktif (saat ini mode demo).");
        return;
      }
      const { error } = await supabase.auth.resetPasswordForEmail(target, {
        redirectTo: `${window.location.origin}/auth/reset`,
      });
      if (error) {
        setError("Gagal mengirim email. Coba lagi sebentar.");
        return;
      }
      setEmail(target);
      setSent(true);
    } catch {
      setError("Terjadi kesalahan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grain flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo />
        </div>

        <div className="card space-y-5 p-6">
          {sent ? (
            <div className="flex flex-col items-center text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-forest-100 text-forest-700">
                <MailCheck className="h-5 w-5" />
              </div>
              <h1 className="mt-3 font-display text-xl font-bold text-ink">Cek email kamu</h1>
              <p className="mt-1 text-sm text-muted">
                Kami kirim tautan reset kata sandi ke <span className="font-medium text-ink">{email}</span>.
                Klik tombol <span className="font-medium text-ink">Reset Password</span> di email itu untuk
                membuat kata sandi baru.
              </p>
              <p className="mt-3 text-xs text-faint">
                Tidak ada email? Cek folder spam, atau{" "}
                <button
                  type="button"
                  onClick={() => setSent(false)}
                  className="cursor-pointer font-medium text-forest-700 hover:underline"
                >
                  kirim ulang
                </button>
                .
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-forest-100 text-forest-700">
                  <Mail className="h-5 w-5" />
                </div>
                <h1 className="mt-3 font-display text-xl font-bold text-ink">Lupa kata sandi?</h1>
                <p className="mt-1 text-sm text-muted">
                  Masukkan email akunmu — kami kirim tautan untuk reset kata sandi.
                </p>
              </div>

              {!isSupabaseConfigured && (
                <p className="rounded-xl bg-gold-soft px-3 py-2 text-xs text-[#8a6512]">
                  Mode demo (tanpa Supabase) — fitur lupa sandi tidak aktif.
                </p>
              )}

              {error && (
                <p className="rounded-xl bg-clay-soft px-3 py-2 text-sm text-[#8c3c1f]">{error}</p>
              )}

              <form onSubmit={submit} className="space-y-4">
                <Field label="Email" htmlFor="email">
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@treelogy.com"
                  />
                </Field>
                <Button type="submit" size="lg" className="w-full" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                  Kirim tautan reset
                </Button>
              </form>
            </>
          )}
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
          >
            <ArrowLeft className="h-4 w-4" />
            Kembali ke halaman masuk
          </Link>
        </div>
      </div>
    </div>
  );
}
