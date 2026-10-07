"use client";

import Link from "next/link";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div role="alert" className="rounded-xl border border-dashed border-line bg-surface p-10 text-center">
      <h1 className="text-lg font-bold">We couldn&apos;t load this page</h1>
      <p className="mx-auto mt-2 max-w-md text-[14px] text-ink-60">
        Something went wrong while reading the review data. Your data is safe. Try again, or head back to the dashboard.
      </p>
      {error.digest ? (
        <p className="mt-2 text-[12px] text-ink-40">Reference: {error.digest}</p>
      ) : null}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="cursor-pointer rounded-md bg-teal px-4 py-2 text-[14px] font-semibold text-ink hover:bg-teal-dark hover:text-white"
        >
          Try again
        </button>
        <Link href="/" className="text-[14px] font-semibold text-teal-text hover:underline">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
