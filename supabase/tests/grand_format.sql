-- Vérification de la migration 20261113120000 (banderoles & grand format). Tout est annulé (ROLLBACK).
-- À exécuter UNIQUEMENT sur une base locale ou de test :
--   docker exec -i supabase_db_elembo psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/grand_format.sql
-- Une assertion fausse lève une exception et interrompt le script.

begin;

do $$
declare
  r record;
  r2 record;
  v_demande public.demandes_grand_format;
  v_devis public.devis;
  v_tarif public.tarifs_grand_format;
  v_commande public.commandes;
  v_partenaire uuid;
  v_echec boolean;
  v_gf jsonb := jsonb_build_object(
    'usage', 'DEUIL', 'support', 'BANDEROLE', 'largeur_m', 3, 'hauteur_m', 1, 'quantite', 2,
    'finition', 'OEILLETS', 'delai', 'STANDARD', 'prestation', 'CREATION',
    'commentaire', 'Hommage à notre père', 'estimation_fcfa', null,
    'estimation_detail', jsonb_build_object('disponible', false, 'raison', 'TARIF_NON_VALIDE')
  );
begin
  -- 1. Création atomique devis + demande.
  select * into r from public.creer_demande_grand_format(
    'TEST-GF-IDEMPOTENCE-0001', 'DEV-TESTGF-0001', 'hash-test-gf', now() + interval '30 days',
    'Client Banderole', null, 'test-gf@example.invalid', '060000000', '242060000000',
    'PARTICULIER', 'Brazzaville', 'Banderole 3 × 1 m × 2 — Deuil & hommage.', '3 × 1 m', 2,
    '{"Offre":"Banderoles & supports grand format"}'::jsonb, '{"nom":"Client Banderole"}'::jsonb,
    null, null, v_gf
  );
  if r.deja_existant then raise exception 'Le premier appel ne doit pas être un doublon'; end if;

  select * into v_devis from public.devis where id = r.devis_id;
  if v_devis.famille <> 'IMPRESSION' or v_devis.statut <> 'NOUVEAU' or v_devis.quantite <> 2 then
    raise exception 'Devis mal formé : % % %', v_devis.famille, v_devis.statut, v_devis.quantite;
  end if;

  select * into v_demande from public.demandes_grand_format where devis_id = r.devis_id;
  if not found then raise exception 'Demande grand format absente'; end if;
  if v_demande.surface_totale_m2 <> 6 then raise exception 'Surface totale attendue 6, obtenue %', v_demande.surface_totale_m2; end if;
  if v_demande.prix_vente_fcfa is not null or v_demande.cout_estime_total_fcfa is not null then
    raise exception 'Aucun chiffrage ne doit exister à la création';
  end if;

  -- 2. Idempotence : même clé → même devis, aucune seconde demande.
  select * into r2 from public.creer_demande_grand_format(
    'TEST-GF-IDEMPOTENCE-0001', 'DEV-TESTGF-0002', 'hash-test-gf-2', now() + interval '30 days',
    'Client Banderole', null, 'test-gf@example.invalid', '060000000', '242060000000',
    'PARTICULIER', 'Brazzaville', 'Banderole 3 × 1 m × 2 — Deuil & hommage.', '3 × 1 m', 2,
    '{}'::jsonb, '{}'::jsonb, null, null, v_gf
  );
  if not r2.deja_existant or r2.devis_id <> r.devis_id then raise exception 'Idempotence rompue'; end if;
  if (select count(*) from public.demandes_grand_format where devis_id = r.devis_id) <> 1 then
    raise exception 'Demande dupliquée';
  end if;

  -- 3. Contraintes : dimension hors bornes, délai DATE sans date, valeur inconnue.
  v_echec := false;
  begin
    perform public.creer_demande_grand_format(
      'TEST-GF-IDEMPOTENCE-0003', 'DEV-TESTGF-0003', 'h3', now() + interval '1 day',
      'Client Banderole', null, 'test-gf@example.invalid', '060000000', '242060000000',
      'PARTICULIER', null, 'Banderole trop grande pour être vraie.', null, 1, '{}'::jsonb, '{}'::jsonb,
      null, null, v_gf || '{"largeur_m": 80}'::jsonb);
  exception when check_violation then v_echec := true;
  end;
  if not v_echec then raise exception 'Une largeur de 80 m aurait dû être refusée'; end if;
  if exists (select 1 from public.devis where reference = 'DEV-TESTGF-0003') then
    raise exception 'Le devis ne doit pas survivre à une demande refusée (atomicité)';
  end if;

  v_echec := false;
  begin
    perform public.creer_demande_grand_format(
      'TEST-GF-IDEMPOTENCE-0004', 'DEV-TESTGF-0004', 'h4', now() + interval '1 day',
      'Client Banderole', null, 'test-gf@example.invalid', '060000000', '242060000000',
      'PARTICULIER', null, 'Banderole pour une date précise.', null, 1, '{}'::jsonb, '{}'::jsonb,
      null, null, v_gf || '{"delai": "DATE"}'::jsonb);
  exception when check_violation then v_echec := true;
  end;
  if not v_echec then raise exception 'Un délai DATE sans date aurait dû être refusé'; end if;

  -- 4. Chiffrage : prix de vente et coût estimé calculés, coût reporté sur le devis.
  insert into public.partenaires (nom, specialite, types_impression, largeur_max_m, tarifs)
  values ('Imprimeur test', 'Grand format', array['BANDEROLE'], 3.2, '{"prix_m2_fcfa": 2500}'::jsonb)
  returning id into v_partenaire;

  update public.demandes_grand_format
     set partenaire_id = v_partenaire,
         prix_impression_fcfa = 30000, frais_creation_fcfa = 10000,
         cout_impression_estime_fcfa = 15000, cout_creation_estime_fcfa = 4000,
         cout_livraison_estime_fcfa = 1500,
         production_prevue_le = current_date + 2, livraison_prevue_le = current_date + 3
   where devis_id = r.devis_id
  returning * into v_demande;
  if v_demande.prix_vente_fcfa <> 40000 then raise exception 'Prix de vente attendu 40000, obtenu %', v_demande.prix_vente_fcfa; end if;
  if v_demande.cout_estime_total_fcfa <> 20500 then raise exception 'Coût estimé attendu 20500, obtenu %', v_demande.cout_estime_total_fcfa; end if;
  select * into v_devis from public.devis where id = r.devis_id;
  if v_devis.cout_estime_fcfa is distinct from 20500 then
    raise exception 'devis.cout_estime_fcfa non synchronisé : %', v_devis.cout_estime_fcfa;
  end if;

  v_echec := false;
  begin
    update public.demandes_grand_format
       set livraison_prevue_le = current_date, production_prevue_le = current_date + 5
     where devis_id = r.devis_id;
  exception when check_violation then v_echec := true;
  end;
  if not v_echec then raise exception 'Une livraison avant la production aurait dû être refusée'; end if;

  -- 5. Grille : aucun prix au départ, VALIDE exige un montant et une validation tracée,
  --    tout changement de montant fait retomber la validation.
  if exists (select 1 from public.tarifs_grand_format where prix_m2_fcfa is not null or statut_prix = 'VALIDE') then
    raise exception 'La grille livrée ne doit contenir aucun prix ni aucune validation';
  end if;
  v_echec := false;
  begin
    update public.tarifs_grand_format set statut_prix = 'VALIDE' where support = 'BANDEROLE';
  exception when check_violation then v_echec := true;
  end;
  if not v_echec then raise exception 'VALIDE sans prix ni validation aurait dû être refusé'; end if;

  update public.tarifs_grand_format set prix_m2_fcfa = 5000 where support = 'BANDEROLE';
  update public.tarifs_grand_format
     set statut_prix = 'VALIDE', prix_valide_par_email = 'finance@example.invalid', prix_valide_le = now()
   where support = 'BANDEROLE'
  returning * into v_tarif;
  if v_tarif.statut_prix <> 'VALIDE' then raise exception 'Validation explicite refusée'; end if;
  update public.tarifs_grand_format set prix_m2_fcfa = 5500 where support = 'BANDEROLE' returning * into v_tarif;
  if v_tarif.statut_prix <> 'PROVISOIRE' or v_tarif.prix_valide_le is not null then
    raise exception 'Un nouveau montant doit faire retomber la validation (statut %)', v_tarif.statut_prix;
  end if;

  -- 6. Le devis grand format suit le cycle commercial existant jusqu'à la commande.
  perform public.transitionner_devis(r.devis_id, 'EN_ANALYSE', null, null, null, 'STAFF');
  perform public.transitionner_devis(r.devis_id, 'PROPOSE', 40000, null, null, 'STAFF');
  perform public.transitionner_devis(r.devis_id, 'ACCEPTE', null, null, null, 'STAFF');
  v_commande := public.creer_commande_depuis_devis(
    r.devis_id, 'ELB-TESTGF-0001', 'MTN_MOMO', 2000, 'Brazzaville', null, null, 'TEST-GF-CMD-0001', null);
  if v_commande.total_fcfa <> 42000 then raise exception 'Total commande attendu 42000, obtenu %', v_commande.total_fcfa; end if;

  -- Les coûts deviennent des tâches d'atelier : la marge de la commande suit.
  insert into public.travaux_production (commande_id, etape, partenaire_id, interne, cout_fcfa)
  values (v_commande.id, 'Impression grand format', v_partenaire, false, 16000),
         (v_commande.id, 'Création graphique', null, true, 4000);
  select * into v_commande from public.commandes where id = v_commande.id;
  if v_commande.cout_fcfa <> 20000 or v_commande.marge_fcfa <> 20000 then
    raise exception 'Coût/marge commande attendus 20000/20000, obtenus %/%', v_commande.cout_fcfa, v_commande.marge_fcfa;
  end if;

  -- 7. Suppression du devis : la demande suit (cascade), l'imprimeur reste.
  delete from public.commandes where id = v_commande.id;
  delete from public.devis where id = r.devis_id;
  if exists (select 1 from public.demandes_grand_format where devis_id = r.devis_id) then
    raise exception 'La demande doit être supprimée avec son devis';
  end if;
  if not exists (select 1 from public.partenaires where id = v_partenaire) then
    raise exception 'Le partenaire ne doit pas être supprimé';
  end if;

  raise notice 'grand_format : toutes les vérifications métier sont passées';
