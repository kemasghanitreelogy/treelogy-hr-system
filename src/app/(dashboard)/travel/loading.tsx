// Skeleton meniru bentuk akhir (baris aksi → ringkasan → daftar padat).
export default function TravelLoading() {
  return (
    <div className="space-y-3">
      <div className="h-5 w-96 max-w-full animate-pulse rounded-lg bg-sand" />
      <div className="flex flex-col gap-2 lg:flex-row">
        <div className="h-10 w-48 animate-pulse rounded-xl bg-sand/70" />
        <div className="h-10 flex-1 animate-pulse rounded-xl bg-sand/70" />
        <div className="h-10 w-40 animate-pulse rounded-xl bg-sand/70" />
      </div>
      <div className="h-4 w-64 animate-pulse rounded bg-sand/70" />
      <div className="overflow-hidden rounded-2xl border border-line bg-panel divide-y divide-line">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-3 py-3">
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-48 max-w-full animate-pulse rounded bg-sand" />
              <div className="h-3 w-64 max-w-full animate-pulse rounded bg-sand/70" />
            </div>
            <div className="h-5 w-20 shrink-0 animate-pulse rounded-full bg-sand/70" />
          </div>
        ))}
      </div>
    </div>
  );
}
