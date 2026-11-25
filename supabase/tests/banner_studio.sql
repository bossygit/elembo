-- Vérification des migrations 20261125120000 et 20261125130000 (Banner Studio). Tout est annulé (ROLLBACK).
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
  select * into r from public.reserver_visuel_banderole(d.devis_id, a, '{}'::jsonb, 1, 'DEUIL');
  if r.etat <> 'NOUVEAU' or r.version <> 1 then raise exception 'réservation : %', r; end if;
  select * into r from public.reserver_visuel_banderole(d.devis_id, a, '{}'::jsonb, 1, 'DEUIL');
  if r.etat <> 'EN_COURS' then raise exception 'rendu simultané non détecté : %', r; end if;

  -- Un rendu abandonné (plus de 5 minutes) laisse la place à une nouvelle version.
  update public.visuels_banderole set cree_le = now() - interval '6 minutes' where devis_id = d.devis_id;
  select * into r from public.reserver_visuel_banderole(d.devis_id, a, '{}'::jsonb, 1, 'DEUIL');
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
  select * into r from public.reserver_visuel_banderole(d.devis_id, a, '{}'::jsonb, 1, 'DEUIL');
  if r.etat <> 'DEJA' or r.version <> 2 then raise exception 'idempotence : %', r; end if;
  echec := false;
  begin perform public.terminer_visuel_banderole(r.visuel_id, 'A_REVOIR', '{}', '{}', '{}', '[]', '[]', null, null);
  exception when others then echec := true; end;
  if not echec then raise exception 'visuel terminé réécrit'; end if;

  -- Un projet modifié archive l'ancien visuel sans toucher à ses fichiers.
  select * into r from public.reserver_visuel_banderole(d.devis_id, b, '{}'::jsonb, 1, null);
  perform public.terminer_visuel_banderole(r.visuel_id, 'RENDU', '{}', '{}', '{}', '[]', jsonb_build_array(
    jsonb_build_object('role', 'production', 'nom', 'visuel-banner-v3.pdf', 'chemin', 'devis/' || d.devis_id || '/visuel-banner-v3.pdf', 'type_mime', 'application/pdf', 'taille_octets', 10, 'type_fichier', 'VISUEL_IMPRESSION', 'checksum', b)), null, b);
  if (select statut from public.visuels_banderole where devis_id = d.devis_id and version = 2) <> 'ARCHIVE' then raise exception 'ancien visuel non archivé'; end if;
  if (select count(*) from public.fichiers_devis where devis_id = d.devis_id) <> 4 then raise exception 'fichiers de l''ancienne version perdus'; end if;

  -- Échec : journalisé, et un nouvel essai reste possible.
  select * into r from public.reserver_visuel_banderole(d.devis_id, repeat('c', 64), '{}'::jsonb, 1, null);
  perform public.echouer_visuel_banderole(r.visuel_id, 'essai');
  select * into r from public.reserver_visuel_banderole(d.devis_id, repeat('c', 64), '{}'::jsonb, 1, null);
  if r.etat <> 'NOUVEAU' or r.version <> 5 then raise exception 'nouvel essai après échec : %', r; end if;

  -- Le pointeur courant appartient forcément au même devis.
  echec := false;
  begin update public.demandes_grand_format set visuel_courant_id = r.visuel_id where devis_id = d2.devis_id;
  exception when foreign_key_violation then echec := true; end;
  if not echec then raise exception 'visuel d''un autre devis accepté comme courant'; end if;
  delete from public.visuels_banderole where devis_id = d.devis_id and version = 3;
  select * into g from public.demandes_grand_format where devis_id = d.devis_id;
  if g.devis_id is null or g.visuel_courant_id is not null then raise exception 'suppression du visuel courant'; end if;

  -- Devis avancé : plus de visuel. Devis ordinaire : pas de visuel.
  update public.devis set statut = 'REFUSE' where id = d2.devis_id;
  echec := false;
  begin perform public.reserver_visuel_banderole(d2.devis_id, a, '{}'::jsonb, 1, null);
  exception when others then echec := sqlerrm like 'VISUEL_STATUT%'; end;
  if not echec then raise exception 'visuel accepté sur un devis refusé'; end if;
end $$;

-- Accès : rien pour anon ; lecture seule pour le personnel ; aucune fonction exposée.
do $$
begin
  if has_table_privilege('anon', 'public.visuels_banderole', 'select') then raise exception 'anon lit visuels_banderole'; end if;
  if has_table_privilege('authenticated', 'public.visuels_banderole', 'insert, update, delete') then raise exception 'authenticated écrit'; end if;
  if has_function_privilege('anon', 'public.reserver_visuel_banderole(uuid, text, jsonb, integer, text)', 'execute')
    or has_function_privilege('authenticated', 'public.terminer_visuel_banderole(uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, text, text)', 'execute')
    or has_function_privilege('authenticated', 'public.echouer_visuel_banderole(uuid, text)', 'execute') then
    raise exception 'fonction exposée';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.visuels_banderole'::regclass) then raise exception 'RLS désactivée'; end if;
  raise notice 'banner_studio : contrôles passés';
end $$;

rollback;
