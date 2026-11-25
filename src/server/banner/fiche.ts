import type { Alerte } from '@/lib/banner/constraints';
import type { DocumentBanner } from '@/lib/banner/model';
import { POLICES } from '@/lib/banner/polices';
import { dpiEffectif, dpiFond } from '@/lib/banner/quality';
import { libelleFinition, libelleSupport, supportParId } from '@/lib/grand-format/catalogue';

import type { Rendu } from './rendu';

/**
 * Fiche de production, en texte : ce que l'imprimeur doit savoir et que le PDF ne montre pas. Aucun
 * prix, aucun coût, aucune coordonnée du client.
 */
export function ficheProduction(doc: DocumentBanner, rendu: Rendu, infos: { reference: string; version: number; quantite: number; empreinte: string; alertes: readonly Alerte[] }): string {
  const { largeurMm: L, hauteurMm: H } = doc.dimensions;
  const c = doc.contraintes;
  const cm = (mm: number) => `${String(Math.round(mm) / 10).replace('.', ',')} cm`;
  const mm = (v: number) => `${String(Math.round(v * 10) / 10).replace('.', ',')} mm`;
  const souple = supportParId(doc.support)?.finitionsApplicables ?? false;
  const l: string[] = [
    'ELEMBO — FICHE DE PRODUCTION',
    '',
    `Devis : ${infos.reference}`,
    `Visuel : ${doc.nom} (version ${infos.version})`,
    `Support : ${libelleSupport(doc.support)}`,
    `Format fini : ${cm(L)} × ${cm(H)} (largeur × hauteur)`,
    `Quantité : ${infos.quantite}`,
    `Finition : ${souple ? libelleFinition(doc.finition) : 'sans objet (support monté)'}`,
    '',
    'FICHIER',
    `PDF vectoriel à l’échelle 1:1, ${rendu.plan.length} page${rendu.plan.length > 1 ? 's' : ''}${rendu.userUnit > 1 ? `, UserUnit ${rendu.userUnit}` : ''}.`,
    c.fondPerduMm > 0 ? `Fond perdu : ${mm(c.fondPerduMm)} (TrimBox = format fini, BleedBox = fond perdu).` : 'Sans fond perdu : le format fini est la page entière.',
    'Couleur : RVB sRGB, sans profil incorporé. Conversion CMJN par l’imprimeur ; BAT recommandé.',
    `Empreinte SHA-256 du PDF : ${infos.empreinte}`,
  ];
  if (rendu.plan.length > 1) {
    l.push('', 'PLAN DE POSE', `${rendu.plan.length} panneaux ${rendu.plan[0].axe === 'x' ? 'de gauche à droite' : 'de haut en bas'}, recouvrement de ${mm(rendu.recouvrementMm)} entre deux panneaux.`);
    for (const p of rendu.plan) l.push(`  Page ${p.page} : ${mm(p.largeurMm)} × ${mm(p.hauteurMm)}, à partir de ${mm(p.debutMm)}`);
  }
  l.push('', 'CONTRAINTES PRISES EN COMPTE (à confirmer par l’imprimeur, non imprimées)', `Marge de sécurité : ${mm(c.margeSecuriteMm)}`);
  if (c.ourletMm > 0) l.push(`Ourlets : ${mm(c.ourletMm)} sur les quatre côtés`);
  if (c.oeillets.actifs) l.push(`Œillets : diamètre ${mm(c.oeillets.diametreMm)}, tous les ${mm(c.oeillets.espacementMm)} au plus, à ${mm(c.oeillets.margeMm)} du bord`);
  if (c.fourreaux.hautMm > 0 || c.fourreaux.basMm > 0) l.push(`Bandes réservées : haut ${mm(c.fourreaux.hautMm)}, bas ${mm(c.fourreaux.basMm)}`);
  l.push('', `POLICES EMBARQUÉES : ${rendu.polices.length ? rendu.polices.map((p) => POLICES.find((x) => p.startsWith(`${x.id}-`))?.nom ?? p).filter((x, i, a) => a.indexOf(x) === i).join(', ') : 'aucune'}`);
  l.push('', `IMAGES (seuils : ${c.dpiMin} dpi au moins, ${c.dpiRecommande} conseillés)`);
  const images = doc.elements.flatMap((e) => {
    const a = e.type === 'image' && e.visible ? doc.assets.find((x) => x.id === e.image.assetId) : undefined;
    return e.type === 'image' && a ? [`  ${e.nom} : ${a.largeurPx} × ${a.hauteurPx} px, ${dpiEffectif(e, a)} dpi à cette taille`] : [];
  });
  const fond = doc.fond.type === 'image' ? doc.assets.find((a) => doc.fond.type === 'image' && a.id === doc.fond.assetId) : undefined;
  if (fond) images.push(`  Fond : ${fond.largeurPx} × ${fond.hauteurPx} px, ${dpiFond(doc, fond)} dpi`);
  l.push(...(images.length ? images : ['  aucune']));
  const alertes = infos.alertes.filter((a) => a.severite !== 'info');
  l.push('', 'POINTS SIGNALÉS', ...(alertes.length ? alertes.map((a) => `  ${a.severite === 'critique' ? '[critique] ' : ''}${a.message}`) : ['  aucun']));
  return `${l.join('\n')}\n`;
}
