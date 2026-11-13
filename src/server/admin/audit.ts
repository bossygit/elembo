/**
 * Journal d'audit du back-office (`public.journal_audit`).
 *
 * Chaque écriture faite depuis /admin y laisse une trace : qui (id + email), quoi, sur quelle
 * entité, avant / après. C'est la source de l'« historique des modifications » affiché sur les
 * fiches commande, produit, client et devis.
 *
 * Un échec d'écriture du journal ne bloque pas l'opération métier déjà validée en base : il est
 * signalé dans les logs serveur (sans données personnelles).
 */

import { supabaseAdmin } from '@/server/supabase/client';
import type { Staff } from './acces';

export type EntiteAuditee =
  | 'commande'
  | 'produit'
  | 'variante'
  | 'categorie'
  | 'client'
  | 'devis'
  | 'production'
  | 'partenaire'
  | 'fichier'
  | 'export'
  | 'session';

export async function journaliser(options: {
  staff: Pick<Staff, 'id' | 'email'> | null;
  action: string;
  entite: EntiteAuditee;
  entiteId?: string | null;
  avant?: unknown;
  apres?: unknown;
}): Promise<void> {
  try {
    const { error } = await supabaseAdmin().from('journal_audit').insert({
      acteur: options.staff?.id ?? null,
      acteur_email: options.staff?.email ?? null,
      action: options.action.slice(0, 80),
      entite: options.entite,
      entite_id: options.entiteId ?? null,
      avant: options.avant ?? null,
      apres: options.apres ?? null,
    });
    if (error) console.error(`Audit non enregistré (${options.action}) :`, error.code ?? error.message);
  } catch (erreur) {
    console.error(`Audit non enregistré (${options.action}) :`, (erreur as Error).message);
  }
}

export type EvenementAudit = {
  id: number;
  acteur_email: string | null;
  action: string;
  entite: string;
  entite_id: string | null;
  avant: Record<string, unknown> | null;
  apres: Record<string, unknown> | null;
  cree_le: string;
};

export async function historiqueAudit(entite: EntiteAuditee, entiteId: string, limite = 50): Promise<EvenementAudit[]> {
  const { data, error } = await supabaseAdmin()
    .from('journal_audit')
    .select('id, acteur_email, action, entite, entite_id, avant, apres, cree_le')
    .eq('entite', entite)
    .eq('entite_id', entiteId)
    .order('cree_le', { ascending: false })
    .limit(limite);
  if (error) throw new Error(error.message);
  return (data ?? []) as EvenementAudit[];
}

/**
 * Champs modifiés entre deux états (pour un affichage « champ : avant → après »).
 * Les clés techniques (dates de mise à jour) sont ignorées.
 */
export function differences(
  avant: Record<string, unknown> | null | undefined,
  apres: Record<string, unknown> | null | undefined,
): { champ: string; avant: unknown; apres: unknown }[] {
  if (!avant || !apres) return [];
  const ignorees = new Set(['maj_le', 'cree_le']);
  const cles = new Set([...Object.keys(avant), ...Object.keys(apres)]);
  const resultat: { champ: string; avant: unknown; apres: unknown }[] = [];
  for (const cle of cles) {
    if (ignorees.has(cle)) continue;
    if (JSON.stringify(avant[cle] ?? null) !== JSON.stringify(apres[cle] ?? null)) {
      resultat.push({ champ: cle, avant: avant[cle] ?? null, apres: apres[cle] ?? null });
    }
  }
  return resultat;
}
