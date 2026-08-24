export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="h-40 animate-pulse rounded-2xl bg-sand/60" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl bg-sand/60" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-sand/60" />
    </div>
  );
}
