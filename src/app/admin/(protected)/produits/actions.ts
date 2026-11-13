'use server';

import { revalidatePath } from 'next/cache';

import { entierChamp, estUuid, texteChamp, texteOuNull } from '@/lib/admin/format';
import { peut } from '@/lib/admin/permissions';
import { estFamille } from '@/lib/admin/statuts';
import { exigerAcces, type Staff } from '@/server/admin/acces';
import { journaliser } from '@/server/admin/audit';
import {
  ID_CATEGORIE,
  ID_PRODUIT,
  TAILLE_MAX_IMAGE,
  ajouterImage,
  creerCategorie,
  creerProduit,
  creerVariante,
  definirImagePrincipale,
  modifierCategorie,
  modifierProduit,
  modifierVariante,
  mouvementerStock,
  produitParId,
  supprimerImage,
  type Produit,
  type TypeMouvement,
} from '@/server/admin/produits';
import { echec, succes } from '@/server/admin/retour';

const LISTE = '/admin/produits';
const fiche = (id: string, ancre?: string) => `/admin/produits/${id}${ancre ? `#${ancre}` : ''}`;
const STATUTS_PRIX = ['TEST', 'PROVISOIRE', 'VALIDE'] as const;
const MAX_FCFA = 100_000_000;

function idProduit(formData: FormData): string {
  const id = texteChamp(formData.get('produit_id'), 64);
  if (!ID_PRODUIT.test(id)) echec(LISTE, 'Produit invalide.');
  return id;
}

function montant(formData: FormData, nom: string, chemin: string, libelle: string): number | null {
  const v = entierChamp(formData.get(nom));
  if (v !== null && (Number.isNaN(v) || v > MAX_FCFA)) echec(chemin, `${libelle} invalide.`);
  return v;
}

/** Champs commerciaux (prix, coût, statut de prix) : uniquement pour `produits.prix`. */
function champsPrix(formData: FormData, staff: Staff, chemin: string, avant?: Produit): Partial<Produit> {
  if (!peut(staff.role, 'produits.prix')) return {};
  const statut = texteChamp(formData.get('statut_prix'), 12);
  if (!(STATUTS_PRIX as readonly string[]).includes(statut)) echec(chemin, 'Statut de prix inconnu.');
  const prix = montant(formData, 'prix_fcfa', chemin, 'Prix');
  const cout = montant(formData, 'cout_fcfa', chemin, 'Coût de production');
  if (statut === 'VALIDE' && prix === null) echec(chemin, 'Un prix validé doit avoir un montant.');
  const champs: Partial<Produit> & { prix_valide_par?: string | null } = {
    statut_prix: statut as Produit['statut_prix'],
    prix_fcfa: prix,
    cout_fcfa: cout,
  };
  // La validation (qui, quand) est réenregistrée dès que le prix validé change.
  if (statut === 'VALIDE' && (avant?.statut_prix !== 'VALIDE' || avant?.prix_fcfa !== prix)) {
    Object.assign(champs, {
      prix_valide_par: staff.id,
      prix_valide_par_email: staff.email ?? staff.id,
      prix_valide_le: new Date().toISOString(),
    });
  }
  return champs;
}

function champsDescriptifs(formData: FormData, chemin: string): Partial<Produit> {
  const nom = texteChamp(formData.get('nom'), 160);
  const famille = texteChamp(formData.get('famille'), 20);
  const categorie = texteChamp(formData.get('categorie_id'), 64);
  if (nom.length < 2) echec(chemin, 'Nom obligatoire.');
  if (!estFamille(famille)) echec(chemin, 'Famille inconnue.');
  if (categorie && !ID_CATEGORIE.test(categorie)) echec(chemin, 'Catégorie invalide.');
  const delai = entierChamp(formData.get('delai_jours'));
  if (delai !== null && (Number.isNaN(delai) || delai > 365)) echec(chemin, 'Délai invalide (0 à 365 jours).');
  const quantiteMin = entierChamp(formData.get('quantite_min')) ?? 1;
  if (Number.isNaN(quantiteMin) || quantiteMin < 1 || quantiteMin > 100_000) echec(chemin, 'Quantité minimale invalide.');
  return {
    nom,
    famille,
    categorie_id: categorie || null,
    description: texteOuNull(formData.get('description'), 2000),
    technique: texteOuNull(formData.get('technique'), 200),
    delai_jours: delai,
    quantite_min: quantiteMin,
  };
}

export async function creerProduitAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('produits.modifier');
  const id = texteChamp(formData.get('id'), 64).toLowerCase();
  if (!ID_PRODUIT.test(id)) echec(LISTE, 'Identifiant invalide : 3 à 64 caractères, minuscules, chiffres, - ou _.');
  const champs = {
    id,
    ...champsDescriptifs(formData, LISTE),
    ...champsPrix(formData, staff, LISTE),
    actif: true,
    disponible: false,
  } as Produit;
  try {
    await creerProduit(champs);
    await journaliser({ staff, action: 'PRODUIT_CREE', entite: 'produit', entiteId: id, apres: champs });
  } catch (erreur) {
    echec(LISTE, erreur);
  }
  revalidatePath(LISTE);
  succes(fiche(id), 'cree');
}

