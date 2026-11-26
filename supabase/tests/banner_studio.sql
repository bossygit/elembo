-- Vérification des migrations Banner Studio (20261125120000, 20261125130000, 20261126120000). Tout est annulé (ROLLBACK).
-- À exécuter UNIQUEMENT sur une base locale ou de test :
--   docker exec -i supabase_db_elembo psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/banner_studio.sql

begin;

do $$
declare
  b storage.buckets;
begin
  select * into b from storage.buckets where id = 'devis';
  if not ('application/json' = any (b.allowed_mime_types)) then raise exception 'JSON absent du bucket devis'; end if;
  if not (b.allowed_mime_types @> array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/zip']) then
    raise exception 'un type existant a disparu du bucket devis';
  end if;
  if cardinality(b.allowed_mime_types) <> 7 or not ('text/plain' = any (b.allowed_mime_types)) then raise exception 'types inattendus : %', b.allowed_mime_types; end if;
  if b.public or b.file_size_limit <> 52428800 then raise exception 'bucket devis : accès ou limite modifiés'; end if;

  -- Rejouer la migration n'ajoute pas de doublon.
  update storage.buckets
  set allowed_mime_types = array_append(allowed_mime_types, 'application/json')
  where id = 'devis' and not ('application/json' = any (coalesce(allowed_mime_types, array[]::text[])));
  select * into b from storage.buckets where id = 'devis';
  if cardinality(b.allowed_mime_types) <> 7 then raise exception 'migration non idempotente'; end if;

  -- Le bucket reste fermé au navigateur.
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and (roles && array['anon', 'authenticated']::name[]) and (coalesce(qual, '') || coalesce(with_check, '')) like '%devis%') then
    raise exception 'une politique ouvre le bucket devis';
  end if;

end $$;

do $$
declare
  d record;
  d2 record;
  r record;
  v public.visuels_banderole;
  g public.demandes_grand_format;
  n integer;
  echec boolean;
  a text := repeat('a', 64);
  b text := repeat('b', 64);
  gf jsonb := jsonb_build_object('usage', 'DEUIL', 'support', 'BANDEROLE', 'largeur_m', 3, 'hauteur_m', 1, 'quantite', 1,
    'finition', 'OEILLETS', 'delai', 'STANDARD', 'prestation', 'FICHIER_PRET', 'estimation_detail', '{}'::jsonb);
  fichiers jsonb;
