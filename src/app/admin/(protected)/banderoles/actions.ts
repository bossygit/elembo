'use server';

import { revalidatePath } from 'next/cache';

import { entierChamp, estDateIso, estUuid, texteChamp, texteOuNull } from '@/lib/admin/format';
import { peut } from '@/lib/admin/permissions';
import { estModePaiement } from '@/lib/admin/statuts';
import { ETAPES_GRAND_FORMAT, POSTES, genererProposition, type PosteCout } from '@/lib/grand-format/suivi';
import { SUPPORTS } from '@/lib/grand-format/catalogue';
import { exigerAcces } from '@/server/admin/acces';
import { journaliser } from '@/server/admin/audit';
import { enregistrerProposition } from '@/server/admin/devis';
import { echec, succes } from '@/server/admin/retour';
import { commandeDuDevis, creerCommandeDepuisDevis } from '@/server/commandes/repository';
import { transitionnerDevis } from '@/server/devis/repository';
import { reporterCoutsApresConversion } from '@/server/grand-format/conversion';
import {
  demandeParDevis,
  enregistrerChiffrage,
  enregistrerCoutReel,
  modifierLivraisonPrevue,
  modifierTarif,
  suspendreTarif,
  tachesDeCommande,
  validerTarif,
  type ChampsChiffrage,
} from '@/server/grand-format/repository';

const MAX_MONTANT = 1_000_000_000;
const fiche = (id: string, ancre?: string) => `/admin/banderoles/${id}${ancre ? `#${ancre}` : ''}`;

function idDemande(formData: FormData): string {
  const id = texteChamp(formData.get('devis_id'), 64);
  if (!estUuid(id)) echec('/admin/banderoles', 'Demande invalide.');
  return id;
}

/** Montant facultatif : `undefined` = champ absent du formulaire, `null` = vidé. */
function montant(formData: FormData, cle: string, chemin: string): number | null | undefined {
  if (!formData.has(cle)) return undefined;
  const n = entierChamp(formData.get(cle));
  if (n !== null && (Number.isNaN(n) || n > MAX_MONTANT)) echec(chemin, `Montant invalide (${cle.replace(/_/g, ' ')}).`);
  return n;
}

function date(formData: FormData, cle: string, chemin: string): string | null | undefined {
  if (!formData.has(cle)) return undefined;
  const d = texteChamp(formData.get(cle), 10);
  if (d && !estDateIso(d)) echec(chemin, 'Date invalide.');
  return d || null;
}

function partenaire(formData: FormData, chemin: string): string | null | undefined {
  if (!formData.has('partenaire_id')) return undefined;
  const p = texteChamp(formData.get('partenaire_id'), 64);
  if (p && !estUuid(p)) echec(chemin, 'Imprimeur invalide.');
  return p || null;
}

function sansIndefinis<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function rafraichir(id: string) {
  revalidatePath(fiche(id));
  revalidatePath('/admin/banderoles');
  revalidatePath(`/admin/devis/${id}`);
  revalidatePath('/admin');
}

/* ------------------------------------------------------------- chiffrage ---- */

/**
 * Chiffrage interne. Chacun n'écrit que ce que son rôle autorise :
 *  - commercial / admin : prix de vente, imprimeur pressenti, dates prévues ;
 *  - finance / admin : coûts estimés.
 * Le prix n'est plus modifiable une fois le devis accepté (prix verrouillé).
 */
export async function enregistrerChiffrageAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('grand_format.voir');
  const id = idDemande(formData);
  const chemin = fiche(id, 'chiffrage');
  const chiffrer = peut(staff.role, 'grand_format.chiffrer');
  const couts = peut(staff.role, 'grand_format.couts');
  if (!chiffrer && !couts) echec(chemin, 'Action non autorisée pour votre rôle.');

  const demande = await demandeParDevis(id);
  if (!demande) echec('/admin/banderoles', 'Demande introuvable.');
  const prixModifiable = ['NOUVEAU', 'EN_ANALYSE', 'PROPOSE'].includes(demande.devis.statut);

  const champs: ChampsChiffrage = {};
  if (chiffrer) {
    Object.assign(
      champs,
      sansIndefinis({
        partenaire_id: partenaire(formData, chemin),
        production_prevue_le: date(formData, 'production_prevue_le', chemin),
        livraison_prevue_le: date(formData, 'livraison_prevue_le', chemin),
      }),
    );
    if (prixModifiable) {
      Object.assign(
        champs,
        sansIndefinis({
          prix_impression_fcfa: montant(formData, 'prix_impression_fcfa', chemin),
          frais_creation_fcfa: montant(formData, 'frais_creation_fcfa', chemin),
        }),
      );
    }
  }
  if (couts) {
    Object.assign(
      champs,
      sansIndefinis({
        cout_impression_estime_fcfa: montant(formData, 'cout_impression_estime_fcfa', chemin),
        cout_creation_estime_fcfa: montant(formData, 'cout_creation_estime_fcfa', chemin),
        cout_livraison_estime_fcfa: montant(formData, 'cout_livraison_estime_fcfa', chemin),
        autres_couts_estimes_fcfa: montant(formData, 'autres_couts_estimes_fcfa', chemin),
      }),
    );
  }
  if (Object.keys(champs).length === 0) echec(chemin, 'Rien à enregistrer.');

  try {
    const { avant, apres } = await enregistrerChiffrage(id, champs);
    if (demande.devis.statut === 'NOUVEAU') await transitionnerDevis(id, 'EN_ANALYSE', null, null, staff.id, 'STAFF');
    await journaliser({ staff, action: 'GRAND_FORMAT_CHIFFRAGE', entite: 'devis', entiteId: id, avant, apres });
  } catch (erreur) {
    echec(chemin, erreur);
  }
  rafraichir(id);
  succes(chemin, 'chiffrage');
}

