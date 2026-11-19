'use client';

/**
 * Envoi de photos ou de documents du dossier partenaire.
 *
 * 1. les grandes photos sont réduites dans le navigateur (2 000 px, JPEG) : moins de données
 *    mobiles pour l'atelier, envoi plus sûr sur une connexion lente ;
 * 2. le serveur prépare une URL d'envoi signée (chemin fabriqué côté serveur) ;
 * 3. le fichier part directement vers le bucket privé, puis le serveur vérifie ses octets.
 */

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { confirmerFichier, preparerEnvoiFichier } from '@/app/partenaire/fichiers-actions';
import type { TypeFichierPartenaire } from '@/lib/partenaires/catalogue';
import { MIMES_PAR_TYPE } from '@/lib/partenaires/fichiers';
import { Alerte, bouton } from './ui';

const COTE_MAX = 2000;
const SEUIL_REDUCTION = 1.5 * 1024 * 1024;

/** Réduit une photo trop lourde ou trop grande ; renvoie le fichier d'origine sinon. */
async function reduire(fichier: File): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(fichier.type) || typeof createImageBitmap !== 'function') return fichier;
  let image: ImageBitmap;
  try {
    image = await createImageBitmap(fichier);
  } catch {
    return fichier;
  }
  const echelle = Math.min(1, COTE_MAX / Math.max(image.width, image.height));
  if (echelle === 1 && fichier.size <= SEUIL_REDUCTION) {
    image.close();
    return fichier;
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * echelle);
  canvas.height = Math.round(image.height * echelle);
  const ctx = canvas.getContext('2d');
  if (!ctx) return fichier;
  ctx.fillStyle = '#ffffff'; // fond blanc pour les PNG transparents convertis en JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.85));
  if (!blob || blob.size >= fichier.size) return fichier;
  return new File([blob], fichier.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
}

export function EnvoiFichier({
  type,
  machineId,
  libelle,
  plusieurs = true,
}: {
  type: TypeFichierPartenaire;
  machineId?: string;
  libelle: string;
  plusieurs?: boolean;
}) {
  const routeur = useRouter();
  const champ = useRef<HTMLInputElement>(null);
  const [etat, setEtat] = useState<{ enCours: boolean; message: string | null; erreur: string | null }>({
    enCours: false,
    message: null,
    erreur: null,
  });

  async function envoyer(liste: FileList | null) {
    if (!liste?.length) return;
    const fichiers = [...liste].slice(0, plusieurs ? 10 : 1);
    setEtat({ enCours: true, message: null, erreur: null });
    let envoyes = 0;
    for (const [i, brut] of fichiers.entries()) {
      setEtat({ enCours: true, message: `Préparation ${i + 1}/${fichiers.length}…`, erreur: null });
      const fichier = type === 'LOGO' ? brut : await reduire(brut);
      const demande = { type, machineId: machineId ?? null, mime: fichier.type, taille: fichier.size };
      const prepare = await preparerEnvoiFichier(demande);
      if (!prepare.ok || !prepare.signedUrl || !prepare.chemin) {
        setEtat({ enCours: false, message: null, erreur: prepare.ok ? 'Envoi impossible.' : prepare.erreur });
        break;
      }
      setEtat({ enCours: true, message: `Envoi ${i + 1}/${fichiers.length}…`, erreur: null });
      const reponse = await fetch(prepare.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': fichier.type, 'x-upsert': 'false' },
        body: fichier,
      }).catch(() => null);
      if (!reponse?.ok) {
        setEtat({ enCours: false, message: null, erreur: 'La connexion a été interrompue pendant l’envoi. Réessayez.' });
        break;
      }
      const confirme = await confirmerFichier({ ...demande, chemin: prepare.chemin, nom: brut.name });
      if (!confirme.ok) {
        setEtat({ enCours: false, message: null, erreur: confirme.erreur });
        break;
      }
      envoyes += 1;
    }
    if (champ.current) champ.current.value = '';
    if (envoyes > 0) {
      setEtat((e) => ({ enCours: false, message: e.erreur ? null : `${envoyes} fichier${envoyes > 1 ? 's' : ''} ajouté${envoyes > 1 ? 's' : ''}.`, erreur: e.erreur }));
      routeur.refresh();
    } else {
      setEtat((e) => ({ ...e, enCours: false }));
    }
  }

  return (
    <div className="space-y-3">
      <label className={`${bouton('secondaire')} cursor-pointer ${etat.enCours ? 'pointer-events-none opacity-50' : ''}`}>
        {etat.enCours ? (etat.message ?? 'Envoi…') : libelle}
        <input
          ref={champ}
          type="file"
          className="sr-only"
          accept={MIMES_PAR_TYPE[type].join(',')}
          multiple={plusieurs}
          disabled={etat.enCours}
          onChange={(e) => void envoyer(e.currentTarget.files)}
        />
      </label>
      {etat.erreur ? <Alerte ton="erreur">{etat.erreur}</Alerte> : null}
      {!etat.enCours && etat.message ? <Alerte ton="succes">{etat.message}</Alerte> : null}
    </div>
  );
}
