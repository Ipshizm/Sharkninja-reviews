/** Shown while a page reads the review store, so navigation never looks frozen. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="animate-pulse space-y-6">
      <span className="sr-only">Loading reviews…</span>
      <div className="h-8 w-72 rounded bg-line" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-28 rounded-xl border border-line bg-surface" />
        ))}
      </div>
      <div className="h-64 rounded-xl border border-line bg-surface" />
    </div>
  );
}
