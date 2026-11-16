-- Vérification de la migration 20261116120000 (Elembo Partners, lot 1). Tout est annulé (ROLLBACK).
-- À exécuter UNIQUEMENT sur une base locale ou de test :
--   docker exec -i supabase_db_elembo psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/elembo_partners.sql
-- Une assertion fausse lève une exception et interrompt le script.
--
-- Acteurs (identifiants fixes) :
--   a1 responsable de A · a2 opérateur de A (invité) · b1 responsable de B
--   u0 compte non confirmé · u1 compte confirmé sans entreprise
--   adm / fin / ate : personnel admin, finance, atelier

begin;

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data) values
  ('00000000-0000-4000-a000-0000000000a1', 'a1@exemple.invalid', now(), '{}'),
  ('00000000-0000-4000-a000-0000000000a2', 'a2@exemple.invalid', now(), '{}'),
  ('00000000-0000-4000-a000-0000000000b1', 'b1@exemple.invalid', now(), '{}'),
  ('00000000-0000-4000-a000-0000000000f0', 'u0@exemple.invalid', null, '{}'),
  ('00000000-0000-4000-a000-0000000000f1', 'u1@exemple.invalid', now(), '{}'),
  ('00000000-0000-4000-a000-00000000ad01', 'adm@exemple.invalid', now(), '{"role":"admin"}'),
  ('00000000-0000-4000-a000-00000000f101', 'fin@exemple.invalid', now(), '{"role":"finance"}'),
  ('00000000-0000-4000-a000-00000000a7e1', 'ate@exemple.invalid', now(), '{"role":"atelier"}');

/* ------------------------------------------------ règles métier (service) ---- */

do $$
declare
  r record;
  v_a uuid;
  v_b uuid;
  v_ma uuid;
  v_mb uuid;
  v_ca uuid;
  v_cb uuid;
  v_t1 uuid;
  v_t2 uuid;
  v_lignee uuid;
  v_echec boolean;
  v_n integer;
  v_machine public.partenaire_machines;
