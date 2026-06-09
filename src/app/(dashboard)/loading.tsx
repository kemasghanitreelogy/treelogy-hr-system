import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted">
      <Loader2 className="h-7 w-7 animate-spin text-forest-600" />
      <p className="text-sm">Memuat data…</p>
    </div>
  );
}
