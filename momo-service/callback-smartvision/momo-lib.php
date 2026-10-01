<?php
/**
 * Bibliothèque du callback MTN MoMo — Smart Vision.
 *
 * Vit HORS de la racine web (/home/smarwvew/momo), avec la configuration et les données : aucun
 * de ces fichiers n'est servable par HTTP, même si PHP tombait en panne de configuration.
 *
 * Discipline reprise du service de paiement (momo-service) :
 *   • la notification de MTN n'est jamais crue sur parole : on revérifie le statut auprès de MTN ;
 *   • on compare le montant encaissé au montant attendu ;
 *   • on répond 200 vite, et on écrit l'état sur disque (idempotent) ;
 *   • aucune clé, aucun numéro de téléphone complet au journal.
 */

declare(strict_types=1);

/** Adresse de base MTN : production Congo, ou sandbox. */
const MOMO_BASES = [
    'mtncongo' => 'https://proxy.momoapi.mtn.com',
    'sandbox'  => 'https://sandbox.momodeveloper.mtn.com',
];

/** Charge la configuration (hors racine web). Retourne null si absente. */
function momo_config(): ?array
{
    static $config = null;
    static $charge = false;
    if ($charge) {
        return $config;
    }
    $charge = true;

    $chemin = __DIR__ . '/config.php';
    if (!is_file($chemin)) {
        return null;
    }
    $valeurs = require $chemin;
    if (!is_array($valeurs)) {
        return null;
    }
    $config = $valeurs;

    return $config;
}

function momo_dossier_donnees(): string
{
    $dossier = __DIR__ . '/data';
    if (!is_dir($dossier)) {
        @mkdir($dossier, 0700, true);
    }

    return $dossier;
}

/** Journal d'exploitation : qui, quand, quel état — jamais de secret ni de numéro complet. */
function momo_journal(string $ligne): void
{
    $fichier = momo_dossier_donnees() . '/journal.log';
    @file_put_contents($fichier, sprintf("[%s] %s\n", gmdate('c'), $ligne), FILE_APPEND | LOCK_EX);
}

function momo_masquer(?string $msisdn): string
{
    $msisdn = (string) $msisdn;
    if (strlen($msisdn) < 6) {
        return '••••';
    }

    return substr($msisdn, 0, 5) . '••••' . substr($msisdn, -2);
}

/** État des transactions : fichier JSON verrouillé, écrit de façon atomique. */
function momo_lire_etat(): array
{
    $fichier = momo_dossier_donnees() . '/transactions.json';
    if (!is_file($fichier)) {
        return [];
    }
    $contenu = @file_get_contents($fichier);
    $etat = $contenu ? json_decode($contenu, true) : null;

    return is_array($etat) ? $etat : [];
}

function momo_ecrire_etat(array $etat): void
{
    $fichier = momo_dossier_donnees() . '/transactions.json';
    $temporaire = $fichier . '.tmp';
    @file_put_contents($temporaire, json_encode($etat, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE), LOCK_EX);
    @rename($temporaire, $fichier);
}

function momo_enregistrer(string $reference, array $donnees): void
{
    $etat = momo_lire_etat();
    $existant = $etat[$reference] ?? ['reference' => $reference, 'historique' => []];
    $existant = array_merge($existant, $donnees);
    $existant['maj_le'] = gmdate('c');
    $existant['historique'][] = ['le' => gmdate('c'), 'quoi' => $donnees['statut'] ?? 'mise a jour'];
    $etat[$reference] = $existant;
    momo_ecrire_etat($etat);
}

