import type { Brand } from "./types";

export type Sku = {
  id: string; // url slug + storage key
  name: string; // as listed in the workbook index sheet
  brand: Brand;
  /** Amazon.in ASIN. Optional so a product can be registered before its listing is confirmed. */
  asin?: string;
  model?: string;
  /**
   * What reviewers call this device when they are not using its name.
   * "air fryer" is the top word in every Combi cloud otherwise, which tells
   * you what the product is, not what anyone thinks of it. Kept per-SKU rather
   * than global so "air flow" survives on the fan and "steam" on the mop.
   */
  categoryTokens?: string[];
  /**
   * Worksheet tab names that have been seen carrying this SKU's reviews.
   * Tab names do NOT match product names, and differ between exports, so this
   * is an explicit list. Add to it rather than guessing at match time.
   */
  sheetNames: string[];
};

/**
 * Source of truth: "Sheet1" of the Ninja workbook, which indexes all twelve
 * products across both brands with their Amazon.in links. ASINs extracted from
 * those links; tracking parameters dropped.
 */
export const SKUS: Sku[] = [
  {
    id: "ninja-blast",
    name: "Ninja Blast",
    brand: "Ninja",
    asin: "B0FWY5Y7VF",
    model: "BC151INNV",
    categoryTokens: ["blender", "juicer"],
    sheetNames: ["Blast"],
  },
  {
    id: "ninja-combi",
    name: "Ninja Combi",
    brand: "Ninja",
    asin: "B0FWY8TT1X",
    model: "SFP701IN",
    categoryTokens: ["fryer", "airfryer", "oven", "cooker"],
    sheetNames: ["Combi"],
  },
  {
    id: "ninja-air-fryer-6-2l",
    name: "Ninja Air Fryer 6.2L",
    brand: "Ninja",
    asin: "B0FWY8R9W8",
    model: "AF180IN",
    categoryTokens: ["airfryer"],
    sheetNames: ["6.2 Air fryer", "6.2 Air Fryer", "Air Fryer 6.2"],
  },
  {
    id: "ninja-dual-zone",
    name: "Ninja Dual Zone",
    brand: "Ninja",
    asin: "B0FWY81CXR",
    model: "AF300IN",
    categoryTokens: ["fryer", "airfryer"],
    sheetNames: ["Dual zone", "Dual Zone"],
  },
  {
    id: "ninja-double-stack",
    name: "Ninja Double Stack",
    brand: "Ninja",
    asin: "B0FWY6L1P5",
    model: "SL300IN",
    categoryTokens: ["fryer", "airfryer"],
    sheetNames: ["DoubleStack", "Double Stack"],
  },
  {
    id: "ninja-crispi",
    name: "Ninja Crispi",
    brand: "Ninja",
    asin: "B0HD7SCDKQ",
    categoryTokens: ["fryer", "airfryer"],
    sheetNames: ["Crispi", "CRISPi"],
  },
  {
    id: "shark-flex-breeze",
    name: "Shark Flex Breeze",
    brand: "Shark",
    asin: "B0GKNN32L5",
    model: "FA200INBK",
    categoryTokens: ["fan"],
    sheetNames: ["FlexBreeze", "Flex Breeze"],
  },
  {
    id: "shark-air-purifier",
    name: "Shark Air Purifier",
    brand: "Shark",
    asin: "B0FWRTBVBN",
    categoryTokens: ["purifier"],
    sheetNames: ["Air Purifier", "Airpurifier"],
  },
  {
    id: "shark-steam-and-scrub",
    name: "Shark Steam & Scrub",
    brand: "Shark",
    asin: "B0FYNH6PBR",
    model: "S8201IN",
    categoryTokens: ["mop", "mopping"],
    sheetNames: ["Steam and Scrub", "Steam & Scrub"],
  },
  {
    id: "shark-detect-clean-and-empty",
    name: "Shark Detect Clean and Empty",
    brand: "Shark",
    asin: "B0FWQT87JQ",
    categoryTokens: ["vacuum", "vacuume", "cleaner"],
    sheetNames: ["Clean and Detect VC", "Detect Clean and Empty"],
  },
  {
    id: "shark-power-pro-pet",
    name: "Shark Power Pro Pet",
    brand: "Shark",
    asin: "B0FWQV36NL",
    model: "IZ380INT",
    categoryTokens: ["vacuum", "vacuume", "cleaner"],
    sheetNames: ["PetPro Vacuume Cleaner", "PetPro", "Power Pro Pet"],
  },
  {
    id: "shark-hydrovac",
    name: "Shark HydroVac",
    brand: "Shark",
    asin: "B0FWQPMDCY",
    categoryTokens: ["vacuum", "vacuume", "cleaner"],
    sheetNames: ["HydroVac", "Hydrovac"],
  },
  {
    id: "shark-powerdetect",
    name: "Shark PowerDetect",
    brand: "Shark",
    asin: "B0FWQRYTMN",
    categoryTokens: ["vacuum", "vacuume", "cleaner"],
    sheetNames: ["Power Detect VC", "PowerDetect", "powerDetect"],
  },
];

