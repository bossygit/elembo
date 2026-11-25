-- Vérification de la migration 20261125120000 (Banner Studio). Tout est annulé (ROLLBACK).
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
  if cardinality(b.allowed_mime_types) <> 6 then raise exception 'types inattendus : %', b.allowed_mime_types; end if;
  if b.public or b.file_size_limit <> 26214400 then raise exception 'bucket devis : accès ou limite modifiés'; end if;

  -- Rejouer la migration n'ajoute pas de doublon.
  update storage.buckets
  set allowed_mime_types = array_append(allowed_mime_types, 'application/json')
  where id = 'devis' and not ('application/json' = any (coalesce(allowed_mime_types, array[]::text[])));
  select * into b from storage.buckets where id = 'devis';
  if cardinality(b.allowed_mime_types) <> 6 then raise exception 'migration non idempotente'; end if;

  -- Le bucket reste fermé au navigateur.
  if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
             and (roles && array['anon', 'authenticated']::name[]) and (coalesce(qual, '') || coalesce(with_check, '')) like '%devis%') then
    raise exception 'une politique ouvre le bucket devis';
  end if;

  raise notice 'banner_studio : contrôles passés';
end $$;

rollback;
