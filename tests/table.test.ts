import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import * as XLSX from "xlsx";
import { reviewHash } from "../lib/hash";
import { parseWorkbook } from "../lib/parse/workbook";
import { UnmappedSheetsError, ingestBuffer } from "../lib/ingest";
import { parseDateCell, parseRating, parseVerified } from "../lib/parse/table";
import { templateCsv, templateWorkbook, TEMPLATE_COLUMNS } from "../lib/template";
import seed from "../data/seed.json";
import type { Review } from "../lib/types";

const REAL: Review[] = (seed as { reviews: Review[] }).reviews;

/**
 * The rows below are the real September export, read back out of the snapshot
 * and written into the model template. Round-tripping the actual data is the
 * only version of this test worth having: a CSV I typed myself would only prove
 * the parser agrees with the CSV I typed.
 */
function toCsv(rows: Review[]): string {
  const header = ["Product", "Rating", "Title", "Review", "Date", "Reviewer", "Verified purchase", "Variant", "Country"];
  const NAMES: Record<string, string> = Object.fromEntries(
    // Round-trip through the id, which the template accepts alongside the name.
    rows.map((r) => [r.skuId, r.skuId]),
  );
  const aoa = [
    header,
    ...rows.map((r) => [
      NAMES[r.skuId],
      String(r.rating),
      r.title,
      r.body,
      r.reviewDate,
      r.reviewer,
      r.verified ? "Yes" : "No",
      r.variant ?? "",
      r.country,
    ]),
  ];
  return XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(aoa));
}

describe("csv import", () => {
  it("reads a CSV at all", () => {
    // The bug this file exists for: a CSV arrives as a single sheet named
    // "Sheet1", which the index-sheet skip threw away before anything looked
    // at its headers. Zero reviews, zero errors, zero warnings.
    const csv = toCsv(REAL.slice(0, 5));
    const out = parseWorkbook(Buffer.from(csv, "utf8"));
    assert.equal(out.reviews.length, 5);
    assert.deepEqual(out.unmappedSheets, []);
    assert.deepEqual(out.skippedRows, []);
  });

  it("round-trips the whole September export without changing a single review", () => {
    const named = REAL.filter((r) => r.reviewer.trim() !== "");
    const out = parseWorkbook(Buffer.from(toCsv(named), "utf8"));

    assert.equal(out.reviews.length, named.length);
    assert.deepEqual(out.skippedRows, []);

    const before = new Set(named.map((r) => r.hash));
    const after = new Set(out.reviews.map((r) => reviewHash(r)));
    assert.deepEqual([...after].filter((h) => !before.has(h)), []);
    assert.equal(after.size, before.size);
  });

  it("keeps the verified flag, which the headline averages depend on", () => {
    const sample = REAL.filter((r) => r.reviewer.trim() !== "").slice(0, 60);
    const out = parseWorkbook(Buffer.from(toCsv(sample), "utf8"));
    const byHash = new Map(out.reviews.map((r) => [reviewHash(r), r]));
    for (const r of sample) {
      assert.equal(byHash.get(r.hash)?.verified, r.verified, r.title);
    }
  });
});

describe("text encoding", () => {
  /**
   * Real Amazon.in reviews are full of curly apostrophes and emoji. Handed an
   * undeclared byte buffer, SheetJS decodes CSV as Windows-1252 and turns
   * "don\u2019t" into "donat", quietly, with the import still reporting success.
   */
  const withPunctuation = REAL.filter((r) => /[\u2018\u2019\u201c\u201d\u2026]|\p{Extended_Pictographic}/u.test(r.body));

  it("has real reviews to test against", () => {
    assert.ok(withPunctuation.length > 20, `only ${withPunctuation.length} found`);
  });

  it("reads a UTF-8 CSV without mangling apostrophes and emoji", () => {
    const out = parseWorkbook(Buffer.from(toCsv(withPunctuation), "utf8"));
    const bodies = new Set(out.reviews.map((r) => r.body));
    for (const r of withPunctuation) assert.ok(bodies.has(r.body), r.title);
    assert.ok(!out.reviews.some((r) => /\u00c3|\u00e2\u0080/.test(r.body)), "mojibake in the output");
  });

  it("reads a UTF-8 CSV that Excel saved with a byte order mark", () => {
    const csv = toCsv(withPunctuation.slice(0, 10));
    const out = parseWorkbook(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(csv, "utf8")]));
    assert.equal(out.reviews.length, 10);
    assert.equal(out.reviews[0].body, withPunctuation[0].body);
  });

  it("reads the UTF-16 CSV that Excel for Mac writes", () => {
    const csv = toCsv(withPunctuation.slice(0, 10));
    const out = parseWorkbook(
      Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(csv, "utf16le")]),
    );
    assert.equal(out.reviews.length, 10);
    assert.equal(out.reviews[0].body, withPunctuation[0].body);
  });
});

