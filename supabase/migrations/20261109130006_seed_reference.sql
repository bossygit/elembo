-- Elembo — socle Supabase, migration 0006 : données de référence.
--
-- Aucune donnée commerciale inventée : les prix proviennent de `tarifs/grille.json` et gardent
-- leur statut (TEST / PROVISOIRE). Le stock est à 0 et explicitement « à confirmer ».
-- Les lignes de budget reprennent le budget de lancement validé : 500 000 FCFA,
-- dont 415 000 opérationnels et 85 000 de réserve protégée.

insert into public.produits
  (id, famille, nom, description, technique, disponible, actif, statut_prix,
   prix_fcfa, cout_fcfa, delai_jours, quantite_min, metadata)
values
  (
    'tshirt-basic',
    'TEXTILE',
    'T-Shirt raglan',
    'T-shirt personnalisé, impression DTF pressée à chaud à Brazzaville.',
    'DTF — pressage à chaud',
    true,
    true,
    'TEST',
    100,
    0,
    3,
    1,
    '{"source":"tarifs/grille.json","note":"prix de test, non commercial","couleurs":["Blanc","Noir","Rouge","Bleu"]}'::jsonb
  ),
  (
    'tshirt-alt',
    'TEXTILE',
    'T-Shirt col rond',
    'T-shirt col rond personnalisé, même qualité d’impression que le raglan.',
    'DTF — pressage à chaud',
    true,
    true,
    'TEST',
    100,
    0,
    3,
    1,
    '{"source":"tarifs/grille.json","note":"prix de test, non commercial","couleurs":["Blanc","Noir","Rouge","Bleu"]}'::jsonb
  ),
  (
    'tableau',
    'TABLEAUX',
    'Tableau canvas',
    'Toile imprimée, seule ou montée sur châssis, en cinq formats.',
    'Impression toile — montage châssis',
    true,
    true,
    'PROVISOIRE',
    null,
    0,
    3,
    1,
    '{"source":"tarifs/grille.json","note":"barème provisoire","formats":["20x30","30x40","40x60","50x70","60x90"]}'::jsonb
  ),
  (
    'impression-graphique',
    'IMPRESSION',
    'Impression graphique',
    'Flyers, affiches, cartes, menus, brochures et documents. Prix sur devis.',
    'Impression A4/A3+ — finitions partenaires',
    true,
    true,
    'PROVISOIRE',
    null,
    0,
    3,
    1,
    '{"note":"prix établis sur devis","supports":["flyers","affiches","cartes-visite","menus","invitations","brochures","documents"]}'::jsonb
  ),
  (
    'services-creatifs',
    'SERVICES',
    'Services créatifs',
    'Identité visuelle, supports publicitaires et communication événementielle.',
    'Création graphique — coordination production',
    true,
    true,
    'PROVISOIRE',
    null,
    0,
    5,
    1,
    '{"note":"prestation sur devis"}'::jsonb
  )
on conflict (id) do nothing;

-- Variantes textile : tailles et couleurs du catalogue actuel. Stock inconnu → 0, à confirmer.
insert into public.variantes_produit
  (produit_id, taille, couleur, sku, stock, seuil_alerte, actif, metadata)
select
  p.id,
  t.taille,
  c.couleur,
  upper(replace(p.id, '-', '_')) || '_' || t.taille || '_' || upper(replace(c.couleur, ' ', '_')),
  0,
  0,
  true,
  '{"stock_a_confirmer":true}'::jsonb
from public.produits p
cross join (values ('S'), ('M'), ('L'), ('XL'), ('XXL'), ('3XL')) as t(taille)
cross join (values ('Blanc'), ('Noir'), ('Rouge'), ('Bleu')) as c(couleur)
where p.id in ('tshirt-basic', 'tshirt-alt')
on conflict do nothing;

insert into public.lignes_budget (libelle, montant_prevu_fcfa, reserve, categorie)
select 'Budget opérationnel de lancement', 415000, false, 'AUTRE'
where not exists (
  select 1 from public.lignes_budget where libelle = 'Budget opérationnel de lancement'
);

insert into public.lignes_budget (libelle, montant_prevu_fcfa, reserve, categorie)
select 'Réserve protégée (non dépensable sans décision)', 85000, true, 'AUTRE'
where not exists (
  select 1 from public.lignes_budget where libelle = 'Réserve protégée (non dépensable sans décision)'
);

insert into public.parametres (cle, valeur, est_public, description)
values
  (
    'livraison',
    '{"villes":[{"id":"brazzaville","nom":"Brazzaville","frais_fcfa":100},{"id":"pointe-noire","nom":"Pointe-Noire","frais_fcfa":100}],"statut_prix":"TEST","delai_max_jours":3}'::jsonb,
    true,
    'Frais et délais de livraison. Tarifs de test (100 FCFA), à remplacer par 1 000 / 2 000 FCFA après validation.'
  ),
  (
    'paiement_en_ligne',
    '{"ouvert":false,"raison":"prix commerciaux non validés"}'::jsonb,
    false,
    'Indicateur serveur : le paiement en ligne reste fermé tant que les prix ne sont pas VALIDE.'
  ),
  (
    'entreprise',
    '{"nom":"Smart Vision Congo","email":"store@smartvision.cg","ville":"Brazzaville"}'::jsonb,
    true,
    'Coordonnées publiques de l’atelier.'
  ),
  (
    'whatsapp',
    '{"numero":null}'::jsonb,
    true,
    'Numéro WhatsApp professionnel — à renseigner par l’exploitant.'
  ),
  (
    'budget_lancement',
    '{"total_fcfa":500000,"operationnel_fcfa":415000,"reserve_fcfa":85000}'::jsonb,
    false,
    'Budget de lancement financé par Smart Vision. La réserve de 85 000 FCFA est protégée.'
  )
on conflict (cle) do nothing;
