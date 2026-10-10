// Adresse du service de paiement Elembo, lue à l'exécution par l'application.
//
// Pourquoi ce fichier existe : l'adresse compilée dans le bundle
// (NEXT_PUBLIC_MOMO_API_URL) ne peut pas changer sans reconstruire et redéployer le
// site. Or le service tourne derrière un tunnel dont l'adresse change à chaque
// redémarrage. Modifier la ligne ci-dessous dans la branche gh-pages suffit donc à
// rebrancher la boutique sur le bon service — sans build.
//
// Valeur vide ou fichier absent : l'application retombe sur l'adresse compilée.
window.__ELEMBO_MOMO_API_URL__ = "https://drill-subsection-adam-amount.trycloudflare.com";
