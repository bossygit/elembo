// Essai de bout en bout du dépôt de dossier, hors navigateur : paie (MTN simulé), envoie les
// fichiers vers l'archive privée, enregistre, relit par la route atelier, puis nettoie.
// À lancer contre un serveur local : node scripts/e2e-dossier.mjs http://localhost:3114
import { del } from '@vercel/blob';
import { uploadPresigned as upload } from '@vercel/blob/client';

const base = process.argv[2] ?? 'http://localhost:3114';
const commande = `ELB-E2E-${Date.now()}`;
const pngBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/gEB6w7pAAAAAElFTkSuQmCC',
  'base64',
);

const appeler = async (chemin, init) => {
  const r = await fetch(`${base}${chemin}`, init);
  const texte = await r.text();
  let corps = {};
  try {
    corps = JSON.parse(texte);
  } catch {
    corps = { brut: texte.slice(0, 200) };
  }
  return { statut: r.status, corps, entetes: r.headers };
};

// 1) Payer (MTN simulé)
const paiement = await appeler('/api/momo/payer', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    commande,
    produitId: 'tshirt-basic',
    lignes: [{ taille: 'M', quantite: 2 }],
    villeId: 'brazzaville',
    telephone: '06 123 45 67',
  }),
});
if (paiement.statut !== 201) throw new Error(`payer: ${paiement.statut} ${JSON.stringify(paiement.corps)}`);
const referenceId = paiement.corps.referenceId;
console.log('1) paiement demandé:', referenceId, paiement.corps.montantFcfa, 'FCFA');

// 2) Attendre PAYE
let statut = 'PENDING';
for (let i = 0; i < 40 && statut === 'PENDING'; i++) {
  await new Promise((r) => setTimeout(r, 150));
  statut = (await appeler(`/api/momo/statut?referenceId=${referenceId}`)).corps.statut;
}
if (statut !== 'PAYE') throw new Error(`statut inattendu: ${statut}`);
console.log('2) statut:', statut);

// 3) Envoi direct du navigateur vers l'archive (ce que fait le client)
const nom = `${commande}-avant.png`;
const depotPng = await upload(`dossiers/${commande}/${nom}`, new Blob([pngBytes], { type: 'image/png' }), {
  access: 'private',
  handleUploadUrl: `${base}/api/commandes/${commande}/upload`,
  clientPayload: JSON.stringify({ referenceId }),
  contentType: 'image/png',
});
console.log('3) fichier déposé:', depotPng.pathname);

// Un second fichier pour vérifier que le dossier accepte la fiche
const nomFiche = `${commande}-fiche.json`;
const fiche = new Blob([JSON.stringify({ commande, exemple: true })], { type: 'application/json' });
const depotFiche = await upload(`dossiers/${commande}/${nomFiche}`, fiche, {
  access: 'private',
  handleUploadUrl: `${base}/api/commandes/${commande}/upload`,
  clientPayload: JSON.stringify({ referenceId }),
  contentType: 'application/json',
});

// 4) Enregistrer les métadonnées
const enregistrement = await appeler(`/api/commandes/${commande}/fichiers`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    referenceId,
    fichiers: [
      { nom, chemin: depotPng.pathname, taille: pngBytes.length, type: 'image/png' },
      { nom: nomFiche, chemin: depotFiche.pathname, taille: fiche.size, type: 'application/json' },
    ],
  }),
});
console.log('4) enregistrement:', enregistrement.statut, JSON.stringify(enregistrement.corps).slice(0, 220));
if (enregistrement.statut !== 201) throw new Error('enregistrement refusé');

// 5) Rejouer : doit être idempotent
const rejoue = await appeler(`/api/commandes/${commande}/fichiers`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    referenceId,
    fichiers: [{ nom, chemin: depotPng.pathname, taille: pngBytes.length, type: 'image/png' }],
  }),
});
console.log('5) rejeu:', rejoue.statut, 'dejaRecu =', rejoue.corps.dejaRecu);

// 6) Route atelier : refus sans jeton, liste et téléchargement avec jeton
const jeton = process.env.ATELIER_TOKEN ?? 'jeton-atelier-essai';
const sansJeton = await appeler(`/api/commandes/${commande}/fichiers`);
const liste = await appeler(`/api/commandes/${commande}/fichiers?token=${encodeURIComponent(jeton)}`);
console.log('6) sans jeton:', sansJeton.statut, '| avec jeton:', liste.statut, JSON.stringify(liste.corps).slice(0, 200));

const telechargement = await fetch(`${base}/api/commandes/${commande}/fichiers/${encodeURIComponent(nom)}`, {
  headers: { 'x-atelier-token': jeton },
});
const octets = Buffer.from(await telechargement.arrayBuffer());
console.log(
  '7) téléchargement atelier:',
  telechargement.status,
  octets.length,
  'octets | identique:',
  octets.equals(pngBytes),
);

// 8) Un dossier non payé est refusé
const refus = await appeler(`/api/commandes/${commande}/fichiers`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    referenceId: '00000000-0000-4000-8000-000000000000',
    fichiers: [{ nom, chemin: depotPng.pathname, taille: pngBytes.length, type: 'image/png' }],
  }),
});
console.log('8) référence inconnue:', refus.statut, JSON.stringify(refus.corps));

// 9) Nettoyage de l'archive d'essai
await del([depotPng.pathname, depotFiche.pathname]);
console.log('9) fichiers d’essai supprimés de l’archive');
