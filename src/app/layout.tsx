import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Footer from "../components/site/Footer";
import Header from "../components/site/Header";
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
      </body>
    </html>
  );
}
