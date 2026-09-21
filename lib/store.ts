import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import seed from "../data/seed.json";
import type { Bucket, IngestReport, Review } from "./types";

export type ImportRecord = {
  id: string;
  filename: string;
  createdAt: string;
  report: IngestReport;
};

export class ReadOnlyStoreError extends Error {
  constructor() {
    super(
      "This deployment has no database, so it is showing a bundled snapshot and cannot accept new data. Set DATABASE_URL to a Postgres connection string or use SQLite to enable imports.",
    );
    this.name = "ReadOnlyStoreError";
  }
}

export interface Store {
  kind: "postgres" | "sqlite" | "file" | "snapshot";
  init(): Promise<void>;
  insertReviews(
    rows: Review[],
    importId: string,
  ): Promise<{ inserted: number; duplicates: number }>;
  allReviews(): Promise<Review[]>;
  setBuckets(updates: { hash: string; buckets: Bucket[] }[]): Promise<number>;
  recordImport(rec: ImportRecord): Promise<void>;
  listImports(): Promise<ImportRecord[]>;
  clear(): Promise<void>;
}

/* ------------------------------------------------------------------ postgres */

const SCHEMA = `
create table if not exists reviews (
  hash          text primary key,
  sku_id        text        not null,
  reviewer      text        not null,
  rating        smallint    not null,
  title         text        not null,
  body          text        not null,
  review_date   date        not null,
  verified      boolean     not null,
  country       text        not null,
  variant       text,
  buckets       text[]      not null default '{}',
  import_id     text        not null,
  created_at    timestamptz not null default now()
);
create index if not exists reviews_sku_idx  on reviews (sku_id);
create index if not exists reviews_date_idx on reviews (review_date);

create table if not exists imports (
  id         text primary key,
  filename   text        not null,
  created_at timestamptz not null default now(),
  report     jsonb       not null
);
`;

function postgresStore(url: string): Store {
  // Imported lazily so the file store works with no pg driver resolution.
  type Sql = ReturnType<typeof import("postgres")>;
  let sql: Sql | null = null;

  async function db(): Promise<Sql> {
    if (!sql) {
      const { default: postgres } = await import("postgres");
      sql = postgres(url, { ssl: "require", max: 3, idle_timeout: 20 });
    }
    return sql;
  }

  return {
    kind: "postgres",
    async init() {
      const s = await db();
      await s.unsafe(SCHEMA);

      // A newly provisioned production database should start from the same
      // reviewed snapshot the read-only deployment serves. The insert is
      // idempotent, so concurrent cold starts and later initialisations are
      // safe.
      const initialReviews = (seed.reviews as unknown as Review[]) ?? [];
      if (initialReviews.length > 0) {
        const payload = initialReviews.map((r) => ({
          hash: r.hash,
          sku_id: r.skuId,
          reviewer: r.reviewer,
          rating: r.rating,
          title: r.title,
          body: r.body,
          review_date: r.reviewDate,
          verified: r.verified,
          country: r.country,
          variant: r.variant,
          buckets: r.buckets,
          import_id: "bundled-seed",
        }));
        await s`
          insert into reviews ${s(payload)}
          on conflict (hash) do nothing
        `;
      }
    },
    async insertReviews(rows, importId) {
      if (rows.length === 0) return { inserted: 0, duplicates: 0 };
      const s = await db();
      const payload = rows.map((r) => ({
        hash: r.hash,
        sku_id: r.skuId,
        reviewer: r.reviewer,
        rating: r.rating,
        title: r.title,
        body: r.body,
        review_date: r.reviewDate,
        verified: r.verified,
        country: r.country,
        variant: r.variant,
        buckets: r.buckets,
        import_id: importId,
      }));
      const done = await s`
        insert into reviews ${s(payload)}
        on conflict (hash) do nothing
        returning hash
      `;
      return {
        inserted: done.length,
        duplicates: rows.length - done.length,
      };
    },
    async allReviews() {
      const s = await db();
      const rows = await s<
        {
          hash: string; sku_id: string; reviewer: string; rating: number;
          title: string; body: string; review_date: Date; verified: boolean;
          country: string; variant: string | null; buckets: string[];
        }[]
      >`select * from reviews order by review_date desc`;
      return rows.map((r) => ({
        hash: r.hash,
        skuId: r.sku_id,
        reviewer: r.reviewer,
        rating: r.rating,
        title: r.title,
        body: r.body,
        reviewDate:
          r.review_date instanceof Date
            ? r.review_date.toISOString().slice(0, 10)
            : String(r.review_date).slice(0, 10),
        verified: r.verified,
        country: r.country,
        variant: r.variant,
        buckets: r.buckets as Bucket[],
      }));
    },
    async setBuckets(updates) {
      if (updates.length === 0) return 0;
      const s = await db();
      let n = 0;
      for (const u of updates) {
        await s`update reviews set buckets = ${u.buckets} where hash = ${u.hash}`;
        n++;
      }
      return n;
    },
    async recordImport(rec) {
      const s = await db();
      await s`
        insert into imports (id, filename, created_at, report)
        values (${rec.id}, ${rec.filename}, ${rec.createdAt}, ${s.json(rec.report as never)})
        on conflict (id) do nothing
      `;
    },
    async listImports() {
      const s = await db();
      const rows = await s<
        { id: string; filename: string; created_at: Date; report: IngestReport }[]
      >`select * from imports order by created_at desc limit 50`;
      return rows.map((r) => ({
        id: r.id,
        filename: r.filename,
        createdAt: new Date(r.created_at).toISOString(),
        report: r.report,
      }));
    },
    async clear() {
      const s = await db();
      await s`delete from reviews`;
      await s`delete from imports`;
    },
  };
}

