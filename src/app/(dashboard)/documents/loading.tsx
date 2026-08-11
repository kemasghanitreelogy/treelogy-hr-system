// Skeleton meniru bentuk akhir halaman (baris aksi → ringkasan → daftar padat)
// supaya tidak ada lompatan layout saat data tiba.
export default function DocumentsLoading() {
  return (
    <div className="space-y-3">
      <div className="h-5 w-80 max-w-full animate-pulse rounded-lg bg-sand" />
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="h-10 flex-1 animate-pulse rounded-xl bg-sand/70" />
        <div className="flex gap-2">
          <div className="h-10 w-44 animate-pulse rounded-xl bg-sand/70" />
          <div className="h-10 w-44 animate-pulse rounded-xl bg-sand/70" />
        </div>
      </div>
      <div className="h-4 w-56 animate-pulse rounded bg-sand/70" />
      <div className="overflow-hidden rounded-2xl border border-line bg-panel divide-y divide-line">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-2.5">
            <div className="h-9 w-9 shrink-0 animate-pulse rounded-xl bg-sand" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-56 max-w-full animate-pulse rounded bg-sand" />
              <div className="h-3 w-32 animate-pulse rounded bg-sand/70" />
            </div>
            <div className="h-5 w-16 shrink-0 animate-pulse rounded-full bg-sand/70" />
          </div>
        ))}
      </div>
    </div>
  );
}