/* ----------------------------------------------------------- proposition ---- */

/** Génère le texte de la proposition depuis le chiffrage et transmet le devis au client. */
export async function envoyerPropositionAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('grand_format.chiffrer');
  const id = idDemande(formData);
  const chemin = fiche(id, 'proposition');
  const demande = await demandeParDevis(id);
  if (!demande) echec('/admin/banderoles', 'Demande introuvable.');
  if (!['NOUVEAU', 'EN_ANALYSE', 'PROPOSE'].includes(demande.devis.statut)) echec(chemin, 'Le devis est clos.');
  if (demande.prix_impression_fcfa === null || demande.prix_vente_fcfa === null || demande.prix_vente_fcfa <= 0) {
    echec(chemin, 'Renseignez d’abord le prix de l’impression.');
  }
  const validite = entierChamp(formData.get('validite_jours')) ?? 15;
  if (Number.isNaN(validite) || validite < 1 || validite > 90) echec(chemin, 'Validité entre 1 et 90 jours.');

  const genere = genererProposition({
    usage: demande.usage,
    support: demande.support,
    supportPrecision: demande.support_precision,
    largeurM: demande.largeur_m,
    hauteurM: demande.hauteur_m,
    quantite: demande.quantite,
    finition: demande.finition,
    finitionPrecision: demande.finition_precision,
    prestation: demande.prestation,
    prixImpressionFcfa: demande.prix_impression_fcfa,
    fraisCreationFcfa: demande.frais_creation_fcfa,
    productionPrevueLe: demande.production_prevue_le,
    livraisonPrevueLe: demande.livraison_prevue_le,
    validiteJours: validite,
  });
  // Le texte peut être retouché avant envoi ; à défaut, le texte généré est utilisé.
  const texte = texteOuNull(formData.get('proposition'), 8000) ?? genere;

  try {
    if (demande.devis.statut === 'NOUVEAU') await transitionnerDevis(id, 'EN_ANALYSE', null, null, staff.id, 'STAFF');
    await enregistrerProposition(id, texte);
    await transitionnerDevis(id, 'PROPOSE', demande.prix_vente_fcfa, null, staff.id, 'STAFF');
    await journaliser({
      staff,
      action: 'GRAND_FORMAT_PROPOSITION',
      entite: 'devis',
      entiteId: id,
      apres: { montant_propose_fcfa: demande.prix_vente_fcfa, proposition_commerciale: texte },
    });
  } catch (erreur) {
    echec(chemin, erreur);
  }
  rafraichir(id);
  succes(chemin, 'proposition');
}

/* -------------------------------------------------------------- décision ---- */

/**
 * Validation ou refus de la demande par Smart Vision, et réponse du client reçue hors ligne.
 * Les transitions restent celles de `transitionner_devis` (base) : rien n'est contourné.
 */
export async function deciderAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('grand_format.chiffrer');
  const id = idDemande(formData);
  const decision = texteChamp(formData.get('decision'), 20);
  const note = texteOuNull(formData.get('note'), 500);
  const cibles: Record<string, 'EN_ANALYSE' | 'REFUSE' | 'ACCEPTE' | 'EXPIRE'> = {
    prendre_en_charge: 'EN_ANALYSE',
    refuser: 'REFUSE',
    client_accepte: 'ACCEPTE',
    client_refuse: 'REFUSE',
    expirer: 'EXPIRE',
  };
  const cible = cibles[decision];
  if (!cible) echec(fiche(id), 'Décision inconnue.');
  try {
    await transitionnerDevis(id, cible, null, note, staff.id, 'STAFF');
    await journaliser({ staff, action: `GRAND_FORMAT_${decision.toUpperCase()}`, entite: 'devis', entiteId: id, apres: { statut: cible, note } });
  } catch (erreur) {
    echec(fiche(id), erreur);
  }
  rafraichir(id);
  succes(fiche(id), 'decision');
}

