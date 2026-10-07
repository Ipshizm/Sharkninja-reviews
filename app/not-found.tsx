import Link from "next/link";

export default function NotFound() {
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface p-10 text-center">
      <h1 className="text-lg font-bold">We can&apos;t find that page</h1>
      <p className="mx-auto mt-2 max-w-md text-[14px] text-ink-60">
        The product or brand you asked for isn&apos;t in the dashboard. It may have been renamed, or the link may be out of date.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="rounded-md bg-teal px-4 py-2 text-[14px] font-semibold text-ink hover:bg-teal-dark hover:text-white"
        >
          Back to dashboard
        </Link>
        <Link href="/ninja" className="text-[14px] font-semibold text-teal-text hover:underline">
          Ninja
        </Link>
        <Link href="/shark" className="text-[14px] font-semibold text-teal-text hover:underline">
          Shark
        </Link>
      </div>
    </div>
  );
}
