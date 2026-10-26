// Nettoyage des fichiers d'essai laissés dans l'archive (préfixe ELB-E2E-).
import { del, list } from '@vercel/blob';

let supprimes = 0;
let curseur;
do {
  const page = await list({ prefix: 'dossiers/ELB-E2E-', cursor: curseur });
  const chemins = page.blobs.map((b) => b.pathname);
  if (chemins.length) {
    await del(chemins);
    supprimes += chemins.length;
    console.log('supprimés:', chemins.join(', '));
  }
  curseur = page.hasMore ? page.cursor : undefined;
} while (curseur);
console.log('total supprimé:', supprimes);
