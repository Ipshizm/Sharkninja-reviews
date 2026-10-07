import { test } from "node:test";
import assert from "node:assert/strict";
import seed from "../data/seed.json";
import { deriveTone, getAllInsights, getSkuInsight } from "../lib/insights";
import { skuDataHash } from "../lib/insights/hash";
import { SKUS } from "../lib/skus";
import type { Review } from "../lib/types";

test("insights system", async (t) => {
  const allReviews = seed.reviews as unknown as Review[];

  await t.test("skuDataHash produces stable fingerprints", () => {
    const mine = allReviews.filter((r) => r.skuId === "ninja-blast");
    const hash1 = skuDataHash(mine);
    const hash2 = skuDataHash([...mine].reverse()); // order insensitive because sorted internally
    assert.equal(hash1, hash2);
    assert.equal(hash1.length, 16);
    assert.match(hash1, /^[0-9a-f]{16}$/);

    // modifying reviews changes the hash
    const altered = [...mine.slice(0, -1)];
    assert.notEqual(skuDataHash(altered), hash1);
  });

  // A SKU registered before its first reviews are imported has nothing to
  // summarise yet; it gets an insight once `npm run insights:generate` runs.
  const withReviews = SKUS.filter((s) => allReviews.some((r) => r.skuId === s.id));

  await t.test("baked insights file exists and covers every SKU that has reviews", () => {
    const file = getAllInsights();
    assert.equal(file.insights.length, withReviews.length);
    assert.ok(file.model.length > 0);
    assert.ok(file.generatedAt.length > 0);

    const validTones = new Set(["critical", "warning", "watch", "healthy", "unknown"]);
    for (const sku of withReviews) {
      const insight = file.insights.find((i) => i.skuId === sku.id);
      assert.ok(insight, `Missing baked insight for SKU: ${sku.id}`);
      assert.ok(validTones.has(insight.tone), `Invalid tone: ${insight.tone} for ${sku.id}`);
      assert.ok(insight.headline.length > 10, `Headline too short for ${sku.id}`);
      assert.ok(Array.isArray(insight.body) && insight.body.length > 0);
      assert.ok(insight.soWhat.length > 0);
      assert.ok(insight.watch.length > 0);
      assert.ok(Array.isArray(insight.evidence) && insight.evidence.length > 0);
    }
  });

  await t.test("freshness check matches current seed reviews", () => {
    for (const sku of withReviews) {
      const mine = allReviews.filter((r) => r.skuId === sku.id);
      const { insight, isStale, currentHash } = getSkuInsight(sku.id, mine);
      assert.ok(insight);
      assert.equal(isStale, false, `Expected ${sku.id} to be fresh, got currentHash=${currentHash}, insightHash=${insight.dataHash}`);
    }
  });

  await t.test("freshness check flags stale when reviews change", () => {
    const mine = allReviews.filter((r) => r.skuId === "shark-flex-breeze");
    const fakeReview: Review = {
      ...mine[0],
      hash: "00000000000000000000000000000000",
      title: "Brand new review that shifts data",
    };
    const { isStale } = getSkuInsight("shark-flex-breeze", [...mine, fakeReview]);
    assert.equal(isStale, true);
  });

  await t.test("deriveTone enforces sub-4.00 rule and honest severity thresholds", () => {
    const makeReviews = (ratings: number[], verified = true): Review[] =>
      ratings.map((r, i) => ({
        hash: `hash-${i}`,
        skuId: "test-sku",
        reviewer: `Reviewer ${i}`,
        rating: r,
        title: "Test title",
        body: "Test review body content",
        reviewDate: "2026-09-01",
        verified,
        country: "India",
        variant: null,
        buckets: [],
      }));

    // Sub-4.00 rating must never be healthy
    const sub4Verified = makeReviews([3, 3, 3, 4, 4, 4, 4, 4, 4, 4]); // avg 3.7
    assert.notEqual(deriveTone(sub4Verified), "healthy");
    assert.equal(deriveTone(sub4Verified), "warning");

    const sub4Overall = [
      ...makeReviews([4, 4, 4, 4, 4, 4, 4, 4, 4, 4], true), // 10 x 4 = 4.0
      ...makeReviews([1, 1, 1], false), // drags overall to 3.3
    ];
    assert.notEqual(deriveTone(sub4Overall), "healthy");

    // Critical thresholds
    const criticalRating = makeReviews([2, 3, 3, 3, 3, 3, 3, 3, 3, 3]); // avg 2.9
    assert.equal(deriveTone(criticalRating), "critical");

    const highNegatives = makeReviews([5, 5, 5, 5, 5, 5, 1, 1, 1, 1]); // 40% neg
    assert.equal(deriveTone(highNegatives), "critical");

    // Low volume thresholds
    const lowVolume = makeReviews([5, 5, 5]);
    assert.equal(deriveTone(lowVolume), "unknown");

    const mediumVolume = makeReviews([5, 5, 5, 5, 5, 5]);
    assert.equal(deriveTone(mediumVolume), "watch");

    // Truly healthy
    const healthyReviews = makeReviews([5, 5, 5, 5, 5, 4, 4, 4, 4, 4, 5, 5]); // avg 4.5, 0% neg, n=12
    assert.equal(deriveTone(healthyReviews), "healthy");
  });

  await t.test("deriveTone exact boundary conditions", () => {
    const make = (ratings: number[], verified = true): Review[] =>
      ratings.map((r, i) => ({
        hash: `bound-hash-${i}`,
        skuId: "test-boundary",
        reviewer: `Reviewer ${i}`,
        rating: r,
        title: "Title",
        body: "Body",
        reviewDate: "2026-09-01",
        verified,
        country: "India",
        variant: null,
        buckets: [],
      }));

    // Exact volume boundaries
    assert.equal(deriveTone(make([5, 5, 5, 5])), "unknown"); // n = 4
    assert.equal(deriveTone(make([5, 5, 5, 5, 5])), "watch"); // n = 5
    assert.equal(deriveTone(make([5, 5, 5, 5, 5, 5, 5, 5, 5])), "watch"); // n = 9
    assert.equal(deriveTone(make([5, 5, 5, 5, 5, 5, 5, 5, 5, 5])), "healthy"); // n = 10

    // Exact rating thresholds (with n=10, 0% negatives)
    // Exactly 4.00 vs 3.90
    assert.equal(deriveTone(make([4, 4, 4, 4, 4, 4, 4, 4, 4, 4])), "healthy"); // avg 4.00
    assert.equal(deriveTone(make([3, 4, 4, 4, 4, 4, 4, 4, 4, 4])), "watch"); // avg 3.90

    // Exactly 3.80 vs 3.70
    assert.equal(deriveTone(make([3, 3, 4, 4, 4, 4, 4, 4, 4, 4])), "watch"); // avg 3.80
    assert.equal(deriveTone(make([3, 3, 3, 4, 4, 4, 4, 4, 4, 4])), "warning"); // avg 3.70

    // Exactly 3.40 vs 3.30
    assert.equal(deriveTone(make([3, 3, 3, 3, 3, 3, 4, 4, 4, 4])), "warning"); // avg 3.40
    assert.equal(deriveTone(make([3, 3, 3, 3, 3, 3, 3, 4, 4, 4])), "critical"); // avg 3.30

    // Exact negative percentage boundaries (using 100 reviews to test clean integer percentages)
    const makeWithNeg = (negCount: number): Review[] => [
      ...make(Array(negCount).fill(1)),
      ...make(Array(100 - negCount).fill(5)),
    ];

    assert.equal(deriveTone(makeWithNeg(11)), "healthy"); // 11% neg (< 12%)
    assert.equal(deriveTone(makeWithNeg(12)), "watch"); // 12% neg (>= 12%)
    assert.equal(deriveTone(makeWithNeg(20)), "warning"); // 20% neg (>= 20%)
    assert.equal(deriveTone(makeWithNeg(35)), "critical"); // 35% neg (>= 35%)
  });
});
