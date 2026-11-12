import { describe, it, expect } from 'vitest';
import profilsJson from '../production/profils.json';
import { DEFAULT_PRODUCT_ID, getPrintArea, getProductById, zoneArea } from '../src/lib/products/catalog';
import {
  LIBELLE_STATUT,
  PROFIL_PAR_DEFAUT,
  PROFILS,
  empechementsCommande,
  motifZone,
  profilParId,
  statutZone,
  validerProfils,
  zoneCommandable,
  zonesProposees,
} from '../src/lib/products/production';
import { productionTextureSize } from '../src/lib/canvas/design-canvas';
import { SIDES } from '../src/types/configurator';

const product = getProductById(DEFAULT_PRODUCT_ID)!;
const dtf = profilParId('dtf');
const flex = profilParId('flex');
const dtg = profilParId('dtg');
const sublimation = profilParId('sublimation');

describe('profils de production — source unique', () => {
  it('le fichier production/profils.json est valide', () => {
    expect(validerProfils()).toEqual([]);
    expect(profilsJson.parDefaut).toBe(PROFIL_PAR_DEFAUT.id);
    expect(PROFILS.map((p) => p.id)).toEqual(['dtf', 'flex', 'dtg', 'sublimation', 'sublimation-mug', 'sublimation-mug-tour']);
    // Les procédés réellement vendus restent distingués des procédés à valider.
    expect(dtf.statut).toBe('disponible');
    expect(flex.statut).toBe('a-valider');
    expect(dtg.statut).toBe('indisponible');
    expect(sublimation.statut).toBe('indisponible');
  });

  it('utilise les mêmes dimensions que le fichier JSON (aucune valeur codée en dur)', () => {
    for (const profil of PROFILS) {
      const source = profilsJson.profils.find((p) => p.id === profil.id)!;
      expect(profil.zones).toEqual(source.zones);
    }
  });

  it('un identifiant inconnu retombe sur le procédé par défaut, sans planter', () => {
    expect(profilParId('inconnu').id).toBe(PROFIL_PAR_DEFAUT.id);
    expect(profilParId(undefined).id).toBe(PROFIL_PAR_DEFAUT.id);
  });

  it('propose les cinq zones, même quand un procédé n’en autorise que deux', () => {
    // Les cinq zones du T-shirt (le pourtour `wrap` est celui du mug, hors procédés textiles).
    const zonesTshirt = SIDES.filter((side) => side !== 'wrap');
    expect(zonesProposees(dtf)).toEqual(zonesTshirt);
    expect(zonesProposees(dtg)).toEqual(zonesTshirt);
  });
});

describe('statut effectif d’une zone', () => {
  it('DTF : avant et dos imprimables, manches et col à valider', () => {
    expect(statutZone(dtf, 'front')).toBe('disponible');
    expect(statutZone(dtf, 'back')).toBe('disponible');
    expect(statutZone(dtf, 'left-sleeve')).toBe('a-valider');
    expect(statutZone(dtf, 'right-sleeve')).toBe('a-valider');
    expect(statutZone(dtf, 'collar')).toBe('a-valider');
    expect(zoneCommandable(dtf, 'front')).toBe(true);
    expect(zoneCommandable(dtf, 'left-sleeve')).toBe(false);
  });

  it('un procédé « à valider » rend toutes ses zones non commandables', () => {
    expect(statutZone(flex, 'front')).toBe('a-valider');
    expect(zoneCommandable(flex, 'front')).toBe(false);
  });

  it('un procédé indisponible rend toutes ses zones indisponibles', () => {
    expect(statutZone(dtg, 'front')).toBe('indisponible');
    expect(statutZone(dtg, 'left-sleeve')).toBe('indisponible');
  });

  it('explique chaque zone bloquée avec un motif lisible', () => {
    expect(motifZone(dtf, 'front')).toBeNull();
    expect(motifZone(dtf, 'left-sleeve')).toContain('Pressage sur manche');
    expect(motifZone(dtg, 'front')).toContain('Impression directe (DTG)');
    expect(LIBELLE_STATUT['a-valider']).toContain('valider');
  });
});

describe('commande : ne jamais promettre une capacité non vérifiée', () => {
  it('autorise une commande DTF sur les zones réellement disponibles', () => {
    expect(empechementsCommande(dtf, ['front', 'back'])).toEqual([]);
  });

  it('bloque une manche DTF non validée par l’atelier', () => {
    const motifs = empechementsCommande(dtf, ['front', 'left-sleeve']);
    expect(motifs).toHaveLength(1);
    expect(motifs[0]).toContain('Manche gauche');
    expect(motifs[0]).toContain('Pressage sur manche');
  });

  it('bloque tout un procédé non proposé', () => {
    const motifs = empechementsCommande(dtg, ['front']);
    expect(motifs).toHaveLength(1);
    expect(motifs[0]).toContain('Impression directe (DTG)');
  });

  it('ne bloque pas une zone vide (seules les zones personnalisées comptent)', () => {
    expect(empechementsCommande(dtf, [])).toEqual([]);
  });
});

describe('dimensions d’impression par procédé', () => {
  it('DTF : 21 × 30 cm devant, 25 × 32,4 cm dos, 9 cm sur les manches', () => {
    expect(getPrintArea(product, 'front', dtf.id)).toMatchObject({ cmWidth: 21, cmHeight: 30 });
    expect(getPrintArea(product, 'back', dtf.id)).toMatchObject({ cmWidth: 25, cmHeight: 32.4 });
    expect(getPrintArea(product, 'left-sleeve', dtf.id)).toMatchObject({ cmWidth: 9, cmHeight: 9 });
    expect(getPrintArea(product, 'collar', dtf.id)).toMatchObject({ cmWidth: 8, cmHeight: 4.5 });
  });

  it('flex : zones plus grandes, dans la texture de la pièce', () => {
    const front = getPrintArea(product, 'front', flex.id)!;
    expect(front).toMatchObject({ cmWidth: 28, cmHeight: 35 });
    expect(front.x + front.w).toBeLessThanOrEqual(1);
  });

  it('la zone imprimable reste DANS la texture, pour tous les procédés', () => {
    for (const profil of PROFILS) {
      for (const side of SIDES) {
        const area = zoneArea(product, side, profil);
        if (!area) continue;
        expect(area.x).toBeGreaterThanOrEqual(0);
        expect(area.y).toBeGreaterThanOrEqual(0);
        expect(area.x + area.w).toBeLessThanOrEqual(1);
        expect(area.y + area.h).toBeLessThanOrEqual(1);
      }
    }
  });

  it('la résolution de production suit la densité du procédé', () => {
    const front = getPrintArea(product, 'front', dtf.id)!;
    expect(productionTextureSize(front, dtf.dpi)).toEqual({ w: 2480, h: 3543 });
    expect(productionTextureSize(front, sublimation.dpi)).toEqual({ w: 1240, h: 1772 });
  });
});
