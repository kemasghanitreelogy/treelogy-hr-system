// Skeleton instan saat /payroll dirender server — klik nav langsung ada respons.
export default function PayrollLoading() {
  return (
    <div className="space-y-5">
      <div className="h-5 w-72 max-w-full animate-pulse rounded-lg bg-sand" />
      <div className="card h-24 animate-pulse bg-panel" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card h-24 animate-pulse bg-panel" />
        ))}
      </div>
      <div className="card overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <div className="h-5 w-44 animate-pulse rounded-lg bg-sand" />
        </div>
        <div className="divide-y divide-line">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-5 py-3.5">
              <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-sand" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-40 max-w-full animate-pulse rounded bg-sand" />
                <div className="h-3 w-24 animate-pulse rounded bg-sand/70" />
              </div>
              <div className="h-4 w-20 animate-pulse rounded bg-sand" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