/** Appel HTTP (jamais de secret au journal). */
function momo_http(string $methode, string $url, array $entetes, ?string $corps = null): array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_CUSTOMREQUEST  => $methode,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => $entetes,
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_CONNECTTIMEOUT => 10,
    ]);
    // Un POST sans corps doit tout de même annoncer Content-Length: 0 — sans quoi la passerelle
    // MTN répond « 411 Length Required ». Passer une chaîne vide à POSTFIELDS le garantit.
    curl_setopt($ch, CURLOPT_POSTFIELDS, $corps ?? ($methode === 'POST' ? '' : null));
    $reponse = curl_exec($ch);
    $statut = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $erreur = curl_error($ch);
    curl_close($ch);

    return ['statut' => $statut, 'corps' => $reponse === false ? null : (string) $reponse, 'erreur' => $erreur];
}

function momo_base(): ?string
{
    $config = momo_config();
    if ($config === null) {
        return null;
    }

    return MOMO_BASES[$config['environnement'] ?? ''] ?? null;
}

/** Jeton OAuth 2.0, mis en cache jusqu'à son expiration (marge de 60 s). */
function momo_jeton(): ?string
{
    $config = momo_config();
    $base = momo_base();
    if ($config === null || $base === null) {
        return null;
    }

    $cache = momo_dossier_donnees() . '/jeton.json';
    if (is_file($cache)) {
        $contenu = json_decode((string) @file_get_contents($cache), true);
        if (is_array($contenu) && ($contenu['expire_le'] ?? 0) > time() + 5) {
            return (string) $contenu['jeton'];
        }
    }

    $identifiants = base64_encode(($config['api_user'] ?? '') . ':' . ($config['api_key'] ?? ''));
    $reponse = momo_http('POST', $base . '/collection/token/', [
        'Authorization: Basic ' . $identifiants,
        'Ocp-Apim-Subscription-Key: ' . ($config['cle_abonnement'] ?? ''),
    ]);

    if ($reponse['statut'] !== 200 || $reponse['corps'] === null) {
        momo_journal('jeton refuse (HTTP ' . $reponse['statut'] . ')');

        return null;
    }
    $donnees = json_decode($reponse['corps'], true);
    $jeton = is_array($donnees) ? ($donnees['access_token'] ?? null) : null;
    if (!is_string($jeton) || $jeton === '') {
        momo_journal('reponse de jeton illisible');

        return null;
    }
    $duree = (int) ($donnees['expires_in'] ?? 3600);
    @file_put_contents($cache, json_encode(['jeton' => $jeton, 'expire_le' => time() + max(30, $duree - 60)]), 0600);

    return $jeton;
}

/** Statut réel d'une demande de paiement, interrogé auprès de MTN. */
function momo_statut_mtn(string $reference): ?array
{
    $config = momo_config();
    $base = momo_base();
    $jeton = momo_jeton();
    if ($config === null || $base === null || $jeton === null) {
        return null;
    }

    $reponse = momo_http('GET', $base . '/collection/v1_0/requesttopay/' . rawurlencode($reference), [
        'Authorization: Bearer ' . $jeton,
        'Ocp-Apim-Subscription-Key: ' . ($config['cle_abonnement'] ?? ''),
        'X-Target-Environment: ' . $config['environnement'],
    ]);
    if ($reponse['statut'] !== 200 || $reponse['corps'] === null) {
        momo_journal('statut indisponible pour ' . $reference . ' (HTTP ' . $reponse['statut'] . ')');

        return null;
    }
    $donnees = json_decode($reponse['corps'], true);

    return is_array($donnees) ? $donnees : null;
}

/** Extrait la référence de transaction d'une notification MTN (corps JSON ou chemin). */
function momo_reference_notification(array $donnees, string $uri): ?string
{
    foreach (['referenceId', 'reference_id', 'externalId', 'financialTransactionId'] as $cle) {
        if (!empty($donnees[$cle]) && is_string($donnees[$cle])) {
            return $donnees[$cle];
        }
    }
    if (isset($donnees['resource']) && is_array($donnees['resource']) && !empty($donnees['resource']['referenceId'])) {
        return (string) $donnees['resource']['referenceId'];
    }
    if (preg_match('~/callback/([A-Za-z0-9._-]+)~', $uri, $m)) {
        return urldecode($m[1]);
    }

    return null;
}

