'use client';

// Annuler / rétablir. Les raccourcis clavier sont actifs partout dans le studio, sauf
// quand le focus est dans un champ de saisie (sinon Ctrl+Z effacerait la frappe du texte
// au lieu d'annuler la dernière opération de design).

import { useEffect } from 'react';
import { useConfiguratorStore } from '../../stores/configurator-store';

function IconeAnnuler() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
    </svg>
  );
}

function IconeRetablir() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H9a5 5 0 0 0 0 10h3" />
    </svg>
  );
}

export default function HistoryControls() {
  const past = useConfiguratorStore((s) => s.past.length);
  const future = useConfiguratorStore((s) => s.future.length);
  const undo = useConfiguratorStore((s) => s.undo);
  const redo = useConfiguratorStore((s) => s.redo);

  useEffect(() => {
    function surTouche(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const cible = e.target as HTMLElement | null;
      const saisie =
        cible &&
        (cible.tagName === 'INPUT' ||
          cible.tagName === 'TEXTAREA' ||
          cible.tagName === 'SELECT' ||
          cible.isContentEditable);
      if (saisie) return;
      const touche = e.key.toLowerCase();
      if (touche === 'z' && !e.shiftKey) {
        e.preventDefault();
        useConfiguratorStore.getState().undo();
      } else if ((touche === 'z' && e.shiftKey) || touche === 'y') {
        e.preventDefault();
        useConfiguratorStore.getState().redo();
      }
    }
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, []);

  return (
    <div className="flex items-center gap-1 rounded-full border border-encre/15 bg-white p-0.5" role="group" aria-label="Historique">
      <button
        type="button"
        onClick={undo}
        disabled={past === 0}
        data-testid="undo"
        title="Annuler (Ctrl+Z)"
        aria-label="Annuler la dernière opération"
        className="grid h-8 w-8 place-items-center rounded-full text-encre transition-colors hover:bg-sable disabled:cursor-not-allowed disabled:opacity-30"
      >
        <IconeAnnuler />
      </button>
      <button
        type="button"
        onClick={redo}
        disabled={future === 0}
        data-testid="redo"
        title="Rétablir (Ctrl+Shift+Z)"
        aria-label="Rétablir l’opération annulée"
        className="grid h-8 w-8 place-items-center rounded-full text-encre transition-colors hover:bg-sable disabled:cursor-not-allowed disabled:opacity-30"
      >
        <IconeRetablir />
      </button>
    </div>
  );
}
