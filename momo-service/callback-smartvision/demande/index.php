<?php
/**
 * Enregistrement d'une commande avant paiement —
 * POST https://smartvision.cg/wp-json/momo/v1/demande
 *
 * La boutique annonce la référence de transaction MTN qu'elle va créer, la commande associée et le
 * montant attendu. Le callback pourra alors **comparer le montant encaissé** au montant attendu
 * (toute divergence donne ANOMALIE, jamais PAYE) et une référence inconnue n'entraîne aucun appel
 * à MTN — un endpoint public ne doit pas servir d'amplificateur.
 *
 * Protégé par un secret partagé, à définir dans /home/smarwvew/momo/config.php (clé « secret »).
 *
 * Corps attendu :
 *   { "referenceId": "<UUID v4>", "commande": "ELB-…", "montantFcfa": 6000,
 *     "montantEnvoye": "6000", "devise": "XAF" }
 */

declare(strict_types=1);

$racine = '/home/smarwvew/momo';
require $racine . '/momo-lib.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo json_encode(['erreur' => 'Méthode non autorisée (POST attendu).']);
    exit;
}

$config = momo_config();
$secret_attendu = $config['secret'] ?? '';
if (!is_string($secret_attendu) || $secret_attendu === '') {
    http_response_code(503);
    echo json_encode(['erreur' => 'Endpoint non configuré : renseignez « secret » dans la configuration.']);
    exit;
}

$secret_recu = $_SERVER['HTTP_X_SECRET'] ?? '';
if (!is_string($secret_recu) || $secret_recu === '' || !hash_equals($secret_attendu, $secret_recu)) {
    http_response_code(401);
    echo json_encode(['erreur' => 'Secret invalide.']);
    exit;
}

$corps = file_get_contents('php://input');
$donnees = json_decode($corps !== false && $corps !== '' ? $corps : '[]', true);
$donnees = is_array($donnees) ? $donnees : [];

$reference = trim((string) ($donnees['referenceId'] ?? ''));
$commande = trim((string) ($donnees['commande'] ?? ''));
$montant_fcfa = $donnees['montantFcfa'] ?? null;

if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $reference)) {
    http_response_code(422);
    echo json_encode(['erreur' => 'referenceId manquant ou non conforme (UUID v4 attendu).']);
    exit;
}
if ($commande === '') {
    http_response_code(422);
    echo json_encode(['erreur' => 'commande manquante.']);
    exit;
}
if (!is_numeric($montant_fcfa) || (int) $montant_fcfa <= 0) {
    http_response_code(422);
    echo json_encode(['erreur' => 'montantFcfa manquant ou invalide.']);
    exit;
}

$devise = isset($donnees['devise']) && is_string($donnees['devise']) ? $donnees['devise'] : 'XAF';
$montant_envoye = isset($donnees['montantEnvoye'])
    ? (string) $donnees['montantEnvoye']
    : (string) (int) $montant_fcfa;

momo_enregistrer($reference, [
    'commande'        => $commande,
    'montant_fcfa'    => (int) $montant_fcfa,
    'montant_envoye'  => $montant_envoye,
    'devise'          => $devise,
    'statut'          => 'PENDING',
    'source'          => 'boutique',
]);

momo_journal('commande enregistree : ' . $commande . ' / ' . $reference . ' / ' . $montant_fcfa . ' FCFA');

http_response_code(201);
echo json_encode([
    'referenceId' => $reference,
    'commande'    => $commande,
    'statut'      => 'PENDING',
    'montantFcfa' => (int) $montant_fcfa,
    'devise'      => $devise,
], JSON_UNESCAPED_UNICODE);
