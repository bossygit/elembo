-- Vérification de la migration 20261119120000 (affectations, Lot 2). Tout est annulé (ROLLBACK).
-- À exécuter UNIQUEMENT sur une base locale ou de test :
--   docker exec -i supabase_db_elembo psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/affectations.sql
-- Une assertion fausse lève une exception et interrompt le script.
--
-- Acteurs : a1 responsable de A · a2 opérateur de A · b1 responsable de B · adm staff admin
--           u_purge compte d'un dossier BROUILLON abandonné

begin;

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data) values
  ('00000000-0000-4000-a000-0000000000a1', 'a1@exemple.invalid', now(), '{}'),
  ('00000000-0000-4000-a000-0000000000a2', 'a2@exemple.invalid', now(), '{}'),
  ('00000000-0000-4000-a000-0000000000b1', 'b1@exemple.invalid', now(), '{}'),
  ('00000000-0000-4000-a000-00000000ad01', 'adm@exemple.invalid', now(), '{"role":"admin"}'),
  ('00000000-0000-4000-a000-00000000ff01', 'purge@exemple.invalid', now(), '{}');

/* ----------------------------------------- socle : ateliers, commande, tarif ---- */

do $$
declare
  r record;
  v_a uuid;
  v_b uuid;
  v_p uuid;
  v_client uuid;
  v_devis uuid;
  v_cmd uuid;
  v_cmd2 uuid;
  v_t1 uuid;
  v_t2 uuid;
  v_t3 uuid;
  v_t4 uuid;
  v_f1 uuid;
  v_f2 uuid;
  v_tarif uuid;
  v_aff1 uuid;
  v_aff2 uuid;
  v_aff3 uuid;
  v_aff_exp uuid;
  v_echec boolean;
  v_n integer;
