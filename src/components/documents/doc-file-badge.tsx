"use client";

import { File, FileImage, FileSpreadsheet, FileText, Presentation, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Ikon jenis berkas 36px — padanan visual QR kecil di daftar inventaris:
 * penanda cepat "dokumen ini PDF / spreadsheet / gambar" tanpa membuka detail.
 */
const BY_EXT: Record<string, { icon: LucideIcon; cls: string }> = {
  pdf: { icon: FileText, cls: "bg-clay-soft text-[#8c3c1f]" },
  doc: { icon: FileText, cls: "bg-sky-soft text-[#2b5d7c]" },
  docx: { icon: FileText, cls: "bg-sky-soft text-[#2b5d7c]" },
  xls: { icon: FileSpreadsheet, cls: "bg-forest-50 text-forest-600" },
  xlsx: { icon: FileSpreadsheet, cls: "bg-forest-50 text-forest-600" },
  pptx: { icon: Presentation, cls: "bg-gold-soft text-[#8a6512]" },
  jpg: { icon: FileImage, cls: "bg-sand text-muted" },
  jpeg: { icon: FileImage, cls: "bg-sand text-muted" },
  png: { icon: FileImage, cls: "bg-sand text-muted" },
  webp: { icon: FileImage, cls: "bg-sand text-muted" },
};

export function DocFileBadge({ ext, className }: { ext: string | null; className?: string }) {
  const { icon: Icon, cls } = (ext && BY_EXT[ext]) || { icon: File, cls: "bg-sand text-faint" };
  return (
    <span
      className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-line", cls, className)}
      title={ext ? `.${ext}` : undefined}
    >
      <Icon className="h-4.5 w-4.5" />
    </span>
  );
}
