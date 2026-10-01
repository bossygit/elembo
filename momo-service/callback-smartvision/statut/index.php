<?php
/**
 * Statut d'une transaction MoMo — GET https://smartvision.cg/wp-json/momo/v1/statut/?referenceId=…
 *
 * C'est le mécanisme fiable : MTN envoie son callback une seule fois, sans réessai, et la
 * documentation recommande explicitement d'interroger le statut. Ce endpoint renvoie l'état
 * enregistré et, si la transaction n'est pas encore tranchée, revérifie d'abord auprès de MTN.
 *
 * Réponse : { reference, commande, statut, montantFcfa, montantEnvoye, montantRecu, devise,
 *             financialTransactionId, raison, majLe }
 *   statut ∈ PENDING | PAYE | ECHEC | ANOMALIE | recu | inconnue
 *
 * Aucune clé n'est renvoyée, aucun montant n'est inventé.
 */

declare(strict_types=1);

$racine = '/home/smarwvew/momo';
require $racine . '/momo-lib.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$reference = isset($_GET['referenceId']) ? trim((string) $_GET['referenceId']) : '';
if ($reference === '') {
    http_response_code(422);
    echo json_encode(['erreur' => 'Paramètre referenceId manquant.']);
    exit;
}

$etat = momo_lire_etat();
$enregistre = $etat[$reference] ?? null;
if ($enregistre === null) {
    http_response_code(404);
    echo json_encode(['erreur' => 'Référence inconnue.']);
    exit;
}

// Tant que le sort n'est pas fixé, on redemande le statut à MTN (sondage recommandé par MTN).
if (!in_array($enregistre['statut'] ?? '', ['PAYE', 'ECHEC', 'ANOMALIE'], true)) {
    $mtn = momo_statut_mtn($reference);
    if (is_array($mtn)) {
        $statut_mtn = strtoupper((string) ($mtn['status'] ?? ''));
        $statut = $statut_mtn === 'SUCCESSFUL' ? 'PAYE' : ($statut_mtn === 'FAILED' ? 'ECHEC' : 'PENDING');
        $montant_recu = isset($mtn['amount']) ? (string) $mtn['amount'] : null;
        $attendu = isset($enregistre['montant_envoye']) ? (string) $enregistre['montant_envoye'] : null;

        if ($statut === 'PAYE' && $attendu !== null && $montant_recu !== null && $montant_recu !== $attendu) {
            momo_enregistrer($reference, ['statut' => 'ANOMALIE', 'montant_recu' => $montant_recu, 'raison' => 'montant incoherent', 'source' => 'sondage']);
        } else {
            momo_enregistrer($reference, [
                'statut'                 => $statut,
                'montant_recu'           => $montant_recu,
                'devise'                 => isset($mtn['currency']) ? (string) $mtn['currency'] : null,
                'raison'                 => isset($mtn['reason']) ? (string) $mtn['reason'] : null,
                'financialTransactionId' => isset($mtn['financialTransactionId']) ? (string) $mtn['financialTransactionId'] : null,
                'source'                 => 'sondage',
            ]);
        }
        $enregistre = momo_lire_etat()[$reference] ?? $enregistre;
    }
}

echo json_encode([
    'reference'              => $reference,
    'commande'               => $enregistre['commande'] ?? null,
    'statut'                 => $enregistre['statut'] ?? 'recu',
    'montantFcfa'            => $enregistre['montant_fcfa'] ?? null,
    'montantEnvoye'          => $enregistre['montant_envoye'] ?? null,
    'montantRecu'            => $enregistre['montant_recu'] ?? null,
    'devise'                 => $enregistre['devise'] ?? null,
    'financialTransactionId' => $enregistre['financialTransactionId'] ?? null,
    'raison'                 => $enregistre['raison'] ?? null,
    'majLe'                  => $enregistre['maj_le'] ?? null,
], JSON_UNESCAPED_UNICODE);
