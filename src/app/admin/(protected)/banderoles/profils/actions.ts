'use server';

import { revalidatePath } from 'next/cache';

import { estUuid, texteChamp } from '@/lib/admin/format';
import { lireSaisieProfil, SUPPORTS_PROFILS } from '@/lib/banner/profils';
import type { SupportStudio } from '@/lib/banner/model';
import { libelleSupport } from '@/lib/grand-format/catalogue';
import { exigerAcces } from '@/server/admin/acces';
import { journaliser } from '@/server/admin/audit';
import { echec, succes } from '@/server/admin/retour';
import { capacitePartenaire, creerProfil, listerProfils, modifierProfil, nomPartenaire, profilParId } from '@/server/banner/profils';

const PAGE = '/admin/banderoles/profils';


function idProfil(formData: FormData): string {
  const id = texteChamp(formData.get('profil_id'), 64);
  if (!estUuid(id)) echec(PAGE, 'Profil invalide.');
  return id;
}

/** Valeurs du profil. Une valeur sensible modifiée retire la validation (contrôle en base). */
export async function enregistrerProfilAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('grand_format.profils');
  const id = idProfil(formData);
  const lu = lireSaisieProfil((cle) => (formData.has(cle) ? String(formData.get(cle)) : null));
  if (!lu.ok) echec(`${PAGE}#p-${id}`, lu.erreur);
  const avant = await profilParId(id);
  if (!avant || avant.statut === 'ARCHIVE') echec(PAGE, 'Profil introuvable ou archivé.');
  try {
    const r = await modifierProfil(id, lu.valeurs);
    await journaliser({ staff, action: 'PROFIL_IMPRESSION_MODIFIE', entite: 'profil_impression', entiteId: id, avant: r.avant, apres: r.apres });
  } catch (e) {
    echec(`${PAGE}#p-${id}`, e);
  }
  revalidatePath(PAGE);
  succes(`${PAGE}#p-${id}`, 'enregistre');
}

/** Validation nominative et datée : la personne connectée atteste que l'imprimeur a confirmé ces valeurs. */
export async function validerProfilAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('grand_format.profils');
  const id = idProfil(formData);
  if (formData.get('confirmation') !== 'oui') echec(`${PAGE}#p-${id}`, 'Cochez la confirmation de l’imprimeur.');
  const p = await profilParId(id);
  if (!p || p.statut === 'ARCHIVE') echec(PAGE, 'Profil introuvable ou archivé.');
  try {
    await modifierProfil(id, { statut: 'VALIDE', valide_par: staff.id, valide_par_email: staff.email ?? staff.id, valide_le: new Date().toISOString() });
    await journaliser({ staff, action: 'PROFIL_IMPRESSION_VALIDE', entite: 'profil_impression', entiteId: id, apres: { version: p.version } });
  } catch (e) {
    echec(`${PAGE}#p-${id}`, e);
  }
  revalidatePath(PAGE);
  succes(`${PAGE}#p-${id}`, 'valide');
}

export async function retirerValidationAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('grand_format.profils');
  const id = idProfil(formData);
  try {
    await modifierProfil(id, { statut: 'A_VALIDER' });
    await journaliser({ staff, action: 'PROFIL_IMPRESSION_A_VALIDER', entite: 'profil_impression', entiteId: id });
  } catch (e) {
    echec(`${PAGE}#p-${id}`, e);
  }
  revalidatePath(PAGE);
  succes(`${PAGE}#p-${id}`, 'retire');
}

/** Un profil de partenaire s'archive ; un profil public ne s'archive pas (il sert de repli). */
export async function archiverProfilAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('grand_format.profils');
  const id = idProfil(formData);
  const p = await profilParId(id);
  if (!p || p.est_public) echec(PAGE, 'Un profil public ne s’archive pas.');
  try {
    await modifierProfil(id, { statut: 'ARCHIVE' });
    await journaliser({ staff, action: 'PROFIL_IMPRESSION_ARCHIVE', entite: 'profil_impression', entiteId: id });
  } catch (e) {
    echec(PAGE, e);
  }
  revalidatePath(PAGE);
  succes(PAGE, 'archive');
}

/**
 * Profil d'un partenaire, prérempli depuis le profil public du support et, pour la laize et la
 * longueur, depuis la capacité grand format validée du partenaire (Elembo Partners).
 */
export async function creerProfilPartenaireAction(formData: FormData): Promise<void> {
  const staff = await exigerAcces('grand_format.profils');
  const partenaireId = texteChamp(formData.get('partenaire_id'), 64);
  const support = texteChamp(formData.get('support'), 20) as SupportStudio;
  if (!estUuid(partenaireId) || !SUPPORTS_PROFILS.includes(support)) echec(PAGE, 'Partenaire ou support invalide.');
  const base = (await listerProfils({ support, actifs: true })).find((l) => l.est_public);
  const capacite = await capacitePartenaire(partenaireId, support);
  let id = '';
  try {
    const p = await creerProfil({
      nom: `${libelleSupport(support)} — ${(await nomPartenaire(partenaireId)) ?? 'imprimeur'}`.slice(0, 120),
      support,
      partenaire_id: partenaireId,
      statut: 'A_VALIDER',
      ...(base ? Object.fromEntries(Object.entries(base).filter(([k]) => /_mm$|^dpi_|^mode_grand_format$/.test(k))) : {}),
      laize_max_mm: capacite?.largeur_max_mm ?? null,
      longueur_max_mm: capacite?.longueur_max_mm ?? null,
    });
    id = p.id;
    await journaliser({ staff, action: 'PROFIL_IMPRESSION_CREE', entite: 'profil_impression', entiteId: p.id, apres: { partenaire_id: partenaireId, support } });
  } catch (e) {
    echec(PAGE, e);
  }
  revalidatePath(PAGE);
  succes(`${PAGE}#p-${id}`, 'cree');
}
