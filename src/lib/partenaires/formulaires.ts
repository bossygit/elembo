/**
 * Lecture et validation des formulaires du dossier partenaire (entreprise, machines, capacités,
 * services, disponibilités). Pures et testées (`partenairesFormulaires.test.ts`).
 *
 * Chaque lecteur renvoie UNIQUEMENT les colonnes que le partenaire a le droit d'écrire (liste
 * blanche) : jamais `partenaire_id`, `statut`, `statut_validation`, `valide_*`. Les dimensions
 * sont saisies en mètres (« 3,20 ») et rendues en millimètres entiers, comme en base.
 */

import {
  CATEGORIES_SERVICE,
  ETATS_MACHINE,
  FAMILLES,
  FINITIONS_PRODUCTION,
  PRESTATIONS,
  STATUTS_DISPONIBILITE,
  TYPES_MACHINE,
  UNITES_CAPACITE,
  UNITES_VITESSE,
  nomPrestation,
  type CategorieService,
  type EtatMachine,
  type FamilleId,
  type StatutDisponibilite,
  type UniteCapacite,
  type UniteVitesse,
} from './catalogue';

export type Lecture<T> = { ok: true; valeur: T } | { ok: false; erreur: string };

const echec = (erreur: string) => ({ ok: false, erreur }) as const;

/* ------------------------------------------------------------- utilitaires -- */

export function texte(fd: FormData, nom: string, max: number): string {
  const v = fd.get(nom);
  return typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '';
}

/** Texte long : les retours à la ligne sont conservés. */
export function texteLong(fd: FormData, nom: string, max: number): string | null {
  const v = fd.get(nom);
  if (typeof v !== 'string') return null;
  const t = v.replace(/\r\n/g, '\n').trim().slice(0, max);
  return t || null;
}

const ouNull = (t: string) => (t ? t : null);

/** Nombre décimal saisi à la française (« 3,2 » ou « 3.2 »). `null` si vide, `NaN` si invalide. */
export function decimal(fd: FormData, nom: string): number | null {
  const brut = texte(fd, nom, 20).replace(/\s/g, '').replace(',', '.');
  if (!brut) return null;
  return /^\d+(\.\d+)?$/.test(brut) ? Number(brut) : Number.NaN;
}

export function entier(fd: FormData, nom: string): number | null {
  const brut = texte(fd, nom, 12).replace(/\s/g, '');
  if (!brut) return null;
  return /^\d+$/.test(brut) ? Number(brut) : Number.NaN;
}

/** Mètres saisis → millimètres entiers. `null` si vide, `NaN` si invalide ou hors bornes. */
export function metresEnMm(fd: FormData, nom: string, maxMetres: number): number | null {
  const m = decimal(fd, nom);
  if (m === null) return null;
  if (Number.isNaN(m) || m <= 0 || m > maxMetres) return Number.NaN;
  return Math.round(m * 1000);
}

/** Millimètres → saisie en mètres (« 3,2 »), pour pré-remplir un formulaire. */
export function mmEnMetres(mm: number | null | undefined): string {
  if (mm === null || mm === undefined) return '';
  return String(mm / 1000).replace('.', ',');
}

/** Liste libre séparée par des virgules ou des retours à la ligne : nettoyée, sans doublon. */
export function liste(fd: FormData, nom: string, max = 40, longueur = 60): string[] {
  const v = fd.get(nom);
  if (typeof v !== 'string') return [];
  const vus = new Set<string>();
  const res: string[] = [];
  for (const brut of v.split(/[,\n;]/)) {
    const t = brut.trim().replace(/\s+/g, ' ').slice(0, longueur);
    const cle = t.toLowerCase();
    if (t && !vus.has(cle)) {
      vus.add(cle);
      res.push(t);
    }
  }
  return res.slice(0, max);
}

/** Codes cochés, limités à une liste autorisée. */
export function codesCoches(fd: FormData, nom: string, autorises: readonly string[]): string[] {
  return [...new Set(fd.getAll(nom).map(String))].filter((c) => autorises.includes(c));
}

