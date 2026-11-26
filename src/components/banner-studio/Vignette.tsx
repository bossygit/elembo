import { placementForme } from '@/lib/banner/formes';
import type { DocumentBanner, Element } from '@/lib/banner/model';
import { metriquesDe, POLICES, varianteDe } from '@/lib/banner/polices';

/**
 * Vignette SVG d'un document (décision 5) : aucune mesure, donc rendue n'importe où. L'alignement
 * passe par `text-anchor` ; les images sont représentées par un aplat.
 */
export function Vignette({ document: d, className }: { document: DocumentBanner; className?: string }) {
  const { largeurMm: L, hauteurMm: H } = d.dimensions;
  return (
    <svg viewBox={`0 0 ${L} ${H}`} className={className} aria-hidden="true" focusable="false">
      <rect width={L} height={H} fill={d.fond.couleur} />
      {d.elements.filter((e) => e.visible).map((e) => (
        <g key={e.id} transform={`translate(${e.xMm} ${e.yMm}) rotate(${e.rotationDeg})`} opacity={e.opacite}><Contenu e={e} /></g>
      ))}
    </svg>
  );
}

function Contenu({ e }: { e: Element }) {
  const w = e.largeurMm;
  const h = e.hauteurMm;
  if (e.type === 'image') {
    const u = Math.min(w, h);
    return (
      <>
        <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="#D8D1C4" />
        <circle cy={-u * 0.14} r={u * 0.19} fill="#B3AA99" />
        <path d={`M${-u * 0.36} ${h / 2}C${-u * 0.36} ${u * 0.02} ${u * 0.36} ${u * 0.02} ${u * 0.36} ${h / 2}Z`} fill="#B3AA99" />
      </>
    );
  }
  if (e.type === 'texte') {
    const t = e.texte;
    const m = metriquesDe(t);
    const v = varianteDe(t);
    const lignes = t.contenu.split('\n');
    const pas = t.corpsMm * t.interligne;
    const x = t.alignement === 'left' ? -w / 2 : t.alignement === 'right' ? w / 2 : 0;
    const base = (-pas * lignes.length) / 2 + (pas - (m.ascendante - m.descendante) * t.corpsMm) / 2 + m.ascendante * t.corpsMm;
    const police = POLICES.find((p) => p.id === t.policeId);
    return (
      <text fontFamily={police ? `"Studio ${police.nom}", sans-serif` : 'sans-serif'} fontSize={t.corpsMm} fontWeight={v.graisse} fontStyle={v.italique ? 'italic' : undefined} letterSpacing={t.interlettrageEm ? `${t.interlettrageEm}em` : undefined} fill={t.couleur} textAnchor={t.alignement === 'left' ? 'start' : t.alignement === 'right' ? 'end' : 'middle'}>
        {lignes.map((l, i) => <tspan key={i} x={x} y={base + i * pas}>{l}</tspan>)}
      </text>
    );
  }
  const p = placementForme(e);
  const peint = { fill: e.forme.fond ?? 'none', stroke: e.forme.contour && p.epaisseurMm ? e.forme.contour : undefined };
  if (p.decoration) return <path transform={`translate(${p.decoration.x} ${p.decoration.y}) scale(${p.decoration.echelle})`} d={p.decoration.trace} {...peint} strokeWidth={p.epaisseurMm / p.decoration.echelle} strokeLinejoin="round" />;
  const { x, y, largeur, hauteur } = p.cadre;
  if (e.forme.nature === 'ellipse') return <ellipse rx={largeur / 2} ry={hauteur / 2} {...peint} strokeWidth={p.epaisseurMm} />;
  return <rect x={x} y={y} width={largeur} height={hauteur} rx={p.rayonMm} {...peint} strokeWidth={p.epaisseurMm} />;
}