begin
  select * into d from public.creer_demande_grand_format('cle-visuel-essai-0001', 'DEV-20261125-VISUEL01', repeat('1', 64), now() + interval '1 day',
    'Client Essai', null, null, '061234567', '242061234567', 'PARTICULIER', null, 'Une banderole', null, 1, '{}'::jsonb, '{}'::jsonb, null, null, gf);
  select * into d2 from public.creer_demande_grand_format('cle-visuel-essai-0002', 'DEV-20261125-VISUEL02', repeat('2', 64), now() + interval '1 day',
    'Client Essai', null, null, '061234567', '242061234567', 'PARTICULIER', null, 'Une banderole', null, 1, '{}'::jsonb, '{}'::jsonb, null, null, gf);

  -- Réservation, idempotence.
  select * into r from public.reserver_visuel_banderole(d.devis_id, a, '{}'::jsonb, 1, 'DEUIL', null, null, 'CLIENT');
  if r.etat <> 'NOUVEAU' or r.version <> 1 then raise exception 'réservation : %', r; end if;
  select * into r from public.reserver_visuel_banderole(d.devis_id, a, '{}'::jsonb, 1, 'DEUIL', null, null, 'CLIENT');
  if r.etat <> 'EN_COURS' then raise exception 'rendu simultané non détecté : %', r; end if;

  -- Un rendu abandonné (plus de 5 minutes) laisse la place à une nouvelle version.
  update public.visuels_banderole set cree_le = now() - interval '6 minutes' where devis_id = d.devis_id;
  select * into r from public.reserver_visuel_banderole(d.devis_id, a, '{}'::jsonb, 1, 'DEUIL', null, null, 'CLIENT');
  if r.etat <> 'NOUVEAU' or r.version <> 2 then raise exception 'rendu abandonné : %', r; end if;

  -- Un visuel rendu exige un PDF ; un chemin d'un autre devis est refusé.
  echec := false;
  begin perform public.terminer_visuel_banderole(r.visuel_id, 'RENDU', '{}', '{}', '{}', '[]', '[]', null, a);
  exception when others then echec := true; end;
  if not echec then raise exception 'visuel RENDU sans PDF accepté'; end if;
  echec := false;
  begin perform public.terminer_visuel_banderole(r.visuel_id, 'RENDU', '{}', '{}', '{}', '[]',
    jsonb_build_array(jsonb_build_object('role', 'production', 'nom', 'x.pdf', 'chemin', 'devis/' || d2.devis_id || '/x.pdf', 'type_mime', 'application/pdf', 'taille_octets', 10, 'type_fichier', 'VISUEL_IMPRESSION', 'checksum', a)), null, a);
  exception when others then echec := true; end;
  if not echec then raise exception 'fichier d''un autre devis accepté'; end if;

  -- Rendu terminé : fichiers PROPRE, pointeur courant, journal.
  fichiers := jsonb_build_array(
    jsonb_build_object('role', 'projet', 'nom', 'projet-banner-v2.json', 'chemin', 'devis/' || d.devis_id || '/projet-banner-v2.json', 'type_mime', 'application/json', 'taille_octets', 10, 'type_fichier', 'SOURCE', 'checksum', a),
    jsonb_build_object('role', 'production', 'nom', 'visuel-banner-v2.pdf', 'chemin', 'devis/' || d.devis_id || '/visuel-banner-v2.pdf', 'type_mime', 'application/pdf', 'taille_octets', 10, 'type_fichier', 'VISUEL_IMPRESSION', 'checksum', a),
    jsonb_build_object('role', 'fiche', 'nom', 'fiche-production-v2.txt', 'chemin', 'devis/' || d.devis_id || '/fiche-production-v2.txt', 'type_mime', 'text/plain', 'taille_octets', 10, 'type_fichier', 'FICHE_PRODUCTION', 'checksum', a));
  perform public.terminer_visuel_banderole(r.visuel_id, 'RENDU', '{"a":1}', '{}', '{"pages":1}', '[]', fichiers, 'visuels/x/apercu-v2.jpg', a);
  select * into v from public.visuels_banderole where id = r.visuel_id;
  if v.statut <> 'RENDU' or v.fichier_production_id is null or v.fichier_fiche_id is null or v.rendu_le is null then raise exception 'visuel mal enregistré'; end if;
  select count(*) into n from public.fichiers_devis where devis_id = d.devis_id and statut_analyse = 'PROPRE' and verifie and analyse_moteur = 'elembo-banner';
  if n <> 3 then raise exception 'fichiers serveur : %', n; end if;
  select * into g from public.demandes_grand_format where devis_id = d.devis_id;
  if g.visuel_courant_id <> r.visuel_id then raise exception 'pointeur courant'; end if;
  if not exists (select 1 from public.journal_audit where action = 'VISUEL_BANDEROLE_RENDU' and entite_id = r.visuel_id::text) then raise exception 'journal absent'; end if;

  -- Le même projet n'est pas rendu deux fois ; un visuel terminé ne se réécrit pas.
  select * into r from public.reserver_visuel_banderole(d.devis_id, a, '{}'::jsonb, 1, 'DEUIL', null, null, 'CLIENT');
  if r.etat <> 'DEJA' or r.version <> 2 then raise exception 'idempotence : %', r; end if;
  echec := false;
  begin perform public.terminer_visuel_banderole(r.visuel_id, 'A_REVOIR', '{}', '{}', '{}', '[]', '[]', null, null);
  exception when others then echec := true; end;
  if not echec then raise exception 'visuel terminé réécrit'; end if;

  -- Un projet modifié archive l'ancien visuel sans toucher à ses fichiers.
  select * into r from public.reserver_visuel_banderole(d.devis_id, b, '{}'::jsonb, 1, null, null, null, 'CLIENT');
  perform public.terminer_visuel_banderole(r.visuel_id, 'RENDU', '{}', '{}', '{}', '[]', jsonb_build_array(
    jsonb_build_object('role', 'production', 'nom', 'visuel-banner-v3.pdf', 'chemin', 'devis/' || d.devis_id || '/visuel-banner-v3.pdf', 'type_mime', 'application/pdf', 'taille_octets', 10, 'type_fichier', 'VISUEL_IMPRESSION', 'checksum', b)), null, b);
  if (select statut from public.visuels_banderole where devis_id = d.devis_id and version = 2) <> 'ARCHIVE' then raise exception 'ancien visuel non archivé'; end if;
  if (select count(*) from public.fichiers_devis where devis_id = d.devis_id) <> 4 then raise exception 'fichiers de l''ancienne version perdus'; end if;

  -- Échec : journalisé, et un nouvel essai reste possible.
  select * into r from public.reserver_visuel_banderole(d.devis_id, repeat('c', 64), '{}'::jsonb, 1, null, null, null, 'CLIENT');
  perform public.echouer_visuel_banderole(r.visuel_id, 'essai');
  select * into r from public.reserver_visuel_banderole(d.devis_id, repeat('c', 64), '{}'::jsonb, 1, null, null, null, 'CLIENT');
  if r.etat <> 'NOUVEAU' or r.version <> 5 then raise exception 'nouvel essai après échec : %', r; end if;

  -- Le pointeur courant appartient forcément au même devis.
  echec := false;
  begin update public.demandes_grand_format set visuel_courant_id = r.visuel_id where devis_id = d2.devis_id;
  exception when foreign_key_violation then echec := true; end;
  if not echec then raise exception 'visuel d''un autre devis accepté comme courant'; end if;
  delete from public.visuels_banderole where devis_id = d.devis_id and version = 3;
  select * into g from public.demandes_grand_format where devis_id = d.devis_id;
  if g.devis_id is null or g.visuel_courant_id is not null then raise exception 'suppression du visuel courant'; end if;

  -- Devis proposé : le personnel peut régénérer, pas le client. Devis refusé : personne.
  perform public.transitionner_devis(d2.devis_id, 'EN_ANALYSE', null, null, null, 'STAFF');
  perform public.transitionner_devis(d2.devis_id, 'PROPOSE', 40000, null, null, 'STAFF');
  select * into r from public.reserver_visuel_banderole(d2.devis_id, a, '{}'::jsonb, 1, null, null, null, 'STAFF');
  if r.etat <> 'NOUVEAU' then raise exception 'régénération du personnel refusée : %', r; end if;
  if (select origine from public.visuels_banderole where id = r.visuel_id) <> 'STAFF' then raise exception 'origine'; end if;
  echec := false;
  begin perform public.reserver_visuel_banderole(d2.devis_id, b, '{}'::jsonb, 1, null, null, null, 'CLIENT');
  exception when others then echec := sqlerrm like 'VISUEL_STATUT%'; end;
  if not echec then raise exception 'visuel du client accepté sur un devis proposé'; end if;
  perform public.transitionner_devis(d2.devis_id, 'REFUSE', null, null, null, 'STAFF');
  echec := false;
  begin perform public.reserver_visuel_banderole(d2.devis_id, repeat('d', 64), '{}'::jsonb, 1, null, null, null, 'STAFF');
  exception when others then echec := sqlerrm like 'VISUEL_STATUT%'; end;
  if not echec then raise exception 'visuel accepté sur un devis refusé'; end if;