/* ---------------------------------------------------------------------- file */

/**
 * Local-development store. Vercel's filesystem is ephemeral, so this is not a
 * production backend — the dashboard says so out loud when it is in use.
 */
function fileStore(path: string): Store {
  type Shape = { reviews: Review[]; imports: ImportRecord[] };

  async function read(): Promise<Shape> {
    try {
      return JSON.parse(await readFile(path, "utf8")) as Shape;
    } catch {
      return { reviews: [], imports: [] };
    }
  }
  async function write(data: Shape) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(data, null, 2));
  }

  return {
    kind: "file",
    async init() {
      await mkdir(dirname(path), { recursive: true });
    },
    async insertReviews(rows, importId) {
      void importId;
      const data = await read();
      const seen = new Set(data.reviews.map((r) => r.hash));
      let inserted = 0;
      let duplicates = 0;
      for (const r of rows) {
        if (seen.has(r.hash)) {
          duplicates++;
          continue;
        }
        seen.add(r.hash);
        data.reviews.push(r);
        inserted++;
      }
      await write(data);
      return { inserted, duplicates };
    },
    async allReviews() {
      const data = await read();
      return data.reviews
        .slice()
        .sort((a, b) => b.reviewDate.localeCompare(a.reviewDate));
    },
    async setBuckets(updates) {
      const data = await read();
      const byHash = new Map(updates.map((u) => [u.hash, u.buckets]));
      let n = 0;
      for (const r of data.reviews) {
        const b = byHash.get(r.hash);
        if (b) {
          r.buckets = b;
          n++;
        }
      }
      await write(data);
      return n;
    },
    async recordImport(rec) {
      const data = await read();
      data.imports.unshift(rec);
      await write(data);
    },
    async listImports() {
      return (await read()).imports.slice(0, 50);
    },
    async clear() {
      await write({ reviews: [], imports: [] });
    },
  };
}

/* ------------------------------------------------------------------ sqlite */

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

