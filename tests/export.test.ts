import { strict as assert } from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import * as XLSX from "xlsx";
import seed from "../data/seed.json";
import { exportCsv, exportFilename, exportWorkbook, EXPORT_HEADERS } from "../lib/export";
import { filterFromParams, filterReviews, filterToParams } from "../lib/filter";
import { ingestBuffer, toReviews } from "../lib/ingest";
import { parseWorkbook } from "../lib/parse/workbook";
import { getStore, resetStoreCacheForTesting } from "../lib/store";
import type { Review } from "../lib/types";

/**
 * The real September snapshot, not rows written for the test: the import bugs
 * this project has had (mojibake, dates a day early, month-first slashes) all
 * passed on invented fixtures and failed on the real export.
 */
const REVIEWS = seed.reviews as Review[];

const meta = {
  filter: {},
  source: "Read-only Snapshot",
  generatedAt: new Date("2026-09-30T10:00:00Z"),
};

function assertRoundTrip(buf: Buffer) {
  const parsed = parseWorkbook(buf);
  assert.deepEqual(parsed.unmappedSheets, [], "an unmapped sheet refuses the whole import");
  assert.deepEqual(parsed.skippedRows, []);
  assert.equal(parsed.reviews.length, REVIEWS.length);

  const byHash = new Map(toReviews(parsed.reviews).map((r) => [r.hash, r]));
  assert.equal(byHash.size, REVIEWS.length);

  for (const original of REVIEWS) {
    const back = byHash.get(original.hash);
    assert.ok(back, `review ${original.hash} (${original.skuId}, ${original.reviewDate}) did not come back`);
    for (const field of [
      "skuId", "reviewer", "rating", "title", "body", "reviewDate", "verified", "country", "variant",
    ] as const) {
      assert.deepEqual(back[field], original[field], `${field} changed for ${original.hash}`);
    }
  }
}

describe("export round-trips through the importer", () => {
  it("xlsx: every snapshot review comes back unchanged", () => {
    assertRoundTrip(exportWorkbook(REVIEWS, meta));
  });

  it("csv: every snapshot review comes back unchanged", () => {
    assertRoundTrip(Buffer.from(exportCsv(REVIEWS), "utf8"));
  });

  it("xlsx dates are real date cells on the right calendar day", () => {
    const wb = XLSX.read(exportWorkbook(REVIEWS.slice(0, 5), meta), { type: "buffer" });
    const ws = wb.Sheets.Reviews;
    const col = EXPORT_HEADERS.indexOf("Date");
    for (let i = 0; i < 5; i++) {
      const cell = ws[XLSX.utils.encode_cell({ r: i + 1, c: col })];
      assert.equal(cell.t, "n");
      assert.equal(cell.w ?? XLSX.SSF.format("yyyy-mm-dd", cell.v), REVIEWS[i].reviewDate);
    }
  });
});

describe("export goes back in through the real import path", () => {
  const dir = mkdtempSync(join(tmpdir(), "export-reimport-"));
  const cwd = process.cwd();
  after(() => {
    process.chdir(cwd);
    resetStoreCacheForTesting();
    // Windows keeps the SQLite file locked until the process exits; the OS
    // clears the temp directory later, so a failed delete is not a test failure.
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* leave it to the OS */
    }
  });

  /**
   * A new SQLite store fills itself on first open: from .data/store.json when
   * there is one, otherwise from the bundled snapshot. Run from an empty
   * directory it holds exactly the snapshot, so importing the snapshot's own
   * export has to add nothing: every row must hash to a review already there.
   */
  it("re-importing an export into the store it came from adds nothing", async () => {
    const previous = process.env.SQLITE_PATH;
    process.chdir(dir);
    process.env.SQLITE_PATH = join(dir, "reviews.sqlite");
    resetStoreCacheForTesting();
    try {
      const store = getStore();
      await store.init();
      assert.equal((await store.allReviews()).length, REVIEWS.length, "store did not start as the snapshot");

      for (const [name, buf] of [
        ["export.xlsx", exportWorkbook(REVIEWS, meta)],
        ["export.csv", Buffer.from(exportCsv(REVIEWS), "utf8")],
      ] as const) {
        const report = await ingestBuffer(buf, name);
        assert.equal(report.parsed, REVIEWS.length, `${name}: rows lost on the way in`);
        assert.equal(report.inserted, 0, `${name}: a review came back as a different review`);
        assert.equal(report.duplicates, REVIEWS.length);
      }
      assert.equal((await store.allReviews()).length, REVIEWS.length);
    } finally {
      if (previous === undefined) delete process.env.SQLITE_PATH;
      else process.env.SQLITE_PATH = previous;
    }
  });
});