/* -------------------------------------------------------------- commande ---- */

/** Devis accepté → commande (parcours commercial et paiement existants), tâches d'atelier. */
export async function creerCommandeAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('devis.traiter');
  const id = idDemande(formData);
  const chemin = fiche(id, 'commande');
  const mode = texteChamp(formData.get('mode_paiement'), 20);
  const livraison = entierChamp(formData.get('livraison'));
  if (!estModePaiement(mode)) echec(chemin, 'Mode de paiement inconnu.');
  if (livraison === null || Number.isNaN(livraison) || livraison > 10_000_000) echec(chemin, 'Frais de livraison invalides.');

  const demande = await demandeParDevis(id);
  if (!demande) echec('/admin/banderoles', 'Demande introuvable.');
  try {
    const existante = await commandeDuDevis(id);
    if (!existante) {
      const commande = await creerCommandeDepuisDevis({
        devisId: id,
        modePaiement: mode,
        livraisonFcfa: livraison,
        ville: texteOuNull(formData.get('ville'), 120),
        adresse: texteOuNull(formData.get('adresse'), 300),
        livraisonPrevueLe: demande.livraison_prevue_le,
        idempotencyKey: `devis:${id}:commande`,
        acteur: staff.id,
      });
      const report = await reporterCoutsApresConversion(id, commande.id);
      await journaliser({
        staff,
        action: 'DEVIS_CONVERTI',
        entite: 'devis',
        entiteId: id,
        apres: { commande: commande.reference, ...(report.mode === 'grand_format' ? { taches_grand_format: report.taches } : {}) },
      });
    }
  } catch (erreur) {
    echec(chemin, erreur);
  }
  revalidatePath('/admin/commandes');
  rafraichir(id);
  succes(chemin, 'commande');
}

/* ----------------------------------------------------- production (imprimeur) ---- */

/** Imprimeur affecté et dates prévues, une fois la commande créée. */
export async function planifierProductionAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('grand_format.chiffrer');
  const id = idDemande(formData);
  const chemin = fiche(id, 'production');
  const demande = await demandeParDevis(id);
  if (!demande?.commande) echec(chemin, 'Aucune commande pour cette demande.');
  const commande = demande.commande;
  const p = partenaire(formData, chemin) ?? null;
  const production = date(formData, 'production_prevue_le', chemin) ?? null;
  const livraison = date(formData, 'livraison_prevue_le', chemin) ?? null;
  if (production && livraison && livraison < production) echec(chemin, 'La livraison ne peut pas précéder la production.');

  try {
    const taches = await tachesDeCommande(commande.id);
    const impression = taches.find((t) => t.etape === ETAPES_GRAND_FORMAT.impression);
    const r1 = await enregistrerCoutReel(commande.id, 'impression', {
      cout_fcfa: impression?.cout_fcfa ?? null,
      partenaire_id: p,
      date_prevue: production,
    });
    const tacheLivraison = taches.find((t) => t.etape === ETAPES_GRAND_FORMAT.livraison);
    if (tacheLivraison || livraison) {
      await enregistrerCoutReel(commande.id, 'livraison', { cout_fcfa: tacheLivraison?.cout_fcfa ?? null, date_prevue: livraison });
    }
    await enregistrerChiffrage(id, { partenaire_id: p, production_prevue_le: production, livraison_prevue_le: livraison });
    await modifierLivraisonPrevue(commande.id, livraison);
    await journaliser({
      staff,
      action: 'GRAND_FORMAT_PLANIFICATION',
      entite: 'commande',
      entiteId: commande.id,
      avant: { partenaire_id: r1.avant?.partenaire_id ?? null, date_prevue: r1.avant?.date_prevue ?? null },
      apres: { partenaire_id: p, production_prevue_le: production, livraison_prevue_le: livraison },
    });
  } catch (erreur) {
    echec(chemin, erreur);
  }
  revalidatePath(`/admin/commandes/${commande.id}`);
  revalidatePath(`/admin/production/${commande.id}`);
  rafraichir(id);
  succes(chemin, 'production');
}

/* ----------------------------------------------------------- coûts réels ---- */

