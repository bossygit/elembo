import { PDFName, PDFRawStream, type PDFDocument, type PDFRef } from 'pdf-lib';

/**
 * Banner Studio — PNG opaque embarqué **sans être décodé** : le PDF comprend nativement la
 * compression PNG (prédicteur 15). pdf-lib décompresse et recompresse tout, ce qui coûte 4 octets
 * par pixel et gonfle souvent le fichier. Renvoie `null` pour un PNG transparent, entrelacé ou à
 * 16 bits : pdf-lib s'en charge.
 */
export function embarquerPngOpaque(pdf: PDFDocument, o: Uint8Array): { ref: PDFRef; width: number; height: number } | null {
  const u32 = (p: number) => ((o[p] << 24) | (o[p + 1] << 16) | (o[p + 2] << 8) | o[p + 3]) >>> 0;
  if (o.length < 45) return null;
  const width = u32(16);
  const height = u32(20);
  const [bits, couleur, , , entrelace] = o.subarray(24, 29);
  if (bits !== 8 || entrelace !== 0 || ![0, 2, 3].includes(couleur)) return null;

  const donnees: Uint8Array[] = [];
  let palette: Uint8Array | null = null;
  let complet = false;
  for (let p = 8; p + 12 <= o.length; ) {
    const taille = u32(p);
    const nom = String.fromCharCode(...o.subarray(p + 4, p + 8));
    if (p + 12 + taille > o.length) return null;
    const contenu = o.subarray(p + 8, p + 8 + taille);
    if (nom === 'tRNS') return null;
    if (nom === 'PLTE') palette = contenu;
    if (nom === 'IDAT') donnees.push(contenu);
    if (nom === 'IEND') { complet = true; break; }
    p += 12 + taille;
  }
  if (!complet || !donnees.length || (couleur === 3 && (!palette || palette.length % 3 !== 0))) return null;

  const total = donnees.reduce((s, d) => s + d.length, 0);
  const flux = new Uint8Array(total);
  let pos = 0;
  for (const d of donnees) {
    flux.set(d, pos);
    pos += d.length;
  }
  const espace = couleur === 2 ? 'DeviceRGB' : couleur === 0 ? 'DeviceGray' : ['Indexed', 'DeviceRGB', palette!.length / 3 - 1, pdf.context.register(pdf.context.flateStream(palette!))];
  const dict = pdf.context.obj({
    Type: 'XObject', Subtype: 'Image', Width: width, Height: height, BitsPerComponent: 8, ColorSpace: espace, Filter: 'FlateDecode', Length: total,
    DecodeParms: { Predictor: 15, Colors: couleur === 2 ? 3 : 1, BitsPerComponent: 8, Columns: width },
  });
  dict.set(PDFName.of('Filter'), PDFName.of('FlateDecode'));
  return { ref: pdf.context.register(PDFRawStream.of(dict, flux)), width, height };
}
