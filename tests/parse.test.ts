import { strict as assert } from "node:assert";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { classify, classifyReview } from "../lib/classify";
import { reviewHash } from "../lib/hash";
import { parseSheet, parseReviewDate } from "../lib/parse/records";
import { parseWorkbook } from "../lib/parse/workbook";
import { skuForSheet } from "../lib/skus";
import { validate } from "../lib/validate";
import { cloudFor, summarise, trend } from "../lib/aggregate";
import type { Review } from "../lib/types";

const NBSP = " ";

/**
 * Every fixture below is copied verbatim out of the September 2026 export.
 * Fixtures written in my own English would only prove the parser agrees with
 * the sentences I invented for it.
 */

// Ninja "6.2 Air fryer", rows 576-595: a multi-row body, a media row mid-record,
// helpfulness chrome, and a following record whose reviewer name is missing.
const AIR_FRYER_576 = [
  `1.0 out of 5 stars${NBSP}Damaged on Arrival & No Response`,
  "Reviewed in India on 10 August 2026",
  "Colour: BLACKVerified Purchase",
  "Click to play video",
  "This experience has been terrible. My Ninja Max Pro Air Fryer arrived with a broken basket (left side from the front), straight out of the box.",
  "I've been trying to get in touch with Ninja support, and it completely sucks. No replies, no resolution, no customer care whatsoever.",
  "I'm honestly fed up. I bought Ninja because of its reputation, but the product quality and after-sales service have been a huge disappointment.",
  "Customer imageCustomer imageCustomer image",
  "7 people found this helpful",
  "Helpful",
  "Report",
  "Product delivered on time. Product delivered in good condition with bubble wrap.",
  `1.0 out of 5 stars${NBSP}Worst product and no use`,
  "Reviewed in India on 10 August 2026",
  "Colour: BLACKVerified Purchase",
  "i am very disappointed with this air fryer. The inner plate had scratches and looked like used one.",
  "7 people found this helpful",
  "Helpful",
];

// Ninja "Combi", rows 1-15.
const COMBI_HEAD = [
  "From India",
  "Surendhran S",
  `1.0 out of 5 stars${NBSP}Lack of Onsite Assistance and No Visible Serial Number in the carton box`,
  "Reviewed in India on 14 July 2026",
  "Colour: Sea Salt GreyVerified Purchase",
  "I purchased this air fryer during an Amazon Prime sale—it's my first air fryer, so I wanted an onsite demo. I reached out to Ninja customer care, but they continued to tell me that only virtual demos are offered in my city.",
  "Helpful",
  "Report",
  "NGULJATHONG CHONGLOI",
  `5.0 out of 5 stars${NBSP}Paisa vasool`,
  "Reviewed in India on 13 July 2026",
  "Colour: Sea Salt GreyVerified Purchase",
  "Excellent. I like it very much. It's little costly though",
  "Helpful",
  "Report",
];

describe("record grammar", () => {
  it("joins a body that spans several rows and drops media/helpfulness chrome", () => {
    const [first] = parseSheet("ninja-air-fryer-6-2l", AIR_FRYER_576);
    assert.equal(first.rating, 1);
    assert.equal(first.title, "Damaged on Arrival & No Response");
    assert.ok(first.body.includes("broken basket"));
    assert.ok(first.body.includes("after-sales service"), "third body row kept");
    assert.ok(!first.body.includes("Click to play video"));
    assert.ok(!first.body.includes("found this helpful"));
  });

  it("does not swallow the next record's reviewer line into this body", () => {
    const [first, second] = parseSheet("ninja-air-fryer-6-2l", AIR_FRYER_576);
    assert.ok(!first.body.includes("bubble wrap"));
    assert.equal(
      second.reviewer,
      "Product delivered on time. Product delivered in good condition with bubble wrap.",
    );
  });

  it("reads the NBSP between the star rating and the title", () => {
    const [, second] = parseSheet("ninja-air-fryer-6-2l", AIR_FRYER_576);
    assert.equal(second.title, "Worst product and no use");
  });

  it("splits verified purchase off the variant string", () => {
    const [first] = parseSheet("ninja-combi", COMBI_HEAD);
    assert.equal(first.verified, true);
    assert.equal(first.variant, "Colour: Sea Salt Grey");
    assert.equal(first.reviewer, "Surendhran S");
  });

  it("skips the 'From India' header without treating it as a reviewer", () => {
    const reviews = parseSheet("ninja-combi", COMBI_HEAD);
    assert.equal(reviews.length, 2);
    assert.equal(reviews[1].reviewer, "NGULJATHONG CHONGLOI");
  });

  it("normalises Amazon's date format", () => {
    assert.equal(parseReviewDate("14 July 2026"), "2026-07-14");
    assert.equal(parseReviewDate("3 March 2025"), "2025-03-03");
    assert.equal(parseReviewDate("not a date"), null);
  });

  it("keeps an unverified review, and records its country", () => {
    const rows = [
      "Some Reviewer",
      `3.0 out of 5 stars${NBSP}It was fine`,
      "Reviewed in the United Kingdom on 2 February 2026",
      "It was fine, nothing special.",
    ];
    const [r] = parseSheet("ninja-blast", rows);
    assert.equal(r.verified, false);
    assert.equal(r.country, "the United Kingdom");
  });

  it("keeps a title-only review (they exist and carry the signal)", () => {
    const rows = [
      "Ramya V.",
      `1.0 out of 5 stars${NBSP}Damaged piece delivered`,
      "Reviewed in India on 7 May 2026",
      "Colour: Sea Salt GreyVerified Purchase",
      "Customer imageCustomer image",
      "Helpful",
    ];
    const [r] = parseSheet("ninja-combi", rows);
    assert.equal(r.body, "");
    assert.equal(r.title, "Damaged piece delivered");
    assert.deepEqual(classifyReview(r), ["Delivery / DOA"]);
  });
});