end $$;

-- Profils d'impression.
do $$
declare
  p public.profils_impression;
  v_partenaire uuid;
  echec boolean;
  n integer;
begin
  select count(*) into n from public.profils_impression where est_public and statut = 'A_VALIDER';
  if n <> 6 then raise exception 'profils publics : %', n; end if;
  select * into p from public.profils_impression where est_public and support = 'ROLL_UP';
  if p.ourlet_mm <> 0 or p.fourreau_bas_mm <> 100 or p.marge_securite_mm <> 30 then raise exception 'seed roll-up : %', p; end if;

  -- Validation nominative, retirée dès qu'une valeur sensible change ; le nom seul ne la retire pas.
  echec := false;
  begin update public.profils_impression set statut = 'VALIDE' where id = p.id;
  exception when check_violation then echec := true; end;
  if not echec then raise exception 'validation anonyme acceptée'; end if;
  update public.profils_impression set statut = 'VALIDE', valide_par_email = 'atelier@exemple.test', valide_le = now() where id = p.id;
  update public.profils_impression set nom = 'Roll-up — renommé' where id = p.id returning * into p;
  if p.statut <> 'VALIDE' or p.version <> 1 then raise exception 'renommer a retiré la validation'; end if;
  update public.profils_impression set marge_securite_mm = 40 where id = p.id returning * into p;
  if p.statut <> 'A_VALIDER' or p.valide_par_email is not null or p.version <> 2 then raise exception 'validation non retirée : %', p; end if;

  -- Un seul profil actif par support (public) et par partenaire et support.
  echec := false;
  begin insert into public.profils_impression (nom, support, est_public) values ('Doublon', 'ROLL_UP', true);
  exception when unique_violation then echec := true; end;
  if not echec then raise exception 'second profil public accepté'; end if;
  insert into public.partenaires (nom, specialite) values ('Imprimeur essai profils', 'IMPRESSION') returning id into v_partenaire;
  insert into public.profils_impression (nom, support, partenaire_id, laize_max_mm) values ('Essai', 'BANDEROLE', v_partenaire, 3200);
  echec := false;
  begin insert into public.profils_impression (nom, support, partenaire_id) values ('Essai 2', 'BANDEROLE', v_partenaire);
  exception when unique_violation then echec := true; end;
  if not echec then raise exception 'second profil du partenaire accepté'; end if;
  update public.profils_impression set statut = 'ARCHIVE' where partenaire_id = v_partenaire;
  insert into public.profils_impression (nom, support, partenaire_id) values ('Essai 2', 'BANDEROLE', v_partenaire);
  echec := false;
  begin insert into public.profils_impression (nom, support, est_public, partenaire_id) values ('Mixte', 'BACHE', true, v_partenaire);
  exception when check_violation then echec := true; end;
  if not echec then raise exception 'profil public d''un partenaire accepté'; end if;
  echec := false;
  begin insert into public.profils_impression (nom, support, partenaire_id, dpi_min, dpi_recommande) values ('Dpi', 'BACHE', v_partenaire, 150, 72);
  exception when check_violation then echec := true; end;
  if not echec then raise exception 'dpi recommandé sous le minimum accepté'; end if;