export const BRANDS: Brand[] = ["Ninja", "Shark"];

export function amazonUrl(sku: Sku): string {
  return sku.asin
    ? `https://www.amazon.in/dp/${sku.asin}`
    : `https://www.amazon.in/s?k=${encodeURIComponent(sku.name)}`;
}

export function skuById(id: string): Sku | undefined {
  return SKUS.find((s) => s.id === id);
}

export function skusForBrand(brand: Brand): Sku[] {
  return SKUS.filter((s) => s.brand === brand);
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Case, spacing and punctuation all dropped: "Power-Detect VC" -> "powerdetectvc". */
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The name without the brand: "Ninja Crispi" -> "crispi". */
const coreName = (sku: Sku) =>
  squash(sku.name.replace(/^(sharkninja|ninja|shark)\s+/i, ""));

/**
 * Resolve a worksheet tab name to a SKU. Returns undefined if unmapped.
 *
 * Tab names are typed by hand and differ between exports, so after the exact
 * list in sheetNames this also accepts the same name written differently
 * ("Crispi", "Ninja Crispi", "crispi-glass"), the model code, the ASIN and the
 * id. A loose match has to be unambiguous: "Detect" fits two vacuums, so it
 * resolves to nothing and gets reported rather than guessed at.
 */
export function skuForSheet(sheetName: string): Sku | undefined {
  const n = norm(sheetName);
  const exact = SKUS.find((s) => s.sheetNames.some((t) => norm(t) === n));
  if (exact) return exact;

  const k = squash(sheetName);
  if (!k) return undefined;
  const bare = k.replace(/^(sharkninja|ninja|shark)/, "") || k;

  const keysOf = (s: Sku) =>
    [
      squash(s.id),
      squash(s.name),
      coreName(s),
      ...(s.model ? [squash(s.model)] : []),
      ...(s.asin ? [squash(s.asin)] : []),
      ...s.sheetNames.map(squash),
    ].filter(Boolean);

  const same = SKUS.filter((s) => keysOf(s).some((key) => key === k || key === bare));
  if (same.length === 1) return same[0];
  if (same.length > 1) return undefined;

  if (bare.length < 4) return undefined;
  const near = SKUS.filter((s) => {
    const core = coreName(s);
    return core.includes(bare) || bare.startsWith(core);
  });
  return near.length === 1 ? near[0] : undefined;
}

const BASE_TOKENS = ["ninja", "shark", "sharkninja", "amazon"];

function tokensOf(sku: Sku): string[] {
  return [
    ...sku.name.toLowerCase().split(/[^a-z0-9.]+/).filter(Boolean),
    ...(sku.asin ? [sku.asin.toLowerCase()] : []),
    ...(sku.model ? [sku.model.toLowerCase()] : []),
    ...(sku.categoryTokens ?? []),
  ];
}

/**
 * Tokens stripped before building word clouds and theme lists.
 *
 * Without this the top "theme" for both praise and complaints is "air fryer",
 * which is the thing being reviewed, not something anyone said about it. At SKU
 * level only that product's own name goes; at brand level every product name in
 * the brand goes, because the clouds there mix SKUs together.
 */
export function brandTokens(sku?: Sku): string[] {
  if (!sku) return BASE_TOKENS;
  return [...new Set([...BASE_TOKENS, ...tokensOf(sku)])];
}

export function brandTokensFor(brand: Brand): string[] {
  return [
    ...new Set([...BASE_TOKENS, ...skusForBrand(brand).flatMap(tokensOf)]),
  ];
}