begin
  -- 1. Inscription : création idempotente, compte non confirmé et compte staff refusés.
  select * into r from public.creer_partenaire_inscription('00000000-0000-4000-a000-0000000000a1', 'Imprimerie A', '060000001');
  if r.deja_existant then raise exception '1 : premier appel marqué doublon'; end if;
  v_a := r.partenaire_id;
  select * into r from public.creer_partenaire_inscription('00000000-0000-4000-a000-0000000000a1', 'Autre nom', null);
  if not r.deja_existant or r.partenaire_id <> v_a then raise exception '1 : inscription non idempotente'; end if;
  if (select statut || origine from public.partenaires where id = v_a) <> 'BROUILLONINSCRIPTION' then
    raise exception '1 : statut ou origine inattendus';
  end if;
  if (select role_partenaire from public.partenaire_utilisateurs where partenaire_id = v_a) <> 'RESPONSABLE' then
    raise exception '1 : le premier inscrit doit être responsable';
  end if;

  v_echec := false;
  begin
    perform public.creer_partenaire_inscription('00000000-0000-4000-a000-0000000000f0', 'Fantôme', null);
  exception when others then v_echec := true; end;
  if not v_echec then raise exception '1 : compte non confirmé accepté'; end if;

  v_echec := false;
  begin
    perform public.creer_partenaire_inscription('00000000-0000-4000-a000-00000000ad01', 'Staff SARL', null);
  exception when others then v_echec := true; end;
  if not v_echec then raise exception '1 : compte staff accepté'; end if;

  select partenaire_id into v_b from public.creer_partenaire_inscription('00000000-0000-4000-a000-0000000000b1', 'Atelier B', '060000002');

  -- 2. Un compte staff ne peut jamais être rattaché directement.
  v_echec := false;
  begin
    insert into public.partenaire_utilisateurs (partenaire_id, user_id, role_partenaire)
    values (v_a, '00000000-0000-4000-a000-00000000ad01', 'LECTURE');
  exception when others then v_echec := true; end;
  if not v_echec then raise exception '2 : rattachement d''un compte staff accepté'; end if;

  -- 3. Invitation : mauvaise adresse refusée, usage unique.
  insert into public.partenaire_invitations (partenaire_id, email, role_partenaire, jeton_hash, expire_le)
  values (v_a, 'a2@exemple.invalid', 'PRODUCTION', repeat('a', 64), now() + interval '7 days');
  v_echec := false;
  begin
    perform public.accepter_invitation_partenaire(repeat('a', 64), '00000000-0000-4000-a000-0000000000f1');
  exception when others then v_echec := true; end;
  if not v_echec then raise exception '3 : invitation acceptée par une autre adresse'; end if;
  if public.accepter_invitation_partenaire(repeat('a', 64), '00000000-0000-4000-a000-0000000000a2') <> v_a then
    raise exception '3 : invitation non rattachée à A';
  end if;
  v_echec := false;
  begin
    perform public.accepter_invitation_partenaire(repeat('a', 64), '00000000-0000-4000-a000-0000000000a2');
  exception when others then v_echec := true; end;
  if not v_echec then raise exception '3 : invitation réutilisable'; end if;

  -- Un compte rattaché à B ne peut pas rejoindre A.
  insert into public.partenaire_invitations (partenaire_id, email, role_partenaire, jeton_hash, expire_le)
  values (v_a, 'b1@exemple.invalid', 'LECTURE', repeat('b', 64), now() + interval '7 days');
  v_echec := false;
  begin
    perform public.accepter_invitation_partenaire(repeat('b', 64), '00000000-0000-4000-a000-0000000000b1');
  exception when others then v_echec := true; end;
  if not v_echec then raise exception '3 : compte rattaché à deux entreprises'; end if;

  -- 4. Dernier responsable protégé (a2 est PRODUCTION).
  v_echec := false;
  begin
    update public.partenaire_utilisateurs set actif = false
     where user_id = '00000000-0000-4000-a000-0000000000a1';
  exception when others then v_echec := true; end;
  if not v_echec then raise exception '4 : dernier responsable désactivé'; end if;

  -- 5. Soumission : dossier incomplet refusé.
  v_echec := false;
  begin
    perform public.soumettre_partenaire(v_b, null);
  exception when others then v_echec := true; end;
  if not v_echec then raise exception '5 : dossier sans machine soumis'; end if;

  -- 6. Machines et capacités ; liaison inter-entreprises refusée.
  insert into public.partenaire_machines (partenaire_id, famille, type_machine, nom, largeur_max_mm)
  values (v_a, 'GRAND_FORMAT', 'ECO_SOLVANT', 'Traceur 3,20 m', 3200) returning id into v_ma;
  insert into public.partenaire_machines (partenaire_id, famille, type_machine, nom)
  values (v_b, 'TEXTILE', 'DTF', 'Imprimante DTF') returning id into v_mb;
  insert into public.partenaire_capacites (partenaire_id, categorie, prestation, nom, largeur_max_mm, unite_capacite, capacite_journaliere, finitions)
  values (v_a, 'GRAND_FORMAT', 'BANDEROLE', 'Banderoles PVC', 3200, 'M2', 60, '{OEILLETS,OURLETS}') returning id into v_ca;
  insert into public.partenaire_capacites (partenaire_id, categorie, prestation, nom, unite_capacite)
  values (v_b, 'TEXTILE', 'DTF', 'Transfert DTF', 'PIECE') returning id into v_cb;
  insert into public.partenaire_capacite_machines values (v_ca, v_ma);

  v_echec := false;
  begin
    insert into public.partenaire_capacite_machines values (v_ca, v_mb);
  exception when others then v_echec := true; end;
  if not v_echec then raise exception '6 : capacité de A liée à une machine de B'; end if;

  v_echec := false;
  begin
    insert into public.partenaire_services (partenaire_id, capacite_id, nom, categorie) values (v_a, v_cb, 'Pose', 'DECOUPE_POSE');
  exception when others then v_echec := true; end;
  if not v_echec then raise exception '6 : service de A lié à une capacité de B'; end if;

  -- 7. Validation technique : retombe sur changement technique, pas sur une panne.
  update public.partenaire_machines set statut_validation = 'VALIDEE', valide_le = now() where id = v_ma;
  update public.partenaire_machines set etat = 'EN_PANNE' where id = v_ma returning * into v_machine;
  if v_machine.statut_validation <> 'VALIDEE' then raise exception '7 : une panne a fait tomber la validation'; end if;
  update public.partenaire_machines set largeur_max_mm = 5000 where id = v_ma returning * into v_machine;
  if v_machine.statut_validation <> 'A_VALIDER' or v_machine.valide_le is not null then
    raise exception '7 : changement de laize sans retour à la validation';
  end if;

  -- 8. Cycle de l'entreprise et historique.
  perform public.soumettre_partenaire(v_a, '00000000-0000-4000-a000-0000000000a1');
  v_echec := false;
  begin
    perform public.decider_partenaire(v_a, 'REFUSE', '  ', '00000000-0000-4000-a000-00000000ad01', 'adm@exemple.invalid');
  exception when others then v_echec := true; end;
  if not v_echec then raise exception '8 : refus sans motif accepté'; end if;
  perform public.decider_partenaire(v_a, 'VALIDE', null, '00000000-0000-4000-a000-00000000ad01', 'adm@exemple.invalid');
  if (select statut from public.partenaires where id = v_a) <> 'VALIDE' then raise exception '8 : A non validé'; end if;
  select count(*) into v_n from public.historique_statuts_partenaire where partenaire_id = v_a;
  if v_n <> 2 then raise exception '8 : historique attendu 2 lignes, obtenu %', v_n; end if;
  if (select acteur from public.historique_statuts_partenaire where partenaire_id = v_a and nouveau_statut = 'VALIDE')
     is distinct from '00000000-0000-4000-a000-00000000ad01'::uuid then
    raise exception '8 : auteur de la validation non tracé';
  end if;

  v_echec := false;
  begin
    update public.partenaires set statut = 'BROUILLON' where id = v_a;
  exception when others then v_echec := true; end;
  if not v_echec then raise exception '8 : transition VALIDE → BROUILLON acceptée'; end if;

  v_echec := false;
  begin
    perform public.decider_partenaire(v_a, 'VALIDE', null, null, 'adm@exemple.invalid');
  exception when others then v_echec := true; end;
  if not v_echec then raise exception '8 : double validation acceptée'; end if;

  -- 9. Tarifs : paliers incohérents refusés.
  v_echec := false;
  begin
    perform public.proposer_tarif_partenaire(v_a, null, 'PARTENAIRE', '00000000-0000-4000-a000-0000000000a1',
      '{"nom":"Bâche au m²","mode_calcul":"AU_M2"}'::jsonb,
      '[{"quantite_min":1,"quantite_max":5,"prix_unitaire_fcfa":2500},{"quantite_min":7,"quantite_max":null,"prix_unitaire_fcfa":2000}]'::jsonb);
  exception when others then v_echec := true; end;
  if not v_echec then raise exception '9 : paliers avec un trou acceptés'; end if;

  v_echec := false;
  begin
    perform public.proposer_tarif_partenaire(v_a, null, 'PARTENAIRE', null, '{"nom":"Sans prix","mode_calcul":"FORFAIT"}'::jsonb, '[]'::jsonb);
  exception when others then v_echec := true; end;
  if not v_echec then raise exception '9 : tarif sans prix ni palier accepté'; end if;

  v_echec := false;
  begin
    perform public.proposer_tarif_partenaire(v_a, null, 'PARTENAIRE', null,
      jsonb_build_object('nom', 'Volé', 'mode_calcul', 'A_LA_PIECE', 'prix_fcfa', 100, 'capacite_id', v_cb), null);
  exception when others then v_echec := true; end;
  if not v_echec then raise exception '9 : tarif de A rattaché à une capacité de B'; end if;

  v_t1 := public.proposer_tarif_partenaire(v_a, null, 'PARTENAIRE', '00000000-0000-4000-a000-0000000000a1',
    jsonb_build_object('nom', 'Bâche au m²', 'mode_calcul', 'AU_M2', 'capacite_id', v_ca),
    '[{"quantite_min":1,"quantite_max":5,"prix_unitaire_fcfa":2500},{"quantite_min":6,"quantite_max":20,"prix_unitaire_fcfa":2200},{"quantite_min":21,"quantite_max":null,"prix_unitaire_fcfa":null}]'::jsonb);
  select lignee_id into v_lignee from public.partenaire_tarifs where id = v_t1;
  if v_lignee <> v_t1 then raise exception '9 : lignée de la version 1 ≠ son id'; end if;
  if (select statut from public.partenaire_tarifs where id = v_t1) <> 'PROPOSE' then
    raise exception '9 : un tarif proposé n''est pas au statut PROPOSE';
  end if;

  -- Un tarif ne naît jamais validé, même inséré directement.
  v_echec := false;
  begin
    insert into public.partenaire_tarifs (partenaire_id, nom, mode_calcul, prix_fcfa, statut, origine, valide_par_email, valide_le, valide_du)
    values (v_a, 'Raccourci', 'FORFAIT', 1, 'VALIDE', 'SMART_VISION', 'x@y.z', now(), current_date);
  exception when others then v_echec := true; end;
  if not v_echec then raise exception '9 : tarif créé directement VALIDE'; end if;

  perform public.valider_tarif_partenaire(v_t1, '00000000-0000-4000-a000-00000000f101', 'fin@exemple.invalid', current_date - 10, null);

  -- 10. Un tarif validé est figé : prix et paliers.
  v_echec := false;
  begin
    update public.partenaire_tarifs set prix_fcfa = 1 where id = v_t1;
  exception when others then v_echec := true; end;
  if not v_echec then raise exception '10 : prix d''un tarif validé modifié'; end if;
  v_echec := false;
  begin
    update public.partenaire_tarif_paliers set prix_unitaire_fcfa = 1 where tarif_id = v_t1;
  exception when others then v_echec := true; end;
  if not v_echec then raise exception '10 : palier d''un tarif validé modifié'; end if;

  -- 11. Nouvelle version (saisie Smart Vision) : v1 reste VALIDE jusqu'à la validation de v2.
  v_t2 := public.proposer_tarif_partenaire(v_a, v_lignee, 'SMART_VISION', '00000000-0000-4000-a000-00000000f101',
    '{"nom":"Bâche au m²","mode_calcul":"AU_M2","prix_fcfa":2300}'::jsonb, null);
  if (select version from public.partenaire_tarifs where id = v_t2) <> 2 then raise exception '11 : version 2 attendue'; end if;
  if (select statut from public.partenaire_tarifs where id = v_t1) <> 'VALIDE' then
    raise exception '11 : v1 invalidée avant la décision sur v2';
  end if;
  -- Re-proposer sur la même lignée remplace la version en discussion, sans créer de v3.
  if public.proposer_tarif_partenaire(v_a, v_lignee, 'SMART_VISION', null,
       '{"nom":"Bâche au m²","mode_calcul":"AU_M2","prix_fcfa":2350}'::jsonb, null) <> v_t2 then
    raise exception '11 : la version en discussion n''a pas été réutilisée';
  end if;
  perform public.valider_tarif_partenaire(v_t2, '00000000-0000-4000-a000-00000000f101', 'fin@exemple.invalid', current_date, null);
  if (select statut from public.partenaire_tarifs where id = v_t1) <> 'REMPLACE'
     or (select valide_jusquau from public.partenaire_tarifs where id = v_t1) <> current_date - 1 then
    raise exception '11 : v1 non remplacée correctement';
  end if;
  select count(*) into v_n from public.partenaire_tarifs where lignee_id = v_lignee and statut = 'VALIDE';
  if v_n <> 1 then raise exception '11 : % versions validées en vigueur', v_n; end if;

  -- 12. Disponibilités et historiques : jamais réécrits par le serveur.
  insert into public.partenaire_disponibilites (partenaire_id, statut, debut_periode) values (v_a, 'DISPONIBLE', current_date);

  perform set_config('test.a', v_a::text, true);
  perform set_config('test.b', v_b::text, true);
  perform set_config('test.ma', v_ma::text, true);
  perform set_config('test.t1', v_t1::text, true);
