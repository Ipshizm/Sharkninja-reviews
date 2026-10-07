"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PortfolioSkuRow } from "@/lib/aggregate";
import { DirectionPill, Stars } from "@/components/Stat";

type SortField = "attention" | "name" | "brand" | "volume" | "rating" | "negative";
type SortDirection = "asc" | "desc";
type BrandFilter = "all" | "ninja" | "shark";

export function MasterSkuTable({ rows }: { rows: PortfolioSkuRow[] }) {
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState<BrandFilter>("all");
  const [hideLowData, setHideLowData] = useState(false);
  const [sortField, setSortField] = useState<SortField>("attention");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      // Default directions depending on field
      if (field === "volume" || field === "negative") {
        setSortDirection("desc");
      } else {
        setSortDirection("asc");
      }
    }
  }

  const counts = useMemo(() => {
    return {
      total: rows.length,
      ninja: rows.filter((r) => r.brand.toLowerCase() === "ninja").length,
      shark: rows.filter((r) => r.brand.toLowerCase() === "shark").length,
      lowData: rows.filter((r) => r.insufficient).length,
    };
  }, [rows]);

  const sortedAndFiltered = useMemo(() => {
    let list = rows;

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.sku.name.toLowerCase().includes(q) ||
          r.sku.id.toLowerCase().includes(q) ||
          (r.topProblem?.bucket.toLowerCase().includes(q) ?? false),
      );
    }

    // Brand filter
    if (brandFilter === "ninja") {
      list = list.filter((r) => r.brand.toLowerCase() === "ninja");
    } else if (brandFilter === "shark") {
      list = list.filter((r) => r.brand.toLowerCase() === "shark");
    }

    // Low data filter
    if (hideLowData) {
      list = list.filter((r) => !r.insufficient);
    }

    // Sorting
    return list.slice().sort((a, b) => {
      let cmp = 0;
      if (sortField === "attention") {
        // Worst verified rating first, but insufficient n sinks to bottom
        if (a.insufficient !== b.insufficient) return a.insufficient ? 1 : -1;
        cmp = (a.verified.avg ?? 99) - (b.verified.avg ?? 99);
      } else if (sortField === "name") {
        cmp = a.sku.name.localeCompare(b.sku.name);
      } else if (sortField === "brand") {
        cmp = a.brand.localeCompare(b.brand) || a.sku.name.localeCompare(b.sku.name);
      } else if (sortField === "volume") {
        cmp = a.all.n - b.all.n;
      } else if (sortField === "rating") {
        cmp = (a.verified.avg ?? 0) - (b.verified.avg ?? 0);
      } else if (sortField === "negative") {
        cmp = a.all.pctNegative - b.all.pctNegative;
      }

      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [rows, search, brandFilter, hideLowData, sortField, sortDirection]);

  function ariaSort(field: SortField): "ascending" | "descending" | "none" {
    if (sortField !== field) return "none";
    return sortDirection === "asc" ? "ascending" : "descending";
  }

  function renderSortArrow(field: SortField) {
    if (sortField !== field) {
      return <span className="opacity-20 ml-1">↕</span>;
    }
    return <span className="ml-1 text-ink">{sortDirection === "asc" ? "▲" : "▼"}</span>;
  }

  return (
    <div className="space-y-3.5">
      {/* Search & Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-line bg-canvas p-1">
          <button
            type="button"
            onClick={() => setBrandFilter("all")}
            aria-pressed={brandFilter === "all"}
            className={`cursor-pointer rounded-md px-3 py-1 text-[11px] font-semibold transition ${
              brandFilter === "all"
                ? "bg-white text-ink shadow-2xs"
                : "text-ink-60 hover:text-ink"
            }`}
          >
            All Brands ({counts.total})
          </button>
          <button
            type="button"
            onClick={() => setBrandFilter("ninja")}
            aria-pressed={brandFilter === "ninja"}
            className={`cursor-pointer rounded-md px-3 py-1 text-[11px] font-semibold transition ${
              brandFilter === "ninja"
                ? "bg-white text-ink shadow-2xs"
                : "text-ink-60 hover:text-ink"
            }`}
          >
            Ninja ({counts.ninja})
          </button>
          <button
            type="button"
            onClick={() => setBrandFilter("shark")}
            aria-pressed={brandFilter === "shark"}
            className={`cursor-pointer rounded-md px-3 py-1 text-[11px] font-semibold transition ${
              brandFilter === "shark"
                ? "bg-white text-ink shadow-2xs"
                : "text-ink-60 hover:text-ink"
            }`}
          >
            Shark ({counts.shark})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5 text-[12px] text-ink-60 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideLowData}
              onChange={(e) => setHideLowData(e.target.checked)}
              className="rounded border-line text-teal-text focus:ring-teal cursor-pointer"
            />
            <span>Hide low data (&lt;10 reviews)</span>
          </label>

          <div className="relative">
            <input
              type="text"
              placeholder="Search listings…"
              aria-label="Search listings"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48 rounded-lg border border-line bg-canvas px-3 py-1 text-[12px] text-ink placeholder:text-ink-40 focus:border-ink focus:bg-white focus:outline-hidden transition"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute right-2.5 top-1.5 text-[11px] text-ink-40 hover:text-ink cursor-pointer"
              >
                ✕
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Interactive Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[13px]">
          <caption className="sr-only">All listings, sortable by column</caption>
          <thead>
            <tr className="border-b border-line text-left text-[11px] font-bold uppercase tracking-[0.08em] text-ink-40 select-none">
              <th scope="col" aria-sort={ariaSort("name")} className="pb-2.5 ">
                <button
                  type="button"
                  onClick={() => handleSort("name")}
                  title="Sort by product name"
                  className="cursor-pointer font-bold uppercase tracking-[0.08em] hover:text-ink"
                >
                  Product {renderSortArrow("name")}
                </button>
              </th>
              <th scope="col" aria-sort={ariaSort("brand")} className="pb-2.5 ">
                <button
                  type="button"
                  onClick={() => handleSort("brand")}
                  title="Sort by brand"
                  className="cursor-pointer font-bold uppercase tracking-[0.08em] hover:text-ink"
                >
                  Brand {renderSortArrow("brand")}
                </button>
              </th>
              <th scope="col" aria-sort={ariaSort("volume")} className="pb-2.5 text-right ">
                <button
                  type="button"
                  onClick={() => handleSort("volume")}
                  title="Sort by review volume"
                  className="cursor-pointer font-bold uppercase tracking-[0.08em] hover:text-ink"
                >
                  Reviews {renderSortArrow("volume")}
                </button>
              </th>
              <th scope="col" aria-sort={ariaSort("rating")} className="pb-2.5 text-right ">
                <button
                  type="button"
                  onClick={() => handleSort("rating")}
                  title="Sort by verified purchase rating"
                  className="cursor-pointer font-bold uppercase tracking-[0.08em] hover:text-ink"
                >
                  Verified Avg {renderSortArrow("rating")}
                </button>
              </th>
              <th scope="col" className="pb-2.5 text-center">Trend</th>
              <th scope="col" aria-sort={ariaSort("negative")} className="pb-2.5 text-right ">
                <button
                  type="button"
                  onClick={() => handleSort("negative")}
                  title="Sort by percentage negative"
                  className="cursor-pointer font-bold uppercase tracking-[0.08em] hover:text-ink"
                >
                  % Negative {renderSortArrow("negative")}
                </button>
              </th>
              <th scope="col" className="pb-2.5 pl-4">Top Issue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {sortedAndFiltered.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-8 text-center text-[13px] text-ink-40">
                  No listings match the selected search and filter criteria.
                </td>
              </tr>
            ) : (
              sortedAndFiltered.map((s) => (
                <tr key={s.sku.id} className="transition hover:bg-canvas">
                  <td className="py-3">
                    <Link
                      href={`/${s.brand.toLowerCase()}/${s.sku.id}`}
                      className="font-semibold text-ink hover:text-teal-text"
                    >
                      {s.sku.name}
                    </Link>
                    {s.insufficient ? (
                      <span className="ml-2 rounded border border-warn-line bg-warn-bg px-1.5 py-0.5 text-[10px] font-semibold text-warn">
                        low data
                      </span>
                    ) : null}
                  </td>
                  <td className="py-3 text-ink-60">{s.brand}</td>
                  <td className="tabular py-3 text-right text-ink-60">
                    {s.all.n}
                    <span className="text-[11px] text-ink-40 ml-1">({s.verified.n}v)</span>
                  </td>
                  <td className="tabular py-3 text-right font-medium">
                    <Stars value={s.verified.avg} />
                  </td>
                  <td className="py-3 text-center">
                    <DirectionPill d={s.direction} />
                  </td>
                  <td className="tabular py-3 text-right text-ink-60">
                    {s.all.n === 0 ? "—" : `${s.all.pctNegative.toFixed(0)}%`}
                  </td>
                  <td className="py-3 pl-4 text-[12px] text-ink-40">
                    {s.topProblem ? (
                      <span>
                        <span className="font-semibold text-ink-60">
                          {s.topProblem.bucket}
                        </span>{" "}
                        ({s.topProblem.pct.toFixed(0)}%)
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-line-soft pt-2.5 text-[11px] text-ink-40">
        <span>
          Showing {sortedAndFiltered.length} of {rows.length} listings
        </span>
        <span>
          Select a column header to sort
        </span>
      </div>
    </div>
  );
}
