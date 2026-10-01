import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { prepareGarmentMaterial } from '../src/lib/three/materials';
import { CATALOG, getProductById } from '../src/lib/products/catalog';

/** Matériau de vêtement avec toutes les textures PBR qu'un fournisseur peut livrer. */
function materiauFournisseur() {
  const texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({
    color: '#0b7f8f',
    map: texture,
    normalMap: texture,
    roughnessMap: texture,
    metalnessMap: texture,
    aoMap: texture,
    roughness: 0.44,
    metalness: 0.3,
  });
  material.name = 'Default_material';
  return material;
}

describe('surface du vêtement fournisseur', () => {
  it('« blank » : ne garde AUCUNE texture du fournisseur (imprimé gravé comprises)', () => {
    const source = materiauFournisseur();
    const material = prepareGarmentMaterial(source, '#FFFFFF', null, false);

    expect(material.map).toBeNull();
    expect(material.normalMap).toBeNull();
    expect(material.roughnessMap).toBeNull();
    expect(material.metalnessMap).toBeNull();
    expect(material.aoMap).toBeNull();
    expect(material.roughness).toBeCloseTo(0.72, 5);
    expect(material.metalness).toBe(0);
    // La couleur du vêtement est portée par le matériau, plus par une texture.
    expect(material.color.getHexString()).toBe('ffffff');
  });

  it('ne modifie jamais le matériau d’origine (cache du GLTFLoader partagé)', () => {
    const source = materiauFournisseur();
    prepareGarmentMaterial(source, '#000000', null, false);

    expect(source.color.getHexString()).toBe('0b7f8f');
    expect(source.map).not.toBeNull();
    expect(source.normalMap).not.toBeNull();
    expect(source.roughness).toBeCloseTo(0.44, 5);
  });

  it('« vendor » : conserve les textures de relief et ne remplace que l’albédo', () => {
    const source = materiauFournisseur();
    const neutre = new THREE.Texture();
    const material = prepareGarmentMaterial(source, '#FFFFFF', neutre, true);

    expect(material.map).toBe(neutre);
    expect(material.normalMap).toBe(source.normalMap);
    expect(material.roughnessMap).toBe(source.roughnessMap);
    expect(material.aoMap).toBe(source.aoMap);
    expect(material.roughness).toBeCloseTo(0.44, 5);
  });

  it('« vendor » sans texture fournie : garde l’albédo d’origine', () => {
    const source = materiauFournisseur();
    const material = prepareGarmentMaterial(source, '#FFFFFF', undefined, true);
    expect(material.map).toBe(source.map);
  });
});

describe('catalogue : modèles à imprimé intégré', () => {
  it('le T-shirt raglan est en surface vierge (imprimé « RUN » de l’auteur)', () => {
    // Le motif est gravé dans l'albédo ET dans la texture de normales : neutraliser
    // l'albédo seul ne le fait pas disparaître (vérifié au rendu).
    expect(getProductById('tshirt-basic')?.surface).toBe('blank');
  });

  it('les autres produits gardent les textures du fournisseur par défaut', () => {
    const autres = CATALOG.filter((p) => p.id !== 'tshirt-basic');
    expect(autres.length).toBeGreaterThan(0);
    for (const product of autres) expect(product.surface ?? 'vendor').toBe('vendor');
  });
});
