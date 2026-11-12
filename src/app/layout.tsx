import type { Metadata } from "next";
import Script from "next/script";
import { Bricolage_Grotesque, Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import Footer from "../components/site/Footer";
import BarreMobile from "../components/site/BarreMobile";
import Header from "../components/site/Header";
import Mouvement from "../components/motion/Mouvement";
import WhatsAppFlottant from "../components/site/WhatsAppFlottant";
import { MARQUE } from "../lib/site/marque";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Titres : grotesque expressive, avec l'axe de largeur pour les capitales serrées du hero.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["opsz", "wdth"],
  display: "swap",
});

// Accent : le mot en italique dans un titre.
const instrument = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://elembo.vercel.app"),
  title: {
    default: MARQUE.titre,
    template: "%s · Elembo",
  },
  description: MARQUE.description,
  applicationName: "Elembo",
  authors: [{ name: MARQUE.editeur }],
  openGraph: {
    type: "website",
    locale: "fr_CG",
    siteName: "Elembo",
    title: MARQUE.titre,
    description: MARQUE.descriptionCourte,
    images: [{ url: "/mockups/tshirt-studio.jpg", width: 1600, height: 1067, alt: "T-shirt personnalisable Elembo" }],
  },
  twitter: {
    card: "summary_large_image",
    title: MARQUE.titre,
    description: MARQUE.descriptionCourte,
    images: ["/mockups/tshirt-studio.jpg"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // Polices du configurateur : fichiers locaux (public/fonts), chargés sous un chemin
  // relatif au basePath du déploiement — le navigateur ne télécharge une police que
  // lorsqu'elle est réellement utilisée (aucun préchargement des 17 familles).
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${geistMono.variable} ${bricolage.variable} ${instrument.variable} h-full antialiased`}
    >
      <head>
        <link rel="stylesheet" href={`${basePath}/fonts/fonts.css`} />
        {/*
          Adresse du service de paiement, modifiable sans reconstruire le site
          (voir public/api-config.js) : elle rebranche la boutique sur le tunnel courant.
          Chargée après l'interactivité (la valeur n'est lue qu'au moment de payer), via
          `next/script` — une balise <script> rendue par React déclenche un avertissement
          d'hydratation.
        */}
        <Script src={`${basePath}/api-config.js`} strategy="afterInteractive" />
      </head>
      <body className="flex min-h-full flex-col bg-creme text-encre">
        <a href="#contenu" className="lien-evitement">
          Aller au contenu
        </a>
        <Header />
        <main id="contenu" className="flex-1">
          {children}
        </main>
        <Footer />
        <WhatsAppFlottant />
        <BarreMobile />
        <Mouvement />
      </body>
    </html>
  );
}
