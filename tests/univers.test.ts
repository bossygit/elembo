import { describe, expect, it } from 'vitest';

import { GAMMES, PRODUITS_VITRINE } from '../src/lib/commerce/catalogue';
import {
  COLLECTIONS,
  KITS_EVENEMENT,
  textesAValider,
  textesPublics,
  UNIVERS,
} from '../src/lib/commerce/univers';
import { lienWhatsApp, MESSAGES_WHATSAPP } from '../src/lib/site/marque';

describe('univers et collections', () => {
  it('propose les cinq univers attendus', () => {
    expect(UNIVERS.map((u) => u.id)).toEqual(['cadeaux', 'identite', 'evenements', 'quotidien', 'memoire']);
  });

  it('ne référence que des produits et des collections qui existent', () => {
    const produits = new Set(PRODUITS_VITRINE.map((p) => p.id));
    const collections = new Set(COLLECTIONS.map((c) => c.id));
    for (const u of UNIVERS) {
      for (const id of u.produits) expect(produits, `${u.id} → ${id}`).toContain(id);
      for (const id of u.collections) expect(collections, `${u.id} → ${id}`).toContain(id);
    }
  });

  it('rattache chaque collection à un univers existant', () => {
    const univers = new Set(UNIVERS.map((u) => u.id));
    for (const c of COLLECTIONS) expect(univers).toContain(c.univers);
  });

  it('donne une gamme connue à chaque kit', () => {
    const gammes = new Set(GAMMES.map((g) => g.id));
    for (const k of KITS_EVENEMENT) expect(gammes).toContain(k.gamme);
  });
});

describe('textes en langues locales', () => {
  it('n’expose jamais un emplacement « à valider » au public', () => {
    for (const c of COLLECTIONS) {
      for (const t of textesPublics(c)) {
        expect(t.aValider).toBe(false);
        expect(t.texte).not.toMatch(/à valider|\[|\]/i);
      }
    }
  });

  it('marque tout texte provisoire comme « à valider »', () => {
    for (const c of COLLECTIONS) {
      for (const t of c.textes) {
        if (/à valider|\[/.test(t.texte)) expect(t.aValider, t.texte).toBe(true);
      }
    }
  });

  it('liste les textes encore à valider (liste de travail pour l’équipe)', () => {
    const restants = textesAValider();
    // Ce test documente le travail restant : il ne bloque pas, il informe.
    if (restants.length > 0) {
      console.info(
        `Textes en langues locales à valider (${restants.length}) :\n` +
          restants.map((t) => `  - [${t.collection}] (${t.langue}) ${t.texte}`).join('\n'),
      );
    }
    expect(Array.isArray(restants)).toBe(true);
  });
});

describe('liens WhatsApp', () => {
  it('pointe vers le numéro d’assistance', () => {
    expect(lienWhatsApp()).toBe('https://wa.me/242064781414');
  });

  it('encode le message pré-rempli', () => {
    const lien = lienWhatsApp(MESSAGES_WHATSAPP.commande('ELB-20261111-1030-AB'));
    expect(lien.startsWith('https://wa.me/242064781414?text=')).toBe(true);
    const texte = decodeURIComponent(new URL(lien).searchParams.get('text') ?? '');
    expect(texte).toContain('ELB-20261111-1030-AB');
  });
});
