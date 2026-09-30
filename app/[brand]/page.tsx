import Link from "next/link";
import { notFound } from "next/navigation";
import {
  brandStats,
  bucketTable,
  cloudFor,
  reviewsForSku,
  themesFor,
} from "@/lib/aggregate";
import { loadReviews } from "@/lib/data";
import { BRANDS, skuById } from "@/lib/skus";
import type { Brand } from "@/lib/types";
import { getAllInsights, getSkuInsight } from "@/lib/insights";
import { ExecutiveBriefing } from "@/components/ExecutiveBriefing";
import { ExportLinks } from "@/components/ExportLinks";
import {
  NotEnough,
  Panel,
  RatingComparison,
  SentimentBar,
  Stars,
} from "@/components/Stat";
import { BucketBars, ThemeList } from "@/components/Insights";
import { WordCloudView } from "@/components/WordCloudView";

export const dynamic = "force-dynamic";

function resolveBrand(slug: string): Brand | null {
  return BRANDS.find((b) => b.toLowerCase() === slug.toLowerCase()) ?? null;
}

export default async function BrandPage({
  params,
}: {
  params: Promise<{ brand: string }>;
}) {
  const { brand: slug } = await params;
  const brand = resolveBrand(slug);
  if (!brand) notFound();

  const reviews = await loadReviews();
  const stats = brandStats(brand, reviews);
  const positiveCloud = cloudFor(stats.reviews, "positive", brand);
  const negativeCloud = cloudFor(stats.reviews, "negative", brand);
  const positiveThemes = themesFor(stats.reviews, "positive", brand, 3);
  const negativeThemes = themesFor(stats.reviews, "negative", brand, 3);
  const buckets = bucketTable(stats.reviews);

  const rawInsights = getAllInsights();
  const brandInsights = rawInsights.insights
    .filter((ins) => {
      const sku = skuById(ins.skuId);
      return sku && sku.brand.toLowerCase() === brand.toLowerCase();
    })
    .map((ins) => {
      const sku = skuById(ins.skuId);
      const skuReviews = reviewsForSku(reviews, ins.skuId);
      const { isStale, insight } = getSkuInsight(ins.skuId, skuReviews);
      return {
        ...(insight ?? ins),
        skuName: sku ? sku.name : ins.skuId,
        brand: sku ? sku.brand : brand,
        isStale,
      };
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/" className="text-[13px] text-ink-60 hover:text-ink">
            ← All brands
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{brand}</h1>
          <p className="text-[13px] text-ink-60">
            {stats.all.n} reviews across {stats.skus.length} SKUs
          </p>
        </div>
        <ExportLinks
          filter={{ brand }}
          count={stats.all.n}
          label={`Export ${brand} reviews`}
        />
      </div>

      <RatingComparison verified={stats.verified} all={stats.all} />

      <div className="grid gap-5 sm:grid-cols-2">
        <Highlight
          kind="top"
          label="Top performer"
          stats={stats.topPerformer}
          brand={brand}
          note={`Ranked on verified average across the ${stats.rankedFrom} SKUs with enough verified reviews to rank.`}
        />
        <Highlight
          kind="attention"
          label="Needs attention"
          stats={stats.needsAttention}
          brand={brand}
          note={`Ranked on verified average across the ${stats.rankedFrom} SKUs with enough verified reviews to rank.`}
        />
      </div>

      <ExecutiveBriefing
        insights={brandInsights}
        model={rawInsights.model}
        generatedAt={rawInsights.generatedAt}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="What praise sounds like"
          subtitle={`Language from 4–5★ reviews${positiveCloud.ok ? ` · ${positiveCloud.n} reviews` : ""}`}
        >
          {positiveCloud.ok ? (
            <WordCloudView words={positiveCloud.words} tone="positive" />
          ) : (
            <NotEnough reason={positiveCloud.reason} />
          )}
          <ThemeList themes={positiveThemes} tone="positive" />
        </Panel>

        <Panel
          title="What complaints sound like"
          subtitle={`Language from 1–2★ reviews${negativeCloud.ok ? ` · ${negativeCloud.n} reviews` : ""}`}
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
        subtitle={`${buckets.negatives} negative reviews across ${brand}. A review can sit in more than one area.`}
      >
        <BucketBars rows={buckets.rows} total={buckets.negatives} />
      </Panel>

      <Panel title="Every SKU" subtitle="Click through for the detail view">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-60">
                <th className="pb-2 font-semibold">SKU</th>
                <th className="pb-2 text-right font-semibold">Reviews</th>
                <th className="pb-2 text-right font-semibold">Verified avg</th>
                <th className="pb-2 text-right font-semibold">% negative</th>
                <th className="pb-2 pl-4 font-semibold">Split</th>
              </tr>
            </thead>
            <tbody>
              {stats.skus.map((s) => (
                <tr
                  key={s.sku.id}
                  className="border-b border-line-soft last:border-0 hover:bg-canvas"
                >
                  <td className="py-2.5">
                    <Link
                      href={`/${brand.toLowerCase()}/${s.sku.id}`}
                      className="font-semibold hover:text-teal"
                    >
                      {s.sku.name}
                    </Link>
                    {s.insufficient ? (
                      <span className="ml-2 align-middle text-[11px] font-semibold text-warn">
                        low n
                      </span>
                    ) : null}
                  </td>
                  <td className="tabular py-2.5 text-right">{s.all.n}</td>
                  <td className="tabular py-2.5 text-right">
                    <Stars value={s.verified.avg} />
                  </td>
                  <td className="tabular py-2.5 text-right">
                    {s.all.n === 0 ? "—" : `${s.all.pctNegative.toFixed(0)}%`}
                  </td>
                  <td className="w-40 py-2.5 pl-4">
                    <SentimentBar s={s.all} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function Highlight({
  kind,
  label,
  stats,
  brand,
  note,
}: {
  kind: "top" | "attention";
  label: string;
  stats: ReturnType<typeof brandStats>["topPerformer"];
  brand: Brand;
  note: string;
}) {
  const accent = kind === "top" ? "border-teal bg-teal-tint" : "border-[#c8322b] bg-[#fdefee]";
  if (!stats) {
    return (
      <div className={`rounded-lg border p-5 ${accent}`}>
        <span className="text-[11px] font-bold uppercase tracking-wide">{label}</span>
        <p className="mt-2 text-[13px] text-ink-60">
          No SKU has enough verified reviews to rank yet.
        </p>
      </div>
    );
  }
  return (
    <Link
      href={`/${brand.toLowerCase()}/${stats.sku.id}`}
      className={`block rounded-lg border p-5 transition hover:shadow-sm ${accent}`}
    >
      <span className="text-[11px] font-bold uppercase tracking-wide">{label}</span>
      <h3 className="mt-1.5 text-lg font-bold tracking-tight">{stats.sku.name}</h3>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl">
          <Stars value={stats.verified.avg} />
        </span>
        <span className="text-[12px] text-ink-60">
          {stats.verified.n} verified · {stats.verified.pctNegative.toFixed(0)}% negative
        </span>
      </div>
      <p className="mt-3 text-[11px] leading-snug text-ink-60">{note}</p>
    </Link>
  );
}
