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
import { ChevronDown, ChevronUp, Eye, EyeOff, ImageIcon, TextIcon, Trash } from '../site/Icons';

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
      <div className="grid grid-cols-2 gap-2">
        <UploadDesign compact />
        <button
          type="button"
          data-testid="add-text"
          onClick={() => addText()}
          className="group flex min-h-[5.5rem] flex-col items-center justify-center gap-1.5 rounded-xl border border-encre/20 bg-white p-3 text-sm font-semibold text-encre transition-colors duration-200 hover:border-encre"
        >
          <TextIcon className="h-6 w-6 text-orange-action transition-transform duration-300 group-hover:-translate-y-0.5" />
          Ajouter du texte
        </button>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-attenue">
            Éléments ({side === 'front' ? 'avant' : 'arrière'})
          </h3>
          {elements.length > 0 && (
            <span className="text-xs text-attenue">
              {elements.length} au total
            </span>
          )}
        </div>

        {face.length === 0 ? (
          <p className="rounded-lg bg-sable/50 px-3 py-2 text-xs text-attenue">
            Aucun élément sur cette face. Ajoutez une image ou un texte.
          </p>
        ) : (
          <ul data-testid="element-list" className="flex flex-col gap-1">
            {face.map((el) => (
              <li
                key={el.id}
                className={`flex items-center gap-0.5 rounded-xl border py-1 pl-3 pr-1 ${
                  el.id === selectedId ? 'border-orange bg-orange/5' : 'border-encre/15 bg-white'
                }`}
              >
                <button
                  type="button"
                  data-testid={`element-${el.id}`}
                  onClick={() => selectElement(el.id)}
                  aria-pressed={el.id === selectedId}
                  className={`flex min-w-0 flex-1 items-center gap-2 text-left text-sm ${
                    el.visible ? 'text-encre' : 'text-attenue line-through'
                  }`}
                >
                  {el.type === 'text' ? (
                    <TextIcon className="h-4 w-4 shrink-0 text-attenue" />
                  ) : (
                    <ImageIcon className="h-4 w-4 shrink-0 text-attenue" />
                  )}
                  <span className="truncate">{labelFor(el)}</span>
                </button>
                <button
                  type="button"
                  aria-label={el.visible ? `Masquer ${labelFor(el)}` : `Afficher ${labelFor(el)}`}
                  onClick={() => toggleElementVisible(el.id)}
                  className="grid h-9 w-9 place-items-center rounded-lg text-attenue hover:bg-sable hover:text-encre"
                >
                  {el.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  aria-label={`Monter ${labelFor(el)}`}
                  onClick={() => moveElement(el.id, 'up')}
                  className="grid h-9 w-7 place-items-center rounded-lg text-attenue hover:bg-sable hover:text-encre"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Descendre ${labelFor(el)}`}
                  onClick={() => moveElement(el.id, 'down')}
                  className="grid h-9 w-7 place-items-center rounded-lg text-attenue hover:bg-sable hover:text-encre"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Supprimer ${labelFor(el)}`}
                  onClick={() => removeElement(el.id)}
                  className="grid h-9 w-9 place-items-center rounded-lg text-attenue hover:bg-red-50 hover:text-red-600"
                >
                  <Trash className="h-4 w-4" />
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
            className="mt-2 text-xs text-attenue underline hover:text-orange-action"
          >
            {surAutreFace} élément{surAutreFace > 1 ? 's' : ''} sur la face {autreFace === 'front' ? 'avant' : 'arrière'} →
          </button>
        )}
      </div>
    </div>
  );
}
