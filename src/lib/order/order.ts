// Commande et production — logique pure, testable sans navigateur.
//
// Le tunnel visé (spec validée) :
//   l'utilisateur personnalise → il VALIDE ce qu'il voit → il passe commande
//   (quantité, tailles, couleur, ville) → Elembo génère un PNG PAR FACE personnalisée
//   → une FICHE DE PRODUCTION accompagne les fichiers pour l'atelier (positionnement,
//   tailles, textes, couleurs) → paiement MoMo MTN en FCFA → livraison ≤ 3 jours.
//
// Ce module ne fait aucun rendu : il calcule les positions en centimètres, le récapitulatif,
// les frais et le délai. Le rendu des PNG est dans lib/canvas/export.ts.

import type { DesignElement, Side, TextElement } from '../../types/configurator';
import { SIDES } from '../../types/configurator';
import type { PrintArea, Product } from '../products/catalog';
import { compositionSize, elementRect, elementsOfSide, printAreaRect, productionTextureSize } from '../canvas/design-canvas';
import type { Measurer, CanvasSpace } from '../canvas/design-canvas';
import { resolveFont } from '../fonts';

/* -------------------------------------------------------------- livraison ------ */

/**
 * Villes desservies. Brazzaville : 1 000 FCFA (tarif confirmé). Pointe-Noire : tarif à
 * confirmer — la commande est bloquée tant qu'il n'est pas défini, plutôt que d'inventer
 * un montant que le client paierait.
 */
export type DeliveryCity = 'brazzaville' | 'pointe-noire';

export type DeliveryOption = {
  city: DeliveryCity;
  label: string;
  /** Frais de livraison en FCFA ; null = à confirmer. */
  feeFcfa: number | null;
  /** Délai maximum annoncé, en jours. */
  maxDays: number;
};

export const DELIVERY: DeliveryOption[] = [
  { city: 'brazzaville', label: 'Brazzaville', feeFcfa: 1000, maxDays: 3 },
  { city: 'pointe-noire', label: 'Pointe-Noire', feeFcfa: null, maxDays: 3 },
];

export function deliveryOption(city: DeliveryCity): DeliveryOption {
  return DELIVERY.find((d) => d.city === city) ?? DELIVERY[0];
}

/**
 * Délai de livraison estimé : il varie avec la quantité, mais **jamais plus de 3 jours**
 * (engagement validé). Le palier est volontairement simple et lisible pour le client.
 */
export function deliveryDays(quantity: number, city: DeliveryCity = 'brazzaville'): number {
  const max = deliveryOption(city).maxDays;
  const q = Math.max(1, Math.floor(quantity));
  const jours = q <= 5 ? 1 : q <= 20 ? 2 : 3;
  return Math.min(jours, max);
}

/* ------------------------------------------------------------------ prix ------ */

export const SIZE_ORDER = ['S', 'M', 'L', 'XL', 'XXL', '3XL'] as const;
export type GarmentSize = (typeof SIZE_ORDER)[number];

export type SizeLine = { size: GarmentSize; quantity: number };

export function totalQuantity(lines: SizeLine[]): number {
  return lines.reduce((total, l) => total + Math.max(0, Math.floor(l.quantity)), 0);
}

export type OrderTotals = {
  quantity: number;
  unitPriceFcfa: number | null;
  itemsSubtotalFcfa: number | null;
  shippingFcfa: number | null;
  totalFcfa: number | null;
  /** Message expliquant ce qui manque pour pouvoir encaisser, le cas échéant. */
  blockedBy: string[];
};

/** Récapitulatif chiffré en FCFA. Aucun montant n'est inventé : ce qui manque est signalé. */
export function orderTotals(params: {
  lines: SizeLine[];
  unitPriceFcfa: number | null;
  city: DeliveryCity;
}): OrderTotals {
  const quantity = totalQuantity(params.lines);
  const shipping = deliveryOption(params.city).feeFcfa;
  const blockedBy: string[] = [];

  if (quantity <= 0) blockedBy.push('aucune quantité saisie');
  if (params.unitPriceFcfa === null) blockedBy.push('prix unitaire du produit non défini dans le catalogue');
  if (shipping === null) blockedBy.push(`frais de livraison à confirmer pour ${deliveryOption(params.city).label}`);

  const subtotal = params.unitPriceFcfa === null ? null : params.unitPriceFcfa * quantity;
  const total = subtotal === null || shipping === null ? null : subtotal + shipping;

  return {
    quantity,
    unitPriceFcfa: params.unitPriceFcfa,
    itemsSubtotalFcfa: subtotal,
    shippingFcfa: shipping,
    totalFcfa: total,
    blockedBy,
  };
}

/** Formatage FCFA (le séparateur de milliers n'est pas une virgule décimale ici). */
export function formatFcfa(montant: number | null): string {
  if (montant === null) return 'à confirmer';
  return `${montant.toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ')} FCFA`;
}

/* ------------------------------------------------ positionnement imprimable ----- */