export async function modifierProduitAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('produits.modifier');
  const id = idProduit(formData);
  const chemin = fiche(id, 'informations');
  try {
    const actuel = await produitParId(id);
    if (!actuel) echec(LISTE, 'Produit introuvable.');
    const champs = { ...champsDescriptifs(formData, chemin), ...champsPrix(formData, staff, chemin, actuel) };
    const { avant, apres } = await modifierProduit(id, champs);
    await journaliser({ staff, action: 'PRODUIT_MODIFIE', entite: 'produit', entiteId: id, avant, apres });
  } catch (erreur) {
    echec(chemin, erreur);
  }
  revalidatePath(LISTE);
  revalidatePath(fiche(id));
  succes(fiche(id), 'modifie');
}

export async function basculerProduitAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('produits.modifier');
  const id = idProduit(formData);
  const champ = texteChamp(formData.get('champ'), 20);
  const valeur = formData.get('valeur') === 'true';
  const retour = texteChamp(formData.get('retour'), 10) === 'fiche' ? fiche(id) : LISTE;
  if (champ !== 'actif' && champ !== 'disponible') echec(retour, 'Champ inconnu.');
  try {
    const { avant, apres } = await modifierProduit(id, { [champ]: valeur });
    await journaliser({
      staff,
      action: 'PRODUIT_MODIFIE',
      entite: 'produit',
      entiteId: id,
      avant: { [champ]: avant[champ] },
      apres: { [champ]: apres[champ] },
    });
  } catch (erreur) {
    echec(retour, erreur);
  }
  revalidatePath(LISTE);
  revalidatePath(fiche(id));
  succes(retour, champ);
}

/* --------------------------------------------------------------- variantes -- */

function champsVariante(formData: FormData, staff: Staff, chemin: string) {
  const taille = texteOuNull(formData.get('taille'), 20);
  const couleur = texteOuNull(formData.get('couleur'), 40);
  const sku = texteOuNull(formData.get('sku'), 64);
  if (sku && !/^[A-Za-z0-9._-]+$/.test(sku)) echec(chemin, 'SKU : lettres, chiffres, point, tiret ou souligné.');
  const seuil = entierChamp(formData.get('seuil_alerte')) ?? 0;
  if (Number.isNaN(seuil) || seuil > 1_000_000) echec(chemin, 'Seuil d’alerte invalide.');
  const champs: Record<string, unknown> = { taille, couleur, sku, seuil_alerte: seuil };
  if (peut(staff.role, 'produits.prix')) {
    champs.prix_fcfa = montant(formData, 'prix_fcfa', chemin, 'Prix de la variante');
    champs.cout_fcfa = montant(formData, 'cout_fcfa', chemin, 'Coût de la variante');
  }
  return champs;
}

export async function ajouterVarianteAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('produits.modifier');
  const produitId = idProduit(formData);
  const chemin = fiche(produitId, 'variantes');
  const champs = champsVariante(formData, staff, chemin);
  if (!champs.taille && !champs.couleur) echec(chemin, 'Indiquez au moins une taille ou une couleur.');
  try {
    const v = await creerVariante({ produit_id: produitId, stock: 0, prix_fcfa: null, cout_fcfa: null, ...champs } as never);
    await journaliser({ staff, action: 'VARIANTE_CREEE', entite: 'produit', entiteId: produitId, apres: { variante: v.id, ...champs } });
  } catch (erreur) {
    echec(chemin, erreur);
  }
  revalidatePath(fiche(produitId));
  succes(chemin, 'variante');
}

export async function modifierVarianteAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('produits.modifier');
  const produitId = idProduit(formData);
  const varianteId = texteChamp(formData.get('variante_id'), 64);
  const chemin = fiche(produitId, 'variantes');
  if (!estUuid(varianteId)) echec(chemin, 'Variante invalide.');
  const bascule = formData.get('actif');
  const champs = bascule === 'true' || bascule === 'false' ? { actif: bascule === 'true' } : champsVariante(formData, staff, chemin);
  try {
    const { avant, apres } = await modifierVariante(produitId, varianteId, champs);
    await journaliser({ staff, action: 'VARIANTE_MODIFIEE', entite: 'produit', entiteId: produitId, avant, apres });
  } catch (erreur) {
    echec(chemin, erreur);
  }
  revalidatePath(fiche(produitId));
  succes(chemin, 'variante');
}

const TYPES_MOUVEMENT: readonly TypeMouvement[] = ['ENTREE', 'SORTIE', 'AJUSTEMENT', 'PERTE'];

