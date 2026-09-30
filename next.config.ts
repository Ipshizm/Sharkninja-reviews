import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The PDF report reads its fonts from disk at run time (lib/report/fonts.ts);
  // nothing imports them, so file tracing has to be told to ship them.
  outputFileTracingIncludes: {
    "/report": [
      "./node_modules/@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-{400,500,600,700}-normal.woff",
      "./node_modules/@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-ext-{400,700}-normal.woff",
      "./node_modules/@fontsource/montserrat/files/montserrat-latin-{600,700}-normal.woff",
      "./node_modules/@fontsource/noto-sans-symbols-2/files/noto-sans-symbols-2-symbols-400-normal.woff",
    ],
  },
};

export default nextConfig;
