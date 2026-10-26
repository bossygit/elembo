import type { NextConfig } from "next";

const isProd = process.env.DEPLOY_TARGET === "gh-pages";

// GitHub Pages : export statique + basePath /elembo (servi sous bossygit.github.io/elembo/).
// NEXT_PUBLIC_BASE_PATH préfixe les chemins public/ dans src/lib/products.ts — sans lui,
// les mockups résolvent en 404 sous Pages (piège : le catch silencieux laisse un canvas vide).
// DEPLOY_TARGET=gh-pages npm run build → out/ ; sinon build standard (Vercel, routes API comprises).
const nextConfig: NextConfig = {
  // `ioredis` garde ses `require` internes (commandes dynamiques) : le laisser hors du bundle
  // serveur évite des erreurs de résolution à l'exécution dans les fonctions Vercel.
  serverExternalPackages: ["ioredis"],
  ...(isProd
    ? {
        output: "export" as const,
        basePath: "/elembo",
        // Export statique : sans trailingSlash, Next écrit « configurator.html » et
        // « /elembo/configurator/ » (barre oblique finale) tombe en 404 sur GitHub Pages.
        trailingSlash: true,
        images: { unoptimized: true },
        env: { NEXT_PUBLIC_BASE_PATH: "/elembo" },
      }
    : {}),
};

export default nextConfig;