describe("the model template", () => {
  it("hands out a workbook that this app can read back", () => {
    const out = parseWorkbook(templateWorkbook());
    // The two example rows, and neither the Products sheet nor the guide
    // mistaken for reviews.
    assert.equal(out.reviews.length, 2);
    assert.deepEqual(out.unmappedSheets, []);
    assert.deepEqual(out.skippedRows, []);
    assert.deepEqual(
      out.reviews.map((r) => r.skuId).sort(),
      ["ninja-air-fryer-6-2l", "shark-steam-and-scrub"].sort(),
    );
  });

  it("hands out a CSV that this app can read back", () => {
    const out = parseWorkbook(Buffer.from(templateCsv(), "utf8"));
    assert.equal(out.reviews.length, 2);
  });

  it("hands out a clean blank template with headers only", () => {
    const csv = templateCsv({ blank: true });
    const outCsv = parseWorkbook(Buffer.from(csv, "utf8"));
    assert.equal(outCsv.reviews.length, 0);

    const wb = templateWorkbook({ blank: true });
    const outWb = parseWorkbook(wb);
    assert.equal(outWb.reviews.length, 0);
  });

  it("documents every column it accepts", () => {
    for (const c of TEMPLATE_COLUMNS) {
      assert.ok(c.note.length > 20, `${c.label} has no explanation`);
    }
  });
});

describe("headers as people actually write them", () => {
  const body = (headers: string) =>
    parseWorkbook(
      Buffer.from(
        `${headers}\nNinja Blast,5,Loved it,Great blender,2026-07-14,Surendhran S,Yes\n`,
        "utf8",
      ),
    );

  it("accepts the Apify export's column names", () => {
    const out = body("productName,stars,reviewTitle,reviewDescription,date,userName,isVerified");
    // reviewDescription is not an alias; the title alone is enough to keep it.
    assert.equal(out.reviews.length, 1);
    assert.equal(out.reviews[0].rating, 5);
  });

  it("ignores case, spaces and punctuation in headers", () => {
    const out = body("PRODUCT , Star Rating ,Review Title,Review Text,Review Date,Customer,Verified Purchase");
    assert.equal(out.reviews.length, 1);
    assert.equal(out.reviews[0].reviewer, "Surendhran S");
    assert.equal(out.reviews[0].verified, true);
  });

  it("finds a header row sitting under a title row", () => {
    const out = parseWorkbook(
      Buffer.from(
        "SharkNinja India review export\n\nProduct,Rating,Title,Review,Date\nNinja Blast,4,Fine,Works well,2026-07-14\n",
        "utf8",
      ),
    );
    assert.equal(out.reviews.length, 1);
  });
});

