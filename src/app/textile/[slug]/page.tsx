import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { ArrowRight, Check } from '@/components/site/Icons';
import PrintIllustration from '@/components/site/PrintIllustration';
import { BoutonLien, Etiquette } from '@/components/site/ui';
import { PRODUITS_VITRINE } from '@/lib/commerce/catalogue';
import { asset } from '@/lib/site/asset';

type Contexte = { params: Promise<{ slug: string }> };

function produit(slug: string) {
  return PRODUITS_VITRINE.find((p) => p.famille === 'textile' && p.id === slug && p.fiche);
}

export function generateStaticParams() {
  return PRODUITS_VITRINE.filter((p) => p.famille === 'textile').map((p) => ({ slug: p.id }));
}

export async function generateMetadata({ params }: Contexte): Promise<Metadata> {
  const { slug } = await params;
  const fiche = produit(slug);
  if (!fiche) return { title: 'Produit textile' };
  return {
    title: fiche.nom,
    description: `${fiche.description} Fiche commerciale, variantes, tailles, zones d’impression et demande de devis.`,
  };
}

export default async function PageProduitTextile({ params }: Contexte) {
  const { slug } = await params;
  const p = produit(slug);
  if (!p || !p.fiche) notFound();
  const fiche = p.fiche;
  const lienDevis = `/devis?famille=TEXTILE&produit=${encodeURIComponent(p.id)}`;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
      <nav className="flex flex-wrap items-center gap-2 text-xs text-attenue" aria-label="Fil d’Ariane">
        <Link href="/" className="hover:text-encre">Accueil</Link>
        <span aria-hidden>/</span>
        <Link href="/boutique" className="hover:text-encre">Boutique</Link>
        <span aria-hidden>/</span>
        <span className="text-encre">{p.nom}</span>
      </nav>

      <div className="mt-8 grid gap-10 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="border border-filet bg-[#F3EFE6] p-4 sm:p-6">
          <div className="aspect-[4/5] w-full">
            {p.image ? (
              <Image
                src={asset(p.image.src)}
                alt={p.image.alt}
                width={1600}
                height={1067}
                sizes="(min-width: 1024px) 45vw, 100vw"
                className="h-full w-full object-contain p-4"
              />
            ) : (
              <PrintIllustration />
            )}
          </div>
          <p className="mt-4 border-t border-encre/15 pt-3 text-[11px] leading-relaxed text-attenue">
            {p.image
              ? 'Mockup de travail, à remplacer par la photo de production réelle.'
              : 'Visuel de fiche produit. Aucun modèle 3D n’est simulé pour ce produit.'}
          </p>
        </div>

        <div>
          <Etiquette>Textile</Etiquette>
          <h1 className="titre-editorial mt-4 text-4xl text-encre sm:text-5xl">{p.nom}</h1>
          <p className="mt-4 text-base leading-relaxed text-attenue">{p.description}</p>

          <div className="mt-6 border-y border-filet py-4">
            <p className="text-xl font-semibold text-encre">{p.prix.libelle}</p>
            <p className="mt-1 text-xs text-attenue">{p.prix.note}</p>
          </div>

          <ul className="mt-6 grid gap-2 sm:grid-cols-2">
            {p.points.map((point) => (
              <li key={point} className="flex items-start gap-2 text-sm text-attenue">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-action" />
                <span>{point}</span>
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-wrap gap-3">
            {fiche.configurable3D ? (
              <BoutonLien href="/personnalisation" variante="primaire">
                Ouvrir le configurateur 3D
                <ArrowRight className="h-4 w-4" />
              </BoutonLien>
            ) : (
              <BoutonLien href={lienDevis} variante="primaire">
                Demander un devis
                <ArrowRight className="h-4 w-4" />
              </BoutonLien>
            )}
            {fiche.configurable3D ? (
              <BoutonLien href={lienDevis} variante="secondaire">
                Demander un devis quantité
              </BoutonLien>
            ) : null}
          </div>

          {fiche.avertissement ? (
            <p className="mt-6 border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900">
              {fiche.avertissement}
            </p>
          ) : null}

          <p className="mt-5 text-xs leading-relaxed text-attenue">
            {fiche.configurable3D
              ? 'Le configurateur permet de composer un aperçu ; le paiement n’est ouvert que si le prix commercial est validé. Sinon, le devis fixe le prix et le délai.'
              : 'La validation se fait sur fiche technique et BAT. Aucun paiement automatique n’est ouvert tant que le prix et la zone d’impression ne sont pas validés.'}
          </p>
        </div>
      </div>

      <section className="mt-14 grid gap-6 border-t border-filet pt-8 md:grid-cols-2">
        <div>
          <h2 className="font-display text-2xl text-encre">Fiche commerciale</h2>
          <dl className="mt-4 divide-y divide-filet text-sm">
            <div className="grid grid-cols-[120px_1fr] gap-3 py-3">
              <dt className="text-attenue">Variantes</dt>
              <dd>{fiche.variantes.join(' · ')}</dd>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-3 py-3">
              <dt className="text-attenue">Tailles</dt>
              <dd>{fiche.tailles.join(' · ')}</dd>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-3 py-3">
              <dt className="text-attenue">Faces</dt>
              <dd>{fiche.faces.join(' · ')}</dd>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-3 py-3">
              <dt className="text-attenue">Technique</dt>
              <dd>{fiche.technique}</dd>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-3 py-3">
              <dt className="text-attenue">Délai</dt>
              <dd>{fiche.delai}</dd>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-3 py-3">
              <dt className="text-attenue">Minimum</dt>
              <dd>{fiche.minimum}</dd>
            </div>
          </dl>
        </div>

        <div>
          <h2 className="font-display text-2xl text-encre">Couleurs & zones d’impression</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {fiche.couleurs.map((couleur) => (
              <span key={couleur.nom} className="inline-flex items-center gap-2 border border-filet px-3 py-2 text-xs">
                <span className="h-4 w-4 border border-black/10" style={{ backgroundColor: couleur.hex }} aria-hidden />
                {couleur.nom}
              </span>
            ))}
          </div>
          <ul className="mt-5 space-y-2">
            {fiche.zones.map((zone) => (
              <li key={zone} className="flex items-start gap-2 text-sm text-attenue">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-action" />
                <span>{zone}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-xs leading-relaxed text-attenue">
            Les dimensions sont indicatives et confirmées sur le BAT. Pour un visuel complexe,
            envoyez votre fichier : nous vérifions la résolution et la zone avant production.
          </p>
        </div>
      </section>

      <section className="mt-10 border border-encre bg-[#F3EFE6] p-6 sm:flex sm:items-center sm:justify-between sm:gap-6">
        <div>
          <h2 className="font-display text-2xl text-encre">Un lot, un uniforme, un événement ?</h2>
          <p className="mt-1 text-sm text-attenue">
            Décrivez les quantités, les tailles et la date. Nous confirmons le prix et le délai
            avant toute production.
          </p>
        </div>
        <BoutonLien href={lienDevis} variante="primaire" className="mt-4 shrink-0 sm:mt-0">
          Demander un devis
          <ArrowRight className="h-4 w-4" />
        </BoutonLien>
      </section>
    </div>
  );
}
