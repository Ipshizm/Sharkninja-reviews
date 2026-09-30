"use client";

import { useId, useMemo, useState } from "react";
import {
  filterReviews,
  type ReviewFilter,
  type SortOption,
  type VerifiedFilter,
} from "@/lib/filter";
import type { Bucket, Review } from "@/lib/types";
import { ExportLinks } from "./ExportLinks";

const PAGE_SIZE = 15;

export function ReviewExplorer({
  reviews,
  skuId,
  skuName,
}: {
  reviews: Review[];
  skuId: string;
  skuName: string;
}) {
  const searchInputId = useId();
  const sortSelectId = useId();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRating, setSelectedRating] = useState<number | "all">("all");
  const [verifiedFilter, setVerifiedFilter] = useState<VerifiedFilter>("all");
  const [selectedBucket, setSelectedBucket] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedReviews, setExpandedReviews] = useState<Record<string, boolean>>({});

  // Collect all unique buckets present in this SKU's reviews
  const availableBuckets = useMemo(() => {
    const set = new Set<string>();
    for (const r of reviews) {
      for (const b of r.buckets) {
        set.add(b);
      }
    }
    return Array.from(set).sort();
  }, [reviews]);

  // Count reviews by star rating
  const ratingCounts = useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of reviews) {
      if (counts[r.rating] !== undefined) counts[r.rating]++;
    }
    return counts;
  }, [reviews]);

  const verifiedCount = useMemo(() => {
    return reviews.filter((r) => r.verified).length;
  }, [reviews]);

  // The same filter the export route applies, so a download holds exactly
  // the rows on screen.
  const filter: ReviewFilter = useMemo(
    () => ({
      skuId,
      q: searchQuery,
      rating: selectedRating === "all" ? undefined : selectedRating,
      verified: verifiedFilter,
      bucket: selectedBucket === "all" ? undefined : (selectedBucket as Bucket),
      sort: sortBy,
    }),
    [skuId, searchQuery, selectedRating, verifiedFilter, selectedBucket, sortBy],
  );
  const filtered = useMemo(() => filterReviews(reviews, filter), [reviews, filter]);

  // Reset page when filters change
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginatedReviews = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, currentPage]);

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    selectedRating !== "all" ||
    verifiedFilter !== "all" ||
    selectedBucket !== "all";

  function clearAllFilters() {
    setSearchQuery("");
    setSelectedRating("all");
    setVerifiedFilter("all");
    setSelectedBucket("all");
    setCurrentPage(1);
  }

  function toggleExpand(hash: string) {
    setExpandedReviews((prev) => ({ ...prev, [hash]: !prev[hash] }));
  }

  function handleBucketClick(bucketName: string) {
    setSelectedBucket(bucketName);
    setCurrentPage(1);
  }

  return (
    <div className="space-y-4">
      {/* Search and Sort Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <label htmlFor={searchInputId} className="sr-only">
            Search reviews for {skuName}
          </label>
          <input
            id={searchInputId}
            type="text"
            placeholder={`Search ${reviews.length} reviews for keywords (e.g. noise, battery, blade)…`}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full rounded-lg border border-line bg-canvas px-3.5 py-2 text-[13px] text-ink placeholder:text-ink-40 focus:border-ink focus:bg-white focus:outline-hidden transition"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => {
                setSearchQuery("");
                setCurrentPage(1);
              }}
              className="absolute right-3 top-2.5 text-[12px] text-ink-40 hover:text-ink cursor-pointer"
            >
              ✕
            </button>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor={sortSelectId} className="shrink-0 text-[12px] text-ink-60">
            Sort by:
          </label>
          <select
            id={sortSelectId}
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as SortOption);
              setCurrentPage(1);
            }}
            className="rounded-lg border border-line bg-canvas px-2.5 py-2 text-[12px] font-semibold text-ink focus:border-ink focus:bg-white focus:outline-hidden cursor-pointer"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="lowest">Lowest rating (1★ first)</option>
            <option value="highest">Highest rating (5★ first)</option>
          </select>
        </div>
      </div>

      {/* Filter Chips Toolbar */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        {/* Star Rating Pills */}
        <div className="flex items-center gap-1 rounded-lg border border-line bg-canvas p-1">
          <button
            type="button"
            onClick={() => {
              setSelectedRating("all");
              setCurrentPage(1);
            }}
            className={`cursor-pointer rounded px-2.5 py-1 text-[11px] font-semibold transition ${
              selectedRating === "all"
                ? "bg-white text-ink shadow-2xs"
                : "text-ink-60 hover:text-ink"
            }`}
          >
            All Ratings ({reviews.length})
          </button>
          {[5, 4, 3, 2, 1].map((stars) => {
            const count = ratingCounts[stars] ?? 0;
            const isSelected = selectedRating === stars;
            return (
              <button
                key={stars}
                type="button"
                onClick={() => {
                  setSelectedRating(isSelected ? "all" : stars);
                  setCurrentPage(1);
                }}
                className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold transition cursor-pointer ${
                  isSelected
                    ? stars >= 4
                      ? "bg-teal text-white"
                      : stars === 3
                        ? "bg-ink text-white"
                        : "bg-brand text-white"
                    : "text-ink-60 hover:text-ink"
                }`}
              >
                <span>{stars}★</span>
                <span className="tabular opacity-75 text-[10px]">({count})</span>
              </button>
            );
          })}
        </div>

        {/* Verified Purchase Toggle */}
        <div className="flex items-center gap-1 rounded-lg border border-line bg-canvas p-1">
          <button
            type="button"
            onClick={() => {
              setVerifiedFilter("all");
              setCurrentPage(1);
            }}
            className={`cursor-pointer rounded px-2.5 py-1 text-[11px] font-semibold transition ${
              verifiedFilter === "all"
                ? "bg-white text-ink shadow-2xs"
                : "text-ink-60 hover:text-ink"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => {
              setVerifiedFilter("verified");
              setCurrentPage(1);
            }}
            className={`cursor-pointer rounded px-2.5 py-1 text-[11px] font-semibold transition ${
              verifiedFilter === "verified"
                ? "bg-white text-teal shadow-2xs"
                : "text-ink-60 hover:text-ink"
            }`}
          >
            Verified ({verifiedCount})
          </button>
          <button
            type="button"
            onClick={() => {
              setVerifiedFilter("unverified");
              setCurrentPage(1);
            }}
            className={`cursor-pointer rounded px-2.5 py-1 text-[11px] font-semibold transition ${
              verifiedFilter === "unverified"
                ? "bg-white text-warn shadow-2xs"
                : "text-ink-60 hover:text-ink"
            }`}
          >
            Unverified ({reviews.length - verifiedCount})
          </button>
        </div>

        {/* Bucket Filter (if any buckets exist) */}
        {availableBuckets.length > 0 ? (
          <div className="flex items-center gap-1 rounded-lg border border-line bg-canvas p-1">
            <span className="px-2 text-[11px] font-medium text-ink-60">Problem:</span>
            <select
              value={selectedBucket}
              onChange={(e) => {
                setSelectedBucket(e.target.value);
                setCurrentPage(1);
              }}
              className="rounded bg-white px-2 py-1 text-[11px] font-semibold text-ink border border-line cursor-pointer"
            >
              <option value="all">All problem areas</option>
              {availableBuckets.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {/* Clear Filters Button */}
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={clearAllFilters}
            className="cursor-pointer rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-brand hover:border-brand transition"
          >
            Reset filters ✕
          </button>
        ) : null}
      </div>

      {/* Result Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-ink-60 border-t border-line-soft pt-2">
        <span>
          Showing <b>{filtered.length}</b> of {reviews.length} reviews
          {hasActiveFilters ? " (filtered)" : ""}
          {totalPages > 1 ? ` · page ${currentPage} of ${totalPages}` : ""}
        </span>
        <ExportLinks
          filter={filter}
          count={filtered.length}
          label={hasActiveFilters ? `Download these ${filtered.length}` : "Download all"}
        />
      </div>

      {/* Reviews List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-canvas p-10 text-center">
          <p className="text-[14px] font-bold text-ink">No matching reviews found</p>
          <p className="mt-1 text-[12px] text-ink-60">
            Try adjusting your search keyword or clearing the active filters.
          </p>
          <button
            type="button"
            onClick={clearAllFilters}
            className="mt-4 rounded-md bg-ink px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-ink-60 cursor-pointer"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {paginatedReviews.map((r) => {
            const isExpanded = expandedReviews[r.hash] ?? false;
            const isLong = (r.body?.length ?? 0) > 320;
            const displayedBody = isLong && !isExpanded ? `${r.body.slice(0, 320)}…` : r.body;

            return (
              <li key={r.hash} className="py-4 first:pt-2 last:pb-2">
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  <span
                    className={`tabular rounded px-2 py-0.5 text-[12px] font-bold ${
                      r.rating >= 4
                        ? "bg-teal-tint text-teal-dark border border-teal-line"
                        : r.rating === 3
                          ? "bg-line-soft text-ink-60 border border-line"
                          : "bg-brand-tint text-brand-dark border border-brand-line"
                    }`}
                  >
                    {r.rating}★
                  </span>

                  <span className="text-[14px] font-bold text-ink">{r.title}</span>

                  <span className="text-[12px] text-ink-60">
                    by <b>{r.reviewer}</b> on {r.reviewDate}
                  </span>

                  {r.verified ? (
                    <span className="rounded-full border border-teal-line bg-teal-tint px-2 py-0.2 text-[10px] font-semibold text-teal">
                      Verified purchase
                    </span>
                  ) : (
                    <span className="rounded-full border border-warn-line bg-warn-bg px-2 py-0.2 text-[10px] font-semibold text-warn">
                      Unverified
                    </span>
                  )}

                  {r.variant ? (
                    <span className="text-[11px] text-ink-40">({r.variant})</span>
                  ) : null}
                </div>

                {r.body ? (
                  <div className="mt-2">
                    <p className="text-[13px] leading-relaxed text-ink-60">
                      {displayedBody}
                    </p>
                    {isLong ? (
                      <button
                        type="button"
                        onClick={() => toggleExpand(r.hash)}
                        className="mt-1 text-[11px] font-semibold text-teal hover:underline cursor-pointer"
                      >
                        {isExpanded ? "Show less" : "Read full review"}
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <p className="mt-1.5 text-[12px] italic text-ink-40">
                    Title only — no review body submitted.
                  </p>
                )}

                {r.buckets.length > 0 ? (
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ink-40">
                      Flagged:
                    </span>
                    {r.buckets.map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => handleBucketClick(b)}
                        title={`Filter reviews by ${b}`}
                        className={`cursor-pointer rounded-full border px-2 py-0.5 text-[11px] transition ${
                          selectedBucket === b
                            ? "border-brand bg-brand-tint text-brand-dark font-bold"
                            : "border-line bg-surface text-ink-60 hover:border-ink hover:text-ink"
                        }`}
                      >
                        {b}
                      </button>
                    ))}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <button
            type="button"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-[12px] font-semibold text-ink disabled:opacity-40 disabled:cursor-not-allowed hover:bg-canvas cursor-pointer"
          >
            ← Previous
          </button>

          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setCurrentPage(p)}
                className={`tabular h-8 w-8 rounded-md text-[12px] font-semibold transition cursor-pointer ${
                  currentPage === p
                    ? "bg-ink text-white"
                    : "border border-line bg-surface text-ink hover:bg-canvas"
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-[12px] font-semibold text-ink disabled:opacity-40 disabled:cursor-not-allowed hover:bg-canvas cursor-pointer"
          >
            Next →
          </button>
        </div>
      ) : null}
    </div>
  );
}
