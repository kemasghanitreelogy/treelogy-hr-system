"use client";

import { Fragment } from "react";
import { CheckCheck, ExternalLink, Image as ImageIcon, Phone, Video } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Format teks WhatsApp → elemen React: *tebal*, _miring_, ~coret~, ```mono```.
 * Tanpa dangerouslySetInnerHTML — isi variabel datang dari spreadsheet orang,
 * dan pratinjau tidak boleh jadi celah menyisipkan HTML.
 */
export function WaText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {formatLine(line)}
          {i < lines.length - 1 && <br />}
        </Fragment>
      ))}
    </>
  );
}

const TOKEN = /(```[^`]+```|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|⟨\d+⟩)/g;

function formatLine(line: string): React.ReactNode[] {
  return line.split(TOKEN).map((part, i) => {
    if (!part) return null;
    if (part.startsWith("```") && part.endsWith("```") && part.length > 6)
      return <code key={i} className="font-mono text-[0.92em]">{part.slice(3, -3)}</code>;
    if (/^\*[^*]+\*$/.test(part)) return <strong key={i} className="font-semibold">{formatLine(part.slice(1, -1))}</strong>;
    if (/^_[^_]+_$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
    if (/^~[^~]+~$/.test(part)) return <s key={i}>{part.slice(1, -1)}</s>;
    // Variabel yang belum terisi — harus mencolok, bukan tersamar.
    if (/^⟨\d+⟩$/.test(part))
      return (
        <span key={i} className="rounded bg-[#fde7c2] px-1 font-mono text-[0.85em] font-semibold text-[#8a5a00]">
          {`{{${part.slice(1, -1)}}}`}
        </span>
      );
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/** Isi gelembung pesan — dipakai di mockup ponsel dan kartu template. */
export function WaBubble({
  text,
  footer,
  buttons = [],
  media,
  time = "09.41",
  compact = false,
}: {
  text: string;
  footer?: string | null;
  buttons?: { type: string; text: string }[];
  media?: "IMAGE" | "VIDEO" | "DOCUMENT" | null;
  time?: string;
  compact?: boolean;
}) {
  return (
    <div className="max-w-[92%]">
      <div
        className={cn(
          "relative rounded-[10px] rounded-tl-none bg-white text-[#111b21] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]",
          compact ? "px-2 pb-1 pt-1.5 text-[11px] leading-[1.4]" : "px-2.5 pb-1.5 pt-2 text-[14.2px] leading-[1.45]",
        )}
      >
        {/* Ekor gelembung */}
        <span aria-hidden className="absolute -left-[7px] top-0 h-0 w-0 border-r-[8px] border-t-[8px] border-r-transparent border-t-white" style={{ borderRightColor: "transparent" }} />
        {media && (
          <div className={cn("mb-1.5 flex items-center justify-center rounded-md bg-[#e9edef] text-[#8696a0]", compact ? "h-12" : "h-32")}>
            {media === "VIDEO" ? <Video className="h-6 w-6" /> : <ImageIcon className="h-6 w-6" />}
          </div>
        )}
        <div className={cn("whitespace-pre-wrap break-words", compact && "line-clamp-6")}>
          <WaText text={text} />
        </div>
        {footer && <p className={cn("mt-1 text-[#667781]", compact ? "text-[10px]" : "text-[12.5px]")}>{footer}</p>}
        <div className={cn("flex items-center justify-end gap-1 text-[#667781]", compact ? "-mt-0.5 text-[9px]" : "mt-0.5 text-[11px]")}>
          <span>{time}</span>
          <CheckCheck className={cn("text-[#53bdeb]", compact ? "h-3 w-3" : "h-4 w-4")} aria-hidden />
        </div>
      </div>
      {buttons.length > 0 && (
        <div className="mt-0.5 space-y-0.5">
          {buttons.map((b, i) => (
            <div
              key={i}
              className={cn(
                "flex items-center justify-center gap-1.5 rounded-[10px] bg-white font-medium text-[#027eb5] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]",
                compact ? "py-1 text-[10px]" : "py-2 text-[14px]",
              )}
            >
              {b.type.toUpperCase() === "URL" && <ExternalLink className={compact ? "h-3 w-3" : "h-4 w-4"} aria-hidden />}
              {b.type.toUpperCase() === "PHONE_NUMBER" && <Phone className={compact ? "h-3 w-3" : "h-4 w-4"} aria-hidden />}
              {b.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Pola latar obrolan WhatsApp — inline SVG, ringan, tanpa aset luar. */
const WALLPAPER =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 80 80'%3E%3Cg fill='%23d6cfc4' fill-opacity='0.35'%3E%3Ccircle cx='10' cy='10' r='1.6'/%3E%3Ccircle cx='50' cy='30' r='1.2'/%3E%3Ccircle cx='30' cy='60' r='1.4'/%3E%3Ccircle cx='70' cy='70' r='1'/%3E%3C/g%3E%3C/svg%3E\")";

/** Mockup ponsel — yang dilihat pelanggan, persis. */
export function WaPhone({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-[340px] rounded-[2.2rem] border-[7px] border-[#1d2a22] bg-[#1d2a22] shadow-[0_24px_60px_-20px_rgba(29,42,34,0.55)]", className)}>
      <div className="overflow-hidden rounded-[1.7rem]">
        <div className="flex items-center gap-2.5 bg-[#075e54] px-3 pb-2.5 pt-4 text-white">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e9f0d8] text-xs font-bold text-forest-700" aria-hidden>
            T
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold leading-tight">{title}</p>
            {subtitle && <p className="truncate text-[11px] leading-tight text-white/75">{subtitle}</p>}
          </div>
        </div>
        <div className="min-h-[300px] bg-[#efeae2] px-3 py-4" style={{ backgroundImage: WALLPAPER }}>
          {children}
        </div>
      </div>
    </div>
  );
}