/**
 * Placement d'un élément exprimé en CENTIMÈTRES par rapport au coin haut-gauche de la zone
 * d'impression : c'est la seule unité qu'un imprimeur peut exploiter directement (les
 * fractions de zone ne veulent rien dire pour lui).
 */
export type PlacementCm = {
  id: string;
  type: DesignElement['type'];
  /** Centre de l'élément, en cm depuis le bord gauche / le bord haut de la zone. */
  centreXCm: number;
  centreYCm: number;
  /** Dimensions de l'élément, en cm, rotation non comprise. */
  largeurCm: number;
  hauteurCm: number;
  /** Débordement : true si l'élément dépasse la zone (donc rogné à l'impression). */
  rogne: boolean;
  rotationDeg: number;
  visible: boolean;
  texte?: {
    contenu: string;
    police: string;
    graisse: number;
    italique: boolean;
    /** Hauteur de capitale utile, en cm (taille de police rapportée à la zone). */
    corpsCm: number;
    couleur: string;
    alignement: TextElement['align'];
    interlignage: number;
    interlettrage: number;
  };
  image?: { nom: string; largeurNativePx: number; hauteurNativePx: number; dpiEstime: number };
};

export function placementCm(
  el: DesignElement,
  area: PrintArea,
  measure: Measurer,
  space: CanvasSpace = compositionSize(area),
): PlacementCm {
  const zone = printAreaRect(area, space);
  const rect = elementRect(el, area, space, measure);
  const cmParPxX = area.cmWidth / zone.w;
  const cmParPxY = area.cmHeight / zone.h;
  const largeurCm = rect.w * cmParPxX;
  const hauteurCm = rect.h * cmParPxY;

  const placement: PlacementCm = {
    id: el.id,
    type: el.type,
    centreXCm: round2((rect.x + rect.w / 2 - zone.x) * cmParPxX),
    centreYCm: round2((rect.y + rect.h / 2 - zone.y) * cmParPxY),
    largeurCm: round2(largeurCm),
    hauteurCm: round2(hauteurCm),
    rogne: rect.x < zone.x - 0.5 || rect.y < zone.y - 0.5 || rect.x + rect.w > zone.x + zone.w + 0.5 || rect.y + rect.h > zone.y + zone.h + 0.5,
    rotationDeg: el.rotation,
    visible: el.visible,
  };

  if (el.type === 'text') {
    const font = resolveFont(el.fontId);
    placement.texte = {
      contenu: el.content,
      police: font.name,
      graisse: el.fontWeight,
      italique: el.fontStyle === 'italic',
      corpsCm: round2((el.fontSize * (space.width / 1024) * cmParPxY) / 1),
      couleur: el.color,
      alignement: el.align,
      interlignage: el.lineHeight,
      interlettrage: el.letterSpacing,
    };
  } else {
    const dpi = largeurCm > 0 ? Math.round((el.width / (largeurCm / 2.54))) : 0;
    placement.image = {
      nom: el.name,
      largeurNativePx: el.width,
      hauteurNativePx: el.height,
      dpiEstime: dpi,
    };
  }
  return placement;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/* ------------------------------------------------------- fiche de production ---- */

export type ProductionFace = {
  side: Side;
  label: string;
  fichier: string;
  /** Dimensions du fichier d'impression et de la zone physique. */
  pixels: { w: number; h: number };
  zoneCm: { w: number; h: number };
  placements: PlacementCm[];
};

export type ProductionSheet = {
  version: 1;
  commande: string;
  date: string;
  produit: { id: string; nom: string; couleur: string; technique: string };
  tailleEtQuantite: { lignes: SizeLine[]; total: number };
  livraison: { ville: string; fraisFcfa: number | null; delaiJours: number };
  paiement: { moyen: string; devise: string; montantFcfa: number | null };
  faces: ProductionFace[];
  consignes: string[];
};

/** Texte lisible (pour WhatsApp/e-mail à l'atelier) à partir de la même donnée. */
export function productionSheetText(sheet: ProductionSheet): string {
  const lignes: string[] = [];
  lignes.push(`FICHE DE PRODUCTION — ${sheet.commande}`);
  lignes.push(`Émise le ${sheet.date}`);
  lignes.push('');
  lignes.push(`Produit      : ${sheet.produit.nom} (${sheet.produit.id})`);
  lignes.push(`Couleur      : ${sheet.produit.couleur}`);
  lignes.push(`Technique    : ${sheet.produit.technique}`);
  lignes.push(
    `Tailles      : ${sheet.tailleEtQuantite.lignes.map((l) => `${l.size}×${l.quantity}`).join(', ')} — total ${sheet.tailleEtQuantite.total} pièce(s)`,
  );
  lignes.push(
    `Livraison    : ${sheet.livraison.ville} — ${formatFcfa(sheet.livraison.fraisFcfa)} — sous ${sheet.livraison.delaiJours} jour(s)`,
  );
  lignes.push(`Paiement     : ${sheet.paiement.moyen} (${sheet.paiement.devise}) — ${formatFcfa(sheet.paiement.montantFcfa)}`);
  lignes.push('');

  for (const face of sheet.faces) {
    lignes.push(
      `--- ${face.label.toUpperCase()} — zone ${face.zoneCm.w} × ${face.zoneCm.h} cm — ${face.fichier} (${face.pixels.w} × ${face.pixels.h} px, 300 dpi, fond transparent) ---`,
    );
    if (!face.placements.length) {
      lignes.push('  (aucun élément)');
    }
    face.placements
      .filter((p) => p.visible)
      .forEach((p, i) => {
        if (p.texte) {
          const t = p.texte;
          lignes.push(
            `  ${i + 1}. TEXTE « ${t.contenu.replace(/\n/g, ' / ')} » — ${t.police} ${t.graisse}${t.italique ? ' italique' : ''}, corps ${t.corpsCm} cm, couleur ${t.couleur}, alignement ${t.alignement}`,
          );
        } else if (p.image) {
          lignes.push(
            `  ${i + 1}. IMAGE ${p.image.nom} (${p.image.largeurNativePx}×${p.image.hauteurNativePx} px, ≈ ${p.image.dpiEstime} dpi à la taille finale)`,
          );
        }
        lignes.push(
          `     taille ${p.largeurCm} × ${p.hauteurCm} cm — centre à ${p.centreXCm} cm du bord gauche et ${p.centreYCm} cm du bord haut${p.rotationDeg ? ` — rotation ${p.rotationDeg}°` : ''}${p.rogne ? ' — ⚠ DÉBORDE (sera rogné)' : ''}`,
        );
      });
    lignes.push('');
  }

  lignes.push('CONSIGNES');
  sheet.consignes.forEach((c) => lignes.push(`  • ${c}`));
  return lignes.join('\n');
}

/* --------------------------------------------------------------- commande ------ */

export type OrderDraft = {
  reference: string;
  product: Product;
  color: string;
  lines: SizeLine[];
  city: DeliveryCity;
  /** Prix unitaire TTC en FCFA, hors livraison. */
  unitPriceFcfa: number | null;
  elements: DesignElement[];
  measure: Measurer;
};

/** Fiches et fichiers à produire : uniquement les faces réellement personnalisées. */
export function facesToProduce(order: Pick<OrderDraft, 'elements'>): Side[] {
  return SIDES.filter((side) =>
    elementsOfSide(order.elements, side).some((el) => el.visible !== false),
  );
}

export function buildProductionSheet(order: OrderDraft, date = new Date()): ProductionSheet {
  const faces: ProductionFace[] = [];
  const totals = orderTotals({ lines: order.lines, unitPriceFcfa: order.unitPriceFcfa, city: order.city });

  for (const side of facesToProduce(order)) {
    const area = order.product.printAreas[side];
    if (!area) continue;
    const space = compositionSize(area);
    faces.push({
      side,
      label: side === 'front' ? 'Face avant' : 'Face arrière',
      fichier: `${order.reference}-${side === 'front' ? 'avant' : 'arriere'}.png`,
      pixels: { w: productionTextureSize(area).w, h: productionTextureSize(area).h },
      zoneCm: { w: area.cmWidth, h: area.cmHeight },
      placements: elementsOfSide(order.elements, side)
        .filter((el) => el.visible !== false)
        .map((el) => placementCm(el, area, order.measure, space)),
    });
  }

  return {
    version: 1,
    commande: order.reference,
    date: date.toISOString().slice(0, 10),
    produit: {
      id: order.product.id,
      nom: order.product.name,
      couleur: order.color,
      technique: 'DTF (transfert à chaud)',
    },
    tailleEtQuantite: { lignes: order.lines, total: totals.quantity },
    livraison: {
      ville: deliveryOption(order.city).label,
      fraisFcfa: totals.shippingFcfa,
      delaiJours: deliveryDays(totals.quantity, order.city),
    },
    paiement: { moyen: 'MTN Mobile Money (MoMo)', devise: 'FCFA', montantFcfa: totals.totalFcfa },
    faces,
    consignes: [
      'Imprimer les fichiers fournis (PNG 300 dpi, fond transparent) sans les redimensionner ni les recadrer.',
      'Respecter le positionnement indiqué en centimètres depuis le coin haut-gauche de la zone d’impression.',
      'Technique : DTF — découpe au contour, pressage à ajuster selon les tests de la presse.',
      'Envoyer un BAT photographique avant expédition si la quantité dépasse 10 pièces.',
    ],
  };
}

/** Référence de commande lisible : ELB-AAAAMMJJ-HHMM-XX. */
export function makeReference(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const jour = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`;
  const heure = `${p(date.getHours())}${p(date.getMinutes())}`;
  const suffixe = Math.random().toString(36).slice(2, 4).toUpperCase();
  return `ELB-${jour}-${heure}-${suffixe}`;
}