end;
$$;

/* --------------------------------------------- droits de service_role ---- */

set local role service_role;
do $$
declare
  v_echec boolean := false;
begin
  begin
    update public.partenaire_disponibilites set statut = 'SATURE';
  exception when insufficient_privilege then v_echec := true; end;
  if not v_echec then raise exception '12 : une disponibilité a été réécrite'; end if;
  v_echec := false;
  begin
    delete from public.historique_statuts_partenaire;
  exception when insufficient_privilege then v_echec := true; end;
  if not v_echec then raise exception '12 : historique supprimable'; end if;
end;
$$;
reset role;

/* ------------------------------------------------- RLS : responsable de A ---- */

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a1","role":"authenticated","app_metadata":{}}', true);
set local role authenticated;
do $$
declare
  v_a uuid := current_setting('test.a')::uuid;
  v_echec boolean := false;
begin
  if public.partenaire_session() is distinct from v_a then raise exception 'RLS a1 : session ≠ A'; end if;
  if (select count(*) from public.mon_partenaire()) <> 1 or (select id from public.mon_partenaire()) <> v_a then
    raise exception 'RLS a1 : mon_partenaire() ne renvoie pas A';
  end if;
  if exists (select 1 from public.partenaires) then raise exception 'RLS a1 : lecture directe de partenaires'; end if;
  if exists (select 1 from public.partenaire_machines where partenaire_id <> v_a)
     or not exists (select 1 from public.partenaire_machines) then
    raise exception 'RLS a1 : machines mal cloisonnées';
  end if;
  if exists (select 1 from public.partenaire_capacites where partenaire_id <> v_a) then raise exception 'RLS a1 : capacités de B visibles'; end if;
  if (select count(*) from public.partenaire_capacite_machines) <> 1 then raise exception 'RLS a1 : liaisons machine/capacité'; end if;
  if exists (select 1 from public.partenaire_tarifs where partenaire_id <> v_a)
     or (select count(*) from public.partenaire_tarifs) <> 2 then
    raise exception 'RLS a1 : tarifs mal cloisonnés';
  end if;
  if (select count(*) from public.partenaire_tarif_paliers) <> 3 then raise exception 'RLS a1 : paliers de A attendus'; end if;
  if (select count(*) from public.partenaire_utilisateurs) <> 2 then raise exception 'RLS a1 : utilisateurs de A attendus (2)'; end if;
  if exists (select 1 from public.partenaire_invitations) then raise exception 'RLS a1 : invitations lisibles'; end if;
  if exists (select 1 from public.historique_statuts_partenaire where partenaire_id <> v_a) then raise exception 'RLS a1 : historique de B'; end if;
  -- Aucune donnée commerciale existante.
  if exists (select 1 from public.commandes) or exists (select 1 from public.devis) or exists (select 1 from public.clients)
     or exists (select 1 from public.tarifs_grand_format) or exists (select 1 from public.demandes_grand_format)
     or exists (select 1 from public.travaux_production) or exists (select 1 from public.notes_internes) then
    raise exception 'RLS a1 : données commerciales visibles';
  end if;
  -- Aucune écriture directe.
  begin
    insert into public.partenaire_machines (partenaire_id, famille, type_machine, nom) values (v_a, 'TEXTILE', 'DTF', 'Pirate');
  exception when insufficient_privilege then v_echec := true; end;
  if not v_echec then raise exception 'RLS a1 : écriture directe possible'; end if;
  v_echec := false;
  begin
    perform public.proposer_tarif_partenaire(v_a, null, 'PARTENAIRE', null, '{"nom":"x","mode_calcul":"FORFAIT","prix_fcfa":1}'::jsonb, null);
  exception when insufficient_privilege then v_echec := true; end;
  if not v_echec then raise exception 'RLS a1 : fonction de service appelable'; end if;
