'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { entierChamp, estDateIso, estUuid, texteChamp, texteOuNull } from '@/lib/admin/format';
import { estModePaiement } from '@/lib/admin/statuts';
import { exigerAcces } from '@/server/admin/acces';
import { journaliser } from '@/server/admin/audit';
import { ajouterNoteInterne } from '@/server/admin/commandes';
import { enregistrerAnalyse, enregistrerProposition, reporterCoutEstime, validerPrix } from '@/server/admin/devis';
import { echec, succes } from '@/server/admin/retour';
import { commandeDuDevis, creerCommandeDepuisDevis } from '@/server/commandes/repository';
import { devisParId, fichierDuDevis, revoquerSessionsDevis, transitionnerDevis } from '@/server/devis/repository';
import { creerUrlTelechargement } from '@/server/storage/supabase';

const fiche = (id: string, ancre?: string) => `/admin/devis/${id}${ancre ? `#${ancre}` : ''}`;

function idDevis(formData: FormData): string {
  const id = texteChamp(formData.get('devis_id'), 64);
  if (!estUuid(id)) echec('/admin/devis', 'Devis invalide.');
  return id;
}

function rafraichir(id: string) {
  revalidatePath(fiche(id));
  revalidatePath('/admin/devis');
  revalidatePath('/admin');
}

/** Étape 2 — analyse des besoins (passe le devis « en analyse » s'il est nouveau). */
export async function enregistrerAnalyseAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('devis.traiter');
  const id = idDevis(formData);
  const chemin = fiche(id, 'analyse');
  const cout = entierChamp(formData.get('cout_estime_fcfa'));
  const delai = entierChamp(formData.get('delai_propose_jours'));
  if (cout !== null && (Number.isNaN(cout) || cout > 1_000_000_000)) echec(chemin, 'Coût estimé invalide.');
  if (delai !== null && (Number.isNaN(delai) || delai > 365)) echec(chemin, 'Délai invalide (0 à 365 jours).');
  try {
    const devis = await devisParId(id);
    if (!devis) echec('/admin/devis', 'Devis introuvable.');
    const { avant, apres } = await enregistrerAnalyse(id, {
      analyse_besoins: texteOuNull(formData.get('analyse_besoins'), 8000),
      cout_estime_fcfa: cout,
      delai_propose_jours: delai,
    });
    if (devis.statut === 'NOUVEAU') await transitionnerDevis(id, 'EN_ANALYSE', null, null, staff.id, 'STAFF');
    await journaliser({ staff, action: 'DEVIS_ANALYSE', entite: 'devis', entiteId: id, avant, apres });
  } catch (erreur) {
    echec(chemin, erreur);
  }
  rafraichir(id);
  succes(chemin, 'analyse');
}

/** Étape 3 — proposition commerciale : montant + texte, devis « proposé » au client. */
export async function proposerDevis(formData: FormData): Promise<void> {
  const staff = await exigerAcces('devis.traiter');
  const id = idDevis(formData);
  const chemin = fiche(id, 'proposition');
  const montant = entierChamp(formData.get('montant'));
  if (montant === null || Number.isNaN(montant) || montant <= 0 || montant > 1_000_000_000) echec(chemin, 'Montant invalide.');
  const texte = texteOuNull(formData.get('proposition_commerciale'), 8000);
  try {
    await enregistrerProposition(id, texte);
    await transitionnerDevis(id, 'PROPOSE', montant, null, staff.id, 'STAFF');
    await journaliser({ staff, action: 'DEVIS_PROPOSITION', entite: 'devis', entiteId: id, apres: { montant_propose_fcfa: montant, proposition_commerciale: texte } });
  } catch (erreur) {
    echec(chemin, erreur);
  }
  rafraichir(id);
  succes(chemin, 'propose');
}

/** Étape 4 — validation interne du prix (direction / finance). */
export async function validerPrixAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('devis.valider_prix');
  const id = idDevis(formData);
  try {
    const apres = await validerPrix(id, staff);
    await journaliser({ staff, action: 'DEVIS_PRIX_VALIDE', entite: 'devis', entiteId: id, apres: { montant_propose_fcfa: apres.montant_propose_fcfa } });
  } catch (erreur) {
    echec(fiche(id, 'proposition'), erreur);
  }
  rafraichir(id);
  succes(fiche(id), 'prix');
}

export async function changerStatut(formData: FormData): Promise<void> {
  const staff = await exigerAcces('devis.traiter');
  const id = idDevis(formData);
  const statut = texteChamp(formData.get('statut'), 20);
  if (statut !== 'EN_ANALYSE' && statut !== 'EXPIRE' && statut !== 'REFUSE') echec(fiche(id), 'Statut non autorisé.');
  try {
    await transitionnerDevis(id, statut, null, null, staff.id, 'STAFF');
  } catch (erreur) {
    echec(fiche(id), erreur);
  }
  rafraichir(id);
  succes(fiche(id), 'statut');
}