export async function mouvementStockAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('stock.ajuster');
  const produitId = idProduit(formData);
  const varianteId = texteChamp(formData.get('variante_id'), 64);
  const type = texteChamp(formData.get('type'), 12) as TypeMouvement;
  const quantite = entierChamp(formData.get('quantite'));
  const chemin = fiche(produitId, 'stock');
  if (!estUuid(varianteId)) echec(chemin, 'Variante invalide.');
  if (!TYPES_MOUVEMENT.includes(type)) echec(chemin, 'Type de mouvement inconnu.');
  if (quantite === null || Number.isNaN(quantite) || quantite > 1_000_000 || (type !== 'AJUSTEMENT' && quantite === 0)) {
    echec(chemin, 'Quantité invalide.');
  }
  const motif = texteOuNull(formData.get('motif'), 200);
  try {
    const { avant, apres } = await mouvementerStock({ produitId, varianteId, type, quantite, motif });
    await journaliser({
      staff,
      action: 'STOCK_MOUVEMENT',
      entite: 'produit',
      entiteId: produitId,
      avant: { variante: varianteId, stock: avant },
      apres: { variante: varianteId, stock: apres, type, quantite, motif },
    });
  } catch (erreur) {
    echec(chemin, erreur);
  }
  revalidatePath(fiche(produitId));
  revalidatePath('/admin');
  succes(chemin, 'stock');
}

/* ------------------------------------------------------------------ images -- */

export async function ajouterImageAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('produits.modifier');
  const produitId = idProduit(formData);
  const chemin = fiche(produitId, 'images');
  const fichier = formData.get('image');
  if (!(fichier instanceof File) || fichier.size === 0) echec(chemin, 'Choisissez une image.');
  if (fichier.size > TAILLE_MAX_IMAGE) echec(chemin, 'Image trop lourde (4 Mo maximum).');
  try {
    const octets = new Uint8Array(await fichier.arrayBuffer());
    const image = await ajouterImage({ produitId, octets, texteAlternatif: texteOuNull(formData.get('texte_alternatif'), 200) });
    await journaliser({ staff, action: 'IMAGE_AJOUTEE', entite: 'produit', entiteId: produitId, apres: { image: image.id, chemin: image.chemin } });
  } catch (erreur) {
    echec(chemin, erreur);
  }
  revalidatePath(fiche(produitId));
  revalidatePath(LISTE);
  succes(chemin, 'image');
}

export async function gererImageAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('produits.modifier');
  const produitId = idProduit(formData);
  const imageId = texteChamp(formData.get('image_id'), 64);
  const operation = texteChamp(formData.get('operation'), 20);
  const chemin = fiche(produitId, 'images');
  if (!estUuid(imageId)) echec(chemin, 'Image invalide.');
  try {
    if (operation === 'principale') {
      await definirImagePrincipale(produitId, imageId);
      await journaliser({ staff, action: 'IMAGE_PRINCIPALE', entite: 'produit', entiteId: produitId, apres: { image: imageId } });
    } else if (operation === 'supprimer') {
      const image = await supprimerImage(produitId, imageId);
      await journaliser({ staff, action: 'IMAGE_SUPPRIMEE', entite: 'produit', entiteId: produitId, avant: { image: imageId, chemin: image.chemin } });
    } else {
      echec(chemin, 'Opération inconnue.');
    }
  } catch (erreur) {
    echec(chemin, erreur);
  }
  revalidatePath(fiche(produitId));
  revalidatePath(LISTE);
  succes(chemin, 'image');
}

/* -------------------------------------------------------------- catégories -- */

const CATEGORIES = '/admin/produits/categories';

export async function enregistrerCategorieAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('produits.modifier');
  const id = texteChamp(formData.get('id'), 64).toLowerCase();
  const nouvelle = formData.get('nouvelle') === '1';
  if (!ID_CATEGORIE.test(id)) echec(CATEGORIES, 'Identifiant invalide : minuscules, chiffres, - ou _.');
  const bascule = formData.get('actif');
  try {
    if (bascule === 'true' || bascule === 'false') {
      const { avant, apres } = await modifierCategorie(id, { actif: bascule === 'true' });
      await journaliser({ staff, action: 'CATEGORIE_MODIFIEE', entite: 'categorie', entiteId: id, avant: { actif: avant.actif }, apres: { actif: apres.actif } });
    } else {
      const nom = texteChamp(formData.get('nom'), 80);
      const famille = texteChamp(formData.get('famille'), 20);
      const ordre = entierChamp(formData.get('ordre')) ?? 0;
      if (nom.length < 2) echec(CATEGORIES, 'Nom obligatoire.');
      if (!estFamille(famille)) echec(CATEGORIES, 'Famille inconnue.');
      if (Number.isNaN(ordre) || ordre > 10_000) echec(CATEGORIES, 'Ordre invalide.');
      const champs = { nom, famille, ordre, description: texteOuNull(formData.get('description'), 500) };
      if (nouvelle) {
        await creerCategorie({ id, ...champs });
        await journaliser({ staff, action: 'CATEGORIE_CREEE', entite: 'categorie', entiteId: id, apres: champs });
      } else {
        const { avant, apres } = await modifierCategorie(id, champs);
        await journaliser({ staff, action: 'CATEGORIE_MODIFIEE', entite: 'categorie', entiteId: id, avant, apres });
      }
    }
  } catch (erreur) {
    echec(CATEGORIES, erreur);
  }
  revalidatePath(CATEGORIES);
  revalidatePath(LISTE);
  succes(CATEGORIES, nouvelle ? 'cree' : 'modifie');
}
