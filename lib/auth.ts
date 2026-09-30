/**
 * One shared password for the team, held in a signed cookie.
 *
 * Deliberately not a user system: this is an internal insights dashboard for a
 * handful of people, and the cost of per-user accounts (invites, resets,
 * offboarding) buys nothing here. What it does buy is that client review data
 * is not sitting on a guessable public URL.
 *
 * Web Crypto rather than node:crypto so this also runs in middleware.
 */

const COOKIE = "snr_session";
const TTL_DAYS = 30;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createSessionValue(): Promise<string> {
  const expires = Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000;
  return `${expires}.${await hmac(String(expires))}`;
}

export async function isValidSession(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const [expires, sig] = value.split(".");
  if (!expires || !sig) return false;
  if (Number(expires) < Date.now()) return false;
  const expected = await hmac(expires);
  // Length-safe comparison; both sides are fixed-length hex.
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0;
}

export function checkPassword(input: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  if (input.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= input.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export const SESSION_COOKIE = COOKIE;
export const SESSION_MAX_AGE = TTL_DAYS * 24 * 60 * 60;

/**
 * Where to send someone after signing in: an internal path, or home. Lives
 * here rather than in the login route because a route file may only export
 * its handlers, and `npm run build:webpack` fails type-checking on anything
 * else.
 */
export function safeNextPath(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";

  // URL parsing also catches backslash and control-character variants such as
  // `/\\evil.example`, which browsers normalize into cross-origin URLs.
  try {
    const base = "https://local.invalid";
    const destination = new URL(value, base);
    return destination.origin === base
      ? `${destination.pathname}${destination.search}${destination.hash}`
      : "/";
  } catch {
    return "/";
  }
}
