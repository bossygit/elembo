import type { Metadata } from 'next';
import Link from 'next/link';

import { BarresHorizontales, Colonnes } from '@/components/admin/graphiques';
import { Badge, Carte, EnTete, Indicateur, Vide, bouton, champ } from '@/components/admin/ui';
import { PERIODES, dateCourte, fcfa, lirePeriode, pourcentage, tauxMarge } from '@/lib/admin/format';
import { peut, type Permission } from '@/lib/admin/permissions';
import { exigerAcces } from '@/server/admin/acces';
import { statistiques, type Statistiques } from '@/server/admin/statistiques';

export const metadata: Metadata = { title: 'Tableau de bord' };
export const dynamic = 'force-dynamic';

const REFUS: Partial<Record<Permission, string>> = {
  'devis.voir': 'les devis',
  'clients.voir': 'les clients',
  'production.voir': 'la vue atelier',
  'production.fichiers': 'les dossiers de production',
  'commandes.exporter': 'l’export des commandes',
  'produits.modifier': 'la modification du catalogue',
};

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M`;
  if (n >= 10_000) return `${Math.round(n / 1000).toLocaleString('fr-FR')} k`;
  return n.toLocaleString('fr-FR');
}

function libellePeriodeSerie(debut: string, unite: 'day' | 'week'): string {
  const d = new Date(debut);
  const format = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Africa/Brazzaville' });
  return unite === 'week' ? `Sem. du ${format.format(d)}` : format.format(d);
}

export default async function PageTableauDeBord({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string; du?: string; au?: string; refus?: string }>;
}) {
  const staff = await exigerAcces('tableau_de_bord.voir');
  const params = await searchParams;
  const periode = lirePeriode(params);
  const voitVentes = peut(staff.role, 'ventes.voir');
  const voitMarges = peut(staff.role, 'marges.voir');

  let stats: Statistiques | null = null;
  let erreur = '';
  try {
    stats = await statistiques(periode.debut, periode.fin);
  } catch {
    erreur = 'Les indicateurs sont indisponibles : la base ne répond pas ou la migration 0010 n’est pas appliquée.';
  }

  const refus = params.refus as Permission | undefined;

  return (
    <div>
      <EnTete
        surtitre="Vue d’ensemble"
        titre="Tableau de bord"
        description={`${periode.libelle} · indicateurs de la période, sauf mention « en cours ».`}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            {PERIODES.map((p) => (
              <Link
                key={p.cle}
                href={`/admin?periode=${p.cle}`}
                aria-current={periode.cle === p.cle ? 'true' : undefined}
                className={bouton(periode.cle === p.cle ? 'primaire' : 'secondaire', 'sm')}
              >
                {p.libelle}
              </Link>
            ))}
            <details className="relative">
              <summary className={`${bouton(periode.cle === 'perso' ? 'primaire' : 'secondaire', 'sm')} cursor-pointer list-none`}>
                Personnalisée
              </summary>
              <form className="absolute right-0 z-10 mt-2 flex w-72 flex-col gap-2 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg">
                <input type="hidden" name="periode" value="perso" />
                <label className="text-xs text-neutral-600">
                  Du
                  <input type="date" name="du" defaultValue={periode.du} className={champ} required />
                </label>
                <label className="text-xs text-neutral-600">
                  Au
                  <input type="date" name="au" defaultValue={periode.au} className={champ} required />
                </label>
                <button type="submit" className={bouton('primaire', 'sm')}>
                  Appliquer
                </button>
              </form>
            </details>
          </div>
        }
      />

      {refus ? (
        <p role="alert" className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          Votre rôle ne donne pas accès à {REFUS[refus] ?? 'cette section'}. Demandez l’accès à un administrateur si nécessaire.
        </p>
      ) : null}
      {erreur ? (
        <p role="alert" className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
          {erreur}
        </p>
      ) : null}

      {stats ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {voitVentes ? (
              <Indicateur
                label="Chiffre d’affaires"
                valeur={fcfa(stats.chiffre_affaires_fcfa)}
                detail="Commandes payées, livraison incluse"
              />
            ) : null}
            <Indicateur label="Commandes reçues" valeur={stats.commandes_recues} detail="Créées, hors brouillons" href="/admin/commandes" />
            <Indicateur
              label="Commandes payées"
              valeur={stats.commandes_payees}
              detail="Paiement confirmé sur la période"
              href={`/admin/commandes?paiement=PAYE&du=${periode.du}&au=${periode.au}`}
            />
            <Indicateur
              label="En production"
              valeur={stats.commandes_en_production}
              detail="En cours, toutes dates"
              href="/admin/production"
            />
            <Indicateur
              label="Commandes livrées"
              valeur={stats.commandes_livrees}
              detail="Livrées sur la période"
              href="/admin/commandes?statut=LIVREE"
            />
            {peut(staff.role, 'devis.voir') ? (
              <Indicateur label="Demandes de devis" valeur={stats.devis_recus} detail="Reçues sur la période" href="/admin/devis" />
            ) : (
              <Indicateur label="Prêtes / en livraison" valeur={stats.commandes_pretes} detail="En cours" />
            )}
          </div>

          <AFaire stats={stats} role={staff.role} />

          {voitMarges ? <Marges stats={stats} /> : null}

          {voitVentes ? (
            <Carte
              titre="Chiffre d’affaires encaissé"
              description={`Par ${stats.periode.unite === 'week' ? 'semaine' : 'jour'}, date de paiement · ${fcfa(stats.chiffre_affaires_fcfa)} sur la période`}
            >
              {stats.chiffre_affaires_fcfa > 0 ? (
                <Colonnes
                  libelleValeur="Chiffre d’affaires"
                  formater={compact}
                  donnees={stats.serie.map((p) => ({
                    cle: p.debut,
                    label: libellePeriodeSerie(p.debut, stats.periode.unite),
                    valeur: Number(p.ca_fcfa),
                    infobulle: `${fcfa(Number(p.ca_fcfa))} · ${p.commandes} commande(s)`,
                  }))}
                />
              ) : (
                <Vide>Aucun encaissement sur la période.</Vide>
              )}
            </Carte>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-2">
            {voitVentes ? (
              <Carte titre="Ventes par catégorie" description="Montant des lignes de commandes payées (hors livraison)">
                {stats.ventes_par_categorie.length ? (
                  <BarresHorizontales
                    libelleValeur="Ventes"
                    formater={fcfa}
                    donnees={stats.ventes_par_categorie.map((c) => ({
                      cle: c.categorie,
                      label: c.categorie,
                      valeur: Number(c.montant_fcfa),
                      detail: `${Number(c.quantite).toLocaleString('fr-FR')} u.`,
                    }))}
                  />
                ) : (
                  <Vide>Aucune vente sur la période.</Vide>
                )}
              </Carte>
            ) : null}

            {voitVentes ? (
              <Carte titre="Produits les plus vendus" description="Classés par quantité vendue">
                {stats.produits_plus_vendus.length ? (
                  <BarresHorizontales
                    libelleValeur="Quantité"
                    formater={(n) => `${n.toLocaleString('fr-FR')} u.`}
                    donnees={stats.produits_plus_vendus.map((p) => ({
                      cle: p.produit_id,
                      label: p.nom,
                      valeur: Number(p.quantite),
                      detail: voitMarges
                        ? `${fcfa(Number(p.montant_fcfa))} · marge ${pourcentage(tauxMarge(Number(p.marge_fcfa), Number(p.montant_fcfa)), 0)}`
                        : fcfa(Number(p.montant_fcfa)),
                    }))}
                  />
                ) : (
                  <Vide>Aucune vente sur la période.</Vide>
                )}
              </Carte>
            ) : null}

            {peut(staff.role, 'produits.voir') ? (
              <Carte
                titre="Alertes de stock"
                description="Variantes dont le stock a atteint le seuil d’alerte (en cours)"
                action={
                  <Link href="/admin/produits" className={bouton('discret')}>
                    Catalogue
                  </Link>
                }
              >
                {stats.alertes_stock.length ? (
                  <ul className="divide-y divide-neutral-100 text-sm">
                    {stats.alertes_stock.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                        <Link href={`/admin/produits/${a.produit_id}#variantes`} className="min-w-0 truncate hover:underline">
                          {a.produit_nom}
                          <span className="text-neutral-500"> · {[a.taille, a.couleur].filter(Boolean).join(' / ') || 'variante unique'}</span>
                        </Link>
                        <Badge ton={a.stock === 0 ? 'danger' : 'alerte'}>
                          {a.stock === 0 ? 'Rupture' : `${a.stock} en stock`} · seuil {a.seuil_alerte}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Vide>Aucune alerte. Les variantes à seuil 0 ne sont pas suivies.</Vide>
                )}
              </Carte>
            ) : null}
          </div>

          <p className="text-xs text-neutral-500">
            Période du {dateCourte(periode.du)} au {dateCourte(periode.au)} inclus, heure de Brazzaville.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function AFaire({ stats, role }: { stats: Statistiques; role: Parameters<typeof peut>[0] }) {
  const elements = [
    peut(role, 'commandes.voir') && stats.commandes_a_lancer > 0
      ? { href: '/admin/commandes?statut=PAYEE', texte: `${stats.commandes_a_lancer} commande(s) payée(s) à lancer en production`, ton: 'attente' as const }
      : null,
    peut(role, 'production.voir') && stats.travaux_en_retard > 0
      ? { href: '/admin/production?retard=1', texte: `${stats.travaux_en_retard} tâche(s) d’atelier en retard`, ton: 'danger' as const }
      : null,
    peut(role, 'devis.voir') && (stats.devis_par_statut.NOUVEAU ?? 0) > 0
      ? { href: '/admin/devis?statut=NOUVEAU', texte: `${stats.devis_par_statut.NOUVEAU} demande(s) de devis à analyser`, ton: 'info' as const }
      : null,
    peut(role, 'commandes.paiement') && stats.paiements_anomalie > 0
      ? { href: '/admin/commandes?paiement=ANOMALIE', texte: `${stats.paiements_anomalie} paiement(s) en anomalie`, ton: 'alerte' as const }
      : null,
    peut(role, 'produits.voir') && stats.alertes_stock.length > 0
      ? { href: '/admin/produits', texte: `${stats.alertes_stock.length} alerte(s) de stock`, ton: 'alerte' as const }
      : null,
  ].filter((e): e is NonNullable<typeof e> => Boolean(e));

  if (!elements.length) return null;
  return (
    <Carte titre="À traiter">
      <ul className="flex flex-wrap gap-2">
        {elements.map((e) => (
          <li key={e.href}>
            <Link href={e.href} className="inline-flex hover:opacity-80">
              <Badge ton={e.ton}>{e.texte} →</Badge>
            </Link>
          </li>
        ))}
      </ul>
    </Carte>
  );
}

