'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { Asset, ElementImage, Recadrage as Cadrage } from '@/lib/banner/model';
import { auRapport, deplacerRecadrage, enFractions, POIGNEES, RECADRAGE_PLEIN, recadrageVisible, tailleMin, tirerPoignee, zoomerRecadrage, type Poignee } from '@/lib/banner/recadrage';

import { Bouton } from './champs';
import { useActions, useContexte, useStudio } from './contexte';

/** Fenêtre de recadrage de l'image sélectionnée. Rien ne change tant qu'on n'a pas validé. */
export function Recadrage() {
  const id = useStudio((s) => s.recadrage);
  const e = useStudio((s) => s.document.elements.find((x) => x.id === id));
  const asset = useStudio((s) => (e?.type === 'image' ? s.document.assets.find((x) => x.id === e.image.assetId) : undefined));
  return e?.type === 'image' && asset ? <Fenetre key={e.id} e={e} asset={asset} /> : null;
}

type Mode = 'cadre' | 'libre' | '1' | '1.3333' | '0.75' | '1.7778';
const MODES: { id: Mode; nom: string }[] = [
  { id: 'cadre', nom: 'Garder le cadre' },
  { id: 'libre', nom: 'Libre' },
  { id: '1', nom: 'Carré' },
  { id: '1.3333', nom: '4:3' },
  { id: '0.75', nom: '3:4' },
  { id: '1.7778', nom: '16:9' },
];
const PRISE = 44;
/** Zone de prise d'une poignée sur un axe : tournée vers l'extérieur si la zone est petite. */
function placer(sens: -1 | 0 | 1, taille: number) {
  const dedans = sens ? Math.min(PRISE / 2, Math.max(0, taille / 2 - PRISE / 2)) : PRISE / 2;
  const bord = sens > 0 ? taille : sens < 0 ? 0 : taille / 2;
  return sens < 0 ? { debut: bord - PRISE + dedans, point: PRISE - dedans } : { debut: bord - dedans, point: dedans };
}
const CURSEUR: Record<Poignee, string> = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', o: 'ew-resize', ne: 'nesw-resize', so: 'nesw-resize', no: 'nwse-resize', se: 'nwse-resize' };

