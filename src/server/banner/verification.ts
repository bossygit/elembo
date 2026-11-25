import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef } from 'pdf-lib';

import type { DocumentBanner } from '@/lib/banner/model';

import { PT_PAR_MM, type PagePlan } from './rendu';

/** Relecture du PDF produit (audit §7.8) : on ne remet à l'imprimeur que ce qu'on a vérifié. */
export type ControlePdf = { ok: boolean; ecarts: string[]; pages: { largeurMm: number; hauteurMm: number }[]; polices: number; images: number };

const TOLERANCE_PT = 0.2;
/** Rien d'actif ni d'annexe dans un fichier d'impression. */
const INTERDITS = ['JS', 'JavaScript', 'OpenAction', 'AA', 'URI', 'Launch', 'EmbeddedFiles', 'AcroForm', 'Annots'];

export async function verifierPdf(octets: Uint8Array, doc: DocumentBanner, plan: PagePlan[], attendu: { polices: number; images: number }): Promise<ControlePdf> {
  const ecarts: string[] = [];
  const pdf = await PDFDocument.load(octets, { updateMetadata: false });
  const pages = pdf.getPages();
  const b = doc.contraintes.fondPerduMm;
  if (pages.length !== plan.length) ecarts.push(`${pages.length} page(s) au lieu de ${plan.length}`);
  const mesures = pages.map((page, i) => {
    const uu = page.node.get(PDFName.of('UserUnit'));
    const u = uu instanceof PDFNumber ? uu.asNumber() : 1;
    const p = plan[i];
    const boite = (nom: string, r: { x: number; y: number; width: number; height: number }, x: number, l: number, h: number) => {
      const voulu = [x, x, l, h].map((v) => v * PT_PAR_MM);
      const lu = [r.x, r.y, r.width, r.height].map((v) => v * u);
      if (p && voulu.some((v, n) => Math.abs(v - lu[n]) > TOLERANCE_PT)) ecarts.push(`page ${i + 1} : ${nom} inattendue`);
    };
    if (p) {
      boite('MediaBox', page.getMediaBox(), 0, p.largeurMm + 2 * b, p.hauteurMm + 2 * b);
      boite('BleedBox', page.getBleedBox(), 0, p.largeurMm + 2 * b, p.hauteurMm + 2 * b);
      boite('TrimBox', page.getTrimBox(), b, p.largeurMm, p.hauteurMm);
    }
    const t = page.getTrimBox();
    if (t.width > 14_400.5 || t.height > 14_400.5) ecarts.push(`page ${i + 1} : au-delà de la limite PDF`);
    return { largeurMm: Math.round(((t.width * u) / PT_PAR_MM) * 10) / 10, hauteurMm: Math.round(((t.height * u) / PT_PAR_MM) * 10) / 10 };
  });

  let polices = 0;
  const imagesVues = new Set<string>();
  const masques = new Set<string>();
  for (const [ref, objet] of pdf.context.enumerateIndirectObjects()) {
    const dict = objet instanceof PDFRawStream ? objet.dict : objet instanceof PDFDict ? objet : null;
    if (!dict) continue;
    for (const cle of INTERDITS) {
      const v = dict.lookup(PDFName.of(cle));
      // pdf-lib ajoute à chaque page une liste d'annotations vide.
      if (v !== undefined && !(v instanceof PDFArray && v.size() === 0)) ecarts.push(`contenu interdit : ${cle}`);
    }
    if (dict.has(PDFName.of('FontFile2')) || dict.has(PDFName.of('FontFile3'))) polices++;
    if (dict.get(PDFName.of('Subtype')) === PDFName.of('Image')) imagesVues.add(ref.toString());
    // Le masque de transparence d'un PNG est une image à part : elle n'est pas comptée.
    const masque = dict.get(PDFName.of('SMask'));
    if (masque instanceof PDFRef) masques.add(masque.toString());
  }
  const images = [...imagesVues].filter((r) => !masques.has(r)).length;
  if (polices !== attendu.polices) ecarts.push(`${polices} police(s) embarquée(s) au lieu de ${attendu.polices}`);
  if (images !== attendu.images) ecarts.push(`${images} image(s) au lieu de ${attendu.images}`);
  return { ok: ecarts.length === 0, ecarts, pages: mesures, polices, images };
}
