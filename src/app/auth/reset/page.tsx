"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

type Status = "verifying" | "form" | "saving" | "done" | "error";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("verifying");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Verify the recovery link on mount, establishing a session.
  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createClient();
      if (!supabase) {
        if (active) setStatus("error");
        return;
      }

      const url = new URL(window.location.href);
      const tokenHash = url.searchParams.get("token_hash");
      const type = url.searchParams.get("type");
      const code = url.searchParams.get("code");

      try {
        if (tokenHash) {
          // Custom template link: verify the recovery token hash directly.
          const { error } = await supabase.auth.verifyOtp({
            type: (type as "recovery") ?? "recovery",
            token_hash: tokenHash,
          });
          if (error) throw error;
        } else if (code) {
          // PKCE fallback (default Supabase link with ?code=).
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else {
          // Implicit/hash link — the client auto-detects the session from the URL hash.
          const { data } = await supabase.auth.getSession();
          if (!data.session) throw new Error("no session");
        }
        if (active) setStatus("form");
      } catch {
        if (active) setStatus("error");
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Kata sandi minimal 8 karakter.");
      return;
    }
    if (password !== confirm) {
      setError("Konfirmasi kata sandi tidak cocok.");
      return;
    }
    setStatus("saving");
    try {
      const supabase = createClient();
      if (!supabase) {
        setError("Fitur ini butuh Supabase aktif.");
        setStatus("form");
        return;
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError("Gagal menyimpan kata sandi. Coba lagi.");
        setStatus("form");
        return;
      }
      setStatus("done");
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 1600);
    } catch {
      setError("Terjadi kesalahan. Coba lagi.");
      setStatus("form");
    }
  }

  return (
    <div className="grain flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo />
        </div>

        <div className="card space-y-5 p-6">
          {status === "verifying" && (
            <div className="flex flex-col items-center py-4 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-forest-600" />
              <p className="mt-3 text-sm text-muted">Memverifikasi tautan…</p>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-clay-soft text-[#8c3c1f]">
                <TriangleAlert className="h-5 w-5" />
              </div>
              <h1 className="mt-3 font-display text-xl font-bold text-ink">Tautan tidak valid</h1>
              <p className="mt-1 text-sm text-muted">
                Tautan reset sudah kedaluwarsa atau pernah dipakai. Silakan minta tautan baru.
              </p>
              <Link href="/forgot-password" className="mt-4 w-full">
                <Button size="lg" className="w-full">
                  Minta tautan baru
                </Button>
              </Link>
            </div>
          )}

          {status === "done" && (
            <div className="flex flex-col items-center text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-forest-100 text-forest-700">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <h1 className="mt-3 font-display text-xl font-bold text-ink">Berhasil!</h1>
              <p className="mt-1 text-sm text-muted">
                Kata sandi diperbarui. Mengalihkan ke dashboard…
              </p>
              <Loader2 className="mt-3 h-5 w-5 animate-spin text-forest-600" />
            </div>
          )}

          {(status === "form" || status === "saving") && (
            <>
              <div className="flex flex-col items-center text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-forest-100 text-forest-700">
                  <KeyRound className="h-5 w-5" />
                </div>
                <h1 className="mt-3 font-display text-xl font-bold text-ink">Kata sandi baru</h1>
                <p className="mt-1 text-sm text-muted">Buat kata sandi baru untuk akunmu.</p>
              </div>

              {error && (
                <p className="rounded-xl bg-clay-soft px-3 py-2 text-sm text-[#8c3c1f]">{error}</p>
              )}

              <form onSubmit={save} className="space-y-4">
                <Field label="Kata sandi baru" htmlFor="new-password" hint="Minimal 8 karakter.">
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={show ? "text" : "password"}
                      autoComplete="new-password"
                      autoFocus
                      required
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
                <Field label="Konfirmasi kata sandi baru" htmlFor="confirm-password">
                  <Input
                    id="confirm-password"
                    type={show ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="••••••••"
                  />
                </Field>
                <Button type="submit" size="lg" className="w-full" disabled={status === "saving"}>
                  {status === "saving" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <KeyRound className="h-4 w-4" />
                  )}
                  Simpan kata sandi
                </Button>
              </form>
            </>
          )}
        </div>

        {status !== "done" && (
          <div className="mt-6 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"
            >
              <ArrowLeft className="h-4 w-4" />
              Kembali ke halaman masuk
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
