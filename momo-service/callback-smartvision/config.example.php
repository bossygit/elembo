<?php
/**
 * Configuration du callback MTN MoMo — Smart Vision.
 *
 * À REMPLIR sur le serveur, puis vérifier les permissions : 0600, propriétaire smarwvew.
 * Ce fichier vit HORS de la racine web (/home/smarwvew/momo/config.php) : il n'est jamais servi.
 *
 * Les valeurs viennent des mails MTN (« SMART VISION-MTN-DEMANDE DES API ») ou du portail :
 *   • environnement : 'mtncongo' en production, 'sandbox' pour les essais ;
 *   • cle_abonnement : Primary Key de la souscription « Collection » ;
 *   • api_user / api_key : API User et API Key du produit Collections ;
 *   • secret : chaîne aléatoire que la boutique doit fournir pour enregistrer une commande
 *     (en-tête X-Secret) — évite qu'un tiers fasse interroger MTN à travers ce endpoint.
 */

declare(strict_types=1);

return [
    'environnement'  => 'mtncongo',            // 'mtncongo' ou 'sandbox'
    'cle_abonnement'       => '',                    // Ocp-Apim-Subscription-Key (produit Collections)
    'api_user'       => '',                    // API User (UUID)
    'api_key'       => '',                    // API Key
    'secret'       => '',                    // secret partagé avec la boutique
];