describe("sheet mapping", () => {
  it("resolves tab names that do not match product names", () => {
    assert.equal(skuForSheet("6.2 Air fryer")?.id, "ninja-air-fryer-6-2l");
    assert.equal(skuForSheet("Clean and Detect VC")?.id, "shark-detect-clean-and-empty");
    assert.equal(skuForSheet("PetPro Vacuume Cleaner")?.id, "shark-power-pro-pet");
  });

  it("returns nothing for a tab it has never seen", () => {
    assert.equal(skuForSheet("Ninja Speediboi 9000"), undefined);
    // Crispi, however the tab is written; ambiguous names resolve to nothing.
    assert.equal(skuForSheet("Crispi")?.id, "ninja-crispi");
    assert.equal(skuForSheet("Ninja CRISPi")?.id, "ninja-crispi");
    assert.equal(skuForSheet("crispi glass")?.id, "ninja-crispi");
    assert.equal(skuForSheet("Power-Detect")?.id, "shark-powerdetect");
    assert.equal(skuForSheet("Detect"), undefined);
  });
});

describe("identity", () => {
  it("gives the same hash to the same review twice", () => {
    const [a] = parseSheet("ninja-combi", COMBI_HEAD);
    const [b] = parseSheet("ninja-combi", COMBI_HEAD);
    assert.equal(reviewHash(a), reviewHash(b));
  });

  it("separates two reviews that differ only by reviewer", () => {
    const [a] = parseSheet("ninja-combi", COMBI_HEAD);
    assert.notEqual(reviewHash(a), reviewHash({ ...a, reviewer: "Someone Else" }));
  });
});

describe("classifier", () => {
  it("puts one review in several buckets when it names several problems", () => {
    const buckets = classify({
      rating: 1,
      title: "Damaged on Arrival & No Response",
      body: "arrived with a broken basket straight out of the box. I've been trying to get in touch with Ninja support, no replies, no customer care.",
    });
    assert.ok(buckets.includes("Delivery / DOA"));
    assert.ok(buckets.includes("Customer Service"));
  });

  it("catches the demo and installation complaints", () => {
    const buckets = classify({
      rating: 1,
      title: "Lack of Onsite Assistance",
      body: "When I asked for an onsite demonstration, the Ninja team told me that only virtual demos are available here.",
    });
    assert.ok(buckets.includes("Installation / Demo"));
  });

  it("does not bucket positive reviews", () => {
    assert.deepEqual(
      classifyReview({
        skuId: "ninja-combi", reviewer: "x", rating: 5, title: "Great",
        body: "no customer service problems at all", reviewDate: "2026-01-01",
        verified: true, country: "India", variant: null,
      }),
      [],
    );
  });
});

describe("honest-data gates", () => {
  const make = (n: number, rating: number): Review[] =>
    Array.from({ length: n }, (_, i) => ({
      skuId: "shark-hydrovac", reviewer: `r${i}`, rating, title: `t${i}`,
      body: "the battery stopped working after a week and support never replied",
      reviewDate: `2026-0${(i % 9) + 1}-01`, verified: true, country: "India",
      variant: null, hash: `h${i}`, buckets: [],
    }));

  it("refuses a word cloud built from too few reviews", () => {
    const result = cloudFor(make(3, 1), "negative");
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.reason, /not enough/i);
  });

  it("draws one once there is enough", () => {
    assert.equal(cloudFor(make(20, 1), "negative").ok, true);
  });

  it("refuses a trend line without enough months", () => {
    const result = trend(make(20, 5).map((r) => ({ ...r, reviewDate: "2026-01-01" })));
    assert.equal(result.ok, false);
  });

  it("counts sentiment on the brief's buckets", () => {
    const s = summarise([...make(4, 5), ...make(2, 3), ...make(4, 1)]);
    assert.equal(s.positive, 4);
    assert.equal(s.neutral, 2);
    assert.equal(s.negative, 4);
  });
});

