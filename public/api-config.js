// Adresse du service de paiement Elembo, lue à l'exécution par l'application.
//
// Depuis la migration Vercel, le site ET les routes /api/momo/* vivent sur le même domaine :
// la valeur vide signifie « même origine ». Il n'y a donc plus d'adresse à republier, plus de
// tunnel, plus de Mac à garder allumé pour encaisser.
//
// Ce fichier reste le point de bascule d'urgence : pour envoyer les paiements vers un autre
// service sans reconstruire le site, il suffit de renseigner son URL ici puis de redéployer.
window.__ELEMBO_MOMO_API_URL__ = "";
