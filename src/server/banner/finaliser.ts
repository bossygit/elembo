import { createHash } from 'node:crypto';

import { bloquant, evaluer, resoudreContraintes, type Alerte, type ProfilImpression } from '@/lib/banner/constraints';
import { analyserImage, aNormaliser, dimensionsImage, OCTETS_ANALYSE, typeReel } from '@/lib/banner/images';
import type { DocumentBanner } from '@/lib/banner/model';
import { NOM_APERCU, NOM_PROJET, nomFichierAsset } from '@/lib/banner/paquet';
import { glyphesManquants, POLICES } from '@/lib/banner/polices';
import { choisirProfil } from '@/lib/banner/profils';
import { lireDocument } from '@/lib/banner/schema';
import { textesExemple } from '@/lib/banner/templates';
import { fichiersDuDevis } from '@/server/devis/repository';

import { ficheProduction } from './fiche';
import { listerProfils } from './profils';
import {
  archiverVisuelCommande, commandeDuDevisBanner, demandeDuDevis, echouerVisuel, ecrireObjet, effacerObjets, lireObjet, reserverVisuel, terminerVisuel,
  visuelCourant, visuelParId, type DemandeVisuel, type FichierServeur,
} from './repository';
import { ErreurRendu, rendrePdf } from './rendu';
import { verifierPdf } from './verification';

/**
 * Banner Studio — finalisation d'un visuel (audit §4.7, §4.8) : le serveur relit les fichiers déposés,
 * refait lui-même tous les contrôles, rend le PDF, le **vérifie**, puis l'attache au devis. Rien de ce
 * que le navigateur affirme n'est cru : ni les contraintes, ni les dimensions, ni les images.
 */

/** À augmenter quand le rendu change : les projets déjà rendus pourront l'être à nouveau. */
export const VERSION_RENDU = 1;
/** Limite des buckets privés. */
export const PDF_MAX_OCTETS = 50 * 1024 * 1024;

export class ErreurFinalisation extends Error {
  constructor(public statut: number, message: string) {
    super(message);
    this.name = 'ErreurFinalisation';
  }
}

export type ResultatVisuel = { etat: 'RENDU' | 'A_REVOIR' | 'EN_COURS'; version: number; alertes: { severite: string; message: string }[] };

const sha256 = (o: Uint8Array | string) => createHash('sha256').update(o).digest('hex');
const enAlertes = (v: unknown): ResultatVisuel['alertes'] =>
  Array.isArray(v) ? v.filter((a) => a && a.severite !== 'info').map((a) => ({ severite: String(a.severite), message: String(a.message) })) : [];

const critique = (code: string, message: string): Alerte => ({ code: code as Alerte['code'], severite: 'critique', elementId: null, message });

/** Le visuel doit être celui qui a été chiffré. */
export function incoherences(doc: DocumentBanner, d: DemandeVisuel): Alerte[] {
  const mm = (m: number) => Math.round(Number(m) * 1000);
  const ecarts: string[] = [];
  if (doc.dimensions.largeurMm !== mm(d.largeur_m) || doc.dimensions.hauteurMm !== mm(d.hauteur_m)) ecarts.push('le format');
  if (doc.support !== d.support) ecarts.push('le support');
  if (doc.finition !== d.finition) ecarts.push('la finition');
  return ecarts.length ? [critique('DOCUMENT_INCOHERENT', `Le visuel ne correspond pas à la demande : ${ecarts.join(', ')}.`)] : [];
}

/** Document canonique : contraintes re-résolues par le serveur depuis le profil, celles du navigateur sont ignorées. */
export function canoniser(doc: DocumentBanner, profil: ProfilImpression): DocumentBanner {
  return {
    ...doc,
    profil: profil.id ? { id: profil.id, version: profil.version } : null,
    contraintes: resoudreContraintes(profil, doc.finition),
    meta: { ...doc.meta, versionRendu: VERSION_RENDU },
  };
}

/** Profil de la demande : celui de l'imprimeur affecté, sinon le profil public du support. */
export async function profilDeLaDemande(support: DocumentBanner['support'], demande: DemandeVisuel): Promise<ProfilImpression> {
  return choisirProfil(support, demande.partenaire_id, await listerProfils({ support, actifs: true }));
}