/**
 * Retrouve la transaction visée par une notification.
 *
 * Constat du sandbox MTN : la notification porte notre `externalId` (référence de commande) et pas
 * toujours la référence de transaction créée côté MTN. On accepte donc les deux : correspondance
 * directe sur la clé, sinon recherche par référence de commande.
 */
function momo_resoudre_reference(?string $valeur): ?string
{
    if ($valeur === null || $valeur === '') {
        return null;
    }

    $etat = momo_lire_etat();
    if (isset($etat[$valeur])) {
        return $valeur;
    }

    foreach ($etat as $cle => $enregistre) {
        if (($enregistre['commande'] ?? null) === $valeur) {
            return (string) $cle;
        }
    }

    return $valeur; // inconnue : traitée comme telle par l'appelant
}

/** Charge utile d'une notification, numéros masqués, pour le diagnostic. */
function momo_masquer_charge(array $donnees): string
{
    $json = json_encode($donnees, JSON_UNESCAPED_UNICODE) ?: '{}';

    return (string) preg_replace('/(\d{6})\d{3,}(\d{2})/', '$1••••$2', substr($json, 0, 600));
}

/**
 * Traite une notification : revérifie auprès de MTN, compare le montant, enregistre.
 * N'invente jamais un paiement : sans vérification possible, l'état reste « recu ».
 */
function momo_traiter_notification(?string $reference, array $donnees_brutes): void
{
    if ($reference === null) {
        momo_journal('notification sans reference exploitable');
        return;
    }

    $etat = momo_lire_etat();
    $cle = momo_resoudre_reference($reference);
    if ($cle === null || !isset($etat[$cle])) {
        // Référence inconnue : on n'appelle pas MTN (pas d'amplification) et on note l'incident.
        momo_enregistrer($reference, ['statut' => 'inconnue', 'source' => 'callback']);
        momo_journal('notification pour une reference inconnue : ' . $reference);
        return;
    }
    $reference = $cle;
    $enregistre = $etat[$reference];
    if (in_array($enregistre['statut'] ?? '', ['PAYE', 'ECHEC'], true)) {
        momo_journal('notification ignoree (deja tranchee) : ' . $reference);
        return;
    }

    $mtn = momo_statut_mtn($reference);
    if ($mtn === null) {
        momo_enregistrer($reference, ['statut' => 'recu', 'source' => 'callback', 'note' => 'verification MTN impossible']);
        return;
    }

    $statut_mtn = strtoupper((string) ($mtn['status'] ?? ''));
    $statut = $statut_mtn === 'SUCCESSFUL' ? 'PAYE' : ($statut_mtn === 'FAILED' ? 'ECHEC' : 'PENDING');
    $montant_recu = isset($mtn['amount']) ? (string) $mtn['amount'] : null;
    $attendu = isset($enregistre['montant_envoye']) ? (string) $enregistre['montant_envoye'] : null;

    if ($statut === 'PAYE' && $attendu !== null && $montant_recu !== null && $montant_recu !== $attendu) {
        momo_enregistrer($reference, [
            'statut'      => 'ANOMALIE',
            'montant_recu' => $montant_recu,
            'raison'      => 'montant recu ' . $montant_recu . ' != attendu ' . $attendu,
            'source'      => 'callback',
        ]);
        momo_journal('ANOMALIE de montant sur ' . $reference . ' — a verifier avant production');
        return;
    }

    momo_enregistrer($reference, [
        'statut'                   => $statut,
        'montant_recu'             => $montant_recu,
        'devise'                   => isset($mtn['currency']) ? (string) $mtn['currency'] : null,
        'raison'                   => isset($mtn['reason']) ? (string) $mtn['reason'] : null,
        'financialTransactionId'   => isset($mtn['financialTransactionId']) ? (string) $mtn['financialTransactionId'] : null,
        'source'                   => 'callback',
    ]);
    momo_journal('notification traitee : ' . $reference . ' → ' . $statut);
}
