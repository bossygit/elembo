'use client';

// PANIER & CRÉATIONS SAUVEGARDÉES.
//
// Le panier conserve des PROJETS complets (config v3 : couleur, procédé, cinq zones,
// images par assetId, textes, positions, rotations). Les fichiers d'image restent dans
// IndexedDB ; seuls leurs identifiants sont sérialisés, donc le panier ne sature pas
// localStorage.
//
// Reprendre une création la recharge dans l'atelier avec tout son travail. Le paiement
// reste unitaire (MTN MoMo) : chaque vêtement est fabriqué et réglé création par création,
// ce qui est expliqué sans ambiguïté.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getProductById } from '../../lib/products/catalog';
import { profilParId } from '../../lib/products/production';
import { formatFcfa } from '../../lib/order/order';
import { SIDE_LABELS } from '../../types/configurator';
import {
  ecrireBrouillon,
  listerPanier,
  listerProjets,
  retirerDuPanier,
  supprimerProjet,
  viderPanier,
} from '../../lib/projects/project-storage';
import type { ProjetSauvegarde } from '../../lib/projects/project-storage';
import { Bag, Trash } from '../site/Icons';

function zonesPersonnalisees(projet: ProjetSauvegarde): string {
  const zones = [...new Set(projet.config.elements.filter((el) => el.visible !== false).map((el) => el.side))];
  return zones.length ? zones.map((side) => SIDE_LABELS[side]).join(' · ') : 'T-shirt uni';
}

function couleurNom(projet: ProjetSauvegarde): string {
  const product = getProductById(projet.config.productId);
  return product?.colors.find((c) => c.hex.toLowerCase() === projet.config.color.toLowerCase())?.name ?? projet.config.color;
}

