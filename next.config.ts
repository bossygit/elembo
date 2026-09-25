import type { NextConfig } from "next";

const isProd = process.env.DEPLOY_TARGET === "gh-pages";

// GitHub Pages : export statique + basePath /elembo (servi sous bossygit.github.io/elembo/).
// NEXT_PUBLIC_BASE_PATH préfixe les chemins public/ dans src/lib/products.ts — sans lui,
// les mockups résolvent en 404 sous Pages (piège : le catch silencieux laisse un canvas vide).
// DEPLOY_TARGET=gh-pages npm run build → out/ ; sinon build standard (Vercel-ready).
const nextConfig: NextConfig = isProd
  ? {
      output: "export",
      basePath: "/elembo",
      images: { unoptimized: true },
      env: { NEXT_PUBLIC_BASE_PATH: "/elembo" },
    }
  : {};

export default nextConfig;