end;
$$;

-- 8. Droits : anon ne voit rien, authenticated sans rôle staff ne voit rien, aucune écriture.
set local role anon;
do $$
begin
  begin
    perform 1 from public.demandes_grand_format limit 1;
    raise exception 'anon ne doit pas lire demandes_grand_format';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.tarifs_grand_format limit 1;
    raise exception 'anon ne doit pas lire tarifs_grand_format';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.creer_demande_grand_format(null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null);
    raise exception 'anon ne doit pas exécuter creer_demande_grand_format';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","app_metadata":{}}';
do $$
begin
  if (select count(*) from public.tarifs_grand_format) <> 0 then
    raise exception 'Un utilisateur sans rôle staff ne doit voir aucun tarif';
  end if;
  begin
    insert into public.tarifs_grand_format (support, libelle) values ('PANNEAU', 'Intrusion');
    raise exception 'authenticated ne doit pas écrire dans tarifs_grand_format';
  exception when insufficient_privilege then null;
  end;
end;
$$;
set local request.jwt.claims = '{"role":"authenticated","app_metadata":{"role":"finance"}}';
do $$
begin
  if (select count(*) from public.tarifs_grand_format) <> 6 then
    raise exception 'Le rôle finance doit lire la grille';
  end if;
end;
$$;
reset role;

do $$ begin raise notice 'grand_format : droits vérifiés'; end $$;

rollback;
