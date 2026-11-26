'use client';

import { useEffect, useRef } from 'react';

import { pasRegle } from '@/lib/banner/vue';

import { useStudio } from './contexte';

export const EPAISSEUR_REGLE = 22;

/** Règle graduée en centimètres, dessinée dans le repère de la vue. Décorative pour la lecture d'écran. */
export function Regle({ axe }: { axe: 'x' | 'y' }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const vue = useStudio((e) => e.vue);
  const longueur = useStudio((e) => (axe === 'x' ? e.cadre.largeur : e.cadre.hauteur));
  const format = useStudio((e) => (axe === 'x' ? e.document.dimensions.largeurMm : e.document.dimensions.hauteurMm));

  useEffect(() => {
    const canvas = ref.current;
    const c = canvas?.getContext('2d');
    if (!canvas || !c) return;
    const dpr = window.devicePixelRatio || 1;
    const E = EPAISSEUR_REGLE;
    canvas.width = (axe === 'x' ? longueur : E) * dpr;
    canvas.height = (axe === 'x' ? E : longueur) * dpr;
    c.scale(dpr, dpr);
    const origine = axe === 'x' ? vue.x : vue.y;
    c.fillStyle = '#F1EADC';
    if (axe === 'x') c.fillRect(origine, 0, format * vue.echelle, E);
    else c.fillRect(0, origine, E, format * vue.echelle);
    c.fillStyle = '#5D5964';
    c.strokeStyle = '#8A8590';
    c.font = '10px system-ui, sans-serif';
    const pas = pasRegle(vue.echelle);
    const premier = Math.floor(-origine / vue.echelle / pas) * pas;
    for (let mm = premier; origine + mm * vue.echelle < longueur; mm += pas / 5) {
      const p = Math.round(origine + mm * vue.echelle) + 0.5;
      const chiffre = Math.abs(mm / pas - Math.round(mm / pas)) < 1e-6;
      c.beginPath();
      if (axe === 'x') { c.moveTo(p, E); c.lineTo(p, chiffre ? E - 10 : E - 4); } else { c.moveTo(E, p); c.lineTo(chiffre ? E - 10 : E - 4, p); }
      c.stroke();
      if (!chiffre) continue;
      const t = String(Math.round(mm) / 10).replace('.', ',');
      if (axe === 'x') c.fillText(t, p + 3, 10);
      else {
        c.save();
        c.translate(10, p - 3);
        c.rotate(-Math.PI / 2);
        c.fillText(t, 0, 0);
        c.restore();
      }
    }
  }, [axe, vue, longueur, format]);

  return <canvas ref={ref} aria-hidden="true" style={axe === 'x' ? { width: longueur, height: EPAISSEUR_REGLE } : { width: EPAISSEUR_REGLE, height: longueur }} className="block" />;
}
