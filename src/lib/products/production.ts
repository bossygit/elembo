// Profils de production — ce que l'atelier peut RÉELLEMENT imprimer.
//
// L'atelier 3D laisse composer sur toutes les zones du vêtement : c'est un outil de
// création. Ce module distingue cette liberté de la réalité de fabrication : pour chaque
// procédé (DTF, flex, DTG, sublimation…), quelles zones sont imprimables, à quelle taille
// et où. Les valeurs vivent dans la source unique `production/profils.json` : aucune
// dimension de production n'est écrite ailleurs dans le code.
//
// Règle : une zone n'est COMMANDABLE que si son procédé ET la zone elle-même sont
// « disponible ». « a-valider » permet de composer et de prévisualiser, jamais de payer.

import brut from '../../../production/profils.json';
import type { Side } from '../../types/configurator';
import { SIDE_LABELS, SIDES } from '../../types/configurator';

export type StatutProduction = 'disponible' | 'a-valider' | 'indisponible';
/** Point de référence mesuré sur le modèle 3D (voir `ZoneModel.reperesCm`). */
export type RepereZone = 'col' | 'epaule' | 'haut';

export type ZoneProduction = {
  statut: StatutProduction;
  /** Zone imprimable maximale, en cm. Ignorée si `pleine`. */
  largeurCm?: number;
  hauteurCm?: number;
  /** Le haut de la zone imprimable est placé à `hautCm` sous ce repère. */
  repere?: RepereZone;
  hautCm?: number;
  /** Décalage horizontal depuis l'axe médian (cm, positif vers la droite de l'image). */
  decalageXCm?: number;
  /** Toute la pièce est imprimable (impression avant assemblage). */
  pleine?: boolean;
  note?: string;
};

export type ProfilProduction = {
  id: string;
  nom: string;
  description: string;
  statut: StatutProduction;
  note?: string;
  /** Densité des fichiers de production. */
  dpi: number;
  zones: Partial<Record<Side, ZoneProduction>>;
};

type FichierProfils = { version: number; parDefaut: string; profils: ProfilProduction[] };

const fichier = brut as unknown as FichierProfils;

export const PROFILS: ProfilProduction[] = fichier.profils;

export const PROFIL_PAR_DEFAUT: ProfilProduction =
  PROFILS.find((p) => p.id === fichier.parDefaut) ?? PROFILS[0];

/** Profil par identifiant ; un identifiant inconnu retombe sur le profil par défaut. */
export function profilParId(id: string | undefined | null): ProfilProduction {
  return PROFILS.find((p) => p.id === id) ?? PROFIL_PAR_DEFAUT;
}

export function zoneProduction(profil: ProfilProduction, side: Side): ZoneProduction | null {
  return profil.zones[side] ?? null;
}

/**
 * Statut EFFECTIF d'une zone : le moins favorable entre celui du procédé et celui de la
 * zone (un procédé indisponible rend toutes ses zones indisponibles).
 */
export function statutZone(profil: ProfilProduction, side: Side): StatutProduction {
  const zone = profil.zones[side];
  if (!zone) return 'indisponible';
  const rang: Record<StatutProduction, number> = { disponible: 0, 'a-valider': 1, indisponible: 2 };
  return rang[profil.statut] >= rang[zone.statut] ? profil.statut : zone.statut;
}

/** Une zone peut-elle être commandée (payée) avec ce procédé ? */
export function zoneCommandable(profil: ProfilProduction, side: Side): boolean {
  return statutZone(profil, side) === 'disponible';
}

/** Zones proposées par le procédé (celles qui ont une configuration). */
export function zonesProposees(profil: ProfilProduction): Side[] {
  return SIDES.filter((side) => Boolean(profil.zones[side]));
}

/**
 * Motifs qui empêchent de COMMANDER les zones personnalisées avec ce procédé.
 *
 * On ne bloque que ce qui est réellement personnalisé : une zone « à valider » vide ne
 * gêne pas. Le but est de ne jamais encaisser un visuel que l'atelier ne sait pas
 * produire — plutôt que de le découvrir après paiement.
 */
export function empechementsCommande(profil: ProfilProduction, sidesPersonnalisees: Side[]): string[] {
  const motifs: string[] = [];
  if (profil.statut !== 'disponible') {
    motifs.push(
      `Le procédé « ${profil.nom} » n’est pas encore proposé à la commande${
        profil.note ? ` (${profil.note})` : ''
      }.`,
    );
    return motifs;
  }
  for (const side of sidesPersonnalisees) {
    const statut = statutZone(profil, side);
    if (statut === 'disponible') continue;
    const motif = motifZone(profil, side);
    motifs.push(`${SIDE_LABELS[side]} : ${motif ?? LIBELLE_STATUT[statut]}`);
  }
  return motifs;
}

export const LIBELLE_STATUT: Record<StatutProduction, string> = {
  disponible: 'Imprimable',
  'a-valider': 'À valider par l’atelier',
  indisponible: 'Non proposé',
};

/** Explication courte et honnête d'une zone non commandable. */
export function motifZone(profil: ProfilProduction, side: Side): string | null {
  const statut = statutZone(profil, side);
  if (statut === 'disponible') return null;
  if (profil.statut !== 'disponible') {
    return `${profil.nom} : ${profil.note ?? 'procédé non proposé pour l’instant.'}`;
  }
  return profil.zones[side]?.note ?? `Zone non imprimable en ${profil.nom} pour l’instant.`;
}

/** Valide le fichier de profils (tests, et avant toute modification). */
export function validerProfils(profils: ProfilProduction[] = PROFILS): string[] {
  const erreurs: string[] = [];
  const ids = new Set<string>();
  const statuts: StatutProduction[] = ['disponible', 'a-valider', 'indisponible'];
  for (const p of profils) {
    if (!p.id || ids.has(p.id)) erreurs.push(`profil ${p.id || '(sans id)'} : identifiant manquant ou en double`);
    ids.add(p.id);
    if (!statuts.includes(p.statut)) erreurs.push(`profil ${p.id} : statut inconnu ${p.statut}`);
    if (!(p.dpi >= 72 && p.dpi <= 1200)) erreurs.push(`profil ${p.id} : dpi invalide (${p.dpi})`);
    for (const [cle, z] of Object.entries(p.zones)) {
      if (!SIDES.includes(cle as Side)) erreurs.push(`profil ${p.id} : zone inconnue « ${cle} »`);
      if (!z) continue;
      if (!statuts.includes(z.statut)) erreurs.push(`profil ${p.id}/${cle} : statut inconnu ${z.statut}`);
      if (!z.pleine) {
        if (!((z.largeurCm ?? 0) > 0) || !((z.hauteurCm ?? 0) > 0)) {
          erreurs.push(`profil ${p.id}/${cle} : dimensions manquantes`);
        }
        if (!z.repere || !['col', 'epaule', 'haut'].includes(z.repere)) {
          erreurs.push(`profil ${p.id}/${cle} : repère manquant ou inconnu`);
        }
        if (!(Number(z.hautCm) >= 0)) erreurs.push(`profil ${p.id}/${cle} : hautCm manquant`);
      }
    }
  }
  if (!profils.some((p) => p.statut === 'disponible')) erreurs.push('aucun procédé disponible');
  return erreurs;
}