begin
  select partenaire_id into v_a from public.creer_partenaire_inscription(
    '00000000-0000-4000-a000-0000000000a1', 'Imprimerie A', '060000001');
  select partenaire_id into v_b from public.creer_partenaire_inscription(
    '00000000-0000-4000-a000-0000000000b1', 'Atelier B', '060000002');
  select partenaire_id into v_p from public.creer_partenaire_inscription(
    '00000000-0000-4000-a000-00000000ff01', 'Brouillon abandonné', '060000003');

  insert into public.partenaire_utilisateurs (partenaire_id, user_id, role_partenaire)
  values (v_a, '00000000-0000-4000-a000-0000000000a2', 'PRODUCTION');

  perform public.decider_partenaire(v_a, 'VALIDE', null, '00000000-0000-4000-a000-00000000ad01', 'adm@exemple.invalid');
  perform public.decider_partenaire(v_b, 'VALIDE', null, '00000000-0000-4000-a000-00000000ad01', 'adm@exemple.invalid');

  insert into public.clients (nom, telephone, ville) values ('Client Test', '061000000', 'Brazzaville')
  returning id into v_client;

  insert into public.devis (reference, client_id, famille, besoin, quantite)
  values ('DEV-20261119-0001', v_client, 'IMPRESSION', 'Banderole de test pour affectation', 1)
  returning id into v_devis;

  insert into public.commandes (reference, client_id, devis_id, statut)
  values ('ELB-20261119-0001', v_client, v_devis, 'A_PRODUIRE')
  returning id into v_cmd;

  insert into public.commandes (reference, client_id, statut)
  values ('ELB-20261119-0002', v_client, 'A_PRODUIRE')
  returning id into v_cmd2;

  insert into public.travaux_production (commande_id, etape) values (v_cmd, 'Impression') returning id into v_t1;
  insert into public.travaux_production (commande_id, etape) values (v_cmd, 'Découpe') returning id into v_t2;
  insert into public.travaux_production (commande_id, etape) values (v_cmd, 'Pose') returning id into v_t3;
  insert into public.travaux_production (commande_id, etape) values (v_cmd, 'Expiration') returning id into v_t4;

  insert into public.fichiers_commande (commande_id, nom, chemin, type_mime, taille_octets, type_fichier, verifie)
  values (v_cmd, 'visuel.png', 'production/visuel.png', 'image/png', 1024, 'VISUEL_IMPRESSION', true)
  returning id into v_f1;

  insert into public.fichiers_commande (commande_id, nom, chemin, type_mime, taille_octets, type_fichier, verifie)
  values (v_cmd2, 'autre.png', 'production/autre.png', 'image/png', 1024, 'VISUEL_IMPRESSION', true)
  returning id into v_f2;

  v_tarif := public.proposer_tarif_partenaire(
    v_a, null, 'SMART_VISION', '00000000-0000-4000-a000-00000000ad01',
    jsonb_build_object('nom', 'Impression au m²', 'mode_calcul', 'AU_M2', 'prix_fcfa', 2000),
    '[]'::jsonb);
  perform public.valider_tarif_partenaire(v_tarif, '00000000-0000-4000-a000-00000000ad01', 'adm@exemple.invalid', current_date, null);

  -- 1. Proposition : instantané figé, aucune affectation posée sur la tâche.
  v_aff1 := public.proposer_affectation(
    'TACHE_PRODUCTION', v_cmd, v_t1, null, v_a, v_tarif, 6, 12000, 'TARIF_VALIDE',
    jsonb_build_object('libelle', 'Impression banderole 6 m²', 'support', 'BANDEROLE',
                       'quantite', 1, 'unite', 'M2', 'surface_m2', 6,
                       'date_fin_prevue', current_date + 5,
                       'details', jsonb_build_object('largeur_mm', 6000, 'hauteur_mm', 1000)),
    '00000000-0000-4000-a000-00000000ad01', 'adm@exemple.invalid');

  select * into r from public.affectations_production where id = v_aff1;
  if r.statut <> 'PROPOSEE' or r.montant_fcfa <> 12000 or r.tarif_version <> 1
     or r.tarif_source <> 'TARIF_VALIDE' then
    raise exception '1 : instantané de tarif incorrect';
  end if;
  if (select partenaire_id from public.travaux_production where id = v_t1) is not null then
    raise exception '1 : une proposition a déjà posé l''atelier sur la tâche';
  end if;
  if (select count(*) from public.affectations_evenements where affectation_id = v_aff1 and nouveau_statut = 'PROPOSEE') <> 1 then
    raise exception '1 : événement PROPOSEE manquant';
  end if;

  -- 2. Double proposition refusée, tarif d'un autre atelier refusé.
  v_echec := false;
  begin
    perform public.proposer_affectation('TACHE_PRODUCTION', v_cmd, v_t1, null, v_a, v_tarif, 6, 12000,
      'TARIF_VALIDE', jsonb_build_object('libelle', 'Doublon'), '00000000-0000-4000-a000-00000000ad01', 'adm@exemple.invalid');
  exception when others then v_echec := true; end;
  if not v_echec then raise exception '2 : double proposition acceptée'; end if;

  v_echec := false;
  begin
    perform public.proposer_affectation('TACHE_PRODUCTION', v_cmd, v_t2, null, v_b, v_tarif, 6, 12000,
      'TARIF_VALIDE', jsonb_build_object('libelle', 'Mauvais tarif'), '00000000-0000-4000-a000-00000000ad01', 'adm@exemple.invalid');
  exception when others then v_echec := true; end;
  if not v_echec then raise exception '2 : tarif d''un autre atelier accepté'; end if;

  -- 3. Seul le responsable de l'atelier décide.
  v_echec := false;
  begin
    perform public.decider_affectation(v_aff1, '00000000-0000-4000-a000-0000000000a2', 'ACCEPTEE', null);
  exception when others then v_echec := true; end;
  if not v_echec then raise exception '3 : un opérateur PRODUCTION a décidé'; end if;

  v_echec := false;
  begin
    perform public.decider_affectation(v_aff1, '00000000-0000-4000-a000-0000000000b1', 'ACCEPTEE', null);
  exception when others then v_echec := true; end;
  if not v_echec then raise exception '3 : un autre atelier a décidé'; end if;

  -- 4. Acceptation : la tâche porte l'atelier, la banderole suivrait la même règle.
  perform public.decider_affectation(v_aff1, '00000000-0000-4000-a000-0000000000a1', 'ACCEPTEE', null);
  select * into r from public.travaux_production where id = v_t1;
  if r.partenaire_id <> v_a or r.interne then
    raise exception 'acceptation : la tâche porte l’atelier';
  end if;
  if (select statut from public.affectations_production where id = v_aff1) <> 'ACCEPTEE' then
    raise exception 'acceptation : statut d''affectation incorrect';
  end if;

  -- 5. Un tarif accepté ne se réécrit pas, une proposition traitée ne se rejoue pas.
  v_echec := false;
  begin
    update public.affectations_production set montant_fcfa = 1 where id = v_aff1;
  exception when others then v_echec := true; end;
  if not v_echec then raise exception 'instantané : un tarif accepté ne se réécrit pas'; end if;

  v_echec := false;
  begin
    perform public.decider_affectation(v_aff1, '00000000-0000-4000-a000-0000000000a1', 'ACCEPTEE', null);
  exception when others then v_echec := true; end;
  if not v_echec then raise exception '5 : une affectation acceptée a été acceptée deux fois'; end if;

  -- 6. Refus : motif obligatoire.
  v_aff2 := public.proposer_affectation(
    'TACHE_PRODUCTION', v_cmd, v_t2, null, v_a, null, null, 5000, 'MANUEL',
    jsonb_build_object('libelle', 'Découpe à négocier', 'tarif_motif', 'Négociation test'),
    '00000000-0000-4000-a000-00000000ad01', 'adm@exemple.invalid');
  v_echec := false;
  begin
    perform public.decider_affectation(v_aff2, '00000000-0000-4000-a000-0000000000a1', 'REFUSEE', null);
  exception when others then v_echec := true; end;
  if not v_echec then raise exception 'refus : motif obligatoire'; end if;
  perform public.decider_affectation(v_aff2, '00000000-0000-4000-a000-0000000000a1', 'REFUSEE', 'Machine indisponible');
  if (select partenaire_id from public.travaux_production where id = v_t2) is not null then
    raise exception '6 : un refus a posé l''atelier sur la tâche';
  end if;
  if (select motif_refus from public.affectations_production where id = v_aff2) <> 'Machine indisponible' then
    raise exception '6 : motif de refus perdu';
  end if;

  -- 7. Annulation après acceptation : la tâche est libérée.
  v_aff3 := public.proposer_affectation(
    'TACHE_PRODUCTION', v_cmd, v_t3, null, v_a, v_tarif, 2, 4000, 'TARIF_VALIDE',
    jsonb_build_object('libelle', 'Pose à domicile'), '00000000-0000-4000-a000-00000000ad01', 'adm@exemple.invalid');
  perform public.ajouter_fichiers_affectation(v_aff3, array[v_f1], '00000000-0000-4000-a000-00000000ad01');
  v_echec := false;
  begin
    perform public.ajouter_fichiers_affectation(v_aff3, array[v_f2], '00000000-0000-4000-a000-00000000ad01');
  exception when others then v_echec := true; end;
  if not v_echec then raise exception '7 : fichier d''une autre commande accepté'; end if;

  perform public.decider_affectation(v_aff3, '00000000-0000-4000-a000-0000000000a1', 'ACCEPTEE', null);
  v_echec := false;
  begin
    perform public.ajouter_fichiers_affectation(v_aff3, array[v_f1], '00000000-0000-4000-a000-00000000ad01');
  exception when others then v_echec := true; end;
  if not v_echec then raise exception '7 : fichier ajouté après acceptation'; end if;
  perform public.annuler_affectation(v_aff3, '00000000-0000-4000-a000-00000000ad01', 'adm@exemple.invalid', 'Atelier indisponible');
  if (select partenaire_id from public.travaux_production where id = v_t3) is not null then
    raise exception '7 : l''annulation n''a pas libéré la tâche';
  end if;

  -- 8. Expiration des propositions dépassées.
  insert into public.affectations_production (
    partenaire_id, commande_id, tache_id, objet, statut, libelle, montant_fcfa,
    tarif_source, tarif_motif, date_limite_reponse, proposee_par
  ) values (
    v_a, v_cmd, v_t4, 'TACHE_PRODUCTION', 'PROPOSEE', 'Proposition expirée', 1000,
    'MANUEL', 'Test expiration', now() - interval '1 hour', '00000000-0000-4000-a000-00000000ad01'
  ) returning id into v_aff_exp;
  v_n := public.expirer_affectations();
  if v_n < 1 or (select statut from public.affectations_production where id = v_aff_exp) <> 'EXPIREE' then
    raise exception '8 : expiration non appliquée';
  end if;

  -- 9. Purge d'un brouillon abandonné : archivage doux, accès coupés, fichiers retirés.
  execute 'alter table public.partenaires disable trigger partenaires_maj_le';
  update public.partenaires set maj_le = now() - interval '91 days' where id = v_p;
  execute 'alter table public.partenaires enable trigger partenaires_maj_le';
  insert into public.partenaire_fichiers (partenaire_id, type_fichier, chemin, type_mime, taille_octets)
  values (v_p, 'LOGO', v_p::text || '/logo/test.png', 'image/png', 100);
  if not exists (select 1 from public.brouillons_abandonnes(90) where id = v_p) then
    raise exception '9 : brouillon abandonné non détecté';
  end if;
  perform public.archiver_brouillon(v_p, 'Purge de test');
  if (select statut from public.partenaires where id = v_p) <> 'ARCHIVE' then
    raise exception '9 : brouillon non archivé';
  end if;
  if exists (select 1 from public.partenaire_utilisateurs where partenaire_id = v_p and actif) then
    raise exception '9 : accès du brouillon encore actif';
  end if;
  if exists (select 1 from public.partenaire_fichiers where partenaire_id = v_p) then
    raise exception '9 : fichiers du brouillon encore référencés';
  end if;

  perform set_config('test.a', v_a::text, true);
  perform set_config('test.b', v_b::text, true);
  perform set_config('test.aff1', v_aff1::text, true);
