"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

/** 6-digit numeric OTP input with auto-advance, backspace, and paste support. */
export function OtpInput({
  value,
  onChange,
  disabled,
  length = 6,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  length?: number;
  autoFocus?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  function setDigit(index: number, char: string) {
    const clean = char.replace(/\D/g, "");
    if (!clean) return;
    const next = (value.slice(0, index) + clean + value.slice(index + 1)).slice(0, length);
    onChange(next);
    const focusTo = Math.min(index + clean.length, length - 1);
    refs.current[focusTo]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (digits[index]) {
        onChange(value.slice(0, index) + value.slice(index + 1));
      } else if (index > 0) {
        onChange(value.slice(0, index - 1) + value.slice(index));
        refs.current[index - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      refs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < length - 1) {
      refs.current[index + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    if (!pasted) return;
    onChange(pasted);
    refs.current[Math.min(pasted.length, length - 1)]?.focus();
  }

  return (
    <div className="flex justify-center gap-2" onPaste={handlePaste}>
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          autoFocus={autoFocus && i === 0}
          disabled={disabled}
          value={digit}
          onChange={(e) => setDigit(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          aria-label={`Digit ${i + 1}`}
          className={cn(
            "h-12 w-11 rounded-xl border border-line bg-panel text-center font-display text-xl font-semibold text-ink outline-none transition",
            "focus:border-forest-300 focus:ring-2 focus:ring-forest-100 disabled:opacity-60",
            digit && "border-forest-300",
          )}
        />
      ))}
    </div>
  );
}