function Fenetre({ e, asset }: { e: ElementImage; asset: Asset }) {
  const a = useActions();
  const { images } = useContexte();
  const dialogue = useRef<HTMLDialogElement>(null);
  const zone = useRef<HTMLDivElement>(null);
  const toile = useRef<HTMLCanvasElement>(null);
  const [r, setR] = useState<Cadrage>(() => recadrageVisible(e, asset));
  const [mode, setMode] = useState<Mode>(e.image.ajustement === 'cover' ? 'cadre' : 'libre');
  const [taille, setTaille] = useState({ largeur: 0, hauteur: 0 });
  const geste = useRef<{ x: number; y: number; r: Cadrage; p: Poignee | null } | null>(null);
  const min = tailleMin(asset);
  const rapport = (m: Mode) => (m === 'libre' ? null : enFractions(m === 'cadre' ? e.largeurMm / e.hauteurMm : Number(m), asset));

  useEffect(() => {
    const d = dialogue.current;
    if (d && !d.open) d.showModal();
    const c = toile.current;
    const source = images.image(asset.id) as HTMLCanvasElement | null;
    if (!c || !source) return;
    c.width = source.width;
    c.height = source.height;
    c.getContext('2d')?.drawImage(source, 0, 0);
  }, [asset.id, images]);

  useLayoutEffect(() => {
    const z = zone.current;
    if (!z) return;
    const mesurer = () => {
      const k = Math.min((z.clientWidth - 48) / asset.largeurPx, (z.clientHeight - 48) / asset.hauteurPx);
      setTaille({ largeur: Math.max(1, asset.largeurPx * k), hauteur: Math.max(1, asset.hauteurPx * k) });
    };
    mesurer();
    const o = new ResizeObserver(mesurer);
    o.observe(z);
    return () => o.disconnect();
  }, [asset.largeurPx, asset.hauteurPx]);

  const choisir = (m: Mode) => {
    setMode(m);
    const k = rapport(m);
    if (k) setR(m === 'cadre' && e.image.ajustement === 'cover' ? recadrageVisible(e, asset) : auRapport(r, k));
  };
  const saisir = (ev: React.PointerEvent, p: Poignee | null) => {
    ev.preventDefault();
    ev.stopPropagation();
    ev.currentTarget.setPointerCapture(ev.pointerId);
    geste.current = { x: ev.clientX, y: ev.clientY, r, p };
  };
  const bouger = (ev: React.PointerEvent) => {
    const g = geste.current;
    if (!g) return;
    const dx = (ev.clientX - g.x) / taille.largeur;
    const dy = (ev.clientY - g.y) / taille.hauteur;
    setR(g.p ? tirerPoignee(g.r, g.p, dx, dy, rapport(mode), min) : deplacerRecadrage(g.r, dx, dy));
  };
  const lacher = () => { geste.current = null; };
  const clavier = (ev: React.KeyboardEvent) => {
    const pas = ev.shiftKey ? 0.1 : 0.01;
    const d: Record<string, [number, number]> = { ArrowLeft: [-pas, 0], ArrowRight: [pas, 0], ArrowUp: [0, -pas], ArrowDown: [0, pas] };
    if (!d[ev.key]) return;
    ev.preventDefault();
    setR(deplacerRecadrage(r, ...d[ev.key]));
  };
  const grand = Math.max(r.l, r.h);
  const px = { l: Math.round(r.l * asset.largeurPx), h: Math.round(r.h * asset.hauteurPx) };
  const pointeur = { onPointerMove: bouger, onPointerUp: lacher, onPointerCancel: lacher };

  return (
    <dialog ref={dialogue} onClose={() => a.ouvrirRecadrage(null)} aria-label="Recadrer l’image" className="m-auto h-dvh max-h-none w-screen max-w-none bg-creme backdrop:bg-encre/70 sm:h-[min(90dvh,760px)] sm:w-[min(94vw,1000px)] sm:rounded-2xl">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-filet px-3 py-1">
          <h2 className="text-base font-semibold">Recadrer</h2>
          <Bouton icone="fermer" libelle="Annuler le recadrage" onClick={() => dialogue.current?.close()} />
        </div>
        <div ref={zone} className="flex min-h-0 flex-1 touch-none select-none items-center justify-center overflow-hidden bg-encre">
          <div className="relative" style={{ width: taille.largeur, height: taille.hauteur }}>
            <canvas ref={toile} className="block h-full w-full bg-white" />
            <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
              <div className="absolute" style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.l * 100}%`, height: `${r.h * 100}%`, boxShadow: '0 0 0 9999px rgba(17, 13, 21, 0.62)' }} />
            </div>
            <div
              role="group"
              tabIndex={0}
              aria-label="Zone conservée. Flèches pour déplacer."
              data-testid="zone-recadrage"
              onKeyDown={clavier}
              onPointerDown={(ev) => saisir(ev, null)}
              {...pointeur}
              className="absolute cursor-move outline-2 outline-white focus-visible:outline-orange-action"
              style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.l * 100}%`, height: `${r.h * 100}%` }}
            >
              <span className="pointer-events-none absolute inset-y-0 left-1/3 right-1/3 border-x border-white/50" />
              <span className="pointer-events-none absolute inset-x-0 bottom-1/3 top-1/3 border-y border-white/50" />
              {POIGNEES.map((p) => {
                const l = r.l * taille.largeur;
                const h = r.h * taille.hauteur;
                const coin = p.length === 2;
                // Poignées de bord masquées quand elles se confondraient avec celles des coins.
                if (!coin && (p === 'n' || p === 's' ? l : h) < PRISE * 2) return null;
                const x = placer(p.includes('e') ? 1 : p.includes('o') ? -1 : 0, l);
                const y = placer(p.includes('s') ? 1 : p.includes('n') ? -1 : 0, h);
                return (
                  <span key={p} data-poignee={p} onPointerDown={(ev) => saisir(ev, p)} {...pointeur} className={`absolute ${coin ? 'z-10' : ''}`} style={{ cursor: CURSEUR[p], width: PRISE, height: PRISE, left: x.debut, top: y.debut }}>
                    <span className="absolute block h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded border-2 border-orange-action bg-white" style={{ left: x.point, top: y.point }} />
                  </span>
                );
              })}
            </div>
          </div>
        </div>
        <div className="space-y-2 border-t border-filet p-3">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Proportions du recadrage">
            {MODES.map((m) => <Bouton key={m.id} libelle={m.nom} texte={m.nom} actif={mode === m.id} className="border border-bordure !text-xs" onClick={() => choisir(m.id)} />)}
            <Bouton libelle="Toute l’image" texte="Toute l’image" className="border border-bordure !text-xs" onClick={() => { setMode('libre'); setR({ ...RECADRAGE_PLEIN }); }} />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex min-h-11 min-w-40 flex-1 items-center gap-2 text-sm">
              Taille
              <input type="range" min={2} max={100} value={Math.round(grand * 100)} onChange={(ev) => setR(zoomerRecadrage(r, Number(ev.target.value) / 100 / grand, min))} className="min-w-0 flex-1 accent-orange-action" />
            </label>
            <span className="text-xs tabular-nums text-attenue">{px.l} × {px.h} px</span>
            <Bouton libelle="Appliquer le recadrage" texte="Appliquer" className="bg-orange-action text-white hover:bg-orange-action/90" onClick={() => { a.poserRecadrage(e.id, r, mode === 'cadre'); dialogue.current?.close(); }} />
          </div>
          <p className="text-xs text-attenue">{mode === 'cadre' ? 'Le cadre garde sa place et sa taille sur la banderole ; seul son contenu change.' : 'Le cadre prend la forme du recadrage. L’image d’origine est conservée.'}</p>
        </div>
      </div>
    </dialog>
  );
}
