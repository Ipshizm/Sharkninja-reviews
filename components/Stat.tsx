import type { DirectionResult, RatingSummary } from "@/lib/aggregate";

/* --------------------------------------------------------------- legends */

export type LegendItem = {
  /** A CSS colour, or null for a swatch-less note. */
  colour: string | null;
  label: string;
  /** Optional value rendered in bold after the label. */
  value?: string;
};

/**
 * One legend component for every chart on the site.
 *
 * Every chart gets one, including the ones where the meaning feels obvious to
 * whoever built it — a reader arriving cold has no idea whether teal means
 * "good" or "Ninja", and should never have to guess.
 */
export function Legend({
  items,
  note,
  className = "",
}: {
  items: LegendItem[];
  note?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {items.map((it) => (
          <li key={it.label} className="flex items-center gap-1.5 text-[12px]">
            {it.colour ? (
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                style={{ background: it.colour }}
              />
            ) : null}
            <span className="text-ink-40">{it.label}</span>
            {it.value ? (
              <b className="tabular font-semibold text-ink">{it.value}</b>
            ) : null}
          </li>
        ))}
      </ul>
      {note ? (
        <p className="mt-1.5 text-[11px] leading-snug text-ink-40">{note}</p>
      ) : null}
    </div>
  );
}

export const SENTIMENT_COLOURS = {
  positive: "#00a5af",
  neutral: "#bbbdc0",
  negative: "#d85827",
} as const;

/** The legend that belongs under every sentiment bar. */
export function SentimentLegend({
  s,
  showCounts = true,
}: {
  s: RatingSummary;
  showCounts?: boolean;
}) {
  return (
    <Legend
      items={[
        {
          colour: SENTIMENT_COLOURS.positive,
          label: "Positive 4–5★",
          value: showCounts
            ? `${s.pctPositive.toFixed(0)}% (${s.positive})`
            : `${s.pctPositive.toFixed(0)}%`,
        },
        {
          colour: SENTIMENT_COLOURS.neutral,
          label: "Neutral 3★",
          value: showCounts
            ? `${s.pctNeutral.toFixed(0)}% (${s.neutral})`
            : `${s.pctNeutral.toFixed(0)}%`,
        },
        {
          colour: SENTIMENT_COLOURS.negative,
          label: "Negative 1–2★",
          value: showCounts
            ? `${s.pctNegative.toFixed(0)}% (${s.negative})`
            : `${s.pctNegative.toFixed(0)}%`,
        },
      ]}
    />
  );
}

/* ------------------------------------------------------------------ stats */

export function Stars({ value }: { value: number | null }) {
  if (value === null) return <span className="text-ink-40">—</span>;
  return (
    <span className="tabular font-semibold">
      {value.toFixed(2)}
      <span className="ml-0.5 text-[0.7em] font-normal text-ink-40">/5</span>
    </span>
  );
}

