"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastApi {
  toast: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const AUTO_DISMISS_MS = 3800;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const seq = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  const remove = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, type: ToastType = "success") => {
      const id = ++seq.current;
      setItems((prev) => [...prev, { id, type, message }].slice(-4));
      timers.current.set(
        id,
        setTimeout(() => remove(id), AUTO_DISMISS_MS),
      );
    },
    [remove],
  );

  const api: ToastApi = {
    toast,
    success: useCallback((m: string) => toast(m, "success"), [toast]),
    error: useCallback((m: string) => toast(m, "error"), [toast]),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {mounted &&
        createPortal(
          <div
            className="pointer-events-none fixed inset-x-0 top-0 z-[100] flex flex-col items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-4"
            role="region"
            aria-live="polite"
            aria-label="Notifikasi"
          >
            {items.map((t) => (
              <ToastCard key={t.id} item={t} onClose={() => remove(t.id)} />
            ))}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}

function ToastCard({ item, onClose }: { item: ToastItem; onClose: () => void }) {
  const styles: Record<ToastType, { ring: string; icon: React.ReactNode }> = {
    success: {
      ring: "ring-forest-200",
      icon: <CheckCircle2 className="h-5 w-5 text-forest-600" />,
    },
    error: {
      ring: "ring-clay/30",
      icon: <AlertTriangle className="h-5 w-5 text-clay" />,
    },
    info: {
      ring: "ring-line",
      icon: <Info className="h-5 w-5 text-sky" />,
    },
  };
  const s = styles[item.type];
  return (
    <div
      className={cn(
        "pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl bg-panel px-4 py-3 shadow-pop ring-1 animate-toast-in",
        s.ring,
      )}
      role="alert"
    >
      <span className="mt-0.5 shrink-0">{s.icon}</span>
      <p className="flex-1 text-sm font-medium text-ink">{item.message}</p>
      <button
        onClick={onClose}
        className="-mr-1 -mt-0.5 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted transition-colors hover:bg-sand"
        aria-label="Tutup notifikasi"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}