describe("export workbook", () => {
  const wb = XLSX.read(exportWorkbook(REVIEWS, meta), { type: "buffer" });

  it("flags a thin verified average instead of presenting it like the rest", () => {
    const rows = XLSX.utils.sheet_to_json<Record<string, string | number>>(wb.Sheets.Summary);
    const byName = new Map(rows.map((r) => [r.Product, r]));
    assert.match(String(byName.get("Shark HydroVac")?.Note), /anecdote, not measurement/);
    assert.equal(byName.get("Ninja Air Fryer 6.2L")?.Note ?? "", "");
  });

  it("dates the file from its reviews, not from the seed's stale timestamp", () => {
    const about = XLSX.utils.sheet_to_csv(wb.Sheets["About this file"]);
    const newest = REVIEWS.map((r) => r.reviewDate).sort().at(-1)!;
    const day = new Date(`${newest}T00:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
    });
    assert.ok(about.includes(day), `About sheet should name ${day}`);
  });
});

describe("csv safety", () => {
  const base = REVIEWS[0];

  it("starts with a byte-order mark so Excel reads UTF-8", () => {
    assert.equal(exportCsv([base]).charCodeAt(0), 0xfeff);
  });

  it("guards cells a spreadsheet would run as a formula", () => {
    const hostile: Review = { ...base, title: '=HYPERLINK("http://x","click")', body: "+1 great", reviewer: "@me" };
    const ws = XLSX.read(exportCsv([hostile]).slice(1), { type: "string", raw: true }).Sheets.Sheet1;
    const cell = (h: string) => ws[XLSX.utils.encode_cell({ r: 1, c: EXPORT_HEADERS.indexOf(h) })].v;
    assert.equal(cell("Title"), `'=HYPERLINK("http://x","click")`);
    assert.equal(cell("Review"), "'+1 great");
    assert.equal(cell("Reviewer"), "'@me");
  });
});

describe("export filter", () => {
  it("rejects parameters it cannot honour instead of exporting everything", () => {
    for (const qs of ["rating=6", "rating=abc", "sku=nope", "brand=dyson", "bucket=Pricing", "verified=maybe", "sort=random", "brand=shark&sku=ninja-blast"]) {
      const r = filterFromParams(new URLSearchParams(qs));
      assert.equal(r.ok, false, `${qs} should be refused`);
    }
  });

  it("survives the trip through a URL", () => {
    const f = { skuId: "ninja-blast", q: "motor", rating: 1, verified: "verified" as const, bucket: "Product" as const, sort: "oldest" as const };
    const back = filterFromParams(filterToParams(f));
    assert.ok(back.ok);
    assert.deepEqual(back.filter, { ...f, brand: "Ninja" });
  });

  it("a SKU export holds only that SKU, a brand export only that brand", () => {
    const blast = filterReviews(REVIEWS, { skuId: "ninja-blast" });
    assert.ok(blast.length > 0);
    assert.ok(blast.every((r) => r.skuId === "ninja-blast"));

    const shark = filterReviews(REVIEWS, { brand: "Shark" });
    assert.ok(shark.length > 0);
    assert.ok(shark.every((r) => r.skuId.startsWith("shark-")));
    assert.equal(shark.length + filterReviews(REVIEWS, { brand: "Ninja" }).length, REVIEWS.length);
  });

  it("names the file after what is in it", () => {
    const now = new Date("2026-09-30T20:00:00Z"); // 1:30 am on the 1st in India
    assert.equal(exportFilename({}, now, "xlsx"), "sharkninja-reviews-2026-10-01.xlsx");
    assert.equal(
      exportFilename({ skuId: "ninja-blast", rating: 1, bucket: "Delivery / DOA" }, now, "csv"),
      "ninja-blast-reviews-1-star-delivery-doa-2026-10-01.csv",
    );
  });
});