describe("cell readers", () => {
  it("reads ratings however they are written", () => {
    assert.equal(parseRating(4), 4);
    assert.equal(parseRating("4"), 4);
    assert.equal(parseRating("4.0"), 4);
    assert.equal(parseRating("1.0 out of 5 stars"), 1);
    assert.equal(parseRating("5 stars"), 5);
    assert.equal(parseRating("★★★★"), 4);
    assert.equal(parseRating("4/5"), 4);
    assert.equal(parseRating(""), null);
    assert.equal(parseRating("9"), null);
    assert.equal(parseRating("not a rating"), null);
  });

  it("does not dig a rating out of free text", () => {
    // A mismapped column used to yield the 2 from "2026" as a two-star review,
    // which is worse than refusing the row: it is a wrong number, silently.
    assert.equal(parseRating("Reviewed 2026"), null);
    assert.equal(parseRating("2026-08-10"), null);
    assert.equal(parseRating("Rated 4 out of 5 stars"), 4);
  });

  it("reads dates however they are written", () => {
    assert.equal(parseDateCell("2026-08-10"), "2026-08-10");
    assert.equal(parseDateCell("10 August 2026"), "2026-08-10");
    assert.equal(parseDateCell("10 Aug 2026"), "2026-08-10");
    assert.equal(parseDateCell("August 10, 2026"), "2026-08-10");
    assert.equal(parseDateCell("Reviewed in India on 10 August 2026"), "2026-08-10");
    assert.equal(parseDateCell(new Date(2026, 7, 10)), "2026-08-10");
    assert.equal(parseDateCell(""), null);
    assert.equal(parseDateCell("last Tuesday"), null);
  });

  it("keeps a slash date day-first through a whole CSV import", () => {
    // The unit test below passed while this did not: SheetJS parses a CSV date
    // cell itself, month-first, before the reader above ever sees the string.
    const out = parseWorkbook(
      Buffer.from(
        "Product,Rating,Title,Review,Date\nNinja Blast,5,Fine,Works well,10/08/2026\n",
        "utf8",
      ),
    );
    assert.equal(out.reviews[0].reviewDate, "2026-08-10");
  });

  it("reads an Indian slash date day-first", () => {
    // 10/08/2026 is the tenth of August here, not the eighth of October.
    assert.equal(parseDateCell("10/08/2026"), "2026-08-10");
    // Unambiguous the other way round, so it is read the other way round.
    assert.equal(parseDateCell("13/08/2026"), "2026-08-13");
    assert.equal(parseDateCell("08/13/2026"), "2026-08-13");
  });

  it("refuses a two-digit year it cannot place", () => {
    // "26-08-10" is the 26th of August 2010 day-first, or the 10th of August
    // 2026 year-first. Nothing in the cell says which, so neither is returned.
    assert.equal(parseDateCell("26-08-10"), null);
    assert.equal(parseDateCell("10-08-26"), "2026-08-10");
  });

  it("reads the day that is written, not the day in this timezone", () => {
    // A scraper export with a time and a zone. Handing the whole string to
    // Date and taking its local day makes this the 11th in India.
    assert.equal(parseDateCell("10 Aug 2026 23:00 GMT"), "2026-08-10");
    assert.equal(parseDateCell("Reviewed in India on 10 August 2026 23:00"), "2026-08-10");
    assert.equal(parseDateCell("2026-08-10T23:00:00Z"), "2026-08-10");
  });

  it("reads the verified flag without treating blank as yes", () => {
    assert.equal(parseVerified("Yes"), true);
    assert.equal(parseVerified("TRUE"), true);
    assert.equal(parseVerified("Verified Purchase"), true);
    assert.equal(parseVerified(""), false);
    assert.equal(parseVerified("No"), false);
    assert.equal(parseVerified("n"), false);
  });
});