/** Contrôle une image déposée contre ce que le document en dit ; renvoie le motif de refus. */
export function refusImage(asset: DocumentBanner['assets'][number], octets: Uint8Array): string | null {
  const entete = octets.subarray(0, OCTETS_ANALYSE);
  if (typeReel(entete) !== asset.mime) return 'type inattendu';
  if (asset.sha256 && sha256(octets) !== asset.sha256) return 'empreinte différente';
  if (aNormaliser(analyserImage(entete))) return 'orientation ou couleurs non normalisées';
  const d = dimensionsImage(entete);
  return d && d.largeur === asset.largeurPx && d.hauteur === asset.hauteurPx ? null : 'dimensions différentes';
}

type Fichiers = Awaited<ReturnType<typeof fichiersDuDevis>>;
type Source = { doc: DocumentBanner; checksum: string; origine: 'CLIENT' | 'STAFF'; fichierImage: (a: DocumentBanner['assets'][number]) => Fichiers[number] | undefined };

/** Visuel envoyé par le client : le projet déposé avec la demande. */
export async function finaliserVisuel(devisId: string, reference: string): Promise<ResultatVisuel> {
  const [fichiers, demande] = await Promise.all([fichiersDuDevis(devisId), demandeDuDevis(devisId)]);
  if (!demande) throw new ErreurFinalisation(409, 'Ce devis n’est pas une demande de banderole.');
  const source = fichiers.find((f) => f.nom === NOM_PROJET && f.verifie && f.chemin.startsWith(`devis/${devisId}/`));
  if (!source) throw new ErreurFinalisation(409, 'Le projet du Studio n’a pas été reçu.');
  const octets = await lireObjet('devis', source.chemin);
  if (!octets || sha256(octets) !== source.checksum) throw new ErreurFinalisation(409, 'Le projet du Studio est illisible.');
  const lecture = lireDocument(new TextDecoder('utf-8').decode(octets));
  if (!lecture.ok) throw new ErreurFinalisation(422, 'Le projet du Studio est invalide.');
  const parNom = (a: DocumentBanner['assets'][number]) => fichiers.find((x) => x.nom === nomFichierAsset(a) && x.verifie && x.chemin.startsWith(`devis/${devisId}/`));
  return rendreVisuel(devisId, reference, { doc: lecture.document, checksum: source.checksum!, origine: 'CLIENT', fichierImage: parNom }, fichiers, demande);
}

/**
 * Régénération par le personnel (changement d'imprimeur ou de profil) : même document, contraintes du
 * profil actuel. Les images sont retrouvées par les identifiants enregistrés au rendu précédent.
 */
export async function regenererVisuel(devisId: string, reference: string): Promise<ResultatVisuel> {
  const [fichiers, demande, courant] = await Promise.all([fichiersDuDevis(devisId), demandeDuDevis(devisId), visuelCourant(devisId)]);
  if (!demande) throw new ErreurFinalisation(409, 'Ce devis n’est pas une demande de banderole.');
  if (!courant) return finaliserVisuel(devisId, reference);
  const lecture = lireDocument(courant.projet);
  if (!lecture.ok) throw new ErreurFinalisation(422, 'Le visuel enregistré est illisible.');
  const ids = ((courant.preflight?.assets ?? {}) as Record<string, string>);
  const fichierImage = (a: DocumentBanner['assets'][number]) =>
    fichiers.find((x) => x.id === ids[a.id] && x.verifie && x.chemin.startsWith(`devis/${devisId}/`)) ??
    fichiers.find((x) => x.nom === nomFichierAsset(a) && x.verifie && x.chemin.startsWith(`devis/${devisId}/`));
  return rendreVisuel(devisId, reference, { doc: lecture.document, checksum: sha256(JSON.stringify(lecture.document)), origine: 'STAFF', fichierImage }, fichiers, demande);
}

