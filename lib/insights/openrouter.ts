import type { Sku } from "@/lib/skus";
import type { Review } from "@/lib/types";
import type { BucketRow, BucketTable, DirectionResult, SkuStats, TrendResult } from "@/lib/aggregate";
import type { Theme } from "@/lib/text";
import type { SkuInsight } from "./types";
import { skuDataHash } from "./hash";

export const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-3.5-sonnet";

export type GenerateInsightInput = {
  sku: Sku;
  reviews: Review[];
  stats: SkuStats;
  buckets: BucketTable;
  trendResult: TrendResult;
  directionResult: DirectionResult;
  negThemes: Theme[];
  posThemes: Theme[];
};

/**
 * Builds the prompt payload for the OpenRouter expert analyst.
 */
function buildPrompt(input: GenerateInsightInput): string {
  const {
    sku,
    reviews,
    stats,
    buckets,
    trendResult,
    directionResult,
    negThemes,
    posThemes,
  } = input;

  const negativeSample = reviews
    .filter((r) => r.rating <= 2)
    .slice(0, 10)
    .map((r) => `- [${r.rating}★, ${r.reviewDate}, verified=${r.verified}] "${r.title}": ${r.body.slice(0, 200)}`)
    .join("\n");

  const positiveSample = reviews
    .filter((r) => r.rating >= 4)
    .slice(0, 6)
    .map((r) => `- [${r.rating}★, ${r.reviewDate}, verified=${r.verified}] "${r.title}": ${r.body.slice(0, 180)}`)
    .join("\n");

  const trendText = trendResult.ok
    ? trendResult.points.map((p) => `${p.label}: avg ${p.avg.toFixed(2)} (n=${p.n})`).join(", ")
    : `No trend line: ${trendResult.reason}`;

  const bucketSummary = buckets.rows
    .filter((r: BucketRow) => r.count > 0)
    .map((r: BucketRow) => `${r.bucket}: ${r.count} reviews (${r.pct.toFixed(0)}%)`)
    .join(", ");

  return `
Product: ${sku.brand} ${sku.name} (${sku.id}${sku.asin ? `, ASIN: ${sku.asin}` : ""}${sku.model ? `, Model: ${sku.model}` : ""})
Total Reviews: ${reviews.length} (Verified: ${stats.verified.n}, Unverified: ${reviews.length - stats.verified.n})
Rating: Verified Average ${stats.verified.avg !== null ? stats.verified.avg.toFixed(2) : "N/A"}★ | All Reviews Average ${stats.all.avg !== null ? stats.all.avg.toFixed(2) : "N/A"}★
Sentiment Breakdown: ${stats.all.pctPositive.toFixed(0)}% positive, ${stats.all.pctNeutral.toFixed(0)}% neutral, ${stats.all.pctNegative.toFixed(0)}% negative
Trend Direction: ${directionResult.dir} (Delta: ${directionResult.delta !== null ? directionResult.delta.toFixed(2) : "N/A"})
Monthly Trend: ${trendText}
Low Data Flag (Insufficient): ${stats.insufficient} (Threshold: 10 verified reviews)

Problem Areas Breakdown (Negative Reviews: ${buckets.negatives}):
${bucketSummary || "None"}

Repeating Complaint Themes:
${negThemes.map((t) => `- "${t.phrase}" (${t.reviews} reviews)`).join("\n") || "None"}

Repeating Praise Themes:
${posThemes.map((t) => `- "${t.phrase}" (${t.reviews} reviews)`).join("\n") || "None"}

Sample Negative Reviews (up to 10):
${negativeSample || "No negative reviews"}

Sample Positive Reviews (up to 6):
${positiveSample || "No positive reviews"}
`.trim();
}

const SYSTEM_PROMPT = `
You are a Senior Commercial Intelligence and Product Quality Director advising the executive leadership of SharkNinja India.
Your mission is to synthesize customer reviews on Amazon.in into an incisive, executive-ready insight card.

Rules:
1. Tone must be one of:
   - "critical": Severe product flaws, collapsing ratings, deceptive claims, or unviable returns endangering brand equity.
   - "warning": Notable friction in product quality, unfulfilled feature claims, or service gaps that require active remediation.
   - "watch": Rating is holding or mixed, but specific vulnerability (e.g. localized floor suitability, noisy fans, small sample size volatility) must be monitored.
   - "healthy": Consistent praise, reliable customer satisfaction, low complaint volume. ANY SKU with average rating below 4.00 (verified or overall) or negative review rate >= 12% MUST NEVER be classified as healthy.
   - "unknown": Too few verified reviews (<5) to draw any credible conclusion without speculation.
2. Voice and Style:
   - Concise, disciplined, and commercially grounded.
   - Confident and measured, never alarmist. Prefer plain, precise words ("fell", "declined", "weakens") over dramatic ones ("crashed", "collapsed", "cripple", "disaster"). Let the numbers carry the weight.
   - AVOID EM DASHES. Use colons, parentheses, or periods instead.
   - Do NOT merely describe what is on the charts ("the rating went from X to Y"). State the root causes, consumer perceptions in the Indian market, and operational realities.
   - Ground every claim in the provided review evidence.
3. Output format must be strictly JSON with this structure:
{
  "skuId": string,
  "tone": "critical" | "warning" | "watch" | "healthy" | "unknown",
  "headline": "One direct sentence stating the executive finding.",
  "body": [
    "First paragraph: core finding and consumer experience reality.",
    "Second paragraph: root cause breakdown (hardware, expectation mismatch, demo/service friction, localization issues)."
  ],
  "soWhat": "Commercial consequence for SharkNinja India (margin impact, marketplace rank risk, returns, retail reputation).",
  "watch": "Specific operational or metric indicator to track next (e.g. return rates, motor failure spikes, demo turnaround).",
  "evidence": [
    "3 to 5 precise numerical or factual points from the data (e.g. '71% of negatives cite product defects', 'Verified rating dropped from 3.82 to 1.00')."
  ]
}
`.trim();

/**
 * Calls OpenRouter to generate an insight for a SKU.
 */
export async function generateSkuInsightWithOpenRouter(
  input: GenerateInsightInput,
  options: {
    apiKey?: string;
    model?: string;
  } = {},
): Promise<SkuInsight> {
  const apiKey = options.apiKey || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Set OPENROUTER_API_KEY in environment or .env.local to generate insights.",
    );
  }

  const model = options.model || process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL;
  const userPrompt = buildPrompt(input);

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://sharkninja.in",
      "X-Title": "SharkNinja India Review Insights",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Analyze this SKU and return only the JSON insight object:\n\n${userPrompt}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`OpenRouter API error (${res.status}): ${errorText}`);
  }

  const data = await res.json();
  const rawContent = data.choices?.[0]?.message?.content;
  if (!rawContent) {
    throw new Error("OpenRouter returned empty completion");
  }

  const parsed = JSON.parse(rawContent);
  const dataHash = skuDataHash(input.reviews);

  return {
    skuId: input.sku.id,
    tone: parsed.tone,
    headline: parsed.headline,
    body: Array.isArray(parsed.body) ? parsed.body : [parsed.body],
    soWhat: parsed.soWhat,
    watch: parsed.watch,
    evidence: Array.isArray(parsed.evidence) ? parsed.evidence : [parsed.evidence],
    dataHash,
    generatedAt: new Date().toISOString(),
    model: data.model || model,
  };
}
