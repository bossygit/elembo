// Parcours complet du Banner Studio, en local : modèle → texte → photo → zones → devis → PDF →
// modification depuis le suivi → profil d'imprimeur → régénération → commande → archivage.
// Enchaîne l'essai du client (banner-commande.mjs) et celui du back-office (banner-admin.mjs) sur la
// MÊME demande. Mêmes variables que ces deux essais.

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ici = dirname(fileURLToPath(import.meta.url));
const client = spawnSync(process.execPath, [join(ici, 'banner-commande.mjs')], { encoding: 'utf8', env: process.env });
process.stdout.write(client.stdout);
const reference = client.stdout.match(/^REFERENCE=(DEV-[A-Z0-9-]+)$/m)?.[1];
if (client.status !== 0 || !reference) {
  console.log('\nParcours arrêté : l’essai du client a échoué.');
  process.exit(1);
}
console.log(`\n— Back-office, demande ${reference}`);
const admin = spawnSync(process.execPath, [join(ici, 'banner-admin.mjs')], { encoding: 'utf8', env: { ...process.env, STUDIO_REFERENCE: reference } });
process.stdout.write(admin.stdout);
process.exit(admin.status ?? 1);
