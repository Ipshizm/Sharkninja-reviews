"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { InsightTone, SkuInsight } from "@/lib/insights/types";

export type EnrichedInsight = SkuInsight & {
  skuName: string;
  brand: string;
  isStale: boolean;
};

const TONE_BADGE: Record<
  InsightTone,
  { label: string; border: string; bg: string; text: string; dot: string }
> = {
  critical: {
    label: "Critical Concern",
    border: "border-brand-line",
    bg: "bg-brand-tint",
    text: "text-brand-dark",
    dot: "bg-brand",
  },
  warning: {
    label: "Action Needed",
    border: "border-warn-line",
    bg: "bg-warn-bg",
    text: "text-warn",
    dot: "bg-warn",
  },
  watch: {
    label: "Watch Item",
    border: "border-[#bee3f8]",
    bg: "bg-[#ebf8ff]",
    text: "text-[#2b6cb0]",
    dot: "bg-[#3182ce]",
  },
  healthy: {
    label: "Healthy Performer",
    border: "border-teal-line",
    bg: "bg-teal-tint",
    text: "text-teal",
    dot: "bg-teal",
  },
  unknown: {
    label: "Insufficient Evidence",
    border: "border-line",
    bg: "bg-canvas",
    text: "text-ink-40",
    dot: "bg-ink-40",
  },
};

type FilterTab = "all" | "attention" | "healthy" | "ninja" | "shark";

