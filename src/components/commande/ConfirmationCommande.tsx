'use client';

// Page de confirmation après un paiement MTN MoMo.
//
// Règle : on n'affiche « commande confirmée » que si le SERVEUR dit PAYE pour cette référence.
// L'URL et le récapitulatif conservé sur l'appareil ne prouvent rien (n'importe qui peut écrire
// une adresse) : ils ne servent qu'à retrouver ce qu'il faut afficher une fois le paiement vérifié.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';

import { formaterFcfa, lireRecap, referencePlausible, type RecapCommande } from '../../lib/order/confirmation';
import { ErreurPaiement, suivrePaiement, type Paiement } from '../../lib/payment/momo';
import { BoutonLien, Etiquette } from '../site/ui';

type Etat =
  | { genre: 'verification' }
  | { genre: 'paye'; paiement: Paiement; recap: RecapCommande | null }
  | { genre: 'attente'; paiement: Paiement }
  | { genre: 'refuse'; paiement: Paiement }
  | { genre: 'injoignable'; message: string };

/** Délai de vérification : le paiement est en principe déjà tranché quand on arrive ici. */
const DELAI_VERIFICATION_MS = 45_000;

function Ligne({ libelle, valeur, fort = false }: { libelle: string; valeur: string; fort?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 py-2 text-sm ${fort ? 'font-semibold text-encre' : 'text-attenue'}`}>
      <dt>{libelle}</dt>
      <dd className={`text-right ${fort ? 'text-encre' : 'text-encre/90'}`}>{valeur}</dd>
    </div>
  );
}

function formaterDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });
}

function Recapitulatif({ recap, paiement }: { recap: RecapCommande; paiement: Paiement }) {
  const transaction = paiement.financialTransactionId ?? recap.financialTransactionId;
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <section aria-labelledby="titre-articles" className="border border-filet bg-white p-5 sm:p-6">
        <h2 id="titre-articles" className="text-xs font-semibold uppercase tracking-[0.16em] text-attenue">
          Votre commande
        </h2>

        <div className="mt-4 flex items-start gap-4">
          <span
            aria-hidden
            className="mt-1 h-10 w-10 shrink-0 rounded-full border border-filet"
            style={{ backgroundColor: recap.produit.couleurHex }}
          />
          <div>
            <p className="text-base font-semibold text-encre">{recap.produit.nom}</p>
            <p className="text-sm text-attenue">
              Couleur {recap.produit.couleur.toLowerCase()}
              {recap.faces.length > 0 ? ` · ${recap.faces.join(' + ').toLowerCase()} personnalisée` : ''}
            </p>
          </div>
        </div>

        <dl className="mt-4 divide-y divide-filet border-y border-filet" data-testid="recap-lignes">
          {recap.lignes.map((l) => (
            <Ligne
              key={l.taille}
              libelle={`Taille ${l.taille} × ${l.quantite}`}
              valeur={formaterFcfa(l.quantite * recap.prixUnitaireFcfa)}
            />
          ))}
        </dl>

        <dl className="mt-2">
          <Ligne libelle="Prix unitaire" valeur={formaterFcfa(recap.prixUnitaireFcfa)} />
          <Ligne
            libelle={`Sous-total (${recap.quantite} pièce${recap.quantite > 1 ? 's' : ''})`}
            valeur={formaterFcfa(recap.sousTotalFcfa)}
          />
          <Ligne libelle={`Livraison — ${recap.livraison.ville}`} valeur={formaterFcfa(recap.livraison.fraisFcfa)} />
          <div className="mt-1 border-t border-encre pt-1">
            <Ligne libelle="Total payé" valeur={formaterFcfa(paiement.montantFcfa)} fort />
          </div>
        </dl>
      </section>

      <div className="flex flex-col gap-6">
        <section aria-labelledby="titre-livraison" className="border border-filet bg-white p-5 sm:p-6">
          <h2 id="titre-livraison" className="text-xs font-semibold uppercase tracking-[0.16em] text-attenue">
            Livraison
          </h2>
          <p className="mt-3 text-sm text-encre">
            {recap.livraison.ville} — sous {recap.livraison.delaiJours} jour{recap.livraison.delaiJours > 1 ? 's' : ''}{' '}
            maximum.
          </p>
          <p className="mt-2 text-xs leading-relaxed text-attenue">
            {recap.atelier.envoye
              ? 'Votre fichier de production a bien été transmis à l’atelier de Brazzaville.'
              : 'Votre paiement est confirmé, mais l’envoi automatique du fichier à l’atelier n’a pas abouti. Contactez-nous avec votre référence : nous récupérerons votre création.'}
          </p>
        </section>

        <section aria-labelledby="titre-paiement" className="border border-filet bg-white p-5 sm:p-6">
          <h2 id="titre-paiement" className="text-xs font-semibold uppercase tracking-[0.16em] text-attenue">
            Paiement
          </h2>
          <dl className="mt-2 divide-y divide-filet">
            <Ligne libelle="Moyen" valeur="MTN Mobile Money" />
            <Ligne libelle="Numéro" valeur={recap.client.telephoneMasque} />
            {recap.client.nom && <Ligne libelle="Client" valeur={recap.client.nom} />}
            {transaction && <Ligne libelle="Transaction MTN" valeur={transaction} />}
            {formaterDate(recap.payeLe) && <Ligne libelle="Date" valeur={formaterDate(recap.payeLe)} />}
          </dl>
        </section>
      </div>
    </div>
  );
}

/** Quand le récapitulatif n'est plus sur cet appareil : on n'affiche que ce que le serveur sait. */
function RecapitulatifMinimal({ commande, paiement }: { commande: string; paiement: Paiement }) {
  return (
    <section aria-labelledby="titre-minimal" className="max-w-xl border border-filet bg-white p-5 sm:p-6">
      <h2 id="titre-minimal" className="text-xs font-semibold uppercase tracking-[0.16em] text-attenue">
        Paiement confirmé
      </h2>
      <dl className="mt-2 divide-y divide-filet">
        <Ligne libelle="Commande" valeur={commande} />
        <Ligne libelle="Montant payé" valeur={formaterFcfa(paiement.montantFcfa)} fort />
        <Ligne libelle="Moyen" valeur="MTN Mobile Money" />
        {paiement.financialTransactionId && <Ligne libelle="Transaction MTN" valeur={paiement.financialTransactionId} />}
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-attenue">
        Le détail de votre commande (tailles, couleur, livraison) n’est pas disponible sur cet appareil. Il a été
        transmis à l’atelier ; rappelez votre référence pour toute question.
      </p>
    </section>
  );
}

export default function ConfirmationCommande({
  commande,
  referenceId,
}: {
  commande: string;
  referenceId: string;
}) {
  const parametresValides = referencePlausible(commande) && referencePlausible(referenceId);
  const [etat, setEtat] = useState<Etat>({ genre: 'verification' });
  const [tentative, setTentative] = useState(0);

  useEffect(() => {
    if (!parametresValides) return;
    let annule = false;

    (async () => {
      try {
        const { paiement } = await suivrePaiement(referenceId, { delaiMaxMs: DELAI_VERIFICATION_MS });
        if (annule) return;

        // Le serveur doit reconnaître cette référence de paiement comme celle de CETTE commande.
        if (paiement.commande !== commande) {
          setEtat({ genre: 'refuse', paiement });
        } else if (paiement.statut === 'PAYE') {
          setEtat({ genre: 'paye', paiement, recap: lireRecap(commande, referenceId) });
        } else if (paiement.statut === 'PENDING') {
          setEtat({ genre: 'attente', paiement });
        } else {
          setEtat({ genre: 'refuse', paiement });
        }
      } catch (erreur) {
        if (annule) return;
        const introuvable = erreur instanceof ErreurPaiement && erreur.statutHttp === 404;
        setEtat(
          introuvable
            ? {
                genre: 'refuse',
                paiement: { referenceId, commande, statut: 'ECHEC', montantFcfa: 0, devise: 'XAF' },
              }
            : {
                genre: 'injoignable',
                message: erreur instanceof Error ? erreur.message : 'Vérification impossible.',
              },
        );
      }
    })();

    return () => {
      annule = true;
    };
  }, [commande, referenceId, parametresValides, tentative]);

  const reessayer = useCallback(() => {
    setEtat({ genre: 'verification' });
    setTentative((n) => n + 1);
  }, []);

  if (!parametresValides) {
    return (
      <Message
        titre="Aucune commande à afficher"
        texte="Ce lien est incomplet. Si vous venez de payer, retrouvez votre commande avec la référence reçue à l’écran de paiement."
      />
    );
  }

  if (etat.genre === 'verification') {
    return (
      <p role="status" aria-live="polite" className="text-sm text-attenue" data-testid="verification">
        Vérification de votre paiement…
      </p>
    );
  }

  if (etat.genre === 'injoignable') {
    return (
      <Message
        titre="Vérification impossible pour le moment"
        texte={`Nous n’avons pas pu joindre le service de paiement (${etat.message}). Votre commande n’est pas perdue : réessayez dans un instant.`}
        action={
          <button
            type="button"
            onClick={reessayer}
            className="inline-flex rounded-full border border-encre px-5 py-3 text-sm font-semibold text-encre hover:bg-encre hover:text-creme"
          >
            Réessayer
          </button>
        }
      />
    );
  }

  if (etat.genre === 'attente') {
    return (
      <Message
        titre="Paiement en attente de validation"
        texte="MTN n’a pas encore confirmé ce paiement. Validez la demande reçue sur votre téléphone, puis actualisez cette page."
        action={
          <button
            type="button"
            onClick={reessayer}
            className="inline-flex rounded-full border border-encre px-5 py-3 text-sm font-semibold text-encre hover:bg-encre hover:text-creme"
          >
            Actualiser
          </button>
        }
      />
    );
  }

  if (etat.genre === 'refuse') {
    return (
      <Message
        titre="Paiement non confirmé"
        texte="Ce paiement n’apparaît pas comme réussi : aucune commande n’est enregistrée sous cette référence et rien n’a été débité par Elembo. Vous pouvez relancer votre commande."
        action={<BoutonLien href="/personnalisation">Retour à la personnalisation</BoutonLien>}
      />
    );
  }

  return (
    <div className="flex flex-col gap-8" data-testid="confirmation-commande">
      <div role="status" className="flex flex-col gap-2">
        <Etiquette>Paiement confirmé</Etiquette>
        <p className="text-sm text-attenue">
          Merci pour votre commande. Référence à rappeler :{' '}
          <span className="font-mono font-semibold text-encre" data-testid="reference-commande">
            {commande}
          </span>
        </p>
      </div>

      {etat.recap ? (
        <Recapitulatif recap={etat.recap} paiement={etat.paiement} />
      ) : (
        <RecapitulatifMinimal commande={commande} paiement={etat.paiement} />
      )}

      <div className="flex flex-wrap gap-3 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-encre px-5 py-3 text-sm font-semibold text-encre transition-colors hover:bg-encre hover:text-creme"
        >
          Imprimer ce récapitulatif
        </button>
        <BoutonLien href="/personnalisation" variante="secondaire">
          Personnaliser un autre textile
        </BoutonLien>
        <BoutonLien href="/">Retour à l’accueil</BoutonLien>
      </div>

      <p className="text-xs text-attenue print:hidden">
        Une question sur votre commande ?{' '}
        <Link href="/contact" className="font-semibold text-encre underline underline-offset-4">
          Contactez l’atelier
        </Link>{' '}
        en rappelant votre référence.
      </p>
    </div>
  );
}

function Message({
  titre,
  texte,
  action,
}: {
  titre: string;
  texte: string;
  action?: React.ReactNode;
}) {
  return (
    <div role="status" className="max-w-xl border border-encre bg-[#F3EFE6] px-5 py-4">
      <p className="font-semibold text-encre">{titre}</p>
      <p className="mt-1 text-sm leading-relaxed text-attenue">{texte}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
