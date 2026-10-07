import Link from "next/link";
import { portfolio, reviewsForSku } from "@/lib/aggregate";
import { loadReviews } from "@/lib/data";
import { usingSnapshot } from "@/lib/store";
import { getAllInsights, getSkuInsight } from "@/lib/insights";
import { skuById } from "@/lib/skus";
import { ExecutiveBriefing } from "@/components/ExecutiveBriefing";
import { ExportLinks } from "@/components/ExportLinks";
import { ReportLink } from "@/components/ReportLink";
import { MasterSkuTable } from "@/components/MasterSkuTable";
import {
  Panel,
  SentimentBar,
  SentimentLegend,
  Stars,
  StatTile,
} from "@/components/Stat";

export const dynamic = "force-dynamic";

export default async function Home() {
  const reviews = await loadReviews();

  if (reviews.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-surface p-10 text-center">
        <h1 className="text-lg font-bold">No reviews loaded yet</h1>
        <p className="mx-auto mt-2 max-w-md text-[14px] text-ink-60">
          Import an Amazon review export to get started. Drop in the Ninja and
          Shark workbooks and the dashboard fills itself in.
        </p>
        <Link
          href="/upload"
          className="mt-5 inline-block rounded-md bg-teal px-4 py-2 text-[14px] font-semibold text-ink hover:bg-teal-dark hover:text-white"
        >
          Import data
        </Link>
      </div>
    );
  }

  const port = portfolio(reviews);
  const range = port.range;

  const rawInsights = getAllInsights();
  const enrichedInsights = rawInsights.insights.map((ins) => {
    const sku = skuById(ins.skuId);
    const skuReviews = reviewsForSku(reviews, ins.skuId);
    const { isStale, insight } = getSkuInsight(ins.skuId, skuReviews);
    return {
      ...(insight ?? ins),
      skuName: sku ? sku.name : ins.skuId,
      brand: sku ? sku.brand : "Unknown",
      isStale,
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Executive Sentiment Overview</h1>
          <p className="mt-1 text-[13px] text-ink-60">
            Portfolio performance across SharkNinja India listings on Amazon.in
            {range ? (
              <>
                {" "}· {formatMonth(range.from)} to {formatMonth(range.to)}
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ReportLink scopeName="all listings" />
          <ExportLinks filter={{}} count={reviews.length} label="Export all reviews" />
          <Link
            href="/upload"
            className="rounded-lg bg-teal px-3 py-1.5 text-[12px] font-semibold text-ink transition hover:bg-teal-dark hover:text-white"
          >
            Import Data
          </Link>
        </div>
      </div>

      {usingSnapshot() ? (
        <p className="rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[12px] text-ink-60">
          {/* Dated from the reviews themselves: the seed's own generatedAt
              stayed at 8 September when later reviews were bundled in. */}
          Read-only snapshot, newest review{" "}
          <span className="font-semibold text-ink">
            {range ? formatDay(range.to) : "none"}
          </span>
          . Connect PostgreSQL (Neon) to import new workbooks from the browser.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Total Reviews"
          value={reviews.length}
          sub={`${port.verified.n} verified purchases (${Math.round((port.verified.n / reviews.length) * 100)}%)`}
        />
        <StatTile
          label="Verified Rating"
          value={
            <span className="text-2xl">
              <Stars value={port.verified.avg} />
            </span>
          }
          sub={`${port.verified.avg?.toFixed(2)} verified average out of 5.0`}
          tone={port.verified.avg && port.verified.avg >= 4.0 ? "good" : "bad"}
        />
        <StatTile
          label="Declining Listings"
          value={port.falling.length}
          sub={
            port.falling.length > 0
              ? port.falling.map((f) => f.sku.name).join(", ")
              : "No SKUs currently falling"
          }
          tone={port.falling.length > 0 ? "bad" : "good"}
        />
        <StatTile
          label="Top Complaint Area"
          value={port.topProblem ? port.topProblem.bucket : "None"}
          sub={
            port.topProblem
              ? `${port.topProblem.count} complaints (${port.topProblem.pct.toFixed(0)}% of negatives)`
              : "No negative reviews recorded"
          }
          tone={port.topProblem ? "bad" : "neutral"}
        />
      </div>

      {/* Brand Rollups */}
      <div className="grid gap-5 sm:grid-cols-2">
        {port.brands.map((t) => (
          <Link
            key={t.brand}
            href={`/${t.brand.toLowerCase()}`}
            className="group rounded-xl border border-line bg-surface p-5 transition hover:border-ink hover:shadow-xs"
          >
            <div className="flex items-baseline justify-between">
              <h2 className="text-xl font-bold tracking-tight group-hover:text-teal-text">
                {t.brand}
              </h2>
              <span className="text-[12px] text-ink-40">
                {t.skuCount} SKUs · {t.all.n} reviews
              </span>
            </div>

            <div className="mt-4 flex items-baseline gap-3">
              <span className="text-3xl">
                <Stars value={t.verified.avg} />
              </span>
              <span className="text-[12px] text-ink-40">
                verified average · n={t.verified.n}
              </span>
            </div>

            <div className="mt-4">
              <SentimentBar s={t.verified} />
            </div>
            <div className="mt-2">
              <SentimentLegend s={t.verified} />
            </div>

            <p className="mt-4 text-[13px] font-semibold text-teal-text">
              View all {t.brand} products →
            </p>
          </Link>
        ))}
      </div>

      {/* Master SKU Table Ranked Worst-First */}
      <Panel
        title="All Listings Ranked (Attention Priority)"
        subtitle="Ranked worst-first on verified purchase average so critical issues remain visible. Small sample size listings (<10 verified) sink below active lines."
      >
        <MasterSkuTable rows={port.skus} />
      </Panel>

      {/* AI briefing sits after the numbers it interprets: KPIs, brands, ranked table. */}
      <ExecutiveBriefing
        insights={enrichedInsights}
        totalReviews={reviews.length}
        generatedAt={rawInsights.generatedAt}
      />
    </div>
  );
}

function formatDay(iso: string) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatMonth(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
