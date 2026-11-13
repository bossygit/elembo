-- Vérification de la migration 0010 (back-office). Tout est annulé à la fin (ROLLBACK).
-- À exécuter UNIQUEMENT sur une base locale ou de test :
--   docker exec -i supabase_db_elembo psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/back_office.sql
-- Une assertion fausse lève une exception et interrompt le script.

begin;

do $$
declare
  v_variante uuid;
  v_commande public.commandes;
  v_client uuid;
  v_devis public.devis;
  v_stats jsonb;
  v_stock integer;
  v_nb bigint;
begin
  -- Produit de test avec coût, variante suivie en stock.
  insert into public.produits (id, famille, nom, prix_fcfa, cout_fcfa, actif, disponible)
  values ('test-back-office', 'TEXTILE', 'Produit test', 1000, 400, true, true);
  insert into public.variantes_produit (produit_id, taille, couleur, stock, seuil_alerte, cout_fcfa)
  values ('test-back-office', 'M', 'Noir', 3, 5, 450) returning id into v_variante;

  -- 1. Le coût unitaire est figé à la création de la ligne, la marge en découle.
  v_commande := public.creer_commande_directe(
    'ELB-TESTBO-0001', 'Client Test', null, '060000000', '242060000000', 'Brazzaville', null,
    2000, 500, 2500,
    '[{"produit_id":"test-back-office","designation":"Test M","quantite":2,"prix_unitaire_fcfa":1000,"total_ligne_fcfa":2000,"options":{"taille":"M"}}]'::jsonb
  );
  select * into v_commande from public.commandes where id = v_commande.id;
  assert v_commande.cout_fcfa = 800, format('coût attendu 800, obtenu %s', v_commande.cout_fcfa);
  assert v_commande.marge_fcfa = 1200, format('marge attendue 1200, obtenue %s', v_commande.marge_fcfa);

  -- 2. Paiement → PAYEE + tâche d'atelier ; un coût de sous-traitance s'ajoute au coût.
  insert into public.paiements (commande_id, montant_fcfa, montant_envoye, msisdn, statut)
  values (v_commande.id, 2500, '2500', '242060000000', 'PENDING');
  update public.paiements set statut = 'PAYE', financial_tx_id = 'TX-TEST' where commande_id = v_commande.id;
  update public.travaux_production set cout_fcfa = 300 where commande_id = v_commande.id;
  select * into v_commande from public.commandes where id = v_commande.id;
  assert v_commande.statut = 'PAYEE', 'la commande doit être PAYEE';
  assert v_commande.cout_fcfa = 1100 and v_commande.marge_fcfa = 900, 'sous-traitance non prise en compte';

  -- 3. Recherche et agrégats clients.
  select count(*) into v_nb from public.rechercher_commandes('TESTBO', 'PAYEE', 'PAYE', now() - interval '1 day', now() + interval '1 day', 10, 0);
  assert v_nb = 1, 'recherche de commande';
  select count(*) into v_nb from public.rechercher_commandes('%', null, null, null, null, 10, 0)
   where reference = 'ELB-TESTBO-0001';
  assert v_nb <= 1, 'le texte de recherche est un paramètre, pas un motif injecté';
  select montant_depense_fcfa into v_nb from public.rechercher_clients('Client Test', null, 10, 0) limit 1;
  assert v_nb >= 2500, 'montant dépensé du client';

  -- 4. Statistiques : CA, marge, catégorie, alerte de stock (seuil 5, stock 3).
  v_stats := public.statistiques_back_office(now() - interval '1 day', now() + interval '1 hour');
  assert (v_stats->>'chiffre_affaires_fcfa')::int >= 2500, 'CA';
  assert (v_stats->'marge'->>'marge_fcfa')::int >= 900, 'marge';
  assert exists (select 1 from jsonb_array_elements(v_stats->'alertes_stock') a where (a->>'id')::uuid = v_variante), 'alerte de stock';
  assert exists (select 1 from jsonb_array_elements(v_stats->'ventes_par_categorie') c where c->>'categorie' = 'Textile personnalisé'), 'catégorie';

  -- 5. Stock : entrée, inventaire, refus d'un stock négatif, traçabilité.
  v_stock := (public.mouvementer_stock(v_variante, 'ENTREE', 4, 'réassort')).stock;
  assert v_stock = 7, 'entrée de stock';
  v_stock := (public.mouvementer_stock(v_variante, 'AJUSTEMENT', 2, 'inventaire')).stock;
  assert v_stock = 2, 'inventaire';
  begin
    perform public.mouvementer_stock(v_variante, 'SORTIE', 5, 'trop');
    assert false, 'un stock négatif doit être refusé';
  exception when check_violation then null;
  end;
  select count(*) into v_nb from public.mouvements_stock where variante_id = v_variante;
  assert v_nb = 2, 'deux mouvements tracés';

  -- 6. Devis : la validation du prix tombe si le montant change avant acceptation.
  insert into public.clients (nom, telephone) values ('Client devis', '060000001') returning id into v_client;
  insert into public.devis (reference, client_id, famille, besoin)
  values ('DEV-TESTBO-0001', v_client, 'TEXTILE', 'Cinquante t-shirts pour un séminaire') returning * into v_devis;
  perform public.transitionner_devis(v_devis.id, 'EN_ANALYSE', null, null, null, 'STAFF');
  perform public.transitionner_devis(v_devis.id, 'PROPOSE', 50000, null, null, 'STAFF');
  update public.devis set prix_valide = true, prix_valide_par_email = 'test@elembo' where id = v_devis.id;
  perform public.transitionner_devis(v_devis.id, 'PROPOSE', 52000, null, null, 'STAFF');
  select * into v_devis from public.devis where id = v_devis.id;
  assert not v_devis.prix_valide and v_devis.prix_valide_le is null, 'validation non réinitialisée';
  perform public.decider_devis_public(v_devis.id, 'ACCEPTE');
  select * into v_devis from public.devis where id = v_devis.id;
  assert v_devis.prix_valide and v_devis.prix_verrouille and v_devis.prix_valide_le is not null, 'acceptation';

  raise notice 'back_office.sql : toutes les vérifications passent.';
end $$;

rollback;