describe("paste validation", () => {
  it("flags a sentence sitting where a reviewer name belongs", () => {
    const [, second] = parseSheet("ninja-air-fryer-6-2l", AIR_FRYER_576);
    const warnings = validate([second], 0);
    assert.equal(warnings[0].kind, "suspicious-reviewer");
  });

  it("leaves real names with initials alone", () => {
    const [first] = parseSheet("ninja-combi", COMBI_HEAD);
    for (const name of ["K. Agarwal", "Dr T.N. Manohara", "Surendhran S"]) {
      assert.equal(validate([{ ...first, reviewer: name }], 0).length, 0, name);
    }
  });
});

/**
 * The real files, when they are on this machine. Numbers here are the counts
 * verified by hand against the workbooks.
 */
const NINJA = `${process.env.HOME}/Downloads/SharkNinjaBrief/Ninja Amazon Reviews - 1st Sept.xlsx`;
const SHARK = `${process.env.HOME}/Downloads/SharkNinjaBrief/Shark Amazon Reviews-1st Sept.xlsx`;

describe("the September 2026 export", { skip: !existsSync(NINJA) }, () => {
  it("parses every review in both workbooks with nothing unmapped", () => {
    const ninja = parseWorkbook(readFileSync(NINJA));
    const shark = parseWorkbook(readFileSync(SHARK));
    assert.deepEqual(ninja.unmappedSheets, []);
    assert.deepEqual(shark.unmappedSheets, []);
    assert.equal(ninja.reviews.length, 226);
    assert.equal(shark.reviews.length, 113);
  });

  it("gives every review a date, a reviewer and a rating", () => {
    const all = [NINJA, SHARK].flatMap((f) => parseWorkbook(readFileSync(f)).reviews);
    assert.equal(all.length, 339);
    for (const r of all) {
      assert.match(r.reviewDate, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(r.reviewer.length > 0);
      assert.ok(r.rating >= 1 && r.rating <= 5);
    }
  });

  it("matches the per-SKU counts", () => {
    const all = [NINJA, SHARK].flatMap((f) => parseWorkbook(readFileSync(f)).reviews);
    const expected: Record<string, [number, number, number]> = {
      // sku: [reviews, verified, negative]
      "ninja-air-fryer-6-2l": [83, 81, 21],
      "ninja-combi": [72, 65, 17],
      "ninja-blast": [59, 57, 25],
      "shark-air-purifier": [47, 34, 17],
      "shark-flex-breeze": [35, 34, 17],
      "shark-steam-and-scrub": [21, 21, 6],
      "ninja-dual-zone": [8, 7, 2],
      "ninja-double-stack": [4, 1, 3],
      "shark-detect-clean-and-empty": [3, 3, 1],
      "shark-power-pro-pet": [3, 3, 2],
      "shark-powerdetect": [3, 3, 1],
      "shark-hydrovac": [1, 1, 0],
    };
    for (const [skuId, [n, verified, negative]] of Object.entries(expected)) {
      const mine = all.filter((r) => r.skuId === skuId);
      assert.equal(mine.length, n, `${skuId} count`);
      assert.equal(mine.filter((r) => r.verified).length, verified, `${skuId} verified`);
      assert.equal(mine.filter((r) => r.rating <= 2).length, negative, `${skuId} negative`);
    }
  });

  it("classifies all but one of the 112 negatives", () => {
    const all = [NINJA, SHARK].flatMap((f) => parseWorkbook(readFileSync(f)).reviews);
    const negatives = all.filter((r) => r.rating <= 2);
    assert.equal(negatives.length, 112);
    const unclassified = negatives.filter((r) => classifyReview(r).length === 0);
    assert.equal(unclassified.length, 1, "only 'Ok. Average' names no cause");
  });

  it("finds the three blocks pasted twice inside the Shark workbook", () => {
    const shark = parseWorkbook(readFileSync(SHARK)).reviews;
    const hashes = shark.map(reviewHash);
    assert.equal(hashes.length - new Set(hashes).size, 3);
  });
});
