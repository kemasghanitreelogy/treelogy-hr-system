"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { SuccessCheck } from "@/components/ui/success-check";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSuccess() {
    const next = new URLSearchParams(window.location.search).get("next") || "/dashboard";
    // Prefetch so the dashboard is ready the moment the checkmark finishes.
    router.prefetch(next);
    setSuccess(true);
    // Let the checkmark draw + register, then glide into the dashboard.
    // `replace` (not push) so pressing Back from the dashboard never
    // returns to the login screen.
    window.setTimeout(() => {
      router.replace(next);
      router.refresh();
    }, 1100);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const supabase = createClient();
      if (!supabase) {
        onSuccess();
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError("Email atau kata sandi salah.");
        setBusy(false);
        return;
      }
      onSuccess();
    } catch {
      setError("Terjadi kesalahan. Coba lagi.");
      setBusy(false);
    }
  }

  return (
    <div className="grain flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo />
          <h1 className="mt-6 font-display text-2xl font-bold text-ink">Masuk ke Treelogy HR</h1>
          <p className="mt-1 text-sm text-muted">Sistem SDM untuk tim pabrik, kebun &amp; sales 🌿</p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-6">
          {!isSupabaseConfigured && (
            <p className="rounded-xl bg-gold-soft px-3 py-2 text-xs text-[#8a6512]">
              Mode demo (tanpa Supabase) — klik Masuk untuk lanjut.
            </p>
          )}

          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required={isSupabaseConfigured}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@treelogy.com"
            />
          </Field>

          <Field label="Kata sandi" htmlFor="password">
            <div className="relative">
              <Input
                id="password"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                required={isSupabaseConfigured}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-faint hover:text-ink"
                aria-label={show ? "Sembunyikan" : "Tampilkan"}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </Field>

          {error && (
            <p className="rounded-xl bg-clay-soft px-3 py-2 text-sm text-[#8c3c1f]">{error}</p>
          )}

          <div className="text-right">
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-forest-700 hover:underline"
            >
              Lupa kata sandi?
            </Link>
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            Masuk
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-faint">
          © 2026 Treelogy · Premium Organic Moringa
        </p>
      </div>

      {success && (
        <div className="grain fixed inset-0 z-[90] flex flex-col items-center justify-center bg-cream animate-overlay">
          <div className="animate-pop-in animate-glow flex h-24 w-24 items-center justify-center rounded-full bg-forest-600 text-cream">
            <SuccessCheck className="h-12 w-12 text-cream" />
          </div>
          <p className="fade-up mt-6 font-display text-lg font-semibold text-ink" style={{ animationDelay: "0.5s" }}>
            Berhasil masuk
          </p>
          <p className="fade-up mt-1 text-sm text-muted" style={{ animationDelay: "0.62s" }}>
            Mengalihkan ke dashboard…
          </p>
        </div>
      )}
    </div>
  );
}