end;
$$;
reset role;

/* --------------------------------------------- RLS : opérateur de A (PRODUCTION) ---- */

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a2","role":"authenticated","app_metadata":{}}', true);
set local role authenticated;
do $$
begin
  if public.role_partenaire_session() <> 'PRODUCTION' then raise exception 'RLS a2 : rôle PRODUCTION attendu'; end if;
  if not exists (select 1 from public.partenaire_machines) then raise exception 'RLS a2 : machines de A invisibles'; end if;
  if exists (select 1 from public.partenaire_tarifs) or exists (select 1 from public.partenaire_tarif_paliers) then
    raise exception 'RLS a2 : un opérateur voit les tarifs';
  end if;
end;
$$;
reset role;

/* ------------------------------------------------- RLS : responsable de B ---- */

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000b1","role":"authenticated","app_metadata":{}}', true);
set local role authenticated;
do $$
declare
  v_a uuid := current_setting('test.a')::uuid;
begin
  if exists (select 1 from public.partenaire_machines where partenaire_id = v_a)
     or exists (select 1 from public.partenaire_capacites where partenaire_id = v_a)
     or exists (select 1 from public.partenaire_tarifs)
     or exists (select 1 from public.partenaire_disponibilites where partenaire_id = v_a)
     or exists (select 1 from public.partenaire_utilisateurs where partenaire_id = v_a)
     or exists (select 1 from public.mon_partenaire() where id = v_a) then
    raise exception 'RLS b1 : données de A visibles';
  end if;