/** Date AAAA-MM-JJ valide, `null` si vide, `false` si invalide. */
export function dateIso(fd: FormData, nom: string): string | null | false {
  const t = texte(fd, nom, 10);
  if (!t) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const d = new Date(`${t}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === t ? t : false;
}

const invalide = (n: number | null) => n !== null && Number.isNaN(n);

/** Valeur d'un menu « FAMILLE:CODE » (machines, prestations). */
export function familleEtCode(
  fd: FormData,
  nom: string,
  catalogue: Record<FamilleId, { id: string }[]>,
): { famille: FamilleId; code: string } | null {
  const [famille, code] = texte(fd, nom, 90).split(':');
  if (!FAMILLES.some((f) => f.id === famille)) return null;
  const f = famille as FamilleId;
  return catalogue[f].some((o) => o.id === code) ? { famille: f, code } : null;
}

const TELEPHONE = /^\+?[0-9][0-9 ().-]{5,30}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/* --------------------------------------------------------------- entreprise -- */

export type ChampsEntreprise = {
  nom: string;
  raison_sociale: string | null;
  specialite: string;
  description: string | null;
  annee_creation: number | null;
  rccm: string | null;
  niu: string | null;
  site_web: string | null;
  telephone: string;
  whatsapp: string | null;
  email: string | null;
  contact_nom: string | null;
  contact_fonction: string | null;
  adresse: string | null;
  ville: string | null;
  quartier: string | null;
  localisation: string | null;
  zone_desservie: string | null;
  delai_jours: number | null;
  quantites_minimales: string | null;
  conditions_particulieres: string | null;
};

export function lireEntreprise(fd: FormData, maintenant = new Date()): Lecture<ChampsEntreprise> {
  const nom = texte(fd, 'nom', 120);
  const specialite = texte(fd, 'specialite', 120);
  const telephone = texte(fd, 'telephone', 32);
  const whatsapp = texte(fd, 'whatsapp', 32);
  const email = texte(fd, 'email', 254).toLowerCase();
  const siteWeb = texte(fd, 'site_web', 300);
  const annee = entier(fd, 'annee_creation');
  const delai = entier(fd, 'delai_jours');

  if (nom.length < 2) return echec('Indiquez le nom commercial de l’entreprise.');
  if (specialite.length < 2) return echec('Indiquez votre spécialité (ex. grand format, textile, sérigraphie).');
  if (!TELEPHONE.test(telephone)) return echec('Indiquez un numéro de téléphone valide.');
  if (whatsapp && !TELEPHONE.test(whatsapp)) return echec('Numéro WhatsApp invalide.');
  if (email && !EMAIL.test(email)) return echec('Adresse e-mail de contact invalide.');
  if (siteWeb && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(siteWeb)) return echec('Le site web doit commencer par http:// ou https://.');
  if (invalide(annee) || (annee !== null && (annee < 1900 || annee > maintenant.getFullYear()))) {
    return echec('Année de création invalide.');
  }
  if (invalide(delai) || (delai !== null && delai > 365)) return echec('Délai habituel invalide (en jours).');

  return {
    ok: true,
    valeur: {
      nom,
      raison_sociale: ouNull(texte(fd, 'raison_sociale', 160)),
      specialite,
      description: texteLong(fd, 'description', 2000),
      annee_creation: annee,
      rccm: ouNull(texte(fd, 'rccm', 60)),
      niu: ouNull(texte(fd, 'niu', 60)),
      site_web: ouNull(siteWeb),
      telephone,
      whatsapp: ouNull(whatsapp),
      email: ouNull(email),
      contact_nom: ouNull(texte(fd, 'contact_nom', 120)),
      contact_fonction: ouNull(texte(fd, 'contact_fonction', 120)),
      adresse: ouNull(texte(fd, 'adresse', 300)),
      ville: ouNull(texte(fd, 'ville', 120)),
      quartier: ouNull(texte(fd, 'quartier', 120)),
      localisation: ouNull(texte(fd, 'localisation', 300)),
      zone_desservie: ouNull(texte(fd, 'zone_desservie', 300)),
      delai_jours: delai,
      quantites_minimales: texteLong(fd, 'quantites_minimales', 1000),
      conditions_particulieres: texteLong(fd, 'conditions_particulieres', 2000),
    },
  };
}

/* ----------------------------------------------------------------- machines -- */

export type ChampsMachine = {
  famille: FamilleId;
  type_machine: string;
  nom: string;
  marque: string | null;
  modele: string | null;
  technologie: string | null;
  annee_acquisition: number | null;
  quantite: number;
  largeur_max_mm: number | null;
  longueur_max_mm: number | null;
  resolution_dpi: number | null;
  vitesse: number | null;
  unite_vitesse: UniteVitesse | null;
  supports_compatibles: string[];
  formats_compatibles: string[];
} & ChampsEtatMachine;

/** Partie modifiable par un opérateur PRODUCTION : état et maintenance (pas de revalidation). */
export type ChampsEtatMachine = {
  etat: EtatMachine;
  derniere_maintenance_le: string | null;
  prochaine_maintenance_le: string | null;
};

export function lireEtatMachine(fd: FormData): Lecture<ChampsEtatMachine> {
  const etat = texte(fd, 'etat', 20);
  if (!ETATS_MACHINE.some((e) => e.id === etat)) return echec('État de la machine inconnu.');
  const derniere = dateIso(fd, 'derniere_maintenance_le');
  const prochaine = dateIso(fd, 'prochaine_maintenance_le');
  if (derniere === false || prochaine === false) return echec('Date de maintenance invalide.');
  return { ok: true, valeur: { etat: etat as EtatMachine, derniere_maintenance_le: derniere, prochaine_maintenance_le: prochaine } };
}

export function lireMachine(fd: FormData, maintenant = new Date()): Lecture<ChampsMachine> {
  const choix = familleEtCode(fd, 'type', TYPES_MACHINE);
  if (!choix) return echec('Choisissez le type de machine.');
  const nom = texte(fd, 'nom', 120);
  if (nom.length < 2) return echec('Donnez un nom à la machine (ex. « Traceur 3,20 m »).');

  const quantite = entier(fd, 'quantite') ?? 1;
  const annee = entier(fd, 'annee_acquisition');
  const largeur = metresEnMm(fd, 'largeur_max_m', 100);
  const longueur = metresEnMm(fd, 'longueur_max_m', 1000);
  const resolution = entier(fd, 'resolution_dpi');
  const vitesse = decimal(fd, 'vitesse');
  const uniteVitesse = texte(fd, 'unite_vitesse', 20);

  if (Number.isNaN(quantite) || quantite < 1 || quantite > 99) return echec('Quantité invalide (1 à 99).');
  if (invalide(annee) || (annee !== null && (annee < 1950 || annee > maintenant.getFullYear()))) {
    return echec('Année d’acquisition invalide.');
  }
  if (invalide(largeur)) return echec('Largeur maximale invalide (en mètres, ex. 3,20).');
  if (invalide(longueur)) return echec('Longueur maximale invalide (en mètres).');
  if (invalide(resolution) || (resolution !== null && (resolution < 1 || resolution > 10000))) return echec('Résolution invalide (en dpi).');
  if (invalide(vitesse) || vitesse === 0) return echec('Vitesse de production invalide.');
  if (vitesse !== null && !UNITES_VITESSE.some((u) => u.id === uniteVitesse)) return echec('Précisez l’unité de la vitesse.');

  const etat = lireEtatMachine(fd);
  if (!etat.ok) return etat;

  return {
    ok: true,
    valeur: {
      famille: choix.famille,
      type_machine: choix.code,
      nom,
      marque: ouNull(texte(fd, 'marque', 80)),
      modele: ouNull(texte(fd, 'modele', 80)),
      technologie: ouNull(texte(fd, 'technologie', 80)),
      annee_acquisition: annee,
      quantite,
      largeur_max_mm: largeur,
      longueur_max_mm: longueur,
      resolution_dpi: resolution,
      vitesse,
      unite_vitesse: vitesse === null ? null : (uniteVitesse as UniteVitesse),
      supports_compatibles: liste(fd, 'supports_compatibles'),
      formats_compatibles: liste(fd, 'formats_compatibles'),
      ...etat.valeur,
    },
  };
}

/* ---------------------------------------------------------------- capacités -- */

export type ChampsCapacite = {
  categorie: FamilleId;
  prestation: string;
  nom: string;
  technologie: string | null;
  largeur_min_mm: number | null;
  largeur_max_mm: number | null;
  longueur_min_mm: number | null;
  longueur_max_mm: number | null;
  supports_compatibles: string[];
  matieres: string[];
  finitions: string[];
  quantite_min: number | null;
  capacite_journaliere: number | null;
  capacite_hebdomadaire: number | null;
  unite_capacite: UniteCapacite;
  delai_jours: number | null;
  delai_express_jours: number | null;
  contraintes: string | null;
};

export function lireCapacite(fd: FormData): Lecture<{ champs: ChampsCapacite; machines: string[] }> {
  const choix = familleEtCode(fd, 'prestation', PRESTATIONS);
  if (!choix) return echec('Choisissez la prestation.');
  const unite = texte(fd, 'unite_capacite', 20);
  if (!UNITES_CAPACITE.some((u) => u.id === unite)) return echec('Choisissez l’unité de capacité.');

  const largeurMin = metresEnMm(fd, 'largeur_min_m', 100);
  const largeurMax = metresEnMm(fd, 'largeur_max_m', 100);
  const longueurMin = metresEnMm(fd, 'longueur_min_m', 1000);
  const longueurMax = metresEnMm(fd, 'longueur_max_m', 1000);
  const quantiteMin = entier(fd, 'quantite_min');
  const jour = decimal(fd, 'capacite_journaliere');
  const semaine = decimal(fd, 'capacite_hebdomadaire');
  const delai = entier(fd, 'delai_jours');
  const express = entier(fd, 'delai_express_jours');

  if ([largeurMin, largeurMax, longueurMin, longueurMax].some(invalide)) return echec('Dimensions invalides (en mètres, ex. 3,20).');
  if (largeurMin !== null && largeurMax !== null && largeurMin > largeurMax) return echec('La largeur minimale dépasse la maximale.');
  if (longueurMin !== null && longueurMax !== null && longueurMin > longueurMax) return echec('La longueur minimale dépasse la maximale.');
  if (invalide(quantiteMin) || quantiteMin === 0) return echec('Quantité minimale invalide.');
  if (invalide(jour) || jour === 0 || invalide(semaine) || semaine === 0) return echec('Capacité de production invalide.');
  if (jour !== null && jour > 9_999_999_999) return echec('Capacité journalière trop grande.');
  if (semaine !== null && semaine > 9_999_999_999) return echec('Capacité hebdomadaire trop grande.');
  if (invalide(delai) || (delai !== null && delai > 365)) return echec('Délai habituel invalide (en jours).');
  if (invalide(express) || (express !== null && express > 365)) return echec('Délai express invalide (en jours).');
  if (express !== null && delai !== null && express > delai) return echec('Le délai express doit être plus court que le délai habituel.');

  const nom = texte(fd, 'nom', 120) || nomPrestation(choix.code);
  const machines = [...new Set(fd.getAll('machines').map(String))].filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 50);

  return {
    ok: true,
    valeur: {
      champs: {
        categorie: choix.famille,
        prestation: choix.code,
        nom,
        technologie: ouNull(texte(fd, 'technologie', 80)),
        largeur_min_mm: largeurMin,
        largeur_max_mm: largeurMax,
        longueur_min_mm: longueurMin,
        longueur_max_mm: longueurMax,
        supports_compatibles: liste(fd, 'supports_compatibles'),
        matieres: liste(fd, 'matieres'),
        finitions: codesCoches(fd, 'finitions', FINITIONS_PRODUCTION.map((f) => f.id)),
        quantite_min: quantiteMin,
        capacite_journaliere: jour,
        capacite_hebdomadaire: semaine,
        unite_capacite: unite as UniteCapacite,
        delai_jours: delai,
        delai_express_jours: express,
        contraintes: texteLong(fd, 'contraintes', 2000),
      },
      machines,
    },
  };
}

/* ----------------------------------------------------------------- services -- */

export type ChampsService = {
  nom: string;
  categorie: CategorieService;
  capacite_id: string | null;
  description: string | null;
  delai_jours: number | null;
  quantite_min: number | null;
  conditions: string | null;
  realise_par_tiers: boolean;
  tiers_precision: string | null;
};

export function lireService(fd: FormData): Lecture<ChampsService> {
  const categorie = texte(fd, 'categorie', 40);
  if (!CATEGORIES_SERVICE.some((c) => c.id === categorie)) return echec('Choisissez le type de service.');
  const nom = texte(fd, 'nom', 120);
  if (nom.length < 2) return echec('Donnez un nom au service.');
  const capacite = texte(fd, 'capacite_id', 40);
  if (capacite && !/^[0-9a-f-]{36}$/i.test(capacite)) return echec('Capacité invalide.');
  const delai = entier(fd, 'delai_jours');
  const quantiteMin = entier(fd, 'quantite_min');
  if (invalide(delai) || (delai !== null && delai > 365)) return echec('Délai invalide (en jours).');
  if (invalide(quantiteMin) || quantiteMin === 0) return echec('Quantité minimale invalide.');
  const tiers = fd.get('realise_par_tiers') === 'oui';
  const precision = texteLong(fd, 'tiers_precision', 1000);
  if (tiers && !precision) return echec('Précisez quel atelier réalise tout ou partie du service, et pour quelle étape.');

  return {
    ok: true,
    valeur: {
      nom,
      categorie: categorie as CategorieService,
      capacite_id: capacite || null,
      description: texteLong(fd, 'description', 2000),
      delai_jours: delai,
      quantite_min: quantiteMin,
      conditions: texteLong(fd, 'conditions', 2000),
      realise_par_tiers: tiers,
      tiers_precision: tiers ? precision : null,
    },
  };
}

/* ----------------------------------------------------------- disponibilités -- */

export type ChampsDisponibilite = {
  statut: StatutDisponibilite;
  debut_periode: string;
  fin_periode: string | null;
  delai_moyen_jours: number | null;
  commentaire: string | null;
};

export function lireDisponibilite(fd: FormData, aujourdhui: string): Lecture<ChampsDisponibilite> {
  const statut = texte(fd, 'statut', 30);
  if (!STATUTS_DISPONIBILITE.some((s) => s.id === statut)) return echec('Choisissez votre disponibilité.');
  const debut = dateIso(fd, 'debut_periode');
  const fin = dateIso(fd, 'fin_periode');
  if (debut === false || fin === false) return echec('Date invalide.');
  const debutEffectif = debut ?? aujourdhui;
  if (fin !== null && fin < debutEffectif) return echec('La fin de période précède son début.');
  const delai = entier(fd, 'delai_moyen_jours');
  if (invalide(delai) || (delai !== null && delai > 365)) return echec('Délai moyen invalide (en jours).');
  return {
    ok: true,
    valeur: {
      statut: statut as StatutDisponibilite,
      debut_periode: debutEffectif,
      fin_periode: fin,
      delai_moyen_jours: delai,
      commentaire: texteLong(fd, 'commentaire', 1000),
    },
  };
}

/**
 * Disponibilité en vigueur : la déclaration la plus récente dont la période couvre la date du
 * jour (même règle que la table `partenaire_disponibilites`, qui n'est jamais réécrite).
 */
export function disponibiliteCourante<T extends { debut_periode: string; fin_periode: string | null; cree_le: string }>(
  declarations: readonly T[],
  aujourdhui: string,
): T | null {
  return (
    [...declarations]
      .filter((d) => d.debut_periode <= aujourdhui && (d.fin_periode === null || d.fin_periode >= aujourdhui))
      .sort((a, b) => (a.debut_periode === b.debut_periode ? b.cree_le.localeCompare(a.cree_le) : b.debut_periode.localeCompare(a.debut_periode)))[0] ?? null
  );
}
