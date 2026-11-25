'use client';

import Link from 'next/link';
import { useState } from 'react';

import { pourcentage } from '@/lib/banner/vue';
import type { EtatSauvegarde } from '@/stores/banner-studio-store';

import { Bouton } from './champs';
import { useActions, useStudio } from './contexte';

const SAUVEGARDE: Record<EtatSauvegarde, string> = {
  vierge: 'Nouveau projet',
  modifie: 'Modifications en cours…',
  enregistrement: 'Enregistrement…',
  enregistre: 'Enregistré sur cet appareil',
  memoire: 'Non conservé : stockage indisponible',
};

export function StudioTopBar({ compact, onControles }: { compact: boolean; onControles: () => void }) {
  const a = useActions();
  const nom = useStudio((e) => e.document.nom);
  const dimensions = useStudio((e) => e.document.dimensions);
  const sauvegarde = useStudio((e) => e.sauvegarde);
  const peutAnnuler = useStudio((e) => e.historique.passe.length > 0);
  const peutRetablir = useStudio((e) => e.historique.futur.length > 0);
  const zoom = useStudio((e) => pourcentage(e.vue, e.cadre, e.document.dimensions));
  const reperes = useStudio((e) => e.reperes);
  const critiques = useStudio((e) => e.alertes.filter((x) => x.severite === 'critique').length);
  const avertissements = useStudio((e) => e.alertes.filter((x) => x.severite === 'avertissement').length);
  const [brouillon, setBrouillon] = useState<string | null>(null);
  const signales = critiques + avertissements;
  const valider = () => {
    if (brouillon !== null) a.poserNom(brouillon);
    setBrouillon(null);
  };

  return (
    <header className="flex min-h-14 items-center gap-1 border-b border-filet bg-creme px-2 lg:px-3">
      <Link href="/banderoles" aria-label="Quitter le Studio" title="Quitter le Studio" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-sable lg:min-h-9">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg>
      </Link>
      <div className="min-w-0 flex-1">
        <input
          aria-label="Nom du projet"
          value={brouillon ?? nom}
          maxLength={120}
          onChange={(e) => setBrouillon(e.target.value)}
          onBlur={valider}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setBrouillon(null); }}
          className="w-full max-w-xs truncate rounded-md bg-transparent px-1.5 text-base font-semibold hover:bg-sable focus-visible:bg-white focus-visible:outline-2 focus-visible:outline-orange-action lg:text-sm"
        />
        <p className="truncate px-1.5 text-xs text-attenue">
          <span className="tabular-nums">{dimensions.largeurMm / 10} × {dimensions.hauteurMm / 10} cm</span>
          <span aria-live="polite" data-testid="sauvegarde" className={sauvegarde === 'memoire' ? 'text-alerte' : ''}> · {SAUVEGARDE[sauvegarde]}</span>
        </p>
      </div>
      <Bouton icone="annuler" libelle="Annuler" onClick={a.annuler} disabled={!peutAnnuler} />
      <Bouton icone="retablir" libelle="Rétablir" onClick={a.retablir} disabled={!peutRetablir} />
      {compact ? null : (
        <>
          <span className="mx-1 h-6 w-px bg-filet" aria-hidden="true" />
          <Bouton icone="moins" libelle="Dézoomer" onClick={() => a.zoomer(1 / 1.25)} />
          <span className="w-12 text-center text-xs tabular-nums text-attenue" data-testid="zoom">{zoom} %</span>
          <Bouton icone="plus" libelle="Zoomer" onClick={() => a.zoomer(1.25)} />
        </>
      )}
      {compact ? null : <Bouton icone="ajuster" libelle="Voir toute la banderole" onClick={a.ajusterVue} />}
      {compact ? <Bouton icone="menu" libelle="Projets" onClick={() => a.ouvrirFenetre('projets')} /> : null}
      {compact ? null : (
        <>
          <Bouton icone={reperes ? 'oeil' : 'cache'} libelle={reperes ? 'Masquer les repères' : 'Afficher les repères'} onClick={a.basculerReperes} />
          <Bouton icone="menu" libelle="Projets" texte="Projets" onClick={() => a.ouvrirFenetre('projets')} className="border border-bordure" />
          <Bouton libelle="Aperçu" texte="Aperçu" onClick={() => a.ouvrirFenetre('apercu')} className="border border-bordure" />
        </>
      )}
      <Bouton
        icone="controles"
        libelle={signales ? `Contrôles : ${critiques} critique${critiques > 1 ? 's' : ''}, ${avertissements} avertissement${avertissements > 1 ? 's' : ''}` : 'Contrôles : rien à signaler'}
        texte={<span className="tabular-nums" data-testid="nb-alertes">{signales}</span>}
        onClick={onControles}
        className={critiques ? 'text-red-700' : avertissements ? 'text-alerte' : 'text-succes'}
      />
      {compact ? null : <Bouton libelle="Finaliser ma demande" texte="Finaliser ma demande" onClick={() => a.ouvrirFenetre('finaliser')} className="ml-1 bg-orange-action whitespace-nowrap text-white hover:bg-orange-action/90" />}
    </header>
  );
}
