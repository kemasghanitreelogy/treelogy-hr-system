// Skeleton meniru bentuk akhir halaman (kotak unggah → penjelasan langkah)
// supaya tidak ada lompatan layout saat halaman siap.
export default function ReceiptSalesLoading() {
  return (
    <div className="space-y-4">
      <div className="card space-y-3 p-4 sm:p-5">
        <div className="h-40 animate-pulse rounded-2xl bg-sand/70" />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="h-4 w-72 max-w-full animate-pulse rounded bg-sand/70" />
          <div className="h-11 w-full animate-pulse rounded-xl bg-sand sm:w-44" />
        </div>
      </div>
      <div className="rounded-2xl border border-dashed border-line bg-cream/40 px-5 py-8">
        <div className="mx-auto h-4 w-56 animate-pulse rounded bg-sand" />
        <div className="mx-auto mt-2 h-3 w-80 max-w-full animate-pulse rounded bg-sand/70" />
        <div className="mx-auto mt-5 grid max-w-3xl gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-sand/70" />
          ))}
        </div>
      </div>
    </div>
  );
}