end;
$$;

/* ------------------------------------------------------------- RLS A/B ---- */

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-0000000000a1","role":"authenticated","app_metadata":{}}', true);
set local role authenticated;
do $$
declare
  v_aff uuid := current_setting('test.aff1')::uuid;
  v_montant integer;
begin
  if not exists (select 1 from public.mes_affectations()) then
    raise exception 'RLS : le responsable A ne voit aucune affectation';
  end if;
  select montant_fcfa into v_montant from public.mes_affectations() where id = v_aff;
  if v_montant is null then
    raise exception 'RLS : le responsable A ne voit pas le montant';
  end if;
  if (select count(*) from public.affectations_production) <> 0 then
    raise exception 'RLS : lecture directe de la table autorisée au partenaire';
  end if;
  if not exists (select 1 from public.mon_affectation(v_aff)) then
    raise exception 'RLS : fiche d''affectation introuvable pour son atelier';
  end if;
end;
$$;
reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-0000000000a2","role":"authenticated","app_metadata":{}}', true);
set local role authenticated;
do $$
declare
  v_aff uuid := current_setting('test.aff1')::uuid;
  v_montant integer;
begin
  select montant_fcfa into v_montant from public.mes_affectations() where id = v_aff;
  if v_montant is not null then
    raise exception 'RLS : un opérateur PRODUCTION voit le montant';
  end if;
end;
$$;
reset role;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-a000-0000000000b1","role":"authenticated","app_metadata":{}}', true);
set local role authenticated;
do $$
declare
  v_aff uuid := current_setting('test.aff1')::uuid;
begin
  if exists (select 1 from public.mes_affectations() where id = v_aff) then
    raise exception 'RLS : un atelier ne lit pas les affectations d’un autre';
  end if;
  if exists (select 1 from public.mon_affectation(v_aff)) then
    raise exception 'RLS : un atelier lit la fiche d''un autre';
  end if;
end;
$$;
reset role;

rollback;