function dateLisible(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function CarteProjet({
  projet,
  actionPrincipale,
  onAction,
  onRetirer,
  libelleRetirer,
}: {
  projet: ProjetSauvegarde;
  actionPrincipale: string;
  onAction: () => void;
  onRetirer: () => void;
  libelleRetirer: string;
}) {
  const product = getProductById(projet.config.productId);
  const profil = profilParId(projet.config.profileId, product);
  return (
    <li data-testid="carte-projet" className="flex gap-3 rounded-2xl border border-encre/10 bg-white p-3 shadow-sm">
      <div className="h-[104px] w-[88px] shrink-0 overflow-hidden rounded-xl bg-sable">
        {projet.apercu ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={projet.apercu} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center text-[10px] text-attenue">Aperçu</div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-encre">{projet.nom}</p>
            <p className="mt-0.5 text-[11px] text-attenue">
              {product?.name ?? projet.config.productId} · {couleurNom(projet)} · {profil.nom}
            </p>
            <p className="mt-0.5 line-clamp-1 text-[11px] text-attenue">{zonesPersonnalisees(projet)}</p>
          </div>
          <button
            type="button"
            onClick={onRetirer}
            aria-label={`${libelleRetirer} : ${projet.nom}`}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-attenue hover:bg-red-50 hover:text-red-600"
          >
            <Trash className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="text-sm font-semibold text-encre">{formatFcfa(projet.prixFcfa ?? null)}</span>
          <div className="flex items-center gap-1.5">
            {projet.modifieLe && <span className="hidden text-[10px] text-attenue sm:inline">{dateLisible(projet.modifieLe)}</span>}
            <button
              type="button"
              onClick={onAction}
              className="rounded-full bg-encre px-3 py-1.5 text-[11px] font-semibold text-creme transition-colors hover:bg-orange hover:text-encre"
            >
              {actionPrincipale}
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

export default function Panier() {
  const router = useRouter();
  const [panier, setPanier] = useState<ProjetSauvegarde[]>([]);
  const [projets, setProjets] = useState<ProjetSauvegarde[]>([]);

  function recharger() {
    setPanier(listerPanier());
    setProjets(listerProjets());
  }

  useEffect(() => {
    // localStorage n'existe pas au rendu serveur : lecture uniquement côté client.
    // C'est une synchronisation avec un système externe, pas un état dérivable.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    recharger();
  }, []);

  /** Recharge une création dans l'atelier (les images sont ré-attachées par assetId). */
  function reprendre(projet: ProjetSauvegarde, commander = false) {
    ecrireBrouillon({ ...projet, id: 'brouillon', modifieLe: new Date().toISOString() });
    router.push(commander ? '/personnalisation#commande' : '/personnalisation');
  }

  const total = panier.reduce((somme, projet) => somme + (projet.prixFcfa ?? 0), 0);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <p className="surtitre text-orange-action">Votre sélection</p>
        <h1 className="titre-editorial mt-2 text-3xl text-encre sm:text-4xl">Panier &amp; créations</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-attenue">
          Chaque création garde sa couleur, son procédé de production et ses cinq zones. Vous
          pouvez la rouvrir dans le studio pour la modifier : rien n’est perdu.
        </p>
      </header>

      <section aria-labelledby="panier-titre" className="mb-10">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="panier-titre" className="flex items-center gap-2 font-display text-xl text-encre">
            <Bag className="h-5 w-5" /> Panier
            <span className="rounded-full bg-encre px-2 py-0.5 font-mono text-[10px] font-semibold text-creme">
              {panier.length}
            </span>
          </h2>
          {panier.length > 0 && (
            <button
              type="button"
              onClick={() => {
                viderPanier();
                recharger();
              }}
              className="text-xs text-attenue underline underline-offset-4 hover:text-red-700"
            >
              Vider le panier
            </button>
          )}
        </div>

        {panier.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-encre/20 bg-white px-4 py-8 text-center">
            <p className="text-sm text-attenue">Votre panier est vide.</p>
            <Link
              href="/personnalisation"
              className="mt-3 inline-flex rounded-full bg-orange px-4 py-2 text-sm font-bold text-encre transition-colors hover:bg-encre hover:text-creme"
            >
              Créer un T-shirt
            </Link>
          </div>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {panier.map((projet) => (
                <CarteProjet
                  key={projet.id}
                  projet={projet}
                  actionPrincipale="Modifier"
                  onAction={() => reprendre(projet)}
                  onRetirer={() => {
                    retirerDuPanier(projet.id);
                    recharger();
                  }}
                  libelleRetirer="Retirer du panier"
                />
              ))}
            </ul>
            <div className="mt-3 flex flex-col gap-2 rounded-2xl bg-encre px-4 py-3 text-creme sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="surtitre text-creme/60">Total indicatif · {panier.length} création(s)</p>
                <p className="font-display text-xl">{formatFcfa(total)}</p>
              </div>
              <p className="max-w-sm text-[11px] leading-snug text-creme/70">
                Le paiement MTN MoMo se règle création par création : ouvrez « Modifier » puis
                « Commander » pour choisir les tailles et la livraison de chaque vêtement.
                La livraison s’ajoute au moment du paiement.
              </p>
            </div>
          </>
        )}
      </section>

      <section aria-labelledby="creations-titre">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 id="creations-titre" className="font-display text-xl text-encre">
            Mes créations enregistrées
          </h2>
          <span className="text-[11px] text-attenue">Conservées sur cet appareil</span>
        </div>
        {projets.length === 0 ? (
          <p className="rounded-2xl border border-encre/10 bg-white px-4 py-6 text-center text-sm text-attenue">
            Aucune création enregistrée. Dans le studio, utilisez « Enregistrer » pour garder
            un projet et y revenir plus tard.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {projets.map((projet) => (
              <CarteProjet
                key={projet.id}
                projet={projet}
                actionPrincipale="Reprendre"
                onAction={() => reprendre(projet)}
                onRetirer={() => {
                  supprimerProjet(projet.id);
                  recharger();
                }}
                libelleRetirer="Supprimer la création"
              />
            ))}
          </ul>
        )}
      </section>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/personnalisation" className="text-sm font-semibold text-orange-action underline underline-offset-4">
          ← Retour au studio
        </Link>
        <Link href="/boutique" className="text-sm text-attenue underline underline-offset-4 hover:text-encre">
          Voir la boutique
        </Link>
      </div>
    </div>
  );
}
