'use client';

// Section DESIGN (étape 2 du configurateur) : ajouter une image ou un texte, puis gérer
// la liste des éléments (calques) de la face courante.
//
// La liste EST la première version de l'interface de calques : sélection, visibilité,
// ordre d'empilement et suppression. L'ordre vient du champ `z` de chaque élément, ce qui
// permettra plus tard un vrai glisser-déposer sans changer le modèle de données.

import { useConfiguratorStore } from '../../stores/configurator-store';
import type { DesignElement } from '../../types/configurator';
import UploadDesign from './UploadDesign';

function labelFor(el: DesignElement): string {
  if (el.type === 'text') {
    const premiere = el.content.split('\n')[0].trim();
    return premiere || '(texte vide)';
  }
  return el.name;
}

export default function DesignPanel() {
  const elements = useConfiguratorStore((s) => s.elements);
  const side = useConfiguratorStore((s) => s.side);
  const selectedId = useConfiguratorStore((s) => s.selectedId);
  const selectElement = useConfiguratorStore((s) => s.selectElement);
  const removeElement = useConfiguratorStore((s) => s.removeElement);
  const toggleElementVisible = useConfiguratorStore((s) => s.toggleElementVisible);
  const moveElement = useConfiguratorStore((s) => s.moveElement);
  const addText = useConfiguratorStore((s) => s.addText);
  const setSide = useConfiguratorStore((s) => s.setSide);

  const face = elements.filter((el) => el.side === side).sort((a, b) => b.z - a.z);
  const autreFace = side === 'front' ? 'back' : 'front';
  const surAutreFace = elements.filter((el) => el.side === autreFace).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <UploadDesign compact />
        <button
          type="button"
          data-testid="add-text"
          onClick={() => addText()}
          className="flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-neutral-300 bg-white p-3 text-sm font-medium text-neutral-800 transition-colors hover:border-[#E85F00]"
        >
          <span className="text-base leading-none">T</span>
          Ajouter du texte
        </button>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Éléments ({side === 'front' ? 'avant' : 'arrière'})
          </h3>
          {elements.length > 0 && (
            <span className="text-xs text-neutral-400">
              {elements.length} au total
            </span>
          )}
        </div>

        {face.length === 0 ? (
          <p className="rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
            Aucun élément sur cette face. Ajoutez une image ou un texte.
          </p>
        ) : (
          <ul data-testid="element-list" className="flex flex-col gap-1">
            {face.map((el) => (
              <li
                key={el.id}
                className={`flex items-center gap-1 rounded-lg border px-2 py-1 ${
                  el.id === selectedId ? 'border-[#E85F00] bg-[#E85F00]/5' : 'border-neutral-200 bg-white'
                }`}
              >
                <button
                  type="button"
                  data-testid={`element-${el.id}`}
                  onClick={() => selectElement(el.id)}
                  aria-pressed={el.id === selectedId}
                  className={`flex min-w-0 flex-1 items-center gap-2 text-left text-sm ${
                    el.visible ? 'text-neutral-800' : 'text-neutral-400 line-through'
                  }`}
                >
                  <span aria-hidden className="text-xs font-bold text-neutral-400">
                    {el.type === 'text' ? 'T' : '▣'}
                  </span>
                  <span className="truncate">{labelFor(el)}</span>
                </button>
                <button
                  type="button"
                  aria-label={el.visible ? `Masquer ${labelFor(el)}` : `Afficher ${labelFor(el)}`}
                  onClick={() => toggleElementVisible(el.id)}
                  className="rounded px-1 text-xs text-neutral-500 hover:bg-neutral-100"
                >
                  {el.visible ? '👁' : '🚫'}
                </button>
                <button
                  type="button"
                  aria-label={`Monter ${labelFor(el)}`}
                  onClick={() => moveElement(el.id, 'up')}
                  className="rounded px-1 text-xs text-neutral-500 hover:bg-neutral-100"
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label={`Descendre ${labelFor(el)}`}
                  onClick={() => moveElement(el.id, 'down')}
                  className="rounded px-1 text-xs text-neutral-500 hover:bg-neutral-100"
                >
                  ↓
                </button>
                <button
                  type="button"
                  aria-label={`Supprimer ${labelFor(el)}`}
                  onClick={() => removeElement(el.id)}
                  className="rounded px-1 text-xs text-neutral-500 hover:bg-red-50 hover:text-red-600"
                >
                  🗑
                </button>
              </li>
            ))}
          </ul>
        )}

        {surAutreFace > 0 && (
          <button
            type="button"
            data-testid="switch-side-hint"
            onClick={() => setSide(autreFace)}
            className="mt-2 text-xs text-neutral-500 underline hover:text-[#E85F00]"
          >
            {surAutreFace} élément{surAutreFace > 1 ? 's' : ''} sur la face {autreFace === 'front' ? 'avant' : 'arrière'} →
          </button>
        )}
      </div>
    </div>
  );
}