async function rendreVisuel(devisId: string, reference: string, source: Source, fichiers: Fichiers, demande: DemandeVisuel): Promise<ResultatVisuel> {
  const profil = await profilDeLaDemande(source.doc.support, demande);
  const doc = canoniser(source.doc, profil);
  const reservation = await reserverVisuel({
    devisId, checksum: sha256(`${VERSION_RENDU}:${profil.id ?? 'repli'}:${profil.version}:${source.checksum}`), projet: doc, projetVersion: doc.version,
    categorie: doc.categorie, profilId: profil.id, profilVersion: profil.id ? profil.version : null, origine: source.origine,
  }).catch((e: Error) => {
    if (e.message.includes('VISUEL_STATUT')) throw new ErreurFinalisation(409, 'Ce devis n’accepte plus de visuel.');
    if (e.message.includes('VISUEL_LIMITE')) throw new ErreurFinalisation(429, 'Trop de versions de ce visuel.');
    throw e;
  });
  const { visuel_id: visuelId, version } = reservation;
  if (reservation.etat === 'EN_COURS') return { etat: 'EN_COURS', version, alertes: [] };
  if (reservation.etat === 'DEJA') {
    const v = await visuelParId(visuelId);
    return { etat: v?.statut === 'RENDU' ? 'RENDU' : 'A_REVOIR', version, alertes: enAlertes(v?.avertissements) };
  }

  const deposes: string[] = [];
  try {
    // --- Images : seules celles du devis, vérifiées, identiques à ce que le document annonce.
    const images = new Map<string, Uint8Array>();
    const manifeste: Record<string, string> = {};
    const refus: Alerte[] = [];
    for (const a of doc.assets) {
      if (a.placeholder) continue;
      const f = source.fichierImage(a);
      const o = f ? await lireObjet('devis', f.chemin) : null;
      if (!f || !o || sha256(o) !== f.checksum) continue; // signalée comme manquante par le préflight
      const motif = refusImage(a, o);
      if (motif) {
        refus.push(critique('IMAGE_REFUSEE', `L’image « ${a.nom} » n’est pas utilisable : ${motif}.`));
        continue;
      }
      images.set(a.id, o);
      manifeste[a.id] = f.id;
    }

    const alertes = [
      ...incoherences(doc, demande),
      ...refus,
      ...evaluer(doc, {
        statutProfil: profil.statut,
        assetsDisponibles: new Set(images.keys()),
        policesDisponibles: new Set(POLICES.map((p) => p.id)),
        glyphesManquants,
        textesExemple: textesExemple(doc),
      }),
    ];
    const preflight = { dimensions: doc.dimensions, versionRendu: VERSION_RENDU, assets: manifeste, profil: { id: profil.id, nom: profil.nom, version: profil.version, statut: profil.statut } };

    const aRevoir = async (liste: Alerte[]): Promise<ResultatVisuel> => {
      await terminerVisuel({ visuelId, statut: 'A_REVOIR', projet: doc, contraintes: doc.contraintes, preflight, avertissements: liste, fichiers: [], apercuChemin: null, checksumProduction: null });
      return { etat: 'A_REVOIR', version, alertes: enAlertes(liste) };
    };
    if (bloquant(alertes)) return await aRevoir(alertes);

    let rendu;
    try {
      rendu = await rendrePdf(doc, images);
    } catch (e) {
      // Refus explicite du rendu : pas un incident, le personnel doit regarder.
      if (e instanceof ErreurRendu) return await aRevoir([critique(e.code, e.message), ...alertes]);
      throw e;
    }
    if (rendu.octets.byteLength > PDF_MAX_OCTETS) return await aRevoir([critique('PDF_TROP_LOURD', 'Le fichier d’impression dépasse 50 Mo : images à alléger.'), ...alertes]);

    const controle = await verifierPdf(rendu.octets, doc, rendu.plan, { polices: rendu.polices.length, images: images.size });
    if (!controle.ok) throw new Error(`PDF non conforme : ${controle.ecarts.join(' ; ')}`);

    // --- Dépôt : noms de version, jamais réutilisés.
    const empreinte = sha256(rendu.octets);
    const texte = (s: string) => new TextEncoder().encode(s);
    const aDeposer: { role: FichierServeur['role']; nom: string; octets: Uint8Array; mime: string; type: string }[] = [
      { role: 'production', nom: `visuel-banner-v${version}.pdf`, octets: rendu.octets, mime: 'application/pdf', type: 'VISUEL_IMPRESSION' },
      { role: 'projet', nom: `projet-banner-v${version}.json`, octets: texte(JSON.stringify(doc)), mime: 'application/json', type: 'SOURCE' },
      { role: 'fiche', nom: `fiche-production-v${version}.txt`, octets: texte(ficheProduction(doc, rendu, { reference, version, quantite: Number(demande.quantite), empreinte, alertes, profil })), mime: 'text/plain', type: 'FICHE_PRODUCTION' },
    ];
    const enregistres: FichierServeur[] = [];
    for (const f of aDeposer) {
      const chemin = `devis/${devisId}/${f.nom}`;
      await ecrireObjet('devis', chemin, f.octets, f.mime);
      deposes.push(chemin);
      enregistres.push({ role: f.role, nom: f.nom, chemin, type_mime: f.mime, taille_octets: f.octets.byteLength, type_fichier: f.type, checksum: sha256(f.octets) });
    }
    const apercuChemin = await deposerApercu(devisId, version, fichiers);

    await terminerVisuel({
      visuelId, statut: 'RENDU', projet: doc, contraintes: doc.contraintes, avertissements: alertes, fichiers: enregistres, apercuChemin, checksumProduction: empreinte,
      preflight: { ...preflight, pages: controle.pages, plan: rendu.plan, recouvrementMm: rendu.recouvrementMm, userUnit: rendu.userUnit, polices: rendu.polices, tailleOctets: rendu.octets.byteLength },
    });
    // Commande déjà créée (régénération après acceptation) : le nouveau visuel la suit.
    const commande = await commandeDuDevisBanner(devisId);
    if (commande) await archiverVisuel(devisId, commande.id).catch((e) => console.error('visuel_archivage_echec', reference, e instanceof Error ? e.message : e));
    return { etat: 'RENDU', version, alertes: enAlertes(alertes) };
  } catch (e) {
    // Rien à moitié : les objets déposés sans ligne en base sont retirés.
    await effacerObjets('devis', deposes).catch(() => undefined);
    await echouerVisuel(visuelId, e instanceof Error ? e.message : 'erreur inconnue').catch(() => undefined);
    throw e;
  }
}