end $$;

-- Archivage à la commande.
do $$
declare
  d record;
  c public.commandes;
  f public.fichiers_commande;
  echec boolean;
  gf jsonb := jsonb_build_object('usage', 'DEUIL', 'support', 'BANDEROLE', 'largeur_m', 3, 'hauteur_m', 1, 'quantite', 1,
    'finition', 'OEILLETS', 'delai', 'STANDARD', 'prestation', 'FICHIER_PRET', 'estimation_detail', '{}'::jsonb);
begin
  select * into d from public.creer_demande_grand_format('cle-visuel-essai-0003', 'DEV-20261126-ARCHIVE1', repeat('3', 64), now() + interval '1 day',
    'Client Essai', null, null, '061234567', '242061234567', 'PARTICULIER', null, 'Une banderole', null, 1, '{}'::jsonb, '{}'::jsonb, null, null, gf);
  insert into public.fichiers_devis (devis_id, nom, chemin, type_mime, taille_octets, type_fichier, checksum, verifie, statut_analyse, expire_le)
  values (d.devis_id, 'visuel-banner-v1.pdf', 'devis/' || d.devis_id || '/visuel-banner-v1.pdf', 'application/pdf', 10, 'VISUEL_IMPRESSION', repeat('a', 64), true, 'PROPRE', now() + interval '90 days');
  perform public.transitionner_devis(d.devis_id, 'EN_ANALYSE', null, null, null, 'STAFF');
  perform public.transitionner_devis(d.devis_id, 'PROPOSE', 40000, null, null, 'STAFF');
  perform public.transitionner_devis(d.devis_id, 'ACCEPTE', null, null, null, 'STAFF');
  c := public.creer_commande_depuis_devis(d.devis_id, 'ELB-ARCHIVE-01', 'MTN_MOMO', 0);
  select * into f from public.fichiers_commande where commande_id = c.id and nom = 'visuel-banner-v1.pdf';
  if f.expire_le > now() + interval '100 days' then raise exception 'conservation déjà longue ?'; end if;

  perform public.archiver_visuel_commande(c.id, jsonb_build_array(
    jsonb_build_object('nom', 'visuel-banner-v1.pdf', 'chemin', 'commandes/' || c.id || '/visuel-banner-v1.pdf', 'type_mime', 'application/pdf', 'taille_octets', 10, 'type_fichier', 'VISUEL_IMPRESSION', 'checksum', repeat('a', 64)),
    jsonb_build_object('nom', 'fiche-production-v1.txt', 'chemin', 'commandes/' || c.id || '/fiche-production-v1.txt', 'type_mime', 'text/plain', 'taille_octets', 10, 'type_fichier', 'FICHE_PRODUCTION', 'checksum', repeat('a', 64))));
  select * into f from public.fichiers_commande where commande_id = c.id and nom = 'visuel-banner-v1.pdf';
  if f.chemin not like 'commandes/%' or f.expire_le < now() + interval '23 months' then raise exception 'archive : %', f; end if;
  if (select count(*) from public.fichiers_commande where commande_id = c.id) <> 2 then raise exception 'doublon de fichier'; end if;
  if not exists (select 1 from public.journal_audit where action = 'VISUEL_BANDEROLE_ARCHIVE' and entite_id = c.id::text) then raise exception 'journal'; end if;
  echec := false;
  begin perform public.archiver_visuel_commande(c.id, jsonb_build_array(jsonb_build_object('nom', 'x.pdf', 'chemin', 'devis/autre/x.pdf', 'type_mime', 'application/pdf', 'taille_octets', 1, 'type_fichier', 'VISUEL_IMPRESSION', 'checksum', 'a')));
  exception when others then echec := true; end;
  if not echec then raise exception 'chemin étranger accepté'; end if;