export async function coutsReelsAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('grand_format.couts');
  const id = idDemande(formData);
  const chemin = fiche(id, 'rentabilite');
  const demande = await demandeParDevis(id);
  if (!demande?.commande) echec(chemin, 'Aucune commande pour cette demande.');
  const commande = demande.commande;

  const saisies: [PosteCout, number | null][] = [];
  for (const poste of POSTES) {
    const v = montant(formData, `cout_${poste.id}`, chemin);
    if (v !== undefined) saisies.push([poste.id, v]);
  }
  try {
    const taches = await tachesDeCommande(commande.id);
    const avant: Record<string, number | null> = {};
    const apres: Record<string, number | null> = {};
    for (const [poste, valeur] of saisies) {
      const existante = taches.find((t) => t.etape === ETAPES_GRAND_FORMAT[poste]);
      if (!existante && valeur === null) continue;
      if (existante && existante.cout_fcfa === valeur) continue;
      await enregistrerCoutReel(commande.id, poste, { cout_fcfa: valeur });
      avant[poste] = existante?.cout_fcfa ?? null;
      apres[poste] = valeur;
    }
    if (Object.keys(apres).length) {
      await journaliser({ staff, action: 'GRAND_FORMAT_COUTS_REELS', entite: 'commande', entiteId: commande.id, avant, apres });
    }
  } catch (erreur) {
    echec(chemin, erreur);
  }
  revalidatePath(`/admin/commandes/${commande.id}`);
  rafraichir(id);
  succes(chemin, 'couts');
}

/* --------------------------------------------------------------- grille ---- */

const TARIFS = '/admin/banderoles/tarifs';

function supportTarif(formData: FormData): string {
  const s = texteChamp(formData.get('support'), 20);
  if (!SUPPORTS.some((x) => x.id === s && x.id !== 'AUTRE')) echec(TARIFS, 'Support inconnu.');
  return s;
}

export async function modifierTarifAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('grand_format.tarifs');
  const support = supportTarif(formData);
  const chemin = `${TARIFS}#${support}`;
  const laizeBrute = texteChamp(formData.get('laize_max_m'), 10).replace(',', '.');
  const laize = laizeBrute ? Number(laizeBrute) : null;
  if (laize !== null && (!Number.isFinite(laize) || laize <= 0 || laize > 50)) echec(chemin, 'Laize invalide (en mètres).');
  const prixM2 = montant(formData, 'prix_m2_fcfa', chemin) ?? null;
  if (prixM2 === 0) echec(chemin, 'Le prix au m² doit être positif.');
  try {
    const { avant, apres } = await modifierTarif(support, {
      prix_m2_fcfa: prixM2,
      minimum_piece_fcfa: montant(formData, 'minimum_piece_fcfa', chemin) ?? null,
      supplement_oeillets_ml_fcfa: montant(formData, 'supplement_oeillets_ml_fcfa', chemin) ?? null,
      supplement_ourlets_ml_fcfa: montant(formData, 'supplement_ourlets_ml_fcfa', chemin) ?? null,
      supplement_fourreaux_ml_fcfa: montant(formData, 'supplement_fourreaux_ml_fcfa', chemin) ?? null,
      frais_creation_fcfa: montant(formData, 'frais_creation_fcfa', chemin) ?? null,
      laize_max_m: laize === null ? null : Math.round(laize * 100) / 100,
      actif: formData.get('actif') === 'on',
      notes: texteOuNull(formData.get('notes'), 2000),
    });
    await journaliser({ staff, action: 'GRAND_FORMAT_TARIF_MODIFIE', entite: 'tarif_grand_format', entiteId: support, avant, apres });
  } catch (erreur) {
    echec(chemin, erreur);
  }
  revalidatePath(TARIFS);
  succes(chemin, 'tarif');
}

export async function validerTarifAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('grand_format.tarifs');
  const support = supportTarif(formData);
  try {
    const apres = await validerTarif(support, staff);
    await journaliser({ staff, action: 'GRAND_FORMAT_TARIF_VALIDE', entite: 'tarif_grand_format', entiteId: support, apres });
  } catch (erreur) {
    echec(`${TARIFS}#${support}`, erreur);
  }
  revalidatePath(TARIFS);
  succes(`${TARIFS}#${support}`, 'valide');
}

export async function suspendreTarifAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('grand_format.tarifs');
  const support = supportTarif(formData);
  try {
    const apres = await suspendreTarif(support);
    await journaliser({ staff, action: 'GRAND_FORMAT_TARIF_SUSPENDU', entite: 'tarif_grand_format', entiteId: support, apres });
  } catch (erreur) {
    echec(`${TARIFS}#${support}`, erreur);
  }
  revalidatePath(TARIFS);
  succes(`${TARIFS}#${support}`, 'suspendu');
}
