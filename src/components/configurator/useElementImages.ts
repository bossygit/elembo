'use client';

// Charge les images des éléments du design (une seule fois par object URL).
//
// Le texte, lui, n'a rien à charger dans le canvas : il est redessiné à partir de ses
// paramètres (police, taille, couleur, contenu). Les polices sont demandées au navigateur
// pour que la mesure et le dessin utilisent la vraie typographie.

import { useEffect, useMemo, useState } from 'react';
import type { DesignElement, TextElement } from '../../types/configurator';
import { ensureFontReady } from '../../lib/fonts';

/** Cache partagé : une source n'est décodée qu'une fois, même avec plusieurs consommateurs. */
const cache = new Map<string, HTMLImageElement>();
const enCours = new Map<string, Promise<HTMLImageElement>>();

function chargerImage(src: string): Promise<HTMLImageElement> {
  const connue = cache.get(src);
  if (connue) return Promise.resolve(connue);
  const deja = enCours.get(src);
  if (deja) return deja;
  const promesse = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      cache.set(src, img);
      enCours.delete(src);
      resolve(img);
    };
    img.onerror = () => {
      enCours.delete(src);
      reject(new Error(`image illisible : ${src.slice(0, 32)}`));
    };
    img.src = src;
  });
  enCours.set(src, promesse);
  return promesse;
}

/**
 * Images chargées, INDEXÉES PAR IDENTIFIANT D'ÉLÉMENT — c'est la clé dont se servent le
 * canvas 2D et la texture 3D. Une source n'est chargée qu'une fois, et l'image n'est
 * exposée qu'une fois `onload` reçu : le canvas ne dessine donc jamais une image vide.
 */
export function useElementImages(elements: DesignElement[]): Map<string, HTMLImageElement> {
  const demandes = useMemo(
    () =>
      elements
        .filter((el) => el.type === 'image')
        .filter((el) => Boolean(el.src))
        .map((el) => ({ id: el.id, src: el.src })),
    [elements],
  );
  const cle = demandes.map((d) => `${d.id}:${d.src}`).join('|');
  const [parSource, setParSource] = useState<Map<string, HTMLImageElement>>(() => new Map(cache));

  useEffect(() => {
    if (!demandes.length) return;
    let annule = false;
    for (const src of [...new Set(demandes.map((d) => d.src))]) {
      if (cache.has(src)) continue;
      chargerImage(src)
        .then((img) => {
          if (!annule) setParSource((prev) => (prev.get(src) === img ? prev : new Map(prev).set(src, img)));
        })
        .catch(() => undefined);
    }
    return () => {
      annule = true;
    };
    // `cle` résume (identifiant, source) : l'effet ne rejoue pas à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle]);

  return useMemo(() => {
    const parId = new Map<string, HTMLImageElement>();
    for (const { id, src } of demandes) {
      const image = cache.get(src) ?? parSource.get(src);
      if (image) parId.set(id, image);
    }
    return parId;
  }, [demandes, parSource]);
}

/**
 * Demande au navigateur de charger les polices des textes présents, puis signale qu'elles
 * sont prêtes (le canvas doit être redessiné à ce moment-là : mesurer avant le
 * chargement donnerait une largeur de police de secours).
 */
export function useTextFonts(elements: DesignElement[]): number {
  const signatures = useMemo(
    () =>
      elements
        .filter((el): el is TextElement => el.type === 'text')
        .map((el) => `${el.fontId}:${el.fontWeight}`)
        .join('|'),
    [elements],
  );
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!signatures) return;
    let annule = false;
    const textes = elements.filter((el): el is TextElement => el.type === 'text');
    Promise.all(textes.map((el) => ensureFontReady(el))).then(() => {
      if (!annule) setVersion((v) => v + 1);
    });
    return () => {
      annule = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signatures]);

  return version;
}
