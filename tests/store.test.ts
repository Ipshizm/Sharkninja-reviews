import { strict as assert } from "node:assert";
import { describe, it, beforeEach } from "node:test";
import { DatabaseSync } from "node:sqlite";
import seed from "../data/seed.json";
import type { Bucket, Review } from "../lib/types";

// Test SQLite schema and operations directly
const SQLITE_SCHEMA = `
create table if not exists reviews (
  hash        text primary key,
  sku_id      text        not null,
  reviewer    text        not null,
  rating      integer     not null,
  title       text        not null,
  body        text        not null,
  review_date text        not null,
  verified    integer     not null,
  country     text        not null,
  variant     text,
  buckets     text        not null default '[]',
  import_id   text        not null,
  created_at  text        not null default CURRENT_TIMESTAMP
);
create index if not exists reviews_sku_idx  on reviews (sku_id);
create index if not exists reviews_date_idx on reviews (review_date);

create table if not exists imports (
  id         text primary key,
  filename   text        not null,
  created_at text        not null default CURRENT_TIMESTAMP,
  report     text        not null
);
`;

describe("sqlite database store", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    db.exec(SQLITE_SCHEMA);
  });

  it("seeds reviews and preserves counts", () => {
    const reviews = seed.reviews as unknown as Review[];
    const insertStmt = db.prepare(`
      insert or ignore into reviews (
        hash, sku_id, reviewer, rating, title, body, review_date,
        verified, country, variant, buckets, import_id
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    db.exec("begin transaction");
    for (const r of reviews) {
      insertStmt.run(
        r.hash,
        r.skuId,
        r.reviewer,
        r.rating,
        r.title,
        r.body,
        r.reviewDate,
        r.verified ? 1 : 0,
        r.country,
        r.variant ?? null,
        JSON.stringify(r.buckets ?? []),
        "seed",
      );
    }
    db.exec("commit");

    const countRow = db.prepare("select count(*) as c from reviews").get() as { c: number };
    assert.equal(countRow.c, reviews.length);
  });

  it("handles duplicate review hashes gracefully", () => {
    const insertStmt = db.prepare(`
      insert or ignore into reviews (
        hash, sku_id, reviewer, rating, title, body, review_date,
        verified, country, variant, buckets, import_id
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const res1 = insertStmt.run("h1", "ninja-combi", "Alice", 5, "Great", "Loved it", "2026-09-01", 1, "India", null, "[]", "imp1");
    assert.equal(res1.changes, 1);

    // Duplicate insert
    const res2 = insertStmt.run("h1", "ninja-combi", "Alice", 5, "Great", "Loved it", "2026-09-01", 1, "India", null, "[]", "imp2");
    assert.equal(res2.changes, 0);

    const countRow = db.prepare("select count(*) as c from reviews").get() as { c: number };
    assert.equal(countRow.c, 1);
  });

  it("updates buckets correctly", () => {
    const insertStmt = db.prepare(`
      insert or ignore into reviews (
        hash, sku_id, reviewer, rating, title, body, review_date,
        verified, country, variant, buckets, import_id
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertStmt.run("h1", "ninja-blast", "Bob", 1, "Broke", "Motor died", "2026-09-02", 1, "India", null, "[]", "imp1");

    const updateStmt = db.prepare("update reviews set buckets = ? where hash = ?");
    const buckets: Bucket[] = ["Product"];
    const updateRes = updateStmt.run(JSON.stringify(buckets), "h1");
    assert.equal(updateRes.changes, 1);

    const row = db.prepare("select buckets from reviews where hash = ?").get("h1") as { buckets: string };
    assert.deepEqual(JSON.parse(row.buckets), ["Product"]);
  });

  it("records and lists import reports in order", () => {
    const importStmt = db.prepare(`
      insert into imports (id, filename, created_at, report)
      values (?, ?, ?, ?)
    `);
    importStmt.run("imp-1", "file1.xlsx", "2026-09-01T10:00:00Z", JSON.stringify({ parsed: 10, inserted: 10 }));
    importStmt.run("imp-2", "file2.xlsx", "2026-09-02T10:00:00Z", JSON.stringify({ parsed: 5, inserted: 5 }));

    const list = db.prepare("select id, filename from imports order by created_at desc").all() as Array<{ id: string; filename: string }>;
    assert.equal(list.length, 2);
    assert.equal(list[0].id, "imp-2");
    assert.equal(list[1].id, "imp-1");
  });
});

describe("sqliteStore Store interface implementation", () => {
  it("initializes, seeds automatically, and inserts new reviews", async () => {
    const { sqliteStore } = await import("../lib/store");
    const store = sqliteStore(":memory:");
    await store.init();

    const all = await store.allReviews();
    assert.ok(all.length > 300, `Expected >300 reviews from seed, got ${all.length}`);

    // Insert a new review
    const newReview: Review = {
      hash: "new-test-hash-123",
      skuId: "ninja-blast",
      reviewer: "Test Evaluator",
      rating: 5,
      title: "Superb product",
      body: "Blending works fast and easy to clean.",
      reviewDate: "2026-09-17",
      verified: true,
      country: "India",
      variant: null,
      buckets: [],
    };

    const res = await store.insertReviews([newReview], "test-import-1");
    assert.equal(res.inserted, 1);
    assert.equal(res.duplicates, 0);

    const reinsert = await store.insertReviews([newReview], "test-import-2");
    assert.equal(reinsert.inserted, 0);
    assert.equal(reinsert.duplicates, 1);

    const updatedAll = await store.allReviews();
    assert.equal(updatedAll.length, all.length + 1);

    // Test record import
    await store.recordImport({
      id: "test-import-1",
      filename: "test.csv",
      createdAt: new Date().toISOString(),
      report: {
        filename: "test.csv",
        sheetsRead: 1,
        rowsRead: 1,
        parsed: 1,
        inserted: 1,
        duplicates: 0,
        unmappedSheets: [],
        skippedRows: [],
        perSku: [],
        dateRange: null,
        warnings: [],
      },
    });

    const imports = await store.listImports();
    assert.ok(imports.length >= 1);
    assert.equal(imports[0].id, "test-import-1");
  });
});

describe("production store selection", () => {
  it("uses the read-only snapshot on Vercel when DATABASE_URL is absent", async () => {
    const { getStore, resetStoreCacheForTesting } = await import("../lib/store");
    const previous = {
      databaseUrl: process.env.DATABASE_URL,
      sqlitePath: process.env.SQLITE_PATH,
      storeMode: process.env.STORE_MODE,
      vercel: process.env.VERCEL,
    };

    try {
      delete process.env.DATABASE_URL;
      delete process.env.SQLITE_PATH;
      delete process.env.STORE_MODE;
      process.env.VERCEL = "1";
      resetStoreCacheForTesting();
      assert.equal(getStore().kind, "snapshot");
    } finally {
      if (previous.databaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous.databaseUrl;
      if (previous.sqlitePath === undefined) delete process.env.SQLITE_PATH;
      else process.env.SQLITE_PATH = previous.sqlitePath;
      if (previous.storeMode === undefined) delete process.env.STORE_MODE;
      else process.env.STORE_MODE = previous.storeMode;
      if (previous.vercel === undefined) delete process.env.VERCEL;
      else process.env.VERCEL = previous.vercel;
      resetStoreCacheForTesting();
    }
  });
});

describe("direct text paste ingest", () => {
  it("ingests raw pasted text for a SKU", async () => {
    const { ingestText } = await import("../lib/ingest");
    const rawText = [
      "Shepali",
      "5.0 out of 5 stars Good Product 👍",
      "Reviewed in India on 12 June 2026",
      "Colour: Cranberrry RedVerified Purchase",
      "This blender is really good for on the go shakes, smoothies.",
      "Helpful",
      "Report",
    ].join("\n");

    const report = await ingestText("ninja-blast", rawText, "Test Paste");
    assert.equal(report.parsed, 1);
    assert.equal(report.filename, "Test Paste");
    assert.equal(report.perSku.length, 1);
    assert.equal(report.perSku[0].skuId, "ninja-blast");
    assert.equal(report.perSku[0].parsed, 1);
  });

  it("rejects unknown SKU with InvalidSkuError", async () => {
    const { ingestText, InvalidSkuError } = await import("../lib/ingest");
    await assert.rejects(
      () => ingestText("non-existent-sku", "Some text"),
      (err: unknown) => err instanceof InvalidSkuError,
    );
  });

  it("rejects text that contains no parseable reviews with EmptyImportError", async () => {
    const { ingestText, EmptyImportError } = await import("../lib/ingest");
    await assert.rejects(
      () => ingestText("ninja-blast", "random text that has no review format"),
      (err: unknown) => err instanceof EmptyImportError,
    );
  });
});