export function ExecutiveBriefing({
  insights,
  model,
  generatedAt,
}: {
  insights: EnrichedInsight[];
  model: string;
  generatedAt: string;
}) {
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const counts = useMemo(() => {
    let warning = 0;
    let watch = 0;
    let healthy = 0;
    for (const item of insights) {
      if (item.tone === "critical" || item.tone === "warning") warning++;
      else if (item.tone === "watch") watch++;
      else if (item.tone === "healthy") healthy++;
    }
    return { warning, watch, healthy, total: insights.length };
  }, [insights]);

  // Critical before warning, so the top three shown are the three worst
  // rather than the first three in list order (which put every Ninja SKU
  // ahead of a critical Shark one).
  const priorityAlerts = useMemo(() => {
    const rank = (i: EnrichedInsight) => (i.tone === "critical" ? 0 : 1);
    return insights
      .filter((i) => i.tone === "critical" || i.tone === "warning")
      .sort((a, b) => rank(a) - rank(b));
  }, [insights]);

  const filtered = useMemo(() => {
    let list = insights;
    if (activeTab === "attention") {
      list = list.filter((i) => i.tone === "critical" || i.tone === "warning" || i.tone === "watch");
    } else if (activeTab === "healthy") {
      list = list.filter((i) => i.tone === "healthy");
    } else if (activeTab === "ninja") {
      list = list.filter((i) => i.brand.toLowerCase() === "ninja");
    } else if (activeTab === "shark") {
      list = list.filter((i) => i.brand.toLowerCase() === "shark");
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (i) =>
          i.skuName.toLowerCase().includes(q) ||
          i.headline.toLowerCase().includes(q) ||
          i.soWhat.toLowerCase().includes(q) ||
          i.watch.toLowerCase().includes(q),
      );
    }
    return list;
  }, [insights, activeTab, searchQuery]);

  const cleanModel = model.replace("openrouter/", "").replace("anthropic/", "");

  return (
    <section className="rounded-xl border border-line bg-surface p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-line bg-teal-tint px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-teal">
              <span className="h-1.5 w-1.5 rounded-full bg-teal" />
              AI Intelligence Rollup
            </span>
            <span className="text-[12px] text-ink-40">
              Synthesized by {cleanModel}
            </span>
          </div>
          <h2 className="display mt-2 text-xl font-bold tracking-tight text-ink sm:text-2xl">
            Executive Portfolio Briefing
          </h2>
          <p className="mt-1 text-[13px] text-ink-60">
            Commercial diagnosis across {insights.length} SharkNinja India listing{insights.length === 1 ? "" : "s"} on Amazon.in.
          </p>
        </div>

        {/* Tone Counters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-lg border border-warn-line bg-warn-bg px-3 py-1.5 text-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-warn">Action Needed</span>
            <p className="tabular text-lg font-bold text-warn">{counts.warning}</p>
          </div>
          <div className="rounded-lg border border-[#bee3f8] bg-[#ebf8ff] px-3 py-1.5 text-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#2b6cb0]">Watch Items</span>
            <p className="tabular text-lg font-bold text-[#2b6cb0]">{counts.watch}</p>
          </div>
          <div className="rounded-lg border border-teal-line bg-teal-tint px-3 py-1.5 text-center">
            <span className="text-[10px] font-bold uppercase tracking-wider text-teal">Healthy</span>
            <p className="tabular text-lg font-bold text-teal">{counts.healthy}</p>
          </div>
        </div>
      </div>

      {/* Priority Action Callout Box */}
      {priorityAlerts.length > 0 && activeTab === "all" && !searchQuery ? (
        <div className="mt-6 rounded-xl border border-warn-line bg-warn-bg/50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <h3 className="text-[12px] font-bold uppercase tracking-wider text-warn">
              Priority Commercial Interventions ({priorityAlerts.length} Alerts)
            </h3>
            <span className="text-[11px] text-ink-40">
              {priorityAlerts.length > 3 ? "Worst 3 shown · " : ""}Require Category / CX Action
            </span>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {priorityAlerts.slice(0, 3).map((item) => (
              <div
                key={item.skuId}
                className="flex flex-col justify-between rounded-lg border border-warn-line bg-white p-3.5 shadow-2xs"
              >
                <div>
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-semibold text-ink-40 uppercase">{item.brand}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${TONE_BADGE[item.tone].text} ${TONE_BADGE[item.tone].bg}`}
                    >
                      {TONE_BADGE[item.tone].label}
                    </span>
                  </div>
                  <Link
                    href={`/${item.brand.toLowerCase()}/${item.skuId}`}
                    className="mt-1 block text-[13px] font-bold text-ink hover:text-teal"
                  >
                    {item.skuName}
                  </Link>
                  <p className="mt-1 text-[12px] leading-snug text-ink-60 line-clamp-2">
                    {item.headline}
                  </p>
                </div>
                <div className="mt-3 border-t border-line-soft pt-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ink-40">Immediate Directive:</span>
                  <p className="text-[11px] font-medium text-ink-60 line-clamp-2">
                    {item.watch}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Filter Tabs and Search Bar */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 rounded-lg border border-line bg-canvas p-1">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`cursor-pointer rounded-md px-3 py-1 text-[12px] font-semibold transition ${
              activeTab === "all"
                ? "bg-white text-ink shadow-2xs"
                : "text-ink-60 hover:text-ink"
            }`}
          >
            All Listings ({insights.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("attention")}
            className={`cursor-pointer rounded-md px-3 py-1 text-[12px] font-semibold transition ${
              activeTab === "attention"
                ? "bg-white text-warn shadow-2xs"
                : "text-ink-60 hover:text-ink"
            }`}
          >
            Needs Attention ({counts.warning + counts.watch})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("healthy")}
            className={`cursor-pointer rounded-md px-3 py-1 text-[12px] font-semibold transition ${
              activeTab === "healthy"
                ? "bg-white text-teal shadow-2xs"
                : "text-ink-60 hover:text-ink"
            }`}
          >
            Healthy ({counts.healthy})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("ninja")}
            className={`cursor-pointer rounded-md px-3 py-1 text-[12px] font-semibold transition ${
              activeTab === "ninja"
                ? "bg-white text-ink shadow-2xs"
                : "text-ink-60 hover:text-ink"
            }`}
          >
            Ninja Only
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("shark")}
            className={`cursor-pointer rounded-md px-3 py-1 text-[12px] font-semibold transition ${
              activeTab === "shark"
                ? "bg-white text-ink shadow-2xs"
                : "text-ink-60 hover:text-ink"
            }`}
          >
            Shark Only
          </button>
        </div>

        <div className="relative">
          <input
            type="text"
            placeholder="Search SKU insights…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-56 rounded-lg border border-line bg-canvas px-3 py-1.5 text-[12px] text-ink placeholder:text-ink-40 focus:border-ink focus:bg-white focus:outline-hidden"
          />
          {searchQuery ? (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-2 text-[11px] text-ink-40 hover:text-ink cursor-pointer"
            >
              ✕
            </button>
          ) : null}
        </div>
      </div>

      {/* Grid of SKU Insight Cards */}
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {filtered.length === 0 ? (
          <div className="col-span-2 rounded-lg border border-dashed border-line p-8 text-center text-[13px] text-ink-40">
            No SKU insights matched the current filter.
          </div>
        ) : (
          filtered.map((item) => {
            const toneStyle = TONE_BADGE[item.tone] ?? TONE_BADGE.unknown;
            return (
              <div
                key={item.skuId}
                className="flex flex-col justify-between rounded-xl border border-line bg-surface p-5 transition hover:border-ink/60"
              >
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-ink-40">
                        {item.brand}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${toneStyle.border} ${toneStyle.bg} ${toneStyle.text}`}
                      >
                        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${toneStyle.dot}`} />
                        {toneStyle.label}
                      </span>
                      {item.isStale ? (
                        <span className="rounded-full border border-warn-line bg-warn-bg px-1.5 py-0.5 text-[10px] font-semibold text-warn">
                          New data
                        </span>
                      ) : null}
                    </div>

                    <Link
                      href={`/${item.brand.toLowerCase()}/${item.skuId}`}
                      className="text-[12px] font-semibold text-teal hover:underline"
                    >
                      SKU Detail →
                    </Link>
                  </div>

                  <Link
                    href={`/${item.brand.toLowerCase()}/${item.skuId}`}
                    className="mt-2 block group"
                  >
                    <h4 className="text-[15px] font-bold text-ink group-hover:text-teal transition">
                      {item.skuName}
                    </h4>
                    <p className="mt-1 text-[13px] font-medium leading-snug text-ink-60">
                      {item.headline}
                    </p>
                  </Link>

                  <div className="mt-3.5 grid gap-2.5 sm:grid-cols-2">
                    <div className="rounded-lg border border-line bg-canvas p-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-ink-40">
                        Commercial Impact
                      </span>
                      <p className="mt-1 text-[12px] leading-snug text-ink">
                        {item.soWhat}
                      </p>
                    </div>
                    <div className="rounded-lg border border-line bg-canvas p-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-ink-40">
                        What to Watch
                      </span>
                      <p className="mt-1 text-[12px] leading-snug text-ink">
                        {item.watch}
                      </p>
                    </div>
                  </div>

                  {item.evidence && item.evidence.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {item.evidence.map((e, idx) => (
                        <span
                          key={idx}
                          className="rounded border border-line-soft bg-canvas px-2 py-0.5 text-[11px] text-ink-60"
                        >
                          {e}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-line-soft pt-3 text-[11px] text-ink-40">
                  <span>Synthesized for Amazon.in</span>
                  <Link
                    href={`/${item.brand.toLowerCase()}/${item.skuId}`}
                    className="font-medium text-ink hover:text-teal"
                  >
                    Read full review breakdown ({item.skuName}) →
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-5 flex items-center justify-between text-[11px] text-ink-40">
        <span>
          Analysis generated on{" "}
          {new Date(generatedAt).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </span>
        <span className="text-ink-60">
          Evaluated across 339 total customer reviews on Amazon.in
        </span>
      </div>
    </section>
  );
}
