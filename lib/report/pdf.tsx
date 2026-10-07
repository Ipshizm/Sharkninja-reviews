import {
  Circle,
  Document,
  Line,
  Page,
  Polyline,
  renderToBuffer,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";
import {
  DIRECTION_THRESHOLD,
  MIN_MONTHS_FOR_TREND,
  MIN_REVIEWS_PER_MONTH,
  MIN_VERIFIED_FOR_CONFIDENCE,
  type BucketTable,
  type DirectionResult,
  type RatingSummary,
} from "../aggregate";
import type { InsightTone } from "../insights/types";
import type { Theme } from "../text";
import { TONE_LABEL, type ReportData, type SkuSection } from "./data";
import { DISPLAY, registerFonts, SANS } from "./fonts";

/**
 * The insights report as an A4 PDF.
 *
 * Same palette and the same honesty rules as the dashboard: orange means
 * negative, averages are verified purchases, thin samples say so, and written
 * analysis that predates the current reviews is marked rather than trusted.
 */
const C = {
  brand: "#d85827",
  brandDark: "#973e1b",
  brandTint: "#fdf0e9",
  brandLine: "#f2c9b5",
  teal: "#00a5af",
  tealDark: "#006a72",
  tealTint: "#e5f6f7",
  tealLine: "#99dbdf",
  ink: "#000000",
  ink60: "#5c5c5c",
  ink40: "#7b7b7b",
  line: "#e4e4e4",
  lineSoft: "#f1f1f1",
  canvas: "#f7f7f7",
  neutral: "#c9c9c9",
  warn: "#8a5a00",
  warnBg: "#fdf6e8",
  warnLine: "#e8d5ab",
  watch: "#2b6cb0",
  watchBg: "#ebf8ff",
  watchLine: "#bee3f8",
};

const TONE_STYLE: Record<
  InsightTone,
  { fg: string; bg: string; border: string }
> = {
  critical: { fg: C.brandDark, bg: C.brandTint, border: C.brandLine },
  warning: { fg: C.warn, bg: C.warnBg, border: C.warnLine },
  watch: { fg: C.watch, bg: C.watchBg, border: C.watchLine },
  healthy: { fg: C.tealDark, bg: C.tealTint, border: C.tealLine },
  unknown: { fg: C.ink60, bg: C.canvas, border: C.line },
};

const s = StyleSheet.create({
  page: {
    paddingTop: 58,
    paddingBottom: 54,
    paddingHorizontal: 40,
    fontFamily: SANS,
    fontSize: 9,
    color: C.ink,
    // No lineHeight anywhere in this file, on purpose. react-pdf 4.9 multiplies
    // a lineHeight by the font size each time it resolves a style and writes
    // the result back. It re-resolves fixed (repeated) elements on every page,
    // so an inherited line height in the footer grew 49-fold a page until
    // pdfkit refused the number and any report over about ten pages failed to
    // render; inherited into ordinary text it doubled the spacing. The fonts'
    // own metrics give about 1.3 for Plus Jakarta Sans, which reads well.
  },
  header: {
    position: "absolute",
    top: 22,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: C.ink40,
    borderBottomWidth: 0.5,
    borderBottomColor: C.line,
    paddingBottom: 6,
  },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: C.ink40,
  },
  display: { fontFamily: DISPLAY, fontWeight: 700 },
  h1: { fontFamily: DISPLAY, fontWeight: 700, fontSize: 21 },
  h2: {
    fontFamily: DISPLAY,
    fontWeight: 700,
    fontSize: 12.5,
    marginBottom: 3,
  },
  kicker: {
    fontSize: 7,
    fontWeight: 700,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: C.ink60,
  },
  muted: { color: C.ink60 },
  faint: { color: C.ink40 },
  section: { marginTop: 18 },
  sub: { fontSize: 8, color: C.ink60, marginBottom: 8 },
  row: { flexDirection: "row" },
  tile: {
    flex: 1,
    borderWidth: 0.75,
    borderColor: C.line,
    borderRadius: 5,
    padding: 9,
  },
  box: {
    borderWidth: 0.75,
    borderColor: C.line,
    borderRadius: 5,
    padding: 9,
  },
  chip: {
    borderWidth: 0.75,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    fontSize: 6.5,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  th: {
    fontSize: 6.5,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: C.ink60,
  },
  td: { fontSize: 8 },
  bullet: { flexDirection: "row", marginBottom: 2.5 },
});

/* ------------------------------------------------------------ formatting */

const fmtAvg = (v: number | null) =>
  v === null ? "n/a" : `${v.toFixed(2)} / 5`;
const pct = (v: number) => `${Math.round(v)}%`;
const count = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * The written analysis says "3.05★". No text face here has the star, and the
 * fallback that does (Noto Sans Symbols 2) has a 1.70 em line box against
 * Jakarta's 1.26, so every line holding one stood a third taller than its
 * neighbours. In print it reads as "3.05 stars".
 */
const prose = (text: string) => text.replace(/(\d)\s*★/g, "$1 stars");

function longDate(iso: string) {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** "8 May 2026", or "13 April 2026 to 13 September 2026". */
function dateSpan(r: { from: string; to: string }) {
  return r.from === r.to
    ? longDate(r.from)
    : `${longDate(r.from)} to ${longDate(r.to)}`;
}

function stamp(d: Date) {
  return `${d.toLocaleString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  })} IST`;
}

function directionText(d: DirectionResult) {
  if (d.dir === "unknown") return "Not enough data";
  const span = `${d.from!.toFixed(2)} to ${d.to!.toFixed(2)}`;
  if (d.dir === "flat") return `Flat (${span})`;
  return `${d.dir === "rising" ? "↑ Rising" : "↓ Falling"} (${span})`;
}

/* ----------------------------------------------------------- small parts */

/** For the ranked table, where the full label wraps to two lines. */
const TONE_SHORT: Record<InsightTone, string> = {
  critical: "Critical",
  warning: "Action needed",
  watch: "Watch",
  healthy: "Healthy",
  unknown: "Low evidence",
};

function ToneChip({ tone, short }: { tone: InsightTone; short?: boolean }) {
  const t = TONE_STYLE[tone];
  return (
    <Text
      style={[
        s.chip,
        { color: t.fg, backgroundColor: t.bg, borderColor: t.border },
      ]}
    >
      {short ? TONE_SHORT[tone] : TONE_LABEL[tone]}
    </Text>
  );
}

function SentimentBar({
  summary,
  height = 6,
}: {
  summary: RatingSummary;
  height?: number;
}) {
  if (summary.n === 0) return null;
  const parts = [
    { v: summary.pctPositive, c: C.teal },
    { v: summary.pctNeutral, c: C.neutral },
    { v: summary.pctNegative, c: C.brand },
  ].filter((p) => p.v > 0);
  return (
    <View
      style={{
        flexDirection: "row",
        height,
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      {parts.map((p, i) => (
        <View key={i} style={{ width: `${p.v}%`, backgroundColor: p.c }} />
      ))}
    </View>
  );
}

function SentimentLegend({ summary }: { summary: RatingSummary }) {
  const item = (c: string, label: string, v: number, n: number) => (
    <View
      style={{ flexDirection: "row", alignItems: "center", marginRight: 8 }}
    >
      <View
        style={{ width: 5, height: 5, backgroundColor: c, marginRight: 3 }}
      />
      <Text style={{ fontSize: 7, color: C.ink60 }}>
        {label} {pct(v)} ({n})
      </Text>
    </View>
  );
  return (
    <View style={{ flexDirection: "row", marginTop: 4, flexWrap: "wrap" }}>
      {item(C.teal, "Positive", summary.pctPositive, summary.positive)}
      {item(C.neutral, "Neutral", summary.pctNeutral, summary.neutral)}
      {item(C.brand, "Negative", summary.pctNegative, summary.negative)}
    </View>
  );
}

function Tile({
  label,
  value,
  sub,
  bad,
}: {
  label: string;
  value: string;
  sub: string;
  bad?: boolean;
}) {
  return (
    <View
      style={[
        s.tile,
        bad ? { backgroundColor: C.brandTint, borderColor: C.brandLine } : {},
      ]}
    >
      <Text style={s.kicker}>{label}</Text>
      <Text style={[s.display, { fontSize: 17, marginTop: 4 }]}>{value}</Text>
      <Text style={{ fontSize: 7, color: C.ink60, marginTop: 2 }}>{sub}</Text>
    </View>
  );
}

function Bullets({
  items,
  colour = C.ink40,
}: {
  items: string[];
  colour?: string;
}) {
  return (
    <View>
      {items.map((t, i) => (
        <View key={i} style={s.bullet} wrap={false}>
          <Text style={{ width: 9, color: colour }}>•</Text>
          <Text style={{ flex: 1 }}>{t}</Text>
        </View>
      ))}
    </View>
  );
}

function Note({
  children,
  tone = "warn",
}: {
  children: string;
  tone?: "warn" | "stale";
}) {
  const t = tone === "warn" ? TONE_STYLE.warning : TONE_STYLE.unknown;
  return (
    <View
      style={{
        borderWidth: 0.75,
        borderColor: t.border,
        backgroundColor: t.bg,
        borderRadius: 4,
        padding: 6,
        marginTop: 6,
      }}
    >
      <Text
        style={{ fontSize: 7.5, color: tone === "warn" ? C.warn : C.ink60 }}
      >
        {children}
      </Text>
    </View>
  );
}

/* ---------------------------------------------------------- problem bars */

function ProblemBars({
  buckets,
  compact,
}: {
  buckets: BucketTable;
  compact?: boolean;
}) {
  if (buckets.negatives === 0) {
    return (
      <Text style={s.faint}>
        No 1 to 2 star reviews, so nothing to break down.
      </Text>
    );
  }
  const rows = buckets.rows.filter((r) => r.count > 0);
  return (
    <View>
      {rows.map((r) => (
        <View
          key={r.bucket}
          style={{ marginBottom: compact ? 4 : 6 }}
          wrap={false}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text
              style={{
                width: compact ? 88 : 118,
                fontSize: compact ? 7.5 : 8.5,
                fontWeight: 600,
              }}
            >
              {r.bucket}
            </Text>
            <View
              style={{
                flex: 1,
                height: compact ? 6 : 8,
                backgroundColor: C.canvas,
                borderRadius: 2,
              }}
            >
              <View
                style={{
                  width: `${r.pct}%`,
                  height: compact ? 6 : 8,
                  borderRadius: 2,
                  backgroundColor:
                    r.bucket === "Unclassified" ? C.neutral : C.brand,
                }}
              />
            </View>
            <Text
              style={{
                width: compact ? 52 : 70,
                textAlign: "right",
                fontSize: compact ? 7 : 8,
              }}
            >
              <Text style={{ fontWeight: 700 }}>{pct(r.pct)}</Text>
              <Text style={s.faint}>
                {" "}
                · {r.count} of {buckets.negatives}
              </Text>
            </Text>
          </View>
          {!compact && r.example ? (
            <Text
              style={{
                fontSize: 7,
                color: C.ink40,
                marginLeft: 118,
                marginTop: 1,
              }}
            >
              {r.example}
            </Text>
          ) : null}
        </View>
      ))}
      <Text style={{ fontSize: 6.5, color: C.ink40, marginTop: 2 }}>
        Share of the {buckets.negatives} negative review
        {buckets.negatives === 1 ? "" : "s"}. One review can name several
        problems, so shares can add up to more than 100%.
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------ trend chart */

const CHART = { w: 230, h: 92, left: 14, right: 6, top: 6, bottom: 14 };

function TrendChart({ section }: { section: SkuSection }) {
  const t = section.trend;
  if (!t.ok)
    return <Text style={[s.faint, { fontSize: 7.5 }]}>{t.reason}</Text>;

  const pw = CHART.w - CHART.left - CHART.right;
  const ph = CHART.h - CHART.top - CHART.bottom;
  const x = (i: number) =>
    CHART.left +
    (t.points.length === 1 ? pw / 2 : (i / (t.points.length - 1)) * pw);
  const y = (v: number) => CHART.top + ((5 - v) / 4) * ph;
  const labelled = new Set([
    0,
    t.points.length - 1,
    Math.floor((t.points.length - 1) / 2),
  ]);

  return (
    <View style={{ width: CHART.w, height: CHART.h, position: "relative" }}>
      <Svg width={CHART.w} height={CHART.h}>
        {[1, 2, 3, 4, 5].map((v) => (
          <Line
            key={v}
            x1={CHART.left}
            x2={CHART.w - CHART.right}
            y1={y(v)}
            y2={y(v)}
            stroke={v === 4 ? C.neutral : C.lineSoft}
            strokeWidth={0.75}
            strokeDasharray={v === 4 ? "2 2" : undefined}
          />
        ))}
        <Polyline
          points={t.points.map((p, i) => `${x(i)},${y(p.avg)}`).join(" ")}
          stroke={C.teal}
          strokeWidth={1.4}
          fill="none"
        />
        {t.points.map((p, i) => (
          <Circle
            key={p.month}
            cx={x(i)}
            cy={y(p.avg)}
            r={2.2}
            fill={p.n >= MIN_REVIEWS_PER_MONTH ? C.teal : "#ffffff"}
            stroke={C.teal}
            strokeWidth={1}
          />
        ))}
      </Svg>
      {[1, 3, 5].map((v) => (
        <Text
          key={v}
          style={{
            position: "absolute",
            left: 0,
            top: y(v) - 4,
            fontSize: 6,
            color: C.ink40,
          }}
        >
          {v}
        </Text>
      ))}
      {t.points.map((p, i) =>
        labelled.has(i) ? (
          <Text
            key={p.month}
            style={{
              position: "absolute",
              top: CHART.h - 9,
              left: x(i) - 14,
              width: 28,
              textAlign: "center",
              fontSize: 6,
              color: C.ink40,
            }}
          >
            {p.label}
          </Text>
        ) : null,
      )}
    </View>
  );
}

/* ----------------------------------------------------------- page chrome */

function Chrome({ data }: { data: ReportData }) {
  return (
    <>
      <View style={s.header} fixed>
        <Text>SharkNinja India · Amazon.in review sentiment</Text>
        <Text>{data.title}</Text>
      </View>
      <View style={s.footer} fixed>
        <Text>
          Generated {stamp(data.generatedAt)} · {data.source}
          {data.range ? ` · reviews to ${longDate(data.range.to)}` : ""}
        </Text>
        <Text
          render={({ pageNumber, totalPages }) =>
            `Page ${pageNumber} of ${totalPages}`
          }
        />
      </View>
    </>
  );
}

function TitleBlock({ data }: { data: ReportData }) {
  return (
    <View>
      <Text style={[s.kicker, { color: C.brand }]}>
        Insights report · {data.scopeLabel}
      </Text>
      <Text style={[s.h1, { marginTop: 5 }]}>
        {data.title.replace(": insights report", "")}
      </Text>
      <Text style={{ fontSize: 9, color: C.ink60, marginTop: 5 }}>
        {data.all.n} Amazon.in reviews, {data.verified.n} of them verified
        purchases
        {data.range ? `, dated ${dateSpan(data.range)}` : ""}.
      </Text>
    </View>
  );
}

/* -------------------------------------------------------------- sections */

function PortfolioKpis({ data }: { data: ReportData }) {
  const v = data.verified;
  return (
    <View style={[s.row, s.section, { gap: 8 }]} wrap={false}>
      <Tile
        label="Reviews"
        value={String(data.all.n)}
        sub={`${v.n} verified (${data.all.n ? pct((v.n / data.all.n) * 100) : "0%"})`}
      />
      <Tile
        label="Verified average"
        value={fmtAvg(v.avg)}
        sub="Verified purchases only"
        bad={v.avg !== null && v.avg < 4}
      />
      <Tile
        label="Declining listings"
        value={String(data.falling.length)}
        sub={
          data.falling.length
            ? data.falling.map((f) => f.name).join(", ")
            : "None falling"
        }
        bad={data.falling.length > 0}
      />
      <Tile
        label="Top complaint area"
        value={data.topProblem ? data.topProblem.bucket : "None"}
        sub={
          data.topProblem
            ? `${data.topProblem.count} complaints, ${pct(data.topProblem.pct)} of negatives`
            : "No negative reviews"
        }
        bad={Boolean(data.topProblem)}
      />
    </View>
  );
}

function BrandRollup({ data }: { data: ReportData }) {
  if (data.brands.length === 0) return null;
  return (
    <View style={[s.row, s.section, { gap: 8 }]} wrap={false}>
      {data.brands.map((b) => (
        <View key={b.brand} style={[s.box, { flex: 1 }]}>
          <View
            style={[
              s.row,
              { justifyContent: "space-between", alignItems: "baseline" },
            ]}
          >
            <Text style={[s.display, { fontSize: 13 }]}>{b.brand}</Text>
            <Text style={{ fontSize: 7, color: C.ink40 }}>
              {b.skuCount} listings · {b.all.n} reviews
            </Text>
          </View>
          <Text style={{ marginTop: 4 }}>
            <Text style={[s.display, { fontSize: 15 }]}>
              {fmtAvg(b.verified.avg)}
            </Text>
            <Text style={{ fontSize: 7.5, color: C.ink40 }}>
              {" "}
              verified average · n = {b.verified.n}
            </Text>
          </Text>
          <View style={{ marginTop: 6 }}>
            <SentimentBar summary={b.verified} />
            <SentimentLegend summary={b.verified} />
          </View>
        </View>
      ))}
    </View>
  );
}

function Priorities({ data }: { data: ReportData }) {
  if (data.priorities.length === 0) return null;
  return (
    <View style={s.section}>
      <Text style={s.h2} minPresenceAhead={80}>
        Priority interventions
      </Text>
      <Text style={s.sub}>
        Listings whose current numbers put them at critical or action needed,
        worst first.
      </Text>
      {data.priorities.map((p) => (
        <View
          key={p.sku.id}
          wrap={false}
          style={{
            borderLeftWidth: 2.5,
            borderLeftColor: TONE_STYLE[p.tone].fg,
            paddingLeft: 8,
            paddingVertical: 3,
            marginBottom: 8,
          }}
        >
          <View style={[s.row, { alignItems: "center", gap: 6 }]}>
            <Text style={{ fontWeight: 700, fontSize: 9.5 }}>{p.sku.name}</Text>
            <Text style={{ fontSize: 7, color: C.ink40 }}>
              {p.sku.brand} · {fmtAvg(p.stats.verified.avg)} verified ·{" "}
              {pct(p.stats.all.pctNegative)} negative
            </Text>
            <View style={{ flex: 1 }} />
            <ToneChip tone={p.tone} />
          </View>
          {p.insight ? (
            <>
              <Text style={{ marginTop: 2 }}>{prose(p.insight.headline)}</Text>
              <Text style={{ marginTop: 2, fontSize: 8, color: C.ink60 }}>
                <Text style={{ fontWeight: 700, color: C.ink }}>Next: </Text>
                {prose(p.insight.watch)}
              </Text>
            </>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const COLS = {
  rank: 16,
  name: 132,
  n: 40,
  avg: 52,
  neg: 40,
  dir: 96,
  problem: 78,
};

function RankedTable({ data }: { data: ReportData }) {
  return (
    <View style={s.section}>
      {/* Heading, note and column header move as one, with room for rows after. */}
      <View wrap={false} minPresenceAhead={90}>
        <Text style={s.h2}>Listings ranked by attention</Text>
        <Text style={s.sub}>
          Worst verified average first. Listings with fewer than{" "}
          {MIN_VERIFIED_FOR_CONFIDENCE} verified reviews sink to the bottom: one
          unhappy buyer moves their average by a full point.
        </Text>
        <View
          style={[
            s.row,
            {
              borderBottomWidth: 0.75,
              borderBottomColor: C.line,
              paddingBottom: 3,
            },
          ]}
        >
          <Text style={[s.th, { width: COLS.rank }]}>#</Text>
          <Text style={[s.th, { width: COLS.name }]}>Listing</Text>
          <Text style={[s.th, { width: COLS.n, textAlign: "right" }]}>
            Reviews
          </Text>
          <Text style={[s.th, { width: COLS.avg, textAlign: "right" }]}>
            Verified
          </Text>
          <Text style={[s.th, { width: COLS.neg, textAlign: "right" }]}>
            % neg
          </Text>
          <Text style={[s.th, { width: COLS.dir, paddingLeft: 10 }]}>
            Direction
          </Text>
          <Text style={[s.th, { width: COLS.problem }]}>Top problem</Text>
          <Text style={[s.th, { flex: 1, textAlign: "right" }]}>Status</Text>
        </View>
      </View>
      {data.ranked.map((r, i) => (
        <View
          key={r.sku.id}
          wrap={false}
          style={[
            s.row,
            {
              alignItems: "center",
              paddingVertical: 4,
              borderBottomWidth: 0.5,
              borderBottomColor: C.lineSoft,
            },
          ]}
        >
          <Text style={[s.td, { width: COLS.rank, color: C.ink40 }]}>
            {i + 1}
          </Text>
          <View style={{ width: COLS.name }}>
            <Text style={[s.td, { fontWeight: 600 }]}>{r.sku.name}</Text>
            <Text
              style={{
                fontSize: 6.5,
                color: r.stats.insufficient ? C.warn : C.ink40,
              }}
            >
              {r.sku.brand}
              {r.stats.insufficient
                ? ` · low data, ${r.stats.verified.n} verified`
                : ""}
            </Text>
          </View>
          <Text style={[s.td, { width: COLS.n, textAlign: "right" }]}>
            {r.stats.all.n}
          </Text>
          <Text
            style={[
              s.td,
              { width: COLS.avg, textAlign: "right", fontWeight: 700 },
            ]}
          >
            {r.stats.verified.avg === null
              ? "n/a"
              : r.stats.verified.avg.toFixed(2)}
          </Text>
          <Text style={[s.td, { width: COLS.neg, textAlign: "right" }]}>
            {r.stats.all.n ? pct(r.stats.all.pctNegative) : "n/a"}
          </Text>
          <Text
            style={[
              s.td,
              {
                width: COLS.dir,
                paddingLeft: 10,
                fontSize: 7.5,
                color:
                  r.direction.dir === "falling"
                    ? C.brandDark
                    : r.direction.dir === "rising"
                      ? C.tealDark
                      : C.ink60,
              },
            ]}
          >
            {directionText(r.direction)}
          </Text>
          <Text style={[s.td, { width: COLS.problem, fontSize: 7.5 }]}>
            {topNamed(r.buckets) ?? "None named"}
          </Text>
          <View style={{ flex: 1, alignItems: "flex-end" }}>
            <ToneChip tone={r.tone} short />
          </View>
        </View>
      ))}
    </View>
  );
}

function topNamed(b: BucketTable) {
  return (
    b.rows.find((r) => r.bucket !== "Unclassified" && r.count > 0)?.bucket ??
    null
  );
}

function Themes({
  title,
  themes,
  colour,
}: {
  title: string;
  themes: Theme[];
  colour: string;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[s.kicker, { marginBottom: 3 }]}>{title}</Text>
      {themes.length === 0 ? (
        <Text style={{ fontSize: 7.5, color: C.ink40 }}>
          No wording repeats across reviews.
        </Text>
      ) : (
        themes.map((t) => (
          <View
            key={t.phrase}
            style={[
              s.row,
              { justifyContent: "space-between", marginBottom: 1.5 },
            ]}
          >
            <Text style={{ fontSize: 8 }}>
              <Text style={{ color: colour }}>• </Text>
              {t.phrase}
            </Text>
            <Text style={{ fontSize: 7, color: C.ink40 }}>
              {t.reviews} review{t.reviews === 1 ? "" : "s"}
            </Text>
          </View>
        ))
      )}
    </View>
  );
}

function SkuDetail({
  section,
  data,
  first,
  titled,
}: {
  section: SkuSection;
  data: ReportData;
  first: boolean;
  /** The page title already names the listing (single-listing report). */
  titled?: boolean;
}) {
  const { sku, stats, insight } = section;
  return (
    <View
      style={{
        marginTop: first ? 0 : 16,
        paddingTop: first ? 0 : 14,
        borderTopWidth: first ? 0 : 0.75,
        borderTopColor: C.line,
      }}
    >
      {/*
        Name, tiles, the low-data note and the analysis headline are one block
        that cannot split, so a listing's header never ends a page alone.
        (minPresenceAhead would say this more briefly; react-pdf 4.9 ignores it
        on nested views like these.)
      */}
      <View wrap={false}>
        <View style={[s.row, { alignItems: "center", gap: 8 }]}>
          {titled ? null : (
            <Text style={[s.display, { fontSize: 14 }]}>{sku.name}</Text>
          )}
          <ToneChip tone={section.tone} />
        </View>
        <Text style={{ fontSize: 7.5, color: C.ink40, marginTop: 1 }}>
          {sku.brand}{sku.asin ? ` · ASIN ${sku.asin}` : ""}
          {sku.model ? ` · ${sku.model}` : ""}
        </Text>

        <View style={[s.row, { gap: 8, marginTop: 8 }]}>
          <Tile
            label="Verified average"
            value={fmtAvg(stats.verified.avg)}
            sub={count(stats.verified.n, "verified purchase")}
            bad={stats.verified.avg !== null && stats.verified.avg < 4}
          />
          <Tile
            label="All reviews"
            value={fmtAvg(stats.all.avg)}
            sub={count(stats.all.n, "review")}
          />
          <Tile
            label="Negative share"
            value={stats.all.n ? pct(stats.all.pctNegative) : "n/a"}
            sub={`${stats.all.negative} of ${stats.all.n} are 1 to 2 stars`}
            bad={stats.all.pctNegative >= 20}
          />
          <Tile
            label="Direction"
            value={
              section.direction.dir === "unknown"
                ? "n/a"
                : section.direction.dir === "flat"
                  ? "Flat"
                  : section.direction.dir === "rising"
                    ? "↑ Rising"
                    : "↓ Falling"
            }
            sub={
              section.direction.dir === "unknown"
                ? "Not enough months to call"
                : `${section.direction.from!.toFixed(2)} to ${section.direction.to!.toFixed(2)} verified`
            }
            bad={section.direction.dir === "falling"}
          />
        </View>

        {stats.insufficient ? (
          <Note>
            {`Read this listing as anecdote, not measurement. With ${stats.verified.n} verified review${
              stats.verified.n === 1 ? "" : "s"
            } (the bar is ${MIN_VERIFIED_FOR_CONFIDENCE}), a single unhappy customer moves the average by a full point.`}
          </Note>
        ) : null}

        {insight ? (
          <View style={{ marginTop: 10 }}>
            <Text style={[s.kicker, { marginBottom: 3 }]}>
              Analysis · written by {data.model},{" "}
              {longDate(insight.generatedAt)}
            </Text>
            <Text style={{ fontWeight: 700, fontSize: 10.5 }}>
              {prose(insight.headline)}
            </Text>
            {section.isStale ? (
              <Note tone="stale">
                Written from an earlier set of reviews than today&apos;s. The
                figures in the tiles above are current; figures quoted in this
                analysis may not be.
              </Note>
            ) : null}
          </View>
        ) : null}
      </View>

      {insight ? (
        <View>
          {insight.body.map((para, i) => (
            <Text
              key={i}
              style={{ marginTop: 5, color: "#222222" }}
              orphans={2}
              widows={2}
            >
              {prose(para)}
            </Text>
          ))}
          <View style={[s.row, { gap: 8, marginTop: 8 }]} wrap={false}>
            <View
              style={[
                s.box,
                { flex: 1, backgroundColor: C.canvas, borderColor: C.lineSoft },
              ]}
            >
              <Text style={[s.kicker, { marginBottom: 3 }]}>
                Commercial impact
              </Text>
              <Text style={{ fontSize: 8.5 }}>{prose(insight.soWhat)}</Text>
            </View>
            <View
              style={[
                s.box,
                { flex: 1, backgroundColor: C.canvas, borderColor: C.lineSoft },
              ]}
            >
              <Text style={[s.kicker, { marginBottom: 3 }]}>What to watch</Text>
              <Text style={{ fontSize: 8.5 }}>{prose(insight.watch)}</Text>
            </View>
          </View>
          {insight.evidence.length > 0 ? (
            <View style={{ marginTop: 8 }} wrap={false}>
              <Text style={[s.kicker, { marginBottom: 3 }]}>
                Evidence cited
              </Text>
              <Bullets items={insight.evidence.map(prose)} />
            </View>
          ) : null}
        </View>
      ) : (
        <Text style={{ marginTop: 10, color: C.ink40 }}>
          No written analysis for this listing yet.
        </Text>
      )}

      <View style={[s.row, { gap: 16, marginTop: 10 }]} wrap={false}>
        <View style={{ width: CHART.w }}>
          <Text style={[s.kicker, { marginBottom: 4 }]}>
            Verified average by month
          </Text>
          <TrendChart section={section} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.kicker, { marginBottom: 4 }]}>
            Problem areas in 1 to 2 star reviews
          </Text>
          <ProblemBars buckets={section.buckets} compact />
        </View>
      </View>

      <View style={[s.row, { gap: 16, marginTop: 10 }]} wrap={false}>
        <Themes
          title="Praise that repeats (4 to 5 stars)"
          themes={section.praise}
          colour={C.teal}
        />
        <Themes
          title="Complaints that repeat (1 to 2 stars)"
          themes={section.complaints}
          colour={C.brand}
        />
      </View>
    </View>
  );
}

function Method({ data }: { data: ReportData }) {
  return (
    <View style={s.section}>
      <Text style={s.h2}>How to read this report</Text>
      <View style={{ marginTop: 4 }}>
        <Bullets
          items={[
            "Averages are verified purchases unless marked all reviews: Amazon confirms these buyers paid for the product.",
            "Sentiment comes from the star rating: 4 to 5 stars is positive, 3 is neutral, 1 to 2 is negative.",
            "Problem areas are keyword rules applied to 1 to 2 star reviews. One review can name several problems, so shares can add up to more than 100%.",
            `Direction compares the verified monthly average at the start of the period with the end. It needs ${MIN_MONTHS_FOR_TREND} months with at least ${MIN_REVIEWS_PER_MONTH} verified reviews each, and it is flat unless the average moved by ${DIRECTION_THRESHOLD} stars or more. On the charts, the dashed line marks 4.0 and a hollow point is a month with fewer than ${MIN_REVIEWS_PER_MONTH} verified reviews.`,
            `Status is worked out from today's numbers. Under 5 verified reviews is insufficient evidence and under ${MIN_VERIFIED_FOR_CONFIDENCE} is at most a watch item. Critical: a verified or overall average under 3.40, or 35% or more negative. Action needed: under 3.80, or 20% or more negative. Watch: under 4.00, or 12% or more negative. Anything else is healthy.`,
            `${
              data.insightsWritten
                ? `The written analysis was generated by ${data.model} ${data.insightsWritten.from === data.insightsWritten.to ? `on ${longDate(data.insightsWritten.from)}` : `between ${longDate(data.insightsWritten.from)} and ${longDate(data.insightsWritten.to)}`}, from the reviews loaded at the time.`
                : "No listing in this report has written analysis yet."
            } Each analysis is fingerprinted against its reviews, and any listing whose reviews have changed since is marked in this report.`,
            `Data: ${data.source}${data.range ? `, reviews dated ${dateSpan(data.range)}` : ""}. Reviews are collected from Amazon.in listing pages.`,
          ]}
        />
      </View>
    </View>
  );
}

function ReportDocument({ data }: { data: ReportData }) {
  const multi = data.scope.kind !== "sku";
  return (
    <Document
      title={data.title}
      author="SharkNinja India review dashboard"
      subject="Amazon.in review sentiment"
      creator="sharkninja-reviews"
      producer="sharkninja-reviews"
    >
      <Page size="A4" style={s.page}>
        <Chrome data={data} />
        <View>
          <TitleBlock data={data} />
          {multi ? (
            <>
              <PortfolioKpis data={data} />
              <BrandRollup data={data} />
              <Priorities data={data} />
              <RankedTable data={data} />
              <View style={s.section} wrap={false}>
                <Text style={s.h2}>Problem areas</Text>
                <Text style={s.sub}>
                  What the 1 to 2 star reviews complain about, across every
                  listing in this report.
                </Text>
                <ProblemBars buckets={data.buckets} />
              </View>
              <View break>
                <Text style={[s.kicker, { color: C.brand, marginBottom: 10 }]}>
                  Listing detail · in ranked order
                </Text>
                {data.ranked.map((section, i) => (
                  <SkuDetail
                    key={section.sku.id}
                    section={section}
                    data={data}
                    first={i === 0}
                  />
                ))}
              </View>
            </>
          ) : (
            <View style={{ marginTop: 16 }}>
              {data.ranked.map((section, i) => (
                <SkuDetail
                  key={section.sku.id}
                  section={section}
                  data={data}
                  first={i === 0}
                  titled
                />
              ))}
            </View>
          )}
          <Method data={data} />
        </View>
      </Page>
    </Document>
  );
}

export async function renderReport(data: ReportData): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<ReportDocument data={data} />);
}
