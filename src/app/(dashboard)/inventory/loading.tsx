// Skeleton yang meniru bentuk akhir halaman (statistik → filter → kartu barang)
// supaya tidak ada lompatan layout saat data tiba.
export default function InventoryLoading() {
  return (
    <div className="space-y-4">
      <div className="h-5 w-80 max-w-full animate-pulse rounded-lg bg-sand" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card h-[104px] animate-pulse bg-panel" />
        ))}
      </div>
      <div className="h-[68px] animate-pulse rounded-2xl border border-line bg-panel" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 rounded-2xl border border-line bg-panel p-3">
            <div className="h-14 w-14 shrink-0 animate-pulse rounded-xl bg-sand" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-20 animate-pulse rounded bg-sand/70" />
              <div className="h-3.5 w-36 max-w-full animate-pulse rounded bg-sand" />
              <div className="h-3 w-28 animate-pulse rounded bg-sand/70" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
