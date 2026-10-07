import type { BucketRow } from "@/lib/aggregate";
import type { Theme } from "@/lib/text";
import type { SkuInsight, InsightTone } from "@/lib/insights/types";
import { Legend } from "./Stat";

export function ThemeList({
  themes,
  tone,
  total,
}: {
  themes: Theme[];
  tone: "positive" | "negative";
  total?: number;
}) {
  if (themes.length === 0) return null;
  const colour = tone === "positive" ? "#00a5af" : "#d85827";
  return (
    <div className="mt-4 border-t border-line pt-4">
      <h3 className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-60">
        Phrases that repeat
      </h3>
      <p className="mt-0.5 text-[11px] text-ink-40">
        Wordings used by more than one reviewer, and how many reviews each
        appears in
        {total ? ` out of ${total}` : ""}.
      </p>
      <ul className="mt-2.5 space-y-1.5">
        {themes.map((t) => (
          <li
            key={t.phrase}
            className="flex items-baseline justify-between gap-3 text-[13px]"
          >
            <span className="capitalize">
              <span
                aria-hidden
                className="mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle"
                style={{ background: colour }}
              />
              {t.phrase}
            </span>
            <span className="tabular shrink-0 text-[12px] text-ink-40">
              {t.reviews} review{t.reviews === 1 ? "" : "s"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The problem-area breakdown.
 *
 * The bar length is the percentage itself, on a fixed 0–100% scale with ticks.
 * It used to be scaled to the largest bucket, which meant the top row was
 * always full-width whatever its number — a bar that looked like "everything"
 * while the label beside it said 53%. Anchoring to 100% costs a little
 * contrast between rows and removes the contradiction.
 */
export function BucketBars({
  rows,
  total,
}: {
  rows: BucketRow[];
  total: number;
}) {
  if (total === 0) {
    return (
      <p className="text-[13px] text-ink-40">
        No negative reviews here — nothing to break down.
      </p>
    );
  }
  const present = rows.filter((r) => r.count > 0);
  const ticks = [0, 25, 50, 75, 100];

  return (
    <div>
      <Legend
        className="mb-4"
        items={[
          {
            colour: "#d85827",
            label: "Share of this SKU's negative reviews that name the problem",
          },
          { colour: "#bbbdc0", label: "Negative, but names no cause" },
        ]}
        note={`Bars run 0–100% of the ${total} negative review${total === 1 ? "" : "s"}. They add up to more than 100% because one review can name several problems — "arrived damaged and nobody replied" is counted twice.`}
      />

      <div className="space-y-3.5">
        {present.map((r) => {
          const grey = r.bucket === "Unclassified";
          return (
            <div key={r.bucket}>
              <div className="grid grid-cols-[minmax(0,9.5rem)_1fr] items-baseline gap-3 sm:grid-cols-[minmax(0,11rem)_1fr]">
                <span className="truncate text-[13px] font-semibold" title={r.bucket}>
                  {r.bucket}
                </span>
                <div className="flex items-center gap-3">
                  <div className="relative h-6 flex-1 overflow-hidden rounded bg-canvas">
                    {ticks.slice(1, -1).map((t) => (
                      <span
                        key={t}
                        aria-hidden
                        className="absolute top-0 bottom-0 w-px bg-line"
                        style={{ left: `${t}%` }}
                      />
                    ))}
                    <div
                      className="relative h-6 rounded-l"
                      style={{
                        width: `${r.pct}%`,
                        background: grey ? "#bbbdc0" : "#d85827",
                      }}
                      role="img"
                      aria-label={`${r.pct.toFixed(0)} percent`}
                    />
                  </div>
                  <span className="tabular w-[8.5rem] shrink-0 text-right text-[12px] text-ink-60">
                    <b className="text-ink">{r.pct.toFixed(0)}%</b>
                    <span className="text-ink-40">
                      {" "}
                      · {r.count} of {total}
                    </span>
                  </span>
                </div>
              </div>
              {r.example ? (
                <p className="mt-1 text-[12px] text-ink-40 sm:pl-[calc(11rem+0.75rem)]">
                  {r.example}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* The scale, stated once at the bottom rather than assumed. */}
      <div className="mt-4 grid grid-cols-[minmax(0,9.5rem)_1fr] gap-3 sm:grid-cols-[minmax(0,11rem)_1fr]">
        <span />
        <div className="flex items-center gap-3">
          <div className="relative flex-1 border-t border-line pt-1">
            {ticks.map((t) => (
              <span
                key={t}
                className="tabular absolute top-1 -translate-x-1/2 text-[10px] text-ink-40"
                style={{ left: `${t}%` }}
              >
                {t}%
              </span>
            ))}
            <span className="block h-3" />
          </div>
          <span className="w-[8.5rem] shrink-0" />
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- insight card */

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
    border: "border-watch-line",
    bg: "bg-watch-bg",
    text: "text-ink",
    dot: "bg-ink-60",
  },
  healthy: {
    label: "Healthy Performer",
    border: "border-teal-line",
    bg: "bg-teal-tint",
    text: "text-teal-text",
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

export function InsightCard({
  insight,
  isStale = false,
  className = "",
}: {
  insight: SkuInsight;
  isStale?: boolean;
  className?: string;
}) {
  const toneStyle = TONE_BADGE[insight.tone] ?? TONE_BADGE.unknown;

  return (
    <div
      className={`rounded-xl border border-line bg-surface p-6 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wide uppercase ${toneStyle.border} ${toneStyle.bg} ${toneStyle.text}`}
          >
            <span
              aria-hidden
              className={`h-1.5 w-1.5 rounded-full ${toneStyle.dot}`}
            />
            {toneStyle.label}
          </span>
          {isStale ? (
            <span
              title="New reviews were imported after this insight was synthesized."
              className="rounded-full border border-warn-line bg-warn-bg px-2 py-0.5 text-[11px] font-semibold text-warn"
            >
              Data evolved since analysis
            </span>
          ) : null}
        </div>
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-40">
          Executive Synthesis
        </div>
      </div>

      <h3 className="display mt-3 text-lg font-bold tracking-tight text-ink sm:text-xl">
        {insight.headline}
      </h3>

      <div className="mt-3 space-y-2 text-[13px] leading-relaxed text-ink-60">
        {insight.body.map((p, idx) => (
          <p key={idx}>{p}</p>
        ))}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-canvas p-3.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-60">
            Commercial Impact
          </span>
          <p className="mt-1 text-[12px] leading-snug text-ink">
            {insight.soWhat}
          </p>
        </div>

        <div className="rounded-lg border border-line bg-canvas p-3.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-60">
            What to Watch
          </span>
          <p className="mt-1 text-[12px] leading-snug text-ink">
            {insight.watch}
          </p>
        </div>
      </div>

      {insight.evidence && insight.evidence.length > 0 ? (
        <div className="mt-4 border-t border-line pt-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-40">
            Grounding Evidence
          </span>
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {insight.evidence.map((e, idx) => (
              <li
                key={idx}
                className="rounded border border-line bg-canvas px-2 py-0.5 text-[11px] text-ink-60"
              >
                {e}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between border-t border-line pt-3 text-[11px] text-ink-40">
        <span>
          Synthesized by {insight.model.replace("openrouter/", "").replace("anthropic/", "")}
        </span>
        <span className="tabular">
          {new Date(insight.generatedAt).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
      </div>
    </div>
  );
}