function Marges({ stats }: { stats: Statistiques }) {
  const taux = tauxMarge(stats.marge.marge_fcfa, stats.marge.ventes_fcfa);
  const moyenne = stats.commandes_payees > 0 ? Math.round(stats.marge.marge_fcfa / stats.commandes_payees) : null;
  return (
    <Carte
      titre="Indicateurs de marge"
      description="Commandes payées sur la période · marge = ventes hors livraison − coût de revient (articles + sous-traitance)"
    >
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <div>
          <p className="text-xs text-neutral-500">Ventes (hors livraison)</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{fcfa(stats.marge.ventes_fcfa)}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-500">Coût de revient</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{fcfa(stats.marge.cout_fcfa)}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-500">Marge brute</p>
          <p className={`mt-1 text-lg font-semibold tabular-nums ${stats.marge.marge_fcfa < 0 ? 'text-red-700' : ''}`}>
            {fcfa(stats.marge.marge_fcfa)}
          </p>
        </div>
        <div>
          <p className="text-xs text-neutral-500">Taux de marge</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{pourcentage(taux)}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-500">Marge moyenne / commande</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{fcfa(moyenne)}</p>
        </div>
      </div>
      {stats.marge.sans_cout > 0 ? (
        <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {stats.marge.sans_cout} commande(s) payée(s) sans coût de revient renseigné : la marge est surestimée.
          Renseignez le coût des produits (catalogue) ou des lignes (fiche commande).
        </p>
      ) : null}
    </Carte>
  );
}
