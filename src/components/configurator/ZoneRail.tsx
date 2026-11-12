'use client';

// Navigation entre les cinq zones d'impression. Chaque vignette est un VRAI aperçu de la
// zone (même composition que la 3D et l'export) : l'utilisateur retrouve immédiatement ses
// visuels, sans perdre le travail des autres zones.
//
// Le statut de production est affiché sur chaque zone : on ne laisse jamais croire qu'une
// manche est imprimable avec un procédé qui ne le permet pas (production/profils.json).

import { useConfiguratorStore } from '../../stores/configurator-store';
import { getProductById, productSides, getPrintArea } from '../../lib/products/catalog';
import { LIBELLE_STATUT, profilParId, statutZone } from '../../lib/products/production';
import { SIDE_LABELS, SIDE_SHORT } from '../../types/configurator';
import { elementsOfSide } from '../../lib/canvas/design-canvas';
import ZonePreview from './ZonePreview';

const COULEUR_STATUT: Record<string, string> = {
  disponible: 'bg-succes',
  'a-valider': 'bg-soleil',
  indisponible: 'bg-attenue/40',
};

export default function ZoneRail() {
  const productId = useConfiguratorStore((s) => s.productId);
  const profileId = useConfiguratorStore((s) => s.profileId);
  const side = useConfiguratorStore((s) => s.side);
  const elements = useConfiguratorStore((s) => s.elements);
  const setSide = useConfiguratorStore((s) => s.setSide);

  const product = getProductById(productId);
  const zones = productSides(product);
  const profil = profilParId(profileId, product);

  if (zones.length <= 1) return null;

  return (
    <div
      data-testid="zone-rail"
      className="min-w-0 rounded-2xl border border-encre/10 bg-white/95 p-1.5 shadow-[0_10px_30px_-12px_rgba(17,13,21,0.45)] backdrop-blur-md"
    >
      <div className="rail w-full gap-1.5" role="tablist" aria-label="Zones de personnalisation">
        {zones.map((zone) => {
          const actif = zone === side;
          const statut = statutZone(profil, zone);
          const nombre = elementsOfSide(elements, zone).filter((el) => el.visible !== false).length;
          const area = getPrintArea(product, zone, profileId);
          return (
            <button
              key={zone}
              type="button"
              role="tab"
              aria-selected={actif}
              aria-label={`${SIDE_LABELS[zone]} — ${LIBELLE_STATUT[statut]}${
                nombre ? ` — ${nombre} élément(s)` : ''
              }`}
              title={`${SIDE_LABELS[zone]} — ${LIBELLE_STATUT[statut]}${
                area ? ` — zone ${area.cmWidth} × ${area.cmHeight} cm` : ''
              }`}
              data-testid={`zone-${zone}`}
              onClick={() => setSide(zone)}
              className={`group flex flex-col items-center gap-1 rounded-xl px-1.5 py-1.5 transition-colors duration-200 ${
                actif ? 'bg-encre text-creme' : 'text-encre hover:bg-sable/70'
              }`}
            >
              <span className="relative flex h-[48px] items-center">
                <ZonePreview
                  side={zone}
                  height={54}
                  gabarit
                  className={`rounded-md ring-1 ring-inset transition-shadow ${
                    actif ? 'ring-orange' : 'ring-encre/15 group-hover:ring-encre/35'
                  }`}
                />
                {nombre > 0 && (
                  <span
                    aria-hidden
                    className={`absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full px-1 font-mono text-[9px] font-bold ${
                      actif ? 'bg-orange text-encre' : 'bg-encre text-creme'
                    }`}
                  >
                    {nombre}
                  </span>
                )}
              </span>
              <span className="flex items-center gap-1 whitespace-nowrap text-[10px] font-semibold sm:text-[11px]">
                <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${COULEUR_STATUT[statut]}`} />
                {SIDE_SHORT[zone]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