/** Étape 5 — acceptation ou refus reçus hors ligne (téléphone, WhatsApp, email). */
export async function deciderPourClient(formData: FormData): Promise<void> {
  const staff = await exigerAcces('devis.traiter');
  const id = idDevis(formData);
  const decision = texteChamp(formData.get('decision'), 10);
  if (decision !== 'ACCEPTE' && decision !== 'REFUSE') echec(fiche(id), 'Décision invalide.');
  try {
    await transitionnerDevis(id, decision, null, null, staff.id, 'STAFF');
  } catch (erreur) {
    echec(fiche(id), erreur);
  }
  rafraichir(id);
  succes(fiche(id), 'decision');
}

export async function ajouterNoteDevis(formData: FormData): Promise<void> {
  const staff = await exigerAcces('devis.traiter');
  const id = idDevis(formData);
  const contenu = texteChamp(formData.get('contenu'), 4000);
  if (!contenu) echec(fiche(id, 'notes'), 'La note est vide.');
  try {
    await ajouterNoteInterne({ entite: 'devis', entiteId: id, contenu, auteur: staff.id, auteurEmail: staff.email });
  } catch (erreur) {
    echec(fiche(id, 'notes'), erreur);
  }
  revalidatePath(fiche(id));
  succes(fiche(id, 'notes'), 'note');
}

export async function revoquerSessions(formData: FormData): Promise<void> {
  const staff = await exigerAcces('devis.sessions');
  const id = idDevis(formData);
  try {
    await revoquerSessionsDevis(id, 'revocation_admin');
    await journaliser({ staff, action: 'DEVIS_SESSIONS_REVOQUEES', entite: 'devis', entiteId: id });
  } catch (erreur) {
    echec(fiche(id), erreur);
  }
  revalidatePath(fiche(id));
  succes(fiche(id), 'sessions');
}

export async function telechargerFichier(formData: FormData): Promise<void> {
  const staff = await exigerAcces('devis.traiter');
  const devisId = idDevis(formData);
  const fichierId = texteChamp(formData.get('fichier_id'), 64);
  if (!estUuid(fichierId)) echec(fiche(devisId), 'Fichier invalide.');
  const fichier = await fichierDuDevis(devisId, fichierId);
  if (!fichier || !fichier.verifie || fichier.statut_analyse !== 'PROPRE') {
    echec(fiche(devisId), 'Fichier indisponible : non vérifié ou non analysé.');
  }
  const url = await creerUrlTelechargement(fichier.chemin, 60);
  await journaliser({ staff, action: 'DEVIS_FICHIER_TELECHARGE', entite: 'devis', entiteId: devisId, apres: { fichier: fichier.nom } });
  redirect(url);
}

/** Étape 6 — transformation en commande (une seule par devis, idempotente). */
export async function creerCommande(formData: FormData): Promise<void> {
  const staff = await exigerAcces('devis.traiter');
  const id = idDevis(formData);
  const chemin = fiche(id, 'commande');
  const mode = texteChamp(formData.get('mode_paiement'), 20);
  const livraison = entierChamp(formData.get('livraison'));
  const dateLivraison = texteChamp(formData.get('livraison_prevue'), 10);
  if (!estModePaiement(mode)) echec(chemin, 'Mode de paiement inconnu.');
  if (livraison === null || Number.isNaN(livraison) || livraison > 10_000_000) echec(chemin, 'Frais de livraison invalides.');
  if (dateLivraison && !estDateIso(dateLivraison)) echec(chemin, 'Date de livraison invalide.');

  let commandeId = '';
  try {
    const existante = await commandeDuDevis(id);
    if (existante) redirect(`/admin/commandes/${existante.id}?ok=existante`);
    const commande = await creerCommandeDepuisDevis({
      devisId: id,
      modePaiement: mode,
      livraisonFcfa: livraison,
      ville: texteOuNull(formData.get('ville'), 120),
      adresse: texteOuNull(formData.get('adresse'), 300),
      livraisonPrevueLe: dateLivraison || null,
      idempotencyKey: `devis:${id}:commande`,
      acteur: staff.id,
    });
    commandeId = commande.id;
    const coutUnitaire = await reporterCoutEstime(id, commande.id);
    await journaliser({
      staff,
      action: 'DEVIS_CONVERTI',
      entite: 'devis',
      entiteId: id,
      apres: { commande: commande.reference, cout_unitaire_reporte_fcfa: coutUnitaire },
    });
  } catch (erreur) {
    echec(chemin, erreur);
  }
  revalidatePath('/admin/commandes');
  rafraichir(id);
  redirect(`/admin/commandes/${commandeId}?ok=creee`);
}