describe("headers that mean something else elsewhere", () => {
  // Found by a second model reading the parser cold. Each of these was wrong.
  it("prefers the clear header over the vague one, whatever the order", () => {
    const out = parseWorkbook(
      Buffer.from(
        "Title,Review Title,ASIN,Rating,Date\nNinja Blast blender,Loved it,B0FWY5Y7VF,5,2026-07-14\n",
        "utf8",
      ),
    );
    // "Title" is the product's in a catalogue dump, so the review headline has
    // to come from "Review Title" even though it appears second.
    assert.equal(out.reviews[0].title, "Loved it");
  });

  it("does the same for Description against Review Text", () => {
    const out = parseWorkbook(
      Buffer.from(
        "Product,Description,Review Text,Rating,Date\nNinja Blast,A 530ml blender,Loved it,5,2026-07-14\n",
        "utf8",
      ),
    );
    assert.equal(out.reviews[0].body, "Loved it");
  });

  it("does the same for Name against Author", () => {
    const out = parseWorkbook(
      Buffer.from(
        "Product,Name,Author,Rating,Title,Date\nNinja Blast,Ninja Blast,Surendhran S,5,Good,2026-07-14\n",
        "utf8",
      ),
    );
    assert.equal(out.reviews[0].reviewer, "Surendhran S");
  });

  it("refuses a sheet whose every header is a vague one", () => {
    // Model/Score/Summary alias to product/rating/title, so an ML evaluation
    // or a scorecard used to import as reviews rather than being refused.
    const out = parseWorkbook(
      Buffer.from("Model,Score,Summary\nAF180IN,4,Performs well\n", "utf8"),
    );
    assert.equal(out.reviews.length, 0);
    assert.deepEqual(out.unmappedSheets, []);
  });

  it("still accepts a sheet where only some headers are vague", () => {
    const out = parseWorkbook(
      Buffer.from("Model,Stars,Summary,Date\nAF180IN,4,Performs well,2026-07-14\n", "utf8"),
    );
    assert.equal(out.reviews.length, 1);
    assert.equal(out.reviews[0].skuId, "ninja-air-fryer-6-2l");
  });
});

describe("rows that cannot be read", () => {
  const csv = [
    "Product,Rating,Title,Review,Date",
    "Ninja Blast,5,Good,Works well,2026-07-14",
    "Ninja Blaster,5,Good,Works well,2026-07-14",
    "Ninja Blast,9,Good,Works well,2026-07-14",
    "Ninja Blast,5,Good,Works well,last Tuesday",
    "Ninja Blast,5,,,2026-07-14",
    ",,,,",
  ].join("\n");

  it("reports them with their row number instead of dropping them", () => {
    const out = parseWorkbook(Buffer.from(csv, "utf8"));
    assert.equal(out.reviews.length, 1);
    assert.deepEqual(
      out.skippedRows.map((s) => [s.row, s.reason]),
      [
        [3, "unknown-product"],
        [4, "bad-rating"],
        [5, "bad-date"],
        [6, "empty-review"],
      ],
    );
    // The wholly blank row is padding, not a skipped review.
    assert.equal(out.rowsRead, 5);
  });
});

describe("a refused import", () => {
  /**
   * A workbook with one good tab and one tab matching no SKU. This used to
   * insert the good tab, write an import record, and then answer the caller
   * with "nothing was imported" — so the store and the message disagreed.
   */
  function mixedWorkbook(): Buffer {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([
        ["Amazon Customer"],
        ["5.0 out of 5 stars Guard"],
        ["Reviewed in India on 12 August 2026"],
        ["Verified Purchase"],
        ["This row must not be stored."],
      ]),
      "Blast",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([["something"], ["else"]]),
      "Ninja Brand New SKU",
    );
    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  }

  it("names the tab it could not place", () => {
    const out = parseWorkbook(mixedWorkbook());
    assert.deepEqual(out.unmappedSheets, ["Ninja Brand New SKU"]);
    assert.equal(out.reviews.length, 1, "the good tab still parses");
  });

  it("imports the recognised tabs and warns about the one it could not place", async () => {
    const report = await ingestBuffer(mixedWorkbook(), "guard.xlsx");
    assert.deepEqual(report.unmappedSheets, ["Ninja Brand New SKU"]);
    assert.equal(report.parsed, 1);
    const w = report.warnings.find((x) => x.kind === "unrecognised-sheet");
    assert.ok(w, "the unplaced tab is reported");
    assert.match(w.detail, /Ninja Brand New SKU/);
  });

  it("refuses before the store is touched when no tab can be placed", async () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet([["something"], ["else"]]),
      "Ninja Brand New SKU",
    );
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    await assert.rejects(
      () => ingestBuffer(buf, "none.xlsx"),
      (err: unknown) => {
        assert.ok(err instanceof UnmappedSheetsError);
        assert.deepEqual(err.sheets, ["Ninja Brand New SKU"]);
        assert.match(err.message, /Nothing was imported/);
        return true;
      },
    );
  });
});
