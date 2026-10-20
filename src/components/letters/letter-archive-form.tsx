"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, RotateCcw, Save } from "lucide-react";
import type { OutgoingLetter } from "@/lib/types";
import type { Locale } from "@/lib/i18n";
import { apiErrorMessage } from "@/lib/api-error";
import { prepareFileForBucket } from "@/lib/upload";
import { useLocale } from "@/components/layout/locale-context";
import { ItemPhoto } from "@/components/inventory/item-photo";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

const STR: Record<Locale, Record<string, string>> = {
  id: {
    photo: "Foto surat",
    photoHint: "Potret surat fisiknya — otomatis dikompres, tetap tajam untuk dibaca.",
    take: "Ambil foto",
    retake: "Ulangi foto",
    title: "Judul surat",
    titlePh: "mis. Surat penawaran kerja sama — PT Maju",
    save: "Simpan",
    uploading: "Mengunggah foto…",
    saving: "Menyimpan…",
    saved: "Arsip surat tersimpan ✓",
    connection: "Koneksi bermasalah. Coba lagi.",
  },
  en: {
    photo: "Letter photo",
    photoHint: "Snap the physical letter — compressed automatically, still sharp enough to read.",
    take: "Take photo",
    retake: "Retake photo",
    title: "Letter title",
    titlePh: "e.g. Partnership proposal — PT Maju",
    save: "Save",
    uploading: "Uploading photo…",
    saving: "Saving…",
    saved: "Letter archive saved ✓",
    connection: "Connection problem. Try again.",
  },
};

/**
 * Arsip satu nomor surat: foto surat fisik + judul.
 *
 * Dipakai di dua tempat — langkah sukses setelah nomor terbit, dan lembar
 * detail sebuah baris — supaya alurnya satu dan sama. Fotonya diunggah
 * langsung ke bucket privat saat Simpan (bukan saat dipotret), jadi memotret
 * ulang tidak meninggalkan berkas yatim.
 */
export function LetterArchiveForm({
  letter,
  onSaved,
}: {
  letter: OutgoingLetter;
  onSaved: (updated: OutgoingLetter) => void;
}) {
  const locale = useLocale();
  const t = STR[locale];
  const toast = useToast();
  const kamera = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState(letter.title ?? "");
  const [step, setStep] = useState<"idle" | "uploading" | "saving">("idle");

  // Pratinjau lokal; URL objeknya dilepas saat diganti/ditutup.
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const busy = step !== "idle";
  const punyaFoto = Boolean(file || letter.photoPath);
  const bisaSimpan = !busy && punyaFoto && title.trim().length > 0;

  function pilih(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // memotret ulang file yang "sama" tetap memicu onChange
    if (f) setFile(f);
  }

  async function simpan() {
    if (!bisaSimpan) return;
    try {
      let photoPath: string | null = null;
      if (file) {
        setStep("uploading");
        try {
          const up = await prepareFileForBucket("letter-files", letter.id, file);
          photoPath = up.path;
        } catch (err) {
          toast.error(apiErrorMessage(err instanceof Error ? err.message : "upload_failed", locale));
          return;
        }
      }
      setStep("saving");
      const res = await fetch("/api/letters", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: letter.id, title: title.trim(), photoPath }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.letter) {
        toast.error(apiErrorMessage(data?.error, locale, res.status));
        return;
      }
      toast.success(t.saved);
      setFile(null);
      onSaved(data.letter as OutgoingLetter);
    } catch {
      toast.error(t.connection);
    } finally {
      setStep("idle");
    }
  }

  return (
    <div className="space-y-3 text-left">
      <Field label={t.photo} hint={t.photoHint} required>
        {/* capture="environment" → kamera belakang langsung terbuka di HP;
            di komputer jatuh ke pemilih berkas biasa. */}
        <input
          ref={kamera}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={pilih}
        />
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt={t.photo}
            className="max-h-80 w-full rounded-2xl border border-line bg-sand/60 object-contain"
          />
        ) : letter.photoPath ? (
          <ItemPhoto
            path={letter.photoPath}
            alt={t.photo}
            endpoint="/api/letters/photo"
            className="h-64 w-full [&_img]:object-contain"
          />
        ) : (
          <button
            type="button"
            onClick={() => kamera.current?.click()}
            disabled={busy}
            className="flex h-40 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-forest-200 bg-forest-50/50 text-forest-700 transition-colors hover:border-forest-400 hover:bg-forest-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-400 disabled:opacity-60"
          >
            <Camera className="h-7 w-7" />
            <span className="text-sm font-semibold">{t.take}</span>
          </button>
        )}
        {punyaFoto && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-2"
            disabled={busy}
            onClick={() => kamera.current?.click()}
          >
            {file ? <RotateCcw className="h-3.5 w-3.5" /> : <Camera className="h-3.5 w-3.5" />}
            {file ? t.retake : t.take}
          </Button>
        )}
      </Field>

      <Field label={t.title} htmlFor={`judul-${letter.id}`} required>
        <Input
          id={`judul-${letter.id}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t.titlePh}
          maxLength={200}
          disabled={busy}
        />
      </Field>

      <Button className="w-full" onClick={simpan} disabled={!bisaSimpan}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {step === "uploading" ? t.uploading : step === "saving" ? t.saving : t.save}
      </Button>
    </div>
  );
}
