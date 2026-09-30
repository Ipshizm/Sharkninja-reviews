import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import seed from "../data/seed.json";
import { brandStats, portfolio } from "../lib/aggregate";
import { deriveTone } from "../lib/insights";
import { buildReport, reportFilename } from "../lib/report/data";
import type { Review } from "../lib/types";

/**
 * The report's numbers, from the real snapshot. The PDF layout itself is
 * checked by rendering it through the running app: react-pdf is ESM-only and
 * tsx's CommonJS loader cannot resolve it, so it is not imported here.
 */
const REVIEWS = seed.reviews as Review[];
const opts = { source: "Read-only Snapshot", generatedAt: new Date("2026-09-30T10:00:00Z") };

describe("insights report data", () => {
  const all = buildReport(REVIEWS, { kind: "portfolio" }, opts);

  it("ranks listings exactly as the dashboard's master table does", () => {
    assert.deepEqual(
      all.ranked.map((r) => r.sku.id),
      portfolio(REVIEWS).skus.map((r) => r.sku.id),
    );
  });

  it("lists only critical and action-needed listings as priorities, critical first", () => {
    assert.ok(all.priorities.length > 0);
    const tones = all.priorities.map((p) => p.tone);
    assert.ok(tones.every((t) => t === "critical" || t === "warning"));
    assert.deepEqual(tones, tones.slice().sort((a, b) => (a === b ? 0 : a === "critical" ? -1 : 1)));
    // ninja-double-stack was once hardcoded into the dashboard's alerts.
    assert.ok(!all.priorities.some((p) => p.sku.id === "ninja-double-stack"));
  });

  it("works each status out from today's reviews, as the dashboard does", () => {
    for (const r of all.ranked) {
      assert.equal(r.tone, deriveTone(REVIEWS.filter((x) => x.skuId === r.sku.id)), r.sku.id);
    }
  });

  it("totals every review once", () => {
    assert.equal(all.all.n, REVIEWS.length);
    assert.equal(all.brands.reduce((n, b) => n + b.all.n, 0), REVIEWS.length);
    assert.equal(all.ranked.reduce((n, r) => n + r.stats.all.n, 0), REVIEWS.length);
  });

  it("dates the analysis per listing, not by the insight file's stamp", () => {
    assert.ok(all.insightsWritten);
    const days = all.ranked.map((r) => r.insight!.generatedAt.slice(0, 10)).sort();
    assert.deepEqual(all.insightsWritten, { from: days[0], to: days.at(-1) });
  });

  it("a brand report holds that brand only, with the brand page's totals", () => {
    const shark = buildReport(REVIEWS, { kind: "brand", brand: "Shark" }, opts);
    assert.ok(shark.ranked.length > 0);
    assert.ok(shark.ranked.every((r) => r.sku.brand === "Shark"));
    assert.ok(shark.priorities.every((r) => r.sku.brand === "Shark"));
    const page = brandStats("Shark", REVIEWS);
    assert.equal(shark.all.n, page.all.n);
    assert.equal(shark.verified.avg, page.verified.avg);
  });

  it("a listing report holds that listing only", () => {
    const blast = buildReport(REVIEWS, { kind: "sku", skuId: "ninja-blast" }, opts);
    assert.deepEqual(blast.ranked.map((r) => r.sku.id), ["ninja-blast"]);
    assert.equal(blast.all.n, REVIEWS.filter((r) => r.skuId === "ninja-blast").length);
    assert.deepEqual(blast.brands, []);
  });

  it("names the file after its scope and the India date", () => {
    const late = new Date("2026-09-30T20:00:00Z"); // 1:30 am on the 1st in India
    assert.equal(reportFilename({ kind: "portfolio" }, late), "sharkninja-insights-2026-10-01.pdf");
    assert.equal(reportFilename({ kind: "brand", brand: "Ninja" }, late), "ninja-insights-2026-10-01.pdf");
    assert.equal(reportFilename({ kind: "sku", skuId: "shark-hydrovac" }, late), "shark-hydrovac-insights-2026-10-01.pdf");
  });
});