end;
$$;
reset role;

/* ------------------------------------- RLS : comptes sans entreprise ---- */

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000f1","role":"authenticated","app_metadata":{}}', true);
set local role authenticated;
do $$
begin
  if public.partenaire_session() is not null or exists (select 1 from public.mon_partenaire())
     or exists (select 1 from public.partenaire_machines) or exists (select 1 from public.partenaire_utilisateurs) then
    raise exception 'RLS u1 : un compte non rattaché voit des données';
  end if;
end;
$$;
reset role;

-- Rôle staff dans le jeton mais compte rattaché : la session partenaire est refusée.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a1","role":"authenticated","app_metadata":{"role":"commercial"}}', true);
set local role authenticated;
do $$
begin
  if public.partenaire_session() is not null then raise exception 'RLS : jeton staff accepté comme session partenaire'; end if;
end;
$$;
reset role;

/* ------------------------------------------------------------ RLS : staff ---- */

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000f101","role":"authenticated","app_metadata":{"role":"finance"}}', true);
set local role authenticated;
do $$
begin
  if (select count(*) from public.partenaire_tarifs) < 2 then raise exception 'RLS finance : tarifs invisibles'; end if;
  if exists (select 1 from public.partenaire_invitations) then raise exception 'RLS finance : invitations visibles'; end if;
end;
$$;
reset role;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-00000000a7e1","role":"authenticated","app_metadata":{"role":"atelier"}}', true);
set local role authenticated;
do $$
begin
  if (select count(distinct partenaire_id) from public.partenaire_machines) <> 2 then raise exception 'RLS atelier : machines'; end if;
  if exists (select 1 from public.partenaire_tarifs) or exists (select 1 from public.partenaire_tarif_paliers) then
    raise exception 'RLS atelier : coûts négociés visibles';
  end if;
end;
$$;
reset role;

/* ------------------------------------------- suspension : accès coupé ---- */

do $$
begin
  perform public.decider_partenaire(current_setting('test.a')::uuid, 'SUSPENDU', 'Retards répétés',
    '00000000-0000-4000-a000-00000000ad01', 'adm@exemple.invalid');
end;
$$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a1","role":"authenticated","app_metadata":{}}', true);
set local role authenticated;
do $$
begin
  if public.partenaire_session() is not null or exists (select 1 from public.mon_partenaire())
     or exists (select 1 from public.partenaire_machines) or exists (select 1 from public.partenaire_tarifs) then
    raise exception 'RLS : un partenaire suspendu lit encore ses données';
  end if;
end;
$$;
reset role;

rollback;
