'use server';

import { revalidatePath, updateTag } from 'next/cache';

import { entierChamp, texteChamp } from '@/lib/admin/format';
import type { StatutPrix } from '@/lib/tarifs/grille';
import { exigerAcces } from '@/server/admin/acces';
import { journaliser } from '@/server/admin/audit';
import { enregistrerLivraison, lireLivraison } from '@/server/admin/livraison';
import { echec, succes } from '@/server/admin/retour';
import { TAG_TARIFS } from '@/server/tarifs/affichage';

const CHEMIN = '/admin/produits/livraison';
const MAX_FCFA = 1_000_000;
const STATUTS: Record<string, StatutPrix> = { VALIDE: 'valide', PROVISOIRE: 'provisoire', TEST: 'test' };

export async function enregistrerLivraisonAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('produits.prix');
  const statut = STATUTS[texteChamp(formData.get('statut_prix'), 12)];
  if (!statut) echec(CHEMIN, 'Statut inconnu.');
  const delai = entierChamp(formData.get('delai_max_jours'));
  if (delai === null || Number.isNaN(delai) || delai < 1 || delai > 60) echec(CHEMIN, 'Délai maximal invalide (1 à 60 jours).');

  try {
    const actuelle = await lireLivraison();
    // Les villes desservies sont celles du paramètre : seuls leurs frais se règlent ici.
    const villes = actuelle.villes.map((v) => {
      const brut = formData.get(`frais_${v.id}`);
      const frais = entierChamp(brut);
      if (frais !== null && (Number.isNaN(frais) || frais > MAX_FCFA)) echec(CHEMIN, `Frais invalides pour ${v.nom}.`);
      return { ...v, fraisFcfa: frais };
    });
    if (statut === 'valide' && villes.some((v) => v.fraisFcfa === null)) {
      echec(CHEMIN, 'Des frais validés doivent être chiffrés pour chaque ville (laissez « Provisoire » sinon).');
    }
    const { avant, apres } = await enregistrerLivraison({ statutPrix: statut, delaiMaxJours: delai as number, villes });
    await journaliser({ staff, action: 'LIVRAISON_MODIFIEE', entite: 'parametre', entiteId: 'livraison', avant, apres });
  } catch (erreur) {
    echec(CHEMIN, erreur);
  }
  revalidatePath(CHEMIN);
  // Frais affichés dans l'atelier, la page tableaux et la boutique : régénérés tout de suite.
  updateTag(TAG_TARIFS);
  succes(CHEMIN, 'modifie');
}