/**
 * Archivage dans la commande (audit §7.7) : PDF, projet et fiche du visuel courant sont recopiés dans
 * le stockage de production et conservés 24 mois. Sans visuel rendu, rien à faire.
 */
export async function archiverVisuel(devisId: string, commandeId: string): Promise<number> {
  const courant = await visuelCourant(devisId);
  if (!courant || courant.statut !== 'RENDU') return 0;
  const ids = new Set([courant.fichier_production_id, courant.fichier_projet_id, courant.fichier_fiche_id].filter(Boolean));
  const fichiers = (await fichiersDuDevis(devisId)).filter((f) => ids.has(f.id));
  const copies: Omit<FichierServeur, 'role'>[] = [];
  for (const f of fichiers) {
    const o = await lireObjet('devis', f.chemin);
    if (!o || sha256(o) !== f.checksum) throw new Error(`Fichier du visuel illisible : ${f.nom}`);
    const chemin = `commandes/${commandeId}/${f.nom}`;
    await ecrireObjet('production', chemin, o, f.type_mime);
    copies.push({ nom: f.nom, chemin, type_mime: f.type_mime, taille_octets: o.byteLength, type_fichier: f.type_fichier, checksum: f.checksum! });
  }
  await archiverVisuelCommande(commandeId, copies);
  return copies.length;
}

/** L'aperçu du client, déjà vérifié comme JPEG, est recopié à côté du visuel. Facultatif. */
async function deposerApercu(devisId: string, version: number, fichiers: Awaited<ReturnType<typeof fichiersDuDevis>>): Promise<string | null> {
  const f = fichiers.find((x) => x.nom === NOM_APERCU && x.verifie && x.chemin.startsWith(`devis/${devisId}/`));
  const o = f ? await lireObjet('devis', f.chemin) : null;
  if (!f || !o || sha256(o) !== f.checksum || typeReel(o) !== 'image/jpeg' || o.byteLength > 5 * 1024 * 1024) return null;
  const chemin = `visuels/${devisId}/apercu-v${version}.jpg`;
  return ecrireObjet('production', chemin, o, 'image/jpeg').then(() => chemin, () => null);
}
