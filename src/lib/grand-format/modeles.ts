/**
 * Modèles d'inspiration des banderoles. Ce sont des compositions ORIGINALES (noms, lieux et
 * organisations fictifs), rendues en direct par `ApercuBanderole` : aucun visuel tiers, aucune
 * photo de stock. Le client s'en inspire ; le studio adapte ensuite le visuel à sa demande.
 */

import type { UsageId } from './catalogue';

export type RoleLigne = 'surtitre' | 'titre' | 'citation' | 'detail' | 'signature';
export type Motif = 'croix' | 'anneaux' | 'ruban' | 'eclat' | 'bougie' | 'etoile';

export type ModeleBanderole = {
  id: string;
  usage: UsageId;
  nom: string;
  format: { largeurM: number; hauteurM: number };
  palette: { fond: string; texte: string; accent: string; filet?: string };
  /** `accent` = serif italique (hommage, mariage) ; `display` = grotesque grasse (annonce). */
  police: 'display' | 'accent';
  motif?: Motif;
  portrait?: boolean;
  lignes: { texte: string; role: RoleLigne }[];
};

export const MODELES: ModeleBanderole[] = [
  {
    id: 'hommage-papa',
    usage: 'DEUIL',
    nom: 'Hommage sobre',
    format: { largeurM: 3, hauteurM: 1 },
    palette: { fond: 'linear-gradient(135deg, #0d0b10 0%, #26202d 100%)', texte: '#fbf7ee', accent: '#d9c08a', filet: '#d9c08a' },
    police: 'accent',
    portrait: true,
    lignes: [
      { texte: 'Hommage à notre regretté', role: 'surtitre' },
      { texte: 'Papa Joseph Malonga', role: 'titre' },
      { texte: '1951 — 2026', role: 'detail' },
      { texte: '« Tu resteras à jamais dans nos cœurs »', role: 'citation' },
      { texte: 'Les familles Malonga, Bouanga et alliées', role: 'signature' },
    ],
  },
  {
    id: 'retrait-deuil',
    usage: 'DEUIL',
    nom: 'Retrait de deuil',
    format: { largeurM: 4, hauteurM: 1 },
    palette: { fond: '#f6f3ee', texte: '#110d15', accent: '#5b3f8c', filet: '#5b3f8c' },
    police: 'accent',
    motif: 'bougie',
    lignes: [
      { texte: 'Cérémonie de retrait de deuil', role: 'surtitre' },
      { texte: 'Maman Henriette Nkounkou', role: 'titre' },
      { texte: '« Heureux ceux qui pleurent, car ils seront consolés » — Matthieu 5:4', role: 'citation' },
      { texte: 'Samedi 6 décembre · Domicile familial, Bacongo', role: 'detail' },
    ],
  },
  {
    id: 'croisade',
    usage: 'EGLISE',
    nom: 'Grande croisade',
    format: { largeurM: 5, hauteurM: 1 },
    palette: { fond: 'linear-gradient(120deg, #1a1f8f 0%, #2b44ff 55%, #6b3df0 100%)', texte: '#ffffff', accent: '#ffc83d' },
    police: 'display',
    motif: 'croix',
    lignes: [
      { texte: 'Église La Source de Vie présente', role: 'surtitre' },
      { texte: 'Grande croisade d’évangélisation', role: 'titre' },
      { texte: '« Jésus-Christ est le même hier, aujourd’hui et éternellement » — Hébreux 13:8', role: 'citation' },
      { texte: 'Du 12 au 15 décembre · 16 h · Esplanade de Moungali', role: 'detail' },
    ],
  },
  {
    id: 'convention',
    usage: 'EGLISE',
    nom: 'Convention',
    format: { largeurM: 4, hauteurM: 1.2 },
    palette: { fond: 'linear-gradient(135deg, #0f6b4c 0%, #0b4a36 100%)', texte: '#fbf7ee', accent: '#d9f24a' },
    police: 'display',
    motif: 'etoile',
    lignes: [
      { texte: 'Convention des femmes 2026', role: 'surtitre' },
      { texte: 'Lève-toi, resplendis !', role: 'titre' },
      { texte: 'Ésaïe 60:1', role: 'citation' },
      { texte: '3 jours de louange, d’enseignement et de communion', role: 'detail' },
    ],
  },
  {
    id: 'mariage',
    usage: 'EVENEMENT',
    nom: 'Bienvenue au mariage',
    format: { largeurM: 3, hauteurM: 1.5 },
    palette: { fond: 'linear-gradient(160deg, #fbf7ee 0%, #f1eadc 100%)', texte: '#3a2a17', accent: '#b8862b', filet: '#b8862b' },
    police: 'accent',
    motif: 'anneaux',
    lignes: [
      { texte: 'Bienvenue au mariage de', role: 'surtitre' },
      { texte: 'Grâce & Junior', role: 'titre' },
      { texte: 'Samedi 20 décembre 2026', role: 'detail' },
      { texte: 'Merci de partager ce jour avec nous', role: 'citation' },
    ],
  },
  {
    id: 'anniversaire',
    usage: 'EVENEMENT',
    nom: 'Anniversaire',
    format: { largeurM: 3, hauteurM: 1 },
    palette: { fond: 'linear-gradient(120deg, #ff4f8b 0%, #ff5a12 100%)', texte: '#ffffff', accent: '#110d15' },
    police: 'display',
    motif: 'eclat',
    lignes: [
      { texte: 'Joyeux anniversaire', role: 'surtitre' },
      { texte: '50 ans, Maman Odile !', role: 'titre' },
      { texte: 'Tes enfants et petits-enfants t’aiment', role: 'citation' },
    ],
  },
  {
    id: 'ouverture',
    usage: 'PUBLICITE',
    nom: 'Grande ouverture',
    format: { largeurM: 4, hauteurM: 1 },
    palette: { fond: '#ff5a12', texte: '#110d15', accent: '#fbf7ee' },
    police: 'display',
    motif: 'eclat',
    lignes: [
      { texte: 'Grande ouverture', role: 'surtitre' },
      { texte: 'Boulangerie Le Fournil', role: 'titre' },
      { texte: '−20 % toute la semaine · Pain chaud dès 6 h', role: 'detail' },
      { texte: 'Avenue de la Paix, Poto-Poto · 06 000 00 00', role: 'signature' },
    ],
  },
  {
    id: 'sensibilisation',
    usage: 'INSTITUTION',
    nom: 'Campagne de sensibilisation',
    format: { largeurM: 4, hauteurM: 1 },
    palette: { fond: '#fbf7ee', texte: '#0b4a36', accent: '#c62828', filet: '#0f6b4c' },
    police: 'display',
    motif: 'ruban',
    lignes: [
      { texte: 'Journée de sensibilisation', role: 'surtitre' },
      { texte: 'Ensemble contre le paludisme', role: 'titre' },
      { texte: 'Dormons tous sous moustiquaire imprégnée', role: 'citation' },
      { texte: 'Association Santé Pour Tous · Brazzaville', role: 'signature' },
    ],
  },
  {
    id: 'roll-up-salon',
    usage: 'AUTRE',
    nom: 'Roll-up de salon',
    format: { largeurM: 0.85, hauteurM: 2 },
    palette: { fond: 'linear-gradient(180deg, #110d15 0%, #2b2233 60%, #ff5a12 100%)', texte: '#fbf7ee', accent: '#ff5a12' },
    police: 'display',
    motif: 'etoile',
    lignes: [
      { texte: 'Salon de l’entrepreneuriat', role: 'surtitre' },
      { texte: 'Vos idées méritent d’être vues', role: 'titre' },
      { texte: 'Stand 14 · Palais des congrès', role: 'detail' },
      { texte: 'smartvision.cg', role: 'signature' },
    ],
  },
];

export function modelesPour(usage: UsageId): ModeleBanderole[] {
  return MODELES.filter((m) => m.usage === usage);
}

export function modeleParId(id: string | undefined | null): ModeleBanderole | undefined {
  return id ? MODELES.find((m) => m.id === id) : undefined;
}

/** Modèle représentatif d'une catégorie (toujours défini). */
export function modelePrincipal(usage: UsageId): ModeleBanderole {
  return modelesPour(usage)[0] ?? MODELES[0];
}
