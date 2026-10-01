'use client';

// Réglages de l'élément sélectionné. Tout est écrit dans le store : la texture du canvas,
// l'aperçu 3D et le JSON de configuration se mettent à jour par la même voie.
//
// Les contrôles sont communs aux images et aux textes (face, position, taille, rotation,
// calque, suppression) ; les textes ajoutent leur propre section (contenu, police,
// couleur, graisse, alignement, interlettrage).

import { useConfiguratorStore } from '../../stores/configurator-store';
import { getPrintArea, getProductById } from '../../lib/products/catalog';
import { TEXT_LIMITS } from '../../types/configurator';
import type { Side, TextElement } from '../../types/configurator';
import { compositionSize, elementOverflow } from '../../lib/canvas/design-canvas';
import { nearestWeight, resolveFont } from '../../lib/fonts';
import ColorField from './ColorField';
import FontPicker from './FontPicker';

function Rangee({
  id,
  label,
  value,
  min,
  max,
  step,
  suffix = '',
  onChange,
  format,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  return (
    <div>
      <label htmlFor={id} className="flex justify-between text-sm font-medium text-neutral-800">
        <span>{label}</span>
        <span className="text-neutral-500">{format ? format(value) : `${value}${suffix}`}</span>
      </label>
      <input
        id={id}
        data-testid={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-[#E85F00]"
      />
    </div>
  );
}

function TextControls({ element }: { element: TextElement }) {
  const updateElement = useConfiguratorStore((s) => s.updateElement);
  const font = resolveFont(element.fontId);
  const poidsDisponibles = font.weights.length > 1;

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label htmlFor="text-content" className="text-sm font-medium text-neutral-800">
          Texte
        </label>
        <textarea
          id="text-content"
          data-testid="text-content"
          rows={2}
          maxLength={TEXT_LIMITS.contentMax}
          value={element.content}
          onChange={(e) => updateElement(element.id, { content: e.target.value })}
          placeholder="Votre texte (Entrée pour une nouvelle ligne)"
          className="mt-1 w-full rounded-lg border border-neutral-300 p-2 text-sm text-neutral-800"
        />
      </div>

      <div>
        <label htmlFor="text-font" className="text-sm font-medium text-neutral-800">
          Police
        </label>
        <div className="mt-1">
          <FontPicker
            value={element.fontId}
            onChange={(fontId) => updateElement(element.id, { fontId } as Partial<TextElement>)}
          />
        </div>
        <p className="mt-1 text-[11px] text-neutral-400">
          {font.license} — usage commercial autorisé
        </p>
      </div>

      <Rangee
        id="text-size"
        label="Taille"
        value={element.fontSize}
        min={TEXT_LIMITS.fontSizeMin}
        max={TEXT_LIMITS.fontSizeMax}
        step={2}
        suffix=" px"
        onChange={(fontSize) => updateElement(element.id, { fontSize } as Partial<TextElement>)}
      />

      <ColorField
        value={element.color}
        onChange={(color) => updateElement(element.id, { color } as Partial<TextElement>)}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-neutral-300">
          <button
            type="button"
            aria-label="Graisse normale"
            aria-pressed={element.fontWeight < 500}
            disabled={!poidsDisponibles}
            onClick={() => updateElement(element.id, { fontWeight: 400 } as Partial<TextElement>)}
            className={`px-2.5 py-1 text-sm disabled:opacity-40 ${
              element.fontWeight < 500 ? 'bg-[#200233] text-white' : 'bg-white text-neutral-700'
            }`}
          >
            Normal
          </button>
          <button
            type="button"
            aria-label="Graisse grasse"
            aria-pressed={element.fontWeight >= 500}
            disabled={!poidsDisponibles}
            onClick={() => updateElement(element.id, { fontWeight: 700 } as Partial<TextElement>)}
            className={`border-l border-neutral-300 px-2.5 py-1 text-sm font-bold disabled:opacity-40 ${
              element.fontWeight >= 500 ? 'bg-[#200233] text-white' : 'bg-white text-neutral-700'
            }`}
          >
            Gras
          </button>
        </div>
        <button
          type="button"
          aria-label="Italique"
          aria-pressed={element.fontStyle === 'italic'}
          onClick={() =>
            updateElement(element.id, {
              fontStyle: element.fontStyle === 'italic' ? 'normal' : 'italic',
            } as Partial<TextElement>)
          }
          className={`rounded-lg border border-neutral-300 px-2.5 py-1 text-sm italic ${
            element.fontStyle === 'italic' ? 'bg-[#200233] text-white' : 'bg-white text-neutral-700'
          }`}
        >
          Italique
        </button>
        <span className="text-[11px] text-neutral-400">
          Poids disponible : {nearestWeight(font, element.fontWeight)}
        </span>
      </div>

      <div>
        <span className="text-sm font-medium text-neutral-800">Alignement</span>
        <div className="mt-1 flex overflow-hidden rounded-lg border border-neutral-300">
          {(
            [
              ['left', 'Gauche'],
              ['center', 'Centre'],
              ['right', 'Droite'],
            ] as const
          ).map(([valeur, libelle], i) => (
            <button
              key={valeur}
              type="button"
              data-testid={`text-align-${valeur}`}
              aria-pressed={element.align === valeur}
              onClick={() => updateElement(element.id, { align: valeur } as Partial<TextElement>)}
              className={`flex-1 px-2 py-1 text-xs ${i > 0 ? 'border-l border-neutral-300' : ''} ${
                element.align === valeur ? 'bg-[#200233] text-white' : 'bg-white text-neutral-700'
              }`}
            >
              {libelle}
            </button>
          ))}
        </div>
      </div>

      <Rangee
        id="text-letter-spacing"
        label="Interlettrage"
        value={element.letterSpacing}
        min={TEXT_LIMITS.letterSpacingMin}
        max={TEXT_LIMITS.letterSpacingMax}
        step={0.01}
        onChange={(letterSpacing) => updateElement(element.id, { letterSpacing } as Partial<TextElement>)}
        format={(v) => `${v.toFixed(2)} em`}
      />

      <Rangee
        id="text-line-height"
        label="Hauteur de ligne"
        value={element.lineHeight}
        min={TEXT_LIMITS.lineHeightMin}
        max={TEXT_LIMITS.lineHeightMax}
        step={0.05}
        onChange={(lineHeight) => updateElement(element.id, { lineHeight } as Partial<TextElement>)}
        format={(v) => v.toFixed(2)}
      />
    </div>
  );
}

export default function ElementControls() {
  const elements = useConfiguratorStore((s) => s.elements);
  const selectedId = useConfiguratorStore((s) => s.selectedId);
  const updateElement = useConfiguratorStore((s) => s.updateElement);
  const removeElement = useConfiguratorStore((s) => s.removeElement);
  const nudge = useConfiguratorStore((s) => s.nudge);
  const setElementSide = useConfiguratorStore((s) => s.setElementSide);
  const moveElement = useConfiguratorStore((s) => s.moveElement);
  const toggleElementVisible = useConfiguratorStore((s) => s.toggleElementVisible);
  const productId = useConfiguratorStore((s) => s.productId);
  const measure = useConfiguratorStore((s) => s.measure);
  const setSide = useConfiguratorStore((s) => s.setSide);

  const element = elements.find((el) => el.id === selectedId) ?? null;
  const product = getProductById(productId);
  const aUneFaceArriere = Boolean(getPrintArea(product, 'back'));

  /** Espace de composition d'une face (format de la zone), pour mesurer le débordement. */
  const spaceFor = (side: Side) => {
    const a = getPrintArea(product, side);
    return a ? compositionSize(a) : { width: 1024, height: 1024 };
  };

  // Débordement de la zone d'impression : signalé et corrigeable en un clic (§21).
  const debordement = element
    ? elementOverflow(element, getPrintArea(product, element.side), spaceFor(element.side), measure)
    : { over: false, factor: 1 };

  function ajuster() {
    if (!element) return;
    const facteur = debordement.factor;
    if (facteur >= 1) return;
    if (element.type === 'text') {
      updateElement(element.id, { fontSize: Math.round(element.fontSize * facteur) } as Partial<TextElement>);
    } else {
      updateElement(element.id, { scale: element.scale * facteur });
    }
    updateElement(element.id, { x: 0, y: 0 });
  }

  if (!element) {
    return (
      <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
        Aucun élément sélectionné. Ajoutez une image ou un texte, puis cliquez dessus dans l’aperçu 2D.
      </p>
    );
  }

  const estTexte = element.type === 'text';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-semibold text-neutral-900">
          {estTexte ? 'Texte' : 'Image'}
          <span className="ml-2 text-xs font-normal text-neutral-400">{element.id}</span>
        </p>
        <button
          type="button"
          onClick={() => toggleElementVisible(element.id)}
          className="rounded-lg border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-50"
        >
          {element.visible ? 'Masquer' : 'Afficher'}
        </button>
      </div>

      {estTexte && <TextControls element={element as TextElement} />}

      <div>
        <span className="text-sm font-medium text-neutral-800">Face</span>
        <div className="mt-1 flex overflow-hidden rounded-lg border border-neutral-300">
          {(
            [
              ['front', 'Avant'],
              ['back', 'Arrière'],
            ] as const
          ).map(([valeur, libelle], i) => (
            <button
              key={valeur}
              type="button"
              data-testid={`element-side-${valeur}`}
              disabled={valeur === 'back' && !aUneFaceArriere}
              aria-pressed={element.side === valeur}
              onClick={() => {
                setElementSide(element.id, valeur as Side);
                setSide(valeur as Side);
              }}
              className={`flex-1 px-2 py-1 text-xs disabled:opacity-40 ${i > 0 ? 'border-l border-neutral-300' : ''} ${
                element.side === valeur ? 'bg-[#200233] text-white' : 'bg-white text-neutral-700'
              }`}
            >
              {libelle}
            </button>
          ))}
        </div>
      </div>

      <div>
        <span className="text-sm font-medium text-neutral-800">Position</span>
        <div className="mt-1 flex items-center gap-2">
          <div className="grid grid-cols-3 gap-1">
            <span />
            <button
              type="button"
              aria-label="Monter l’élément"
              data-testid="nudge-up"
              onClick={() => nudge(element.id, 0, -1)}
              className="h-8 w-8 rounded-lg border border-neutral-300 text-sm hover:bg-neutral-50"
            >
              ↑
            </button>
            <span />
            <button
              type="button"
              aria-label="Décaler à gauche"
              data-testid="nudge-left"
              onClick={() => nudge(element.id, -1, 0)}
              className="h-8 w-8 rounded-lg border border-neutral-300 text-sm hover:bg-neutral-50"
            >
              ←
            </button>
            <button
              type="button"
              aria-label="Centrer l’élément"
              data-testid="center-element"
              onClick={() => updateElement(element.id, { x: 0, y: 0 })}
              className="h-8 w-8 rounded-lg border border-neutral-300 text-xs hover:bg-neutral-50"
            >
              ⌖
            </button>
            <button
              type="button"
              aria-label="Décaler à droite"
              data-testid="nudge-right"
              onClick={() => nudge(element.id, 1, 0)}
              className="h-8 w-8 rounded-lg border border-neutral-300 text-sm hover:bg-neutral-50"
            >
              →
            </button>
            <span />
            <button
              type="button"
              aria-label="Descendre l’élément"
              data-testid="nudge-down"
              onClick={() => nudge(element.id, 0, 1)}
              className="h-8 w-8 rounded-lg border border-neutral-300 text-sm hover:bg-neutral-50"
            >
              ↓
            </button>
            <span />
          </div>
          <p className="text-xs text-neutral-500">
            ou flèches du clavier
            <br />
            (aperçu 2D)
          </p>
        </div>
      </div>

      {!estTexte && (
        <Rangee
          id="element-scale"
          label="Taille"
          value={element.scale}
          min={0.1}
          max={3}
          step={0.05}
          onChange={(scale) => updateElement(element.id, { scale })}
          format={(v) => `${Math.round(v * 100)} %`}
        />
      )}

      <Rangee
        id="element-rotation"
        label="Rotation"
        value={element.rotation}
        min={-180}
        max={180}
        step={5}
        suffix="°"
        onChange={(rotation) => updateElement(element.id, { rotation })}
      />

      {debordement.over && (
        <div role="status" className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <span>
            Cet élément dépasse la zone d’impression ({element.type === 'text' ? 'texte' : 'image'} trop grand) : il
            sera rogné à l’impression.
          </span>
          <button
            type="button"
            data-testid="fit-to-area"
            onClick={() => ajuster()}
            className="self-start rounded-lg bg-amber-600 px-2.5 py-1 font-semibold text-white hover:bg-amber-700"
          >
            Ajuster à la zone
          </button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => moveElement(element.id, 'up')}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          Calque +
        </button>
        <button
          type="button"
          onClick={() => moveElement(element.id, 'down')}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50"
        >
          Calque −
        </button>
        <button
          type="button"
          data-testid="remove-element"
          onClick={() => removeElement(element.id)}
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-700 hover:bg-red-100"
        >
          Supprimer
        </button>
      </div>
    </div>
  );
}
