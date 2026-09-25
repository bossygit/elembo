// Catalogue produits Elembo — zones d'impression normalisées (technique Printful).
// Une zone est relative à la PHOTO de mockup (0..1) : {x, y} = coin haut-gauche,
// {w, h} = taille. Le rendu convertit en pixels canvas via printArea.ts.

export type Zone = { x: number; y: number; w: number; h: number };

export type ProductDef = {
  id: string;
  label: string;
  mockup: string; // chemin public de la photo de mockup
  zone: Zone; // zone d'impression normalisée 0..1
  accent: string; // couleur d'accent UI (aplats, pas de dégradés)
};

export const PRODUCTS: ProductDef[] = [
  {
    id: 'tshirt',
    label: 'T-shirt',
    mockup: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/mockups/tshirt-blanc.png`,
    zone: { x: 0.36, y: 0.28, w: 0.28, h: 0.28 }, // poitrine, face
    accent: '#E85F00',
  },
  {
    id: 'casquette',
    label: 'Casquette',
    mockup: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/mockups/casquette-blanche.png`,
    zone: { x: 0.4, y: 0.35, w: 0.2, h: 0.16 }, // panneau avant
    accent: '#200233',
  },
  {
    id: 'tableau',
    label: 'Tableau',
    mockup: `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/mockups/tableau-mural.png`,
    zone: { x: 0.3, y: 0.18, w: 0.4, h: 0.55 }, // cadre vertical
    accent: '#0E7C66',
  },
];

export function getProduct(id: string): ProductDef | undefined {
  return PRODUCTS.find((p) => p.id === id);
}