/** Positive / neutral / negative as one 100%-wide bar. */
export function SentimentBar({
  s,
  height = "h-2.5",
}: {
  s: RatingSummary;
  height?: string;
}) {
  if (s.n === 0) {
    return <div className={`${height} rounded-full bg-line-soft`} />;
  }
  const parts = [
    { key: "positive", pct: s.pctPositive, n: s.positive },
    { key: "neutral", pct: s.pctNeutral, n: s.neutral },
    { key: "negative", pct: s.pctNegative, n: s.negative },
  ] as const;
  return (
    <div
      className={`flex ${height} overflow-hidden rounded-full bg-line-soft`}
      role="img"
      aria-label={parts
        .map((p) => `${p.pct.toFixed(0)}% ${p.key} (${p.n} reviews)`)
        .join(", ")}
    >
      {parts.map((p) => (
        <div
          key={p.key}
          style={{
            width: `${p.pct}%`,
            background: SENTIMENT_COLOURS[p.key],
          }}
        />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- direction */

const DIRECTION_STYLE = {
  falling: {
    arrow: "▼",
    word: "Falling",
    className: "bg-brand-tint text-brand-dark border-brand-line",
  },
  rising: {
    arrow: "▲",
    word: "Rising",
    className: "bg-teal-tint text-teal-text border-teal-line",
  },
  flat: {
    arrow: "▬",
    word: "Steady",
    className: "bg-line-soft text-ink-60 border-line",
  },
  unknown: {
    arrow: "–",
    word: "Not enough data",
    className: "bg-transparent text-ink-40 border-line",
  },
} as const;

/** Which way the verified monthly average is heading, or an honest shrug. */
export function DirectionPill({
  d,
  showDelta = true,
}: {
  d: DirectionResult;
  showDelta?: boolean;
}) {
  const style = DIRECTION_STYLE[d.dir];
  return (
    <span
      title={
        d.reason ??
        `Verified monthly average moved ${d.delta! >= 0 ? "+" : ""}${d.delta!.toFixed(2)} across ${d.months} months`
      }
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${style.className}`}
    >
      <span aria-hidden>{style.arrow}</span>
      {style.word}
      {showDelta && d.delta !== null ? (
        <span className="tabular font-normal opacity-80">
          {d.delta >= 0 ? "+" : ""}
          {d.delta.toFixed(1)}
        </span>
      ) : null}
    </span>
  );
}

/* --------------------------------------------------------------- surfaces */

/**
 * The verified-vs-all comparison the brief calls a required element. Shown as
 * two panels side by side so the gap between them is the point.
 */
export function RatingComparison({
  verified,
  all,
}: {
  verified: RatingSummary;
  all: RatingSummary;
}) {
  const panels = [
    {
      label: "Verified purchases",
      note: "Amazon confirmed these buyers paid for the product. This is the number to trust.",
      s: verified,
      lead: true,
    },
    {
      label: "All reviews",
      note: "Everything on the listing, including reviews Amazon has not verified as purchases.",
      s: all,
      lead: false,
    },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {panels.map((p) => (
        <div
          key={p.label}
          className={`rounded-xl border bg-surface p-5 ${
            p.lead ? "border-ink" : "border-line"
          }`}
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em]">
              {p.label}
            </span>
            <span className="tabular text-[12px] text-ink-40">
              {p.s.n} review{p.s.n === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-2 text-4xl">
            <Stars value={p.s.avg} />
          </div>
          <p className="mt-1.5 text-[12px] leading-snug text-ink-40">{p.note}</p>
          <div className="mt-4">
            <SentimentBar s={p.s} />
          </div>
          <div className="mt-2.5">
            <SentimentLegend s={p.s} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A single big number with a label under it. */
export function StatTile({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  tone?: "neutral" | "good" | "bad";
}) {
  const accent =
    tone === "good"
      ? "border-teal-line bg-teal-tint"
      : tone === "bad"
        ? "border-brand-line bg-brand-tint"
        : "border-line bg-surface";
  return (
    <div className={`rounded-xl border p-4 ${accent}`}>
      <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-60">
        {label}
      </div>
      <div className="display mt-1.5 text-3xl font-bold tracking-tight">
        {value}
      </div>
      {sub ? (
        <p className="mt-1 text-[12px] leading-snug text-ink-40">{sub}</p>
      ) : null}
    </div>
  );
}

export function InsufficientBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-warn-line bg-warn-bg px-2.5 py-1 text-[11px] font-semibold text-warn">
      <span className="h-1.5 w-1.5 rounded-full bg-warn" />
      Too few reviews to be sure — {n} verified
    </span>
  );
}

export function Panel({
  title,
  subtitle,
  children,
  action,
  className = "",
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-line bg-surface p-5 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-bold uppercase tracking-[0.08em]">
            {title}
          </h2>
          {subtitle ? (
            <p className="mt-1 max-w-2xl text-[12px] leading-snug text-ink-40">
              {subtitle}
            </p>
          ) : null}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function NotEnough({ reason }: { reason: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-canvas px-4 py-8 text-center">
      <p className="mx-auto max-w-sm text-[13px] leading-relaxed text-ink-40">
        <b className="text-ink-60">Not shown.</b> {reason}
      </p>
    </div>
  );
}
