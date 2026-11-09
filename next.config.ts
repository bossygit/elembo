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
  // Ne pas révéler la stack dans les réponses.
  poweredByHeader: false,
  async headers() {
    const communs: { key: string; value: string }[] = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=(), payment=()",
      },
    ];
    // HSTS seulement en production : en développement, forcer HTTPS casserait `next dev`.
    if (process.env.NODE_ENV === "production") {
      communs.push({ key: "Strict-Transport-Security", value: "max-age=63072000" });
    }
    return [
      { source: "/:path*", headers: communs },
      // Les réponses d'API ne doivent jamais être mises en cache par un intermédiaire :
      // elles contiennent des statuts de paiement et des dossiers de commande.
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
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
