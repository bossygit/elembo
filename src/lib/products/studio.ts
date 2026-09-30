// Catalogue produits Elembo — zones d'impression normalisées (technique Printful).
// Une zone est relative à la PHOTO de mockup (0..1) : {x, y} = coin haut-gauche,
// {w, h} = taille. Le rendu convertit en pixels canvas via printArea.ts.

export type Zone = { x: number; y: number; w: number; h: number };

export type ProductDef = {
  id: string;
  label: string;
  mockup: string; // chemin public de la photo de mockup
  zone: Zone; // zone d'impression normalisée 0..1
  zoneCm: { w: number; h: number }; // taille physique IMPRIMABLE de la zone (cm) — sert au calcul des dpi
  accent: string; // couleur d'accent UI (aplats, pas de dégradés)
};

// ⚠️ INVARIANT : la conversion pixels → centimètres doit être isotrope, donc
// `zoneCm.w / zoneCm.h` DOIT être égal au ratio de la zone dans la photo, c'est-à-dire
// (zone.w × largeurPx) / (zone.h × hauteurPx). Sinon un visuel carré s'imprime en
// rectangle et le bon à tirer ne correspond plus au tirage. Le test
// tests/printPhysics.test.ts valide cet invariant contre les vrais PNG : si vous
// remplacez une photo de mockup ou déplacez une zone, ajustez zoneCm — le test
// échouera sinon, c'est voulu.
//
// Tailles physiques de référence : les valeurs ci-dessous sont calées sur des
// formats réels (A4 textile, panneau avant de casquette, affiche 24×43). Elles sont
// à confirmer sur la presse VEVOR et les supports réellement utilisés.
export const PRODUCTS: ProductDef[] = [
  {
    id: 'tshirt',
    label: 'T-shirt',
    mockup: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/mockups/tshirt-blanc.png`, // 1200×1400
    zone: { x: 0.36, y: 0.28, w: 0.28, h: 0.28 }, // poitrine, face → zone photo 336×392 px (ratio 0,857)
    zoneCm: { w: 24, h: 28 }, // ≈ format A4 portrait
    accent: '#E85F00',
  },
  {
    id: 'casquette',
    label: 'Casquette',
    mockup: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/mockups/casquette-blanche.png`, // 1200×900
    zone: { x: 0.4, y: 0.35, w: 0.2, h: 0.16 }, // panneau avant → zone photo 240×144 px (ratio 1,667)
    zoneCm: { w: 12, h: 7.2 }, // panneau avant de casquette
    accent: '#200233',
  },
  {
    id: 'tableau',
    label: 'Tableau',
    mockup: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/mockups/tableau-mural.png`, // 1000×1300
    zone: { x: 0.3, y: 0.18, w: 0.4, h: 0.55 }, // cadre vertical → zone photo 400×715 px (ratio 0,559)
    zoneCm: { w: 24, h: 42.9 }, // affiche verticale
    accent: '#0E7C66',
  },
];

export function getProduct(id: string): ProductDef | undefined {
  return PRODUCTS.find((p) => p.id === id);
}
