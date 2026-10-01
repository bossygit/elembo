<?php
/**
 * Callback MTN MoMo — https://smartvision.cg/wp-json/momo/v1/callback
 *
 * C'est l'URL déclarée à MTN Congo dans la demande d'API. MTN y envoie **une seule fois** le
 * résultat d'une transaction (en PUT ou en POST selon la configuration), sans réessai : ce script
 * accuse donc réception immédiatement (HTTP 200), puis revérifie le statut auprès de MTN.
 *
 * La réponse ne vaut pas validation : le statut réel est enregistré dans
 * /home/smarwvew/momo/data/transactions.json et lisible par
 *   GET https://smartvision.cg/wp-json/momo/v1/statut/?referenceId=…
 */

declare(strict_types=1);

$racine = '/home/smarwvew/momo';
require $racine . '/momo-lib.php';

$methode = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// MTN utilise PUT et POST : les deux doivent être acceptés. Un GET n'a rien à faire ici.
if (!in_array($methode, ['PUT', 'POST'], true)) {
    http_response_code(405);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['erreur' => 'Méthode non autorisée (PUT ou POST attendu).']);
    exit;
}

$corps = file_get_contents('php://input');
$donnees = json_decode($corps !== false && $corps !== '' ? $corps : '[]', true);
$donnees = is_array($donnees) ? $donnees : [];
$reference = momo_reference_notification($donnees, $_SERVER['REQUEST_URI'] ?? '');

// 1) Accuser réception tout de suite : la plateforme MTN n'attend que quelques secondes.
http_response_code(200);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
echo json_encode(['recu' => true, 'reference' => $reference]);

// 2) Traiter ensuite, sans faire attendre MTN (PHP-FPM : la réponse est déjà envoyée).
if (function_exists('fastcgi_finish_request')) {
    fastcgi_finish_request();
}

momo_journal('notification recue (' . $methode . ') reference=' . ($reference ?? 'aucune'));
momo_journal('charge utile : ' . momo_masquer_charge($donnees));
momo_traiter_notification($reference, $donnees);
