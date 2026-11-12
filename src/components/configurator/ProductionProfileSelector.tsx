'use client';

// Choix du PROCÉDÉ DE PRODUCTION. Le configurateur 3D est un studio de création : il laisse
// composer sur les cinq zones du vêtement. Ce module sépare cette liberté de la réalité de
// l'atelier : pour chaque procédé, quelles zones sont réellement imprimables, à quelle
// taille, et avec quel statut.
//
// Aucune dimension n'est écrite ici : tout vient de production/profils.json, lue par
// src/lib/products/production.ts. Un procédé « à valider » autorise la composition et
// l'aperçu, jamais le paiement. On n'annonce donc jamais une capacité non vérifiée.

import { useConfiguratorStore } from '../../stores/configurator-store';
import { getPrintArea, getProductById } from '../../lib/products/catalog';
import {
  LIBELLE_STATUT,
  PROFILS,
  motifZone,
  profilParId,
  statutZone,
  zonesProposees,
} from '../../lib/products/production';
import type { StatutProduction } from '../../lib/products/production';
import { SIDE_LABELS } from '../../types/configurator';

const BADGE: Record<StatutProduction, string> = {
  disponible: 'bg-succes/10 text-succes',
  'a-valider': 'bg-soleil/25 text-amber-800',
  indisponible: 'bg-encre/10 text-attenue',
};

export default function ProductionProfileSelector() {
  const productId = useConfiguratorStore((s) => s.productId);
  const profileId = useConfiguratorStore((s) => s.profileId);
  const setProfile = useConfiguratorStore((s) => s.setProfile);
  const product = getProductById(productId);
  const profil = profilParId(profileId);

  if (!product) return null;
  // Les procédés n'ont de sens que pour le modèle à zones ; les autres produits gardent
  // leurs zones fixes du catalogue.
  if (product.technique !== 'zones') return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Procédé de production">
        {PROFILS.map((p) => {
          const actif = p.id === profil.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={actif}
              data-testid={`profil-${p.id}`}
              onClick={() => setProfile(p.id)}
              className={`rounded-xl border px-3 py-2.5 text-left transition-colors duration-200 ${
                actif
                  ? 'border-encre bg-encre text-creme'
                  : 'border-encre/15 bg-white text-encre hover:border-encre/40'
              }`}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="text-sm font-semibold">{p.nom}</span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    actif ? 'bg-creme/15 text-creme' : BADGE[p.statut]
                  }`}
                >
                  {LIBELLE_STATUT[p.statut]}
                </span>
              </span>
              <span className={`mt-0.5 block text-[11px] leading-snug ${actif ? 'text-creme/70' : 'text-attenue'}`}>
                {p.description}
              </span>
              {p.note && (
                <span className={`mt-1 block text-[11px] leading-snug ${actif ? 'text-soleil' : 'text-amber-800'}`}>
                  {p.note}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-encre/10 bg-sable/30 p-2.5">
        <p className="surtitre mb-1.5 text-attenue">Zones imprimables — {profil.nom}</p>
        <ul className="flex flex-col gap-1">
          {zonesProposees(profil).map((side) => {
            const statut = statutZone(profil, side);
            const area = getPrintArea(product, side, profil.id);
            const motif = motifZone(profil, side);
            return (
              <li key={side} className="flex items-start justify-between gap-2 text-[11px]">
                <span className="min-w-0">
                  <span className="font-medium text-encre">{SIDE_LABELS[side]}</span>
                  {area && (
                    <span className="text-attenue"> · {area.cmWidth} × {area.cmHeight} cm</span>
                  )}
                  {motif && statut !== 'disponible' && (
                    <span className="block leading-snug text-attenue">{motif}</span>
                  )}
                </span>
                <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${BADGE[statut]}`}>
                  {LIBELLE_STATUT[statut]}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="text-[11px] leading-snug text-attenue">
        Dimensions et statuts viennent de la source unique <code className="font-mono">production/profils.json</code>,
        validée par l’atelier. Une zone « à valider » reste composable, mais la commande est
        bloquée tant qu’elle contient un visuel.
      </p>
    </div>
  );
}
