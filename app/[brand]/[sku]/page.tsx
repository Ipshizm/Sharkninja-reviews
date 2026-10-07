import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import {
  bucketTable,
  cloudFor,
  MIN_VERIFIED_FOR_CONFIDENCE,
  reviewsForSku,
  skuStats,
  themesFor,
  trend,
} from "@/lib/aggregate";
import { loadReviews } from "@/lib/data";
import { amazonUrl, BRANDS, skuById } from "@/lib/skus";
import { getSkuInsight } from "@/lib/insights";
import { BucketBars, InsightCard, ThemeList } from "@/components/Insights";
import { ReportLink } from "@/components/ReportLink";
import { ReviewExplorer } from "@/components/ReviewExplorer";
import {
  InsufficientBadge,
  NotEnough,
  Panel,
  RatingComparison,
} from "@/components/Stat";
import { TrendChart } from "@/components/TrendChart";
import { WordCloudView } from "@/components/WordCloudView";

export const dynamic = "force-dynamic";

export default async function SkuPage({
  params,
}: {
  params: Promise<{ brand: string; sku: string }>;
}) {
  const { brand: brandSlug, sku: skuId } = await params;
  const brand = BRANDS.find((b) => b.toLowerCase() === brandSlug.toLowerCase());
  const sku = skuById(skuId);
  if (!brand || !sku || sku.brand !== brand) notFound();

  const all = await loadReviews();
  const reviews = reviewsForSku(all, sku.id);
  const stats = skuStats(sku, all);
  const positiveCloud = cloudFor(reviews, "positive", sku);
  const negativeCloud = cloudFor(reviews, "negative", sku);
  const positiveThemes = themesFor(reviews, "positive", sku, 5);
  const negativeThemes = themesFor(reviews, "negative", sku, 5);
  const buckets = bucketTable(reviews);
  const trendResult = trend(reviews);
  const { insight, isStale } = getSkuInsight(sku.id, reviews);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Breadcrumbs
            items={[
              { label: "Dashboard", href: "/" },
              { label: brand, href: `/${brand.toLowerCase()}` },
              { label: sku.name },
            ]}
          />
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{sku.name}</h1>
            {stats.insufficient ? (
              <InsufficientBadge n={stats.verified.n} />
            ) : null}
          </div>
          <p className="mt-1 text-[13px] text-ink-60">
            {reviews.length} review{reviews.length === 1 ? "" : "s"}
            {sku.model ? ` · ${sku.model}` : ""} ·{" "}
            <a
              href={amazonUrl(sku)}
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-ink"
            >
              listing on Amazon.in
            </a>
          </p>
        </div>
        <ReportLink skuId={sku.id} scopeName={sku.name} />
      </div>

      {stats.insufficient ? (
        <div className="rounded-lg border border-warn-line bg-warn-bg p-4 text-[13px]">
          <b>Read this page as anecdote, not measurement.</b> With{" "}
          {stats.verified.n} verified review
          {stats.verified.n === 1 ? "" : "s"} (the bar is{" "}
          {MIN_VERIFIED_FOR_CONFIDENCE}), a single unhappy customer moves the
          average by a full point. Percentages below are shown for completeness,
          not for decisions.
        </div>
      ) : null}

      <RatingComparison verified={stats.verified} all={stats.all} />

      {insight ? <InsightCard insight={insight} isStale={isStale} /> : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="What people praise"
          subtitle={`4–5★ language${positiveCloud.ok ? ` · ${positiveCloud.n} reviews` : ""}`}
        >
          {positiveCloud.ok ? (
            <WordCloudView words={positiveCloud.words} tone="positive" />
          ) : (
            <NotEnough reason={positiveCloud.reason} />
          )}
          <ThemeList themes={positiveThemes} tone="positive" />
        </Panel>

        <Panel
          title="What people complain about"
          subtitle={`1–2★ language${negativeCloud.ok ? ` · ${negativeCloud.n} reviews` : ""}`}
        >
          {negativeCloud.ok ? (
            <WordCloudView words={negativeCloud.words} tone="negative" />
          ) : (
            <NotEnough reason={negativeCloud.reason} />
          )}
          <ThemeList themes={negativeThemes} tone="negative" />
        </Panel>
      </div>

      <Panel
        title="Problem areas"
        subtitle={`${buckets.negatives} negative review${buckets.negatives === 1 ? "" : "s"} for this SKU. A review can sit in more than one area.`}
      >
        <BucketBars rows={buckets.rows} total={buckets.negatives} />
      </Panel>

      <Panel
        title="Rating over time"
        subtitle="Monthly average, verified purchases only"
      >
        {trendResult.ok ? (
          <TrendChart points={trendResult.points} />
        ) : (
          <NotEnough reason={trendResult.reason} />
        )}
      </Panel>

      <Panel
        title="Customer reviews explorer"
        subtitle={`All ${reviews.length} customer review${reviews.length === 1 ? "" : "s"} for this listing. Search keywords, filter by star rating, or drill down by verified status and problem area.`}
      >
        <ReviewExplorer reviews={reviews} skuId={sku.id} skuName={sku.name} />
      </Panel>
    </div>
  );
}
