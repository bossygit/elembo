'use client';

/**
 * Moteur d'animation du site — un seul composant, monté dans le layout.
 *
 * Les pages restent des composants serveur : elles déclarent leurs intentions par attributs,
 * et ce moteur les anime au défilement.
 *
 *   data-anim="monte"     l'élément monte et apparaît (les voisins d'un même lot se décalent)
 *   data-anim="titre"     le titre se révèle ligne par ligne, sous un masque
 *   data-anim="image"     l'image se dévoile de bas en haut pendant que son contenu se pose
 *   data-parallaxe="0.2"  léger déplacement vertical lié au défilement (écrans larges seulement)
 *
 * Règles :
 *   - GSAP est chargé APRÈS l'hydratation (import dynamique) : il ne retarde ni l'affichage
 *     ni l'interaction. L'entrée du hero est en CSS pur pour la même raison.
 *   - Rien n'est masqué en CSS : sans JavaScript, ou avant son arrivée, tout est visible.
 *     Un élément déjà à l'écran quand GSAP arrive n'est pas re-masqué (pas de clignotement).
 *   - `prefers-reduced-motion` : aucune animation n'est créée.
 *   - Nettoyage : tout vit dans un `gsap.context()`, annulé au changement de page et au
 *     démontage (animations, ScrollTriggers et découpages de texte compris).
 */

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

export default function Mouvement() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let annule = false;
    let nettoyer: (() => void) | undefined;

    (async () => {
      const [{ gsap }, { ScrollTrigger }, { SplitText }] = await Promise.all([
        import('gsap'),
        import('gsap/ScrollTrigger'),
        import('gsap/SplitText'),
      ]);
      if (annule) return;
      gsap.registerPlugin(ScrollTrigger, SplitText);

      const horsEcran = (el: Element) => el.getBoundingClientRect().top > window.innerHeight * 0.92;
      const contexte = gsap.context(() => {
        // -- Apparitions par lots ---------------------------------------------------------
        const montants = gsap.utils.toArray<HTMLElement>('[data-anim="monte"]').filter(horsEcran);
        if (montants.length > 0) {
          gsap.set(montants, { autoAlpha: 0, y: 36 });
          ScrollTrigger.batch(montants, {
            start: 'top 90%',
            once: true,
            onEnter: (lot) =>
              gsap.to(lot, {
                autoAlpha: 1,
                y: 0,
                duration: 0.9,
                ease: 'power3.out',
                stagger: 0.08,
                overwrite: true,
              }),
          });
        }

        // -- Titres : révélation ligne par ligne -----------------------------------------
        gsap.utils
          .toArray<HTMLElement>('[data-anim="titre"]')
          .filter(horsEcran)
          .forEach((titre) => {
            SplitText.create(titre, {
              type: 'lines',
              mask: 'lines',
              autoSplit: true,
              onSplit: (decoupe) =>
                gsap.from(decoupe.lines, {
                  yPercent: 110,
                  duration: 1,
                  ease: 'power4.out',
                  stagger: 0.09,
                  scrollTrigger: { trigger: titre, start: 'top 88%', once: true },
                }),
            });
          });

        // -- Images : dévoilement --------------------------------------------------------
        gsap.utils
          .toArray<HTMLElement>('[data-anim="image"]')
          .filter(horsEcran)
          .forEach((cadre) => {
            const declencheur = { trigger: cadre, start: 'top 85%', once: true };
            gsap.fromTo(
              cadre,
              { clipPath: 'inset(100% 0% 0% 0%)' },
              { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.2, ease: 'power4.out', scrollTrigger: declencheur },
            );
            const contenu = cadre.querySelector('img');
            if (contenu) {
              gsap.from(contenu, { scale: 1.18, duration: 1.6, ease: 'power3.out', scrollTrigger: declencheur });
            }
          });

        // -- Parallaxe : écrans larges uniquement (coût et confort sur mobile) ------------
        const mm = gsap.matchMedia();
        mm.add('(min-width: 1024px)', () => {
          gsap.utils.toArray<HTMLElement>('[data-parallaxe]').forEach((el) => {
            const force = Number(el.dataset.parallaxe) || 0.15;
            gsap.fromTo(
              el,
              { y: force * 90 },
              {
                y: force * -90,
                ease: 'none',
                scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: 0.6 },
              },
            );
          });
        });
      });

      nettoyer = () => contexte.revert();
      if (annule) nettoyer();
    })();

    return () => {
      annule = true;
      nettoyer?.();
    };
  }, [pathname]);

  return null;
}