end $$;

-- Accès : rien pour anon ; lecture seule pour le personnel ; aucune fonction exposée.
do $$
begin
  if has_table_privilege('anon', 'public.visuels_banderole', 'select') then raise exception 'anon lit visuels_banderole'; end if;
  if has_table_privilege('authenticated', 'public.visuels_banderole', 'insert, update, delete') then raise exception 'authenticated écrit'; end if;
  if has_function_privilege('anon', 'public.reserver_visuel_banderole(uuid, text, jsonb, integer, text, uuid, integer, text)', 'execute')
    or has_function_privilege('authenticated', 'public.terminer_visuel_banderole(uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, text, text)', 'execute')
    or has_function_privilege('authenticated', 'public.echouer_visuel_banderole(uuid, text)', 'execute') then
    raise exception 'fonction exposée';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.visuels_banderole'::regclass) then raise exception 'RLS désactivée'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.profils_impression'::regclass) then raise exception 'RLS désactivée (profils)'; end if;
  if has_table_privilege('anon', 'public.profils_impression', 'select') or has_table_privilege('authenticated', 'public.profils_impression', 'update') then raise exception 'profils exposés'; end if;
  if has_function_privilege('authenticated', 'public.archiver_visuel_commande(uuid, jsonb)', 'execute') then raise exception 'archivage exposé'; end if;
  raise notice 'banner_studio : contrôles passés';
end $$;

rollback;
