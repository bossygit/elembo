'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import CommandeBanderole, { type VisuelStudio } from '@/components/grand-format/CommandeBanderole';
import type { UsageId } from '@/lib/grand-format/catalogue';

type Etat = { etat: 'chargement' } | { etat: 'pret'; visuel: VisuelStudio } | { etat: 'erreur'; message: string };

/** Relit sur l'appareil le visuel préparé par le Studio. Rien n'est encore envoyé. */
async function lireVisuel(projet: string): Promise<VisuelStudio> {
  // Chargé seulement ici : le formulaire ordinaire n'embarque rien du Studio.
  const [{ assemblerPaquet }, stockage, { categorieParId }] = await Promise.all([import('@/lib/banner/paquet'), import('@/lib/banner/stockage'), import('@/lib/banner/categories')]);
  const [lecture, paquet] = await Promise.all([stockage.lireProjet(projet), stockage.lirePaquet(projet)]);
  if (!lecture?.ok) throw new Error('Ce visuel n’est pas sur cet appareil.');
  const d = lecture.document;
  if (!paquet || paquet.modifieLe !== d.modifieLe) throw new Error('Ce visuel a changé depuis sa préparation : finalisez-le à nouveau dans le Studio.');
  const images = new Map<string, Blob>();
  for (const a of d.assets) {
    const b = await stockage.lireAsset(a.id);
    if (b) images.set(a.id, b);
  }
  const r = assemblerPaquet({ document: d, apercu: paquet.apercu, images });
  if (!r.ok) throw new Error(r.erreur);
  return {
    projet: d.id,
    nom: d.nom,
    usage: d.categorie ? categorieParId(d.categorie)?.usage : undefined,
    support: d.support,
    finition: d.finition,
    largeurM: d.dimensions.largeurMm / 1000,
    hauteurM: d.dimensions.hauteurMm / 1000,
    fichiers: r.fichiers,
    apercuUrl: URL.createObjectURL(paquet.apercu),
    surEnvoi: (reference) => void stockage.marquerEnvoye(d.id, reference),
  };
}

export default function CommandeStudio({ projet, initialUsage }: { projet: string; initialUsage?: UsageId }) {
  const [etat, setEtat] = useState<Etat>({ etat: 'chargement' });

  useEffect(() => {
    let actif = true;
    let url: string | null = null;
    lireVisuel(projet).then(
      (visuel) => {
        url = visuel.apercuUrl;
        if (actif) setEtat({ etat: 'pret', visuel });
        else URL.revokeObjectURL(url);
      },
      (e: unknown) => {
        if (actif) setEtat({ etat: 'erreur', message: e instanceof Error ? e.message : 'Ce visuel ne peut pas être lu.' });
      },
    );
    return () => {
      actif = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [projet]);

  if (etat.etat === 'chargement') return <p className="text-sm text-attenue" role="status">Lecture de votre visuel…</p>;
  if (etat.etat === 'erreur') {
    return (
      <div className="max-w-2xl rounded-3xl border border-filet bg-white p-6" role="alert">
        <p className="font-semibold text-encre">{etat.message}</p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link href={`/banderoles/studio?projet=${projet}`} className="rounded-full bg-encre px-5 py-3 font-semibold text-creme">Ouvrir le Studio</Link>
          <a href="/banderoles/commander" className="rounded-full border border-encre px-5 py-3 font-semibold text-encre">Commander sans ce visuel</a>
        </div>
      </div>
    );
  }
  return <CommandeBanderole initialUsage={initialUsage} visuel={etat.visuel} />;
}
