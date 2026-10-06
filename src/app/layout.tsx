import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Elembo — Print-on-Demand local",
  description:
    "Uploadez votre design, voyez-le imprimé : t-shirts, casquettes et tableaux personnalisés, livrés à Brazzaville et Pointe-Noire. Par Smart Vision Congo.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // Polices du configurateur : fichiers locaux (public/fonts), chargés sous un chemin
  // relatif au basePath du déploiement — le navigateur ne télécharge une police que
  // lorsqu'elle est réellement utilisée (aucun préchargement des 17 familles).
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="stylesheet" href={`${basePath}/fonts/fonts.css`} />
        {/* Adresse du service de paiement, modifiable sans reconstruire le site
            (voir public/api-config.js) : c'est elle qui rebranche la boutique sur
            le tunnel courant. Absente ou vide → adresse compilée dans le bundle.
            `defer` : la valeur n'est lue qu'au moment de payer, donc inutile de
            bloquer l'analyse de la page (et c'est ce que la règle Next exige). */}
        <script src={`${basePath}/api-config.js`} defer />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
