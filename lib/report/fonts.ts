import { join } from "node:path";
import { Font } from "@react-pdf/renderer";

/**
 * The dashboard's own typefaces, embedded in the PDF.
 *
 * Read from the @fontsource packages at run time; next.config.ts traces these
 * files into the /report function so they exist on Vercel too. The latin
 * subsets carry every character the report writes except two: ₹ lives in
 * Plus Jakarta Sans' latin-ext file, and the ★ the written analysis uses
 * ("3.05★") is in no text face at all, so Noto Sans Symbols 2 backs both up.
 * react-pdf falls through the list glyph by glyph.
 */
const files = (pkg: string, file: string) =>
  join(process.cwd(), "node_modules", "@fontsource", pkg, "files", file);

export const SANS = ["Jakarta", "JakartaExt", "Symbols"];
export const DISPLAY = ["Montserrat", "JakartaExt", "Symbols"];

let registered = false;

export function registerFonts() {
  if (registered) return;
  registered = true;

  Font.register({
    family: "Jakarta",
    fonts: [400, 500, 600, 700].map((w) => ({
      src: files("plus-jakarta-sans", `plus-jakarta-sans-latin-${w}-normal.woff`),
      fontWeight: w,
    })),
  });
  Font.register({
    family: "JakartaExt",
    fonts: [400, 700].map((w) => ({
      src: files("plus-jakarta-sans", `plus-jakarta-sans-latin-ext-${w}-normal.woff`),
      fontWeight: w,
    })),
  });
  Font.register({
    family: "Montserrat",
    fonts: [600, 700].map((w) => ({
      src: files("montserrat", `montserrat-latin-${w}-normal.woff`),
      fontWeight: w,
    })),
  });
  Font.register({
    family: "Symbols",
    src: files("noto-sans-symbols-2", "noto-sans-symbols-2-symbols-400-normal.woff"),
  });

  // Product names and figures broken with a hyphen read as typos in print.
  Font.registerHyphenationCallback((word) => [word]);
}
