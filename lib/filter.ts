import { BUCKETS, type Brand, type Bucket, type Review } from "./types";
import { BRANDS, skuById } from "./skus";

/**
 * What a reader has narrowed the reviews down to.
 *
 * One definition shared by the review explorer on screen and the export route,
 * so a download always holds exactly the rows the reader was looking at. Kept
 * free of SheetJS and the store so the client bundle can import it.
 */
export type SortOption = "newest" | "oldest" | "lowest" | "highest";
export type VerifiedFilter = "all" | "verified" | "unverified";

export type ReviewFilter = {
  brand?: Brand;
  skuId?: string;
  q?: string;
  rating?: number;
  verified?: VerifiedFilter;
  bucket?: Bucket;
  sort?: SortOption;
};

const SORTS: SortOption[] = ["newest", "oldest", "lowest", "highest"];

export function filterReviews(reviews: Review[], f: ReviewFilter): Review[] {
  let list = reviews;

  if (f.skuId) {
    list = list.filter((r) => r.skuId === f.skuId);
  } else if (f.brand) {
    list = list.filter((r) => skuById(r.skuId)?.brand === f.brand);
  }

  const q = f.q?.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        r.body.toLowerCase().includes(q) ||
        r.reviewer.toLowerCase().includes(q) ||
        (r.variant !== null && r.variant.toLowerCase().includes(q)),
    );
  }

  if (f.rating !== undefined) list = list.filter((r) => r.rating === f.rating);

  if (f.verified === "verified") list = list.filter((r) => r.verified);
  else if (f.verified === "unverified") list = list.filter((r) => !r.verified);

  const bucket = f.bucket;
  if (bucket) list = list.filter((r) => r.buckets.includes(bucket));

  const sort = f.sort ?? "newest";
  return list.slice().sort((a, b) => {
    if (sort === "oldest") return a.reviewDate.localeCompare(b.reviewDate);
    if (sort === "lowest") return a.rating - b.rating || b.reviewDate.localeCompare(a.reviewDate);
    if (sort === "highest") return b.rating - a.rating || b.reviewDate.localeCompare(a.reviewDate);
    return b.reviewDate.localeCompare(a.reviewDate);
  });
}

/** True when anything beyond brand, SKU and sort narrows the list. */
export function isNarrowed(f: ReviewFilter): boolean {
  return Boolean(
    f.q?.trim() ||
      f.rating !== undefined ||
      (f.verified && f.verified !== "all") ||
      f.bucket,
  );
}

/** Query string for a filter. Defaults are left out so links stay short. */
export function filterToParams(f: ReviewFilter): URLSearchParams {
  const p = new URLSearchParams();
  if (f.brand) p.set("brand", f.brand.toLowerCase());
  if (f.skuId) p.set("sku", f.skuId);
  if (f.q?.trim()) p.set("q", f.q.trim());
  if (f.rating !== undefined) p.set("rating", String(f.rating));
  if (f.verified && f.verified !== "all") p.set("verified", f.verified);
  if (f.bucket) p.set("bucket", f.bucket);
  if (f.sort && f.sort !== "newest") p.set("sort", f.sort);
  return p;
}

/**
 * The reverse, for the export route. A parameter that does not parse is an
 * error, not ignored: quietly dropping `rating=6` would hand over every review
 * under a filename that claims otherwise.
 */
export function filterFromParams(
  p: URLSearchParams,
): { ok: true; filter: ReviewFilter } | { ok: false; error: string } {
  const f: ReviewFilter = {};

  const brand = p.get("brand");
  if (brand) {
    const match = BRANDS.find((b) => b.toLowerCase() === brand.toLowerCase());
    if (!match) return { ok: false, error: `Unknown brand "${brand}".` };
    f.brand = match;
  }

  const skuId = p.get("sku");
  if (skuId) {
    const sku = skuById(skuId);
    if (!sku) return { ok: false, error: `Unknown product "${skuId}".` };
    if (f.brand && sku.brand !== f.brand) {
      return { ok: false, error: `${sku.name} is not a ${f.brand} product.` };
    }
    f.skuId = sku.id;
    f.brand = sku.brand;
  }

  const q = p.get("q");
  if (q?.trim()) f.q = q.trim();

  const rating = p.get("rating");
  if (rating) {
    const n = Number(rating);
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      return { ok: false, error: `Rating must be a whole number from 1 to 5, not "${rating}".` };
    }
    f.rating = n;
  }

  const verified = p.get("verified");
  if (verified) {
    if (verified !== "all" && verified !== "verified" && verified !== "unverified") {
      return { ok: false, error: `Verified must be "verified" or "unverified", not "${verified}".` };
    }
    f.verified = verified;
  }

  const bucket = p.get("bucket");
  if (bucket) {
    const match = BUCKETS.find((b) => b === bucket);
    if (!match) return { ok: false, error: `Unknown problem area "${bucket}".` };
    f.bucket = match;
  }

  const sort = p.get("sort");
  if (sort) {
    const match = SORTS.find((s) => s === sort);
    if (!match) return { ok: false, error: `Unknown sort "${sort}".` };
    f.sort = match;
  }

  return { ok: true, filter: f };
}

/** Plain-words description of a filter, for the file and its name. */
export function describeFilter(f: ReviewFilter): string[] {
  const out: string[] = [];
  if (f.skuId) out.push(`Product: ${skuById(f.skuId)?.name ?? f.skuId}`);
  else if (f.brand) out.push(`Brand: ${f.brand}`);
  else out.push("All products");
  if (f.rating !== undefined) out.push(`${f.rating}-star reviews only`);
  if (f.verified === "verified") out.push("Verified purchases only");
  if (f.verified === "unverified") out.push("Unverified reviews only");
  if (f.bucket) out.push(`Problem area: ${f.bucket}`);
  if (f.q?.trim()) out.push(`Matching "${f.q.trim()}"`);
  return out;
}
