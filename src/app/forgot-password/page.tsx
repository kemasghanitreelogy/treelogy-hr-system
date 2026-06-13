"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { OtpInput } from "@/components/ui/otp-input";

type Step = "email" | "otp" | "password" | "done";

const RESEND_SECONDS = 45;

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data } as const;
}

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    timer.current = setInterval(() => setCooldown((s) => (s <= 1 ? 0 : s - 1)), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [cooldown]);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    const target = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) {
      setError("Masukkan alamat email yang valid.");
      return;
    }
    setBusy(true);
    try {
      const { ok, data } = await postJson("/api/auth/forgot/request", { email: target });
      if (!ok) {
        const reason = (data as { error?: string })?.error;
        setError(
          reason === "not_configured"
            ? "Layanan email belum dikonfigurasi. Hubungi admin."
            : reason === "send_failed"
              ? "Email gagal terkirim. Coba lagi atau hubungi admin."
              : reason === "lookup_unavailable"
                ? "Layanan sedang bermasalah. Coba lagi sebentar lagi."
                : "Gagal mengirim kode. Coba lagi.",
        );
        return;
      }
      setEmail(target);
      setCode("");
      setStep("otp");
      setCooldown(RESEND_SECONDS);
    } catch {
      setError("Terjadi kesalahan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    if (code.length !== 6) {
      setError("Masukkan 6 digit kode.");
      return;
    }
    setBusy(true);
    try {
      const { ok } = await postJson("/api/auth/forgot/verify", { email, code });
      if (!ok) {
        setError("Kode salah atau sudah kedaluwarsa.");
        return;
      }
      setStep("password");
    } catch {
      setError("Terjadi kesalahan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Kata sandi minimal 8 karakter.");
      return;
    }
    if (password !== confirm) {
      setError("Konfirmasi kata sandi tidak cocok.");
      return;
    }
    setBusy(true);
    try {
      const { ok, data } = await postJson("/api/auth/forgot/reset", { email, code, password });
      if (!ok) {
        setError(
          data?.error === "invalid_code"
            ? "Kode sudah kedaluwarsa. Ulangi dari awal."
            : "Gagal menyimpan kata sandi. Coba lagi.",
        );
        return;
      }
      setStep("done");
      setTimeout(() => router.push("/login"), 1800);
    } catch {
      setError("Terjadi kesalahan. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  const stepMeta: Record<Step, { icon: React.ReactNode; title: string; subtitle: string }> = {
    email: {
      icon: <Mail className="h-5 w-5" />,
      title: "Lupa kata sandi?",
      subtitle: "Masukkan email akunmu — kami kirim kode verifikasi 6 digit.",
    },
    otp: {
      icon: <ShieldCheck className="h-5 w-5" />,
      title: "Verifikasi kode",
      subtitle: `Kode dikirim ke ${email}. Cek kotak masuk (atau folder spam).`,
    },
    password: {
      icon: <KeyRound className="h-5 w-5" />,
      title: "Kata sandi baru",
      subtitle: "Buat kata sandi baru untuk akunmu.",
    },
    done: {
      icon: <CheckCircle2 className="h-5 w-5" />,
      title: "Berhasil!",
      subtitle: "Kata sandi diperbarui. Mengalihkan ke halaman masuk…",
    },
  };

  const meta = stepMeta[step];

  return (
    <div className="grain flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo />
        </div>

        <div className="card space-y-5 p-6">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-forest-100 text-forest-700">
              {meta.icon}
            </div>
            <h1 className="mt-3 font-display text-xl font-bold text-ink">{meta.title}</h1>
            <p className="mt-1 text-sm text-muted">{meta.subtitle}</p>
          </div>

          {error && (
            <p className="rounded-xl bg-clay-soft px-3 py-2 text-sm text-[#8c3c1f]">{error}</p>
          )}

          {step === "email" && (
            <form onSubmit={sendCode} className="space-y-4">
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
                Kirim kode
              </Button>
            </form>
          )}

          {step === "otp" && (
            <form onSubmit={verifyCode} className="space-y-4">
              <OtpInput value={code} onChange={setCode} disabled={busy} autoFocus />
              <Button type="submit" size="lg" className="w-full" disabled={busy || code.length !== 6}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="h-4 w-4" />
                )}
                Verifikasi
              </Button>
              <div className="text-center text-xs text-faint">
                {cooldown > 0 ? (
                  <span>Kirim ulang kode dalam {cooldown}s</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => sendCode()}
                    disabled={busy}
                    className="cursor-pointer font-medium text-forest-700 hover:underline disabled:opacity-60"
                  >
                    Kirim ulang kode
                  </button>
                )}
              </div>
            </form>
          )}

          {step === "password" && (
            <form onSubmit={savePassword} className="space-y-4">
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
              <Button type="submit" size="lg" className="w-full" disabled={busy}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                Simpan kata sandi
              </Button>
            </form>
          )}

          {step === "done" && (
            <div className="flex flex-col items-center py-2 text-center">
              <Loader2 className="h-5 w-5 animate-spin text-forest-600" />
            </div>
          )}
        </div>

        {step !== "done" && (
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
