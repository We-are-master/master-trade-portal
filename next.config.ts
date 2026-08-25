import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

// Pin the workspace root to this project — a parent package-lock.json exists in the
// home directory, which would otherwise make Next infer the wrong root.
const root = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: { root },
  // Lets a second `next dev` run from this checkout (a demo server alongside the
  // one you are already using) — two instances cannot share one build dir.
  // Unset means the usual `.next`, so a plain `npm run dev` is unaffected.
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
};

export default nextConfig;