export function sqliteStore(dbPath: string): Store {
  let db: DatabaseSync | null = null;

  async function getDb(): Promise<DatabaseSync> {
    if (!db) {
      if (dbPath !== ":memory:") {
        await mkdir(dirname(dbPath), { recursive: true });
      }
      db = new DatabaseSync(dbPath);
    }
    return db;
  }

  return {
    kind: "sqlite",
    async init() {
      const s = await getDb();
      s.exec(SQLITE_SCHEMA);

      const countResult = s.prepare("select count(*) as c from reviews").get() as { c: number };
      if (countResult.c === 0) {
        let initialReviews: Review[] = [];
        let initialImports: ImportRecord[] = [];

        const jsonStorePath = join(process.cwd(), ".data", "store.json");
        try {
          const raw = await readFile(jsonStorePath, "utf8");
          const parsed = JSON.parse(raw) as { reviews?: Review[]; imports?: ImportRecord[] };
          if (Array.isArray(parsed.reviews) && parsed.reviews.length > 0) {
            initialReviews = parsed.reviews;
            initialImports = parsed.imports ?? [];
          }
        } catch {
          // No store.json found or invalid
        }

        if (initialReviews.length === 0) {
          initialReviews = (seed.reviews as unknown as Review[]) ?? [];
        }

        if (initialReviews.length > 0) {
          const insertStmt = s.prepare(`
            insert or ignore into reviews (
              hash, sku_id, reviewer, rating, title, body, review_date,
              verified, country, variant, buckets, import_id
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          s.exec("begin transaction");
          try {
            for (const r of initialReviews) {
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
                "seed-import",
              );
            }
            s.exec("commit");
          } catch (e) {
            s.exec("rollback");
            throw e;
          }
        }

        if (initialImports.length > 0) {
          const insertImp = s.prepare(`
            insert or ignore into imports (id, filename, created_at, report)
            values (?, ?, ?, ?)
          `);
          s.exec("begin transaction");
          try {
            for (const imp of initialImports) {
              insertImp.run(
                imp.id,
                imp.filename,
                imp.createdAt,
                JSON.stringify(imp.report),
              );
            }
            s.exec("commit");
          } catch (e) {
            s.exec("rollback");
            throw e;
          }
        }
      }
    },
    async insertReviews(rows, importId) {
      if (rows.length === 0) return { inserted: 0, duplicates: 0 };
      const s = await getDb();
      const insertStmt = s.prepare(`
        insert or ignore into reviews (
          hash, sku_id, reviewer, rating, title, body, review_date,
          verified, country, variant, buckets, import_id
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      let inserted = 0;
      s.exec("begin transaction");
      try {
        for (const r of rows) {
          const res = insertStmt.run(
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
            importId,
          );
          if (res.changes > 0) inserted++;
        }
        s.exec("commit");
      } catch (e) {
        s.exec("rollback");
        throw e;
      }

      return {
        inserted,
        duplicates: rows.length - inserted,
      };
    },
    async allReviews() {
      const s = await getDb();
      const rows = s.prepare(`
        select hash, sku_id, reviewer, rating, title, body, review_date,
               verified, country, variant, buckets
        from reviews
        order by review_date desc
      `).all() as Array<{
        hash: string;
        sku_id: string;
        reviewer: string;
        rating: number;
        title: string;
        body: string;
        review_date: string;
        verified: number;
        country: string;
        variant: string | null;
        buckets: string;
      }>;

      return rows.map((r) => ({
        hash: r.hash,
        skuId: r.sku_id,
        reviewer: r.reviewer,
        rating: r.rating,
        title: r.title,
        body: r.body,
        reviewDate: r.review_date,
        verified: Boolean(r.verified),
        country: r.country,
        variant: r.variant,
        buckets: (r.buckets ? JSON.parse(r.buckets) : []) as Bucket[],
      }));
    },
    async setBuckets(updates) {
      if (updates.length === 0) return 0;
      const s = await getDb();
      const stmt = s.prepare("update reviews set buckets = ? where hash = ?");
      let n = 0;
      s.exec("begin transaction");
      try {
        for (const u of updates) {
          const res = stmt.run(JSON.stringify(u.buckets), u.hash);
          if (res.changes > 0) n++;
        }
        s.exec("commit");
      } catch (e) {
        s.exec("rollback");
        throw e;
      }
      return n;
    },
    async recordImport(rec) {
      const s = await getDb();
      const stmt = s.prepare(`
        insert into imports (id, filename, created_at, report)
        values (?, ?, ?, ?)
        on conflict (id) do update set report = excluded.report
      `);
      stmt.run(rec.id, rec.filename, rec.createdAt, JSON.stringify(rec.report));
    },
    async listImports() {
      const s = await getDb();
      const rows = s.prepare(`
        select id, filename, created_at, report
        from imports
        order by created_at desc
        limit 50
      `).all() as Array<{
        id: string;
        filename: string;
        created_at: string;
        report: string;
      }>;

      return rows.map((r) => ({
        id: r.id,
        filename: r.filename,
        createdAt: r.created_at,
        report: JSON.parse(r.report) as IngestReport,
      }));
    },
    async clear() {
      const s = await getDb();
      s.exec("delete from reviews; delete from imports;");
    },
  };
}

/* ------------------------------------------------------------------ snapshot */

/**
 * What a deployment falls back to when explicit snapshot mode is selected.
 */
function snapshotStore(): Store {
  const reviews = (seed.reviews as unknown as Review[])
    .slice()
    .sort((a, b) => b.reviewDate.localeCompare(a.reviewDate));

  return {
    kind: "snapshot",
    async init() {},
    async insertReviews() {
      throw new ReadOnlyStoreError();
    },
    async allReviews() {
      return reviews;
    },
    async setBuckets() {
      throw new ReadOnlyStoreError();
    },
    async recordImport() {
      throw new ReadOnlyStoreError();
    },
    async listImports() {
      return [];
    },
    async clear() {
      throw new ReadOnlyStoreError();
    },
  };
}

export const snapshotGeneratedAt = seed.generatedAt as string;

/* -------------------------------------------------------------------- picker */

let cached: Store | null = null;

export function resetStoreCacheForTesting(): void {
  cached = null;
}

export function getStore(): Store {
  if (cached) return cached;
  const url = process.env.DATABASE_URL;

  if (url && (url.startsWith("postgres://") || url.startsWith("postgresql://"))) {
    cached = postgresStore(url);
  } else if (url && (url.startsWith("sqlite:") || url.startsWith("file:"))) {
    const p = url.replace(/^(sqlite:|file:)\/\//, "").replace(/^(sqlite:|file:)/, "");
    cached = sqliteStore(p);
  } else if (process.env.SQLITE_PATH) {
    cached = sqliteStore(process.env.SQLITE_PATH);
  } else if (process.env.STORE_MODE === "snapshot") {
    cached = snapshotStore();
  } else if (process.env.STORE_MODE === "file") {
    cached = fileStore(join(process.cwd(), ".data", "store.json"));
  } else if (process.env.VERCEL) {
    // Never pretend an instance-local /tmp database is persistent. Without a
    // production database, deployments remain useful but explicitly read-only.
    cached = snapshotStore();
  } else {
    // Default: SQLite in .data/reviews.sqlite
    cached = sqliteStore(join(process.cwd(), ".data", "reviews.sqlite"));
  }
  return cached;
}

/** True when the dashboard is serving the baked-in snapshot, not live data. */
export const usingSnapshot = () => getStore().kind === "snapshot";
export const storeKind = () => getStore().kind;

export function getStoreDescription(): string {
  const store = getStore();
  switch (store.kind) {
    case "postgres":
      return "PostgreSQL";
    case "sqlite":
      return "SQLite Database";
    case "file":
      return "Local File Store (.data/store.json)";
    case "snapshot":
      return "Read-only Snapshot";
  }
}
