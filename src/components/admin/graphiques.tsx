/**
 * Graphiques du tableau de bord, en HTML/CSS (aucune bibliothèque, rendu serveur).
 *
 * Chaque graphique ne porte qu'une série : une seule teinte (magnitude), pas de légende — le
 * titre de la carte nomme la série. Les valeurs sont en encre de texte, jamais dans la couleur
 * de la barre. Chaque graphique a sa vue tableau (accessibilité, lecteurs d'écran, impression).
 */

const TEINTE = 'bg-orange-action';

export type Barre = { cle: string; label: string; valeur: number; detail?: string };

/** Classement horizontal (ventes par catégorie, produits les plus vendus). */
export function BarresHorizontales({
  donnees,
  formater,
  libelleValeur,
}: {
  donnees: Barre[];
  formater: (n: number) => string;
  libelleValeur: string;
}) {
  const max = Math.max(1, ...donnees.map((d) => d.valeur));
  return (
    <figure>
      <ul className="space-y-2.5" aria-hidden="true">
        {donnees.map((d) => (
          <li key={d.cle} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[minmax(0,12rem)_1fr_auto]">
            <span className="truncate text-neutral-700" title={d.label}>
              {d.label}
            </span>
            <span className="h-2.5 rounded-r bg-neutral-100">
              <span
                className={`block h-full rounded-r ${TEINTE}`}
                style={{ width: `${Math.max(1.5, (d.valeur / max) * 100)}%` }}
              />
            </span>
            <span className="text-right tabular-nums text-encre">
              {formater(d.valeur)}
              {d.detail ? <span className="ml-1.5 text-xs text-neutral-500">{d.detail}</span> : null}
            </span>
          </li>
        ))}
      </ul>
      <TableauDonnees
        entetes={['', libelleValeur]}
        lignes={donnees.map((d) => [d.label, `${formater(d.valeur)}${d.detail ? ` (${d.detail})` : ''}`])}
      />
    </figure>
  );
}

export type Colonne = { cle: string; label: string; valeur: number; infobulle: string };

/** Évolution dans le temps (chiffre d'affaires par jour ou par semaine). */
export function Colonnes({
  donnees,
  formater,
  libelleValeur,
}: {
  donnees: Colonne[];
  formater: (n: number) => string;
  libelleValeur: string;
}) {
  const max = Math.max(1, ...donnees.map((d) => d.valeur));
  const reperes = new Set([0, Math.floor((donnees.length - 1) / 2), donnees.length - 1]);
  return (
    <figure>
      <div className="flex items-stretch gap-3">
        <div className="flex w-16 shrink-0 flex-col justify-between pb-6 text-right text-[11px] tabular-nums text-neutral-500" aria-hidden="true">
          <span>{formater(max)}</span>
          <span>0</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative flex h-40 items-end gap-[2px] border-b border-neutral-300" role="list" aria-label={libelleValeur}>
            <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-neutral-200" aria-hidden="true" />
            {donnees.map((d) => (
              <div
                key={d.cle}
                role="listitem"
                tabIndex={0}
                aria-label={`${d.label} : ${d.infobulle}`}
                className="group relative flex h-full flex-1 items-end outline-none"
              >
                <div
                  className={`w-full rounded-t-[3px] ${d.valeur > 0 ? TEINTE : 'bg-transparent'} opacity-90 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100`}
                  style={{ height: d.valeur > 0 ? `${Math.max(2, (d.valeur / max) * 100)}%` : '0' }}
                />
                <div className="absolute inset-x-0 bottom-0 top-0 -z-0 rounded group-hover:bg-neutral-900/[0.03]" aria-hidden="true" />
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-encre px-2 py-1 text-[11px] text-white shadow-lg group-hover:block group-focus-visible:block">
                  <span className="font-medium">{d.label}</span>
                  <br />
                  {d.infobulle}
                </div>
              </div>
            ))}
          </div>
          <div className="relative mt-1.5 h-4 text-[11px] text-neutral-500" aria-hidden="true">
            {donnees.map((d, i) =>
              reperes.has(i) ? (
                <span
                  key={d.cle}
                  className="absolute top-0 whitespace-nowrap"
                  style={
                    i === 0
                      ? { left: 0 }
                      : i === donnees.length - 1
                        ? { right: 0 }
                        : { left: `${((i + 0.5) / donnees.length) * 100}%`, transform: 'translateX(-50%)' }
                  }
                >
                  {d.label}
                </span>
              ) : null,
            )}
          </div>
        </div>
      </div>
      <TableauDonnees entetes={['Période', libelleValeur]} lignes={donnees.map((d) => [d.label, d.infobulle])} />
    </figure>
  );
}

function TableauDonnees({ entetes, lignes }: { entetes: string[]; lignes: string[][] }) {
  return (
    <details className="mt-3 text-xs text-neutral-500">
      <summary className="cursor-pointer select-none hover:text-encre">Voir les données</summary>
      <table className="mt-2 w-full text-left">
        <thead>
          <tr>
            {entetes.map((e) => (
              <th key={e} className="py-1 pr-3 font-medium">
                {e}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100 text-neutral-700">
          {lignes.map((l, i) => (
            <tr key={i}>
              {l.map((c, j) => (
                <td key={j} className="py-1 pr-3 tabular-nums">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
