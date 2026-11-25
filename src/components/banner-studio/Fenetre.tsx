'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { Bouton } from './champs';

/** Fenêtre modale native : plein écran sur téléphone, centrée sur ordinateur. */
export function Fenetre({ titre, fermer, children, pied }: { titre: string; fermer: () => void; children: ReactNode; pied?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal();
  }, []);
  return (
    <dialog ref={ref} onClose={fermer} aria-label={titre} className="m-auto h-dvh max-h-none w-screen max-w-none bg-creme backdrop:bg-encre/70 sm:h-auto sm:max-h-[min(90dvh,820px)] sm:w-[min(94vw,900px)] sm:rounded-2xl">
      <div className="flex h-full max-h-[inherit] flex-col sm:h-auto">
        <div className="flex items-center justify-between border-b border-filet px-4 py-1">
          <h2 className="text-base font-semibold">{titre}</h2>
          <Bouton icone="fermer" libelle="Fermer" onClick={() => ref.current?.close()} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{children}</div>
        {pied ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-filet p-3">{pied}</div> : null}
      </div>
    </dialog>
  );
}

export const PRIMAIRE = 'bg-orange-action text-white hover:bg-orange-action/90';
