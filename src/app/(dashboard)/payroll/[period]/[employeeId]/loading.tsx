// Skeleton instan untuk halaman detail slip — baris yang diklik langsung merespons.
export default function PayslipLoading() {
  return (
    <div className="space-y-4">
      <div className="h-4 w-40 animate-pulse rounded bg-sand" />
      <div className="h-4 w-64 max-w-full animate-pulse rounded bg-sand/70" />
      <div className="card space-y-5 p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 animate-pulse rounded-full bg-sand" />
            <div className="space-y-1.5">
              <div className="h-4 w-36 animate-pulse rounded bg-sand" />
              <div className="h-3 w-48 animate-pulse rounded bg-sand/70" />
            </div>
          </div>
          <div className="h-9 w-40 animate-pulse rounded-xl bg-sand" />
        </div>
        <div className="h-24 animate-pulse rounded-2xl bg-sand" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-sand/60" />
        ))}
      </div>
    </div>
  );
}
