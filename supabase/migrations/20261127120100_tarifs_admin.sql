-- Elembo — les prix et les frais de livraison sont pilotés depuis le tableau de bord.
--
-- Jusqu'ici, le site et le paiement lisaient `tarifs/grille.json` (figé au déploiement) et les
-- prix saisis dans l'admin n'avaient aucun effet. Désormais la table `produits` et le paramètre
-- `livraison` font foi : le paiement les relit à chaque commande.
--
-- Cette migration :
--   1. crée les fiches des produits du configurateur qui manquaient (casquette, mug) ;
--   2. aligne les T-shirts et la livraison sur les valeurs EN VIGUEUR aujourd'hui (grille :
--      100 FCFA validés, paiement MoMo ouvert), pour que la bascule ne change aucun prix.
--      Seules les lignes restées dans leur état de départ (seed 0006) sont touchées : une
--      valeur déjà modifiée dans l'admin n'est jamais écrasée.

-- 1. Casquette : 2 000 FCFA, prix validé par l'exploitant le 27/11/2026.
insert into public.produits
  (id, famille, nom, description, technique, disponible, actif, statut_prix,
   prix_fcfa, cout_fcfa, delai_jours, quantite_min, metadata,
   prix_valide_par_email, prix_valide_le)
values (
  'casquette-personnalisee',
  'TEXTILE',
  'Casquette Elembo',
  'Casquette 6 panneaux à visière courbe, taille unique réglable, personnalisée en 3D.',
  'Broderie ou transfert DTF',
  true,
  true,
  'VALIDE',
  2000,
  null,
  null,
  1,
  '{"source":"configurateur 3D","note":"prix validé par l’exploitant le 27/11/2026"}'::jsonb,
  'exploitant (migration 20261127)',
  '2026-11-27T12:00:00+01:00'
)
on conflict (id) do nothing;

-- Mug : composable dans l'atelier, prix non arbitré → « Prix sur demande », devis.
insert into public.produits
  (id, famille, nom, description, technique, disponible, actif, statut_prix,
   prix_fcfa, cout_fcfa, delai_jours, quantite_min, metadata)
values (
  'mug-personnalise',
  'OBJETS',
  'Mug Elembo 330 ml',
  'Mug céramique personnalisé en 3D : photo, prénom ou message.',
  'Sublimation',
  true,
  true,
  'PROVISOIRE',
  null,
  null,
  null,
  1,
  '{"source":"configurateur 3D","note":"prix à arbitrer"}'::jsonb
)
on conflict (id) do nothing;

-- 2. T-shirts : la grille les vend à 100 FCFA, prix validé par l'exploitant le 10/11/2026.
update public.produits
set statut_prix = 'VALIDE',
    prix_valide_par_email = 'exploitant (grille du 10/11/2026)',
    prix_valide_le = '2026-11-10T12:00:00+01:00',
    maj_le = now()
where id in ('tshirt-basic', 'tshirt-alt')
  and statut_prix = 'TEST'
  and prix_fcfa = 100
  and prix_valide_le is null;

-- Livraison : la grille applique 100 FCFA validés (Brazzaville, Pointe-Noire), délai 3 jours.
update public.parametres
set valeur = jsonb_set(valeur, '{statut_prix}', '"VALIDE"'),
    maj_le = now()
where cle = 'livraison'
  and valeur ->> 'statut_prix' = 'TEST'
  and valeur = '{"villes":[{"id":"brazzaville","nom":"Brazzaville","frais_fcfa":100},{"id":"pointe-noire","nom":"Pointe-Noire","frais_fcfa":100}],"statut_prix":"TEST","delai_max_jours":3}'::jsonb;
