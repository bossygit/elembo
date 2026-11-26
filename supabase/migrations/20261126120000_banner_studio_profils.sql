-- Banner Studio, lot 6 : profils d'impression et archivage des visuels à la commande.
--
-- Additif. Un profil décrit ce qu'un imprimeur sait réellement faire (marges, ourlets, œillets,
-- fourreaux, laize, pagination, définition). Un profil public par support sert de repli prudent ;
-- un profil propre à un partenaire le remplace dès que ce partenaire est affecté. Aucun profil n'est
-- « validé » sans un acte nominatif, et toute valeur sensible modifiée retire la validation.

create table if not exists public.profils_impression (
  id uuid primary key default gen_random_uuid(),
  nom text not null check (char_length(trim(nom)) between 2 and 120),
  support text not null check (support in ('BANDEROLE', 'BACHE', 'ROLL_UP', 'KAKEMONO', 'X_BANNER', 'PANNEAU')),
  partenaire_id uuid references public.partenaires (id) on delete cascade,
  est_public boolean not null default false,
  statut text not null default 'A_VALIDER' check (statut in ('BROUILLON', 'A_VALIDER', 'VALIDE', 'ARCHIVE')),
  version integer not null default 1 check (version > 0),
  laize_max_mm integer check (laize_max_mm is null or laize_max_mm between 100 and 50000),
  longueur_max_mm integer check (longueur_max_mm is null or longueur_max_mm between 100 and 100000),
  marge_securite_mm integer not null default 50 check (marge_securite_mm between 0 and 1000),
  fond_perdu_mm integer not null default 0 check (fond_perdu_mm between 0 and 100),
  ourlet_mm integer not null default 50 check (ourlet_mm between 0 and 1000),
  oeillet_diametre_mm integer not null default 20 check (oeillet_diametre_mm between 1 and 200),
  oeillet_espacement_mm integer not null default 500 check (oeillet_espacement_mm between 50 and 5000),
  oeillet_marge_mm integer not null default 30 check (oeillet_marge_mm between 0 and 500),
  fourreau_haut_mm integer not null default 60 check (fourreau_haut_mm between 0 and 1000),
  fourreau_bas_mm integer not null default 60 check (fourreau_bas_mm between 0 and 1000),
  dpi_min integer not null default 72 check (dpi_min between 30 and 600),
  dpi_recommande integer not null default 150 check (dpi_recommande between 30 and 600),
  page_max_mm integer not null default 5080 check (page_max_mm between 500 and 5080),
  mode_grand_format text not null default 'PANNEAUX' check (mode_grand_format in ('PANNEAUX', 'PAGE_UNIQUE_USERUNIT')),
  notes text check (notes is null or char_length(notes) <= 2000),
  valide_par uuid references auth.users (id) on delete set null,
  valide_par_email text,
  valide_le timestamptz,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  constraint profils_impression_public check (not est_public or partenaire_id is null),
  constraint profils_impression_prive check (est_public or partenaire_id is not null),
  constraint profils_impression_dpi check (dpi_recommande >= dpi_min),
  constraint profils_impression_validation
    check (statut <> 'VALIDE' or (valide_par_email is not null and valide_le is not null))
);

comment on table public.profils_impression is
  'Contraintes d''impression par support : profil public de repli, ou profil d''un partenaire. Validation nominative.';

create unique index if not exists profils_impression_public_unique
  on public.profils_impression (support) where est_public and statut <> 'ARCHIVE';
create unique index if not exists profils_impression_partenaire_unique
  on public.profils_impression (partenaire_id, support) where partenaire_id is not null and statut <> 'ARCHIVE';

drop trigger if exists profils_impression_maj_le on public.profils_impression;
create trigger profils_impression_maj_le before update on public.profils_impression
  for each row execute function public.set_maj_le();

/** Une valeur qui change l'impression retire la validation et crée une nouvelle version. */
create or replace function public.reinitialiser_validation_profil_impression()
returns trigger
language plpgsql
as $$
begin
  if (new.support, new.laize_max_mm, new.longueur_max_mm, new.marge_securite_mm, new.fond_perdu_mm, new.ourlet_mm,
      new.oeillet_diametre_mm, new.oeillet_espacement_mm, new.oeillet_marge_mm, new.fourreau_haut_mm, new.fourreau_bas_mm,
      new.dpi_min, new.dpi_recommande, new.page_max_mm, new.mode_grand_format)
     is distinct from
     (old.support, old.laize_max_mm, old.longueur_max_mm, old.marge_securite_mm, old.fond_perdu_mm, old.ourlet_mm,
      old.oeillet_diametre_mm, old.oeillet_espacement_mm, old.oeillet_marge_mm, old.fourreau_haut_mm, old.fourreau_bas_mm,
      old.dpi_min, old.dpi_recommande, old.page_max_mm, old.mode_grand_format) then
    new.version := old.version + 1;
    if new.statut = 'VALIDE' then new.statut := 'A_VALIDER'; end if;
    new.valide_par := null;
    new.valide_par_email := null;
    new.valide_le := null;
  end if;
  if new.statut <> 'VALIDE' and old.statut = 'VALIDE' then
    new.valide_par := null;
    new.valide_par_email := null;
    new.valide_le := null;
  end if;
  return new;
end;
$$;

drop trigger if exists profils_impression_validation on public.profils_impression;
create trigger profils_impression_validation before update on public.profils_impression
  for each row execute function public.reinitialiser_validation_profil_impression();

-- Profils publics prudents : les mêmes valeurs que `PROFILS_PUBLICS` (src/lib/banner/constraints.ts).
insert into public.profils_impression (nom, support, est_public, ourlet_mm, fourreau_haut_mm, fourreau_bas_mm, marge_securite_mm, dpi_recommande)
select v.nom, v.support, true, v.ourlet, v.haut, v.bas, v.marge, v.dpi
from (values
  ('Banderole — profil public', 'BANDEROLE', 50, 60, 60, 50, 150),
  ('Bâche de façade — profil public', 'BACHE', 50, 60, 60, 50, 150),
  ('Roll-up — profil public', 'ROLL_UP', 0, 0, 100, 30, 150),
  ('Kakémono — profil public', 'KAKEMONO', 0, 30, 30, 30, 150),
  ('X-banner — profil public', 'X_BANNER', 0, 0, 0, 30, 150),
  ('Panneau rigide — profil public', 'PANNEAU', 0, 0, 0, 20, 200)
) as v(nom, support, ourlet, haut, bas, marge, dpi)
where not exists (select 1 from public.profils_impression p where p.est_public and p.support = v.support and p.statut <> 'ARCHIVE');

/* ----------------------------------------------------- visuels et profils ---- */

alter table public.visuels_banderole
  add column if not exists profil_id uuid references public.profils_impression (id) on delete set null,
  add column if not exists profil_version integer check (profil_version is null or profil_version > 0),
  add column if not exists origine text not null default 'CLIENT' check (origine in ('CLIENT', 'STAFF'));

drop function if exists public.reserver_visuel_banderole(uuid, text, jsonb, integer, text);

/**
 * Comme au lot 5, avec le profil retenu. Le personnel peut aussi régénérer un visuel de devis proposé ou
 * accepté (changement d'imprimeur) ; le client, seulement avant la proposition.
 */
create or replace function public.reserver_visuel_banderole(
  p_devis_id uuid,
  p_checksum text,
  p_projet jsonb,
  p_projet_version integer,
  p_categorie text,
  p_profil_id uuid,
  p_profil_version integer,
  p_origine text
) returns table (visuel_id uuid, version integer, etat text, statut text)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_devis public.devis;
  v public.visuels_banderole;
  v_version integer;
begin
  if p_origine not in ('CLIENT', 'STAFF') then raise exception 'Origine inattendue' using errcode = '22023'; end if;
  select * into v_devis from public.devis d where d.id = p_devis_id for update;
  if not found then raise exception 'Devis introuvable' using errcode = 'P0002'; end if;
  if v_devis.statut not in ('NOUVEAU', 'EN_ANALYSE')
     and not (p_origine = 'STAFF' and v_devis.statut in ('PROPOSE', 'ACCEPTE')) then
    raise exception 'VISUEL_STATUT : le devis n''accepte plus de visuel' using errcode = '55000';
  end if;
  if not exists (select 1 from public.demandes_grand_format g where g.devis_id = p_devis_id) then
    raise exception 'VISUEL_DEMANDE : ce devis n''est pas une demande grand format' using errcode = '22023';
  end if;

  select * into v from public.visuels_banderole b
    where b.devis_id = p_devis_id and b.checksum_projet = p_checksum
      and (b.statut in ('RENDU', 'A_REVOIR') or (b.statut = 'EN_COURS' and b.cree_le > now() - interval '5 minutes'))
    order by b.version desc limit 1;
  if found then
    visuel_id := v.id; version := v.version; statut := v.statut;
    etat := case when v.statut = 'EN_COURS' then 'EN_COURS' else 'DEJA' end;
    return next;
    return;
  end if;

  select coalesce(max(b.version), 0) + 1 into v_version from public.visuels_banderole b where b.devis_id = p_devis_id;
  if v_version > 50 then raise exception 'VISUEL_LIMITE : trop de versions' using errcode = '54000'; end if;

  insert into public.visuels_banderole (devis_id, version, categorie_modele, projet, projet_version, checksum_projet, profil_id, profil_version, origine)
  values (p_devis_id, v_version, p_categorie, p_projet, p_projet_version, p_checksum, p_profil_id, p_profil_version, p_origine)
  returning * into v;
  visuel_id := v.id; version := v.version; statut := v.statut; etat := 'NOUVEAU';
  return next;
end;
$$;

/**
 * Archivage d'un visuel dans sa commande (audit §7.7) : les fichiers, recopiés dans le stockage de
 * production, sont conservés 24 mois. Une ligne déjà copiée depuis le devis (même nom) est mise à jour.
 */
create or replace function public.archiver_visuel_commande(p_commande_id uuid, p_fichiers jsonb)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  f jsonb;
  n integer := 0;
begin
  if not exists (select 1 from public.commandes c where c.id = p_commande_id) then
    raise exception 'Commande introuvable' using errcode = 'P0002';
  end if;
  for f in select * from jsonb_array_elements(coalesce(p_fichiers, '[]'::jsonb)) loop
    if (f->>'chemin') not like 'commandes/' || p_commande_id || '/%' then
      raise exception 'Chemin de fichier inattendu' using errcode = '22023';
    end if;
    insert into public.fichiers_commande (commande_id, nom, chemin, type_mime, taille_octets, type_fichier, fournisseur, checksum, verifie, verifie_le, expire_le)
    values (p_commande_id, f->>'nom', f->>'chemin', f->>'type_mime', (f->>'taille_octets')::bigint, (f->>'type_fichier')::public.type_fichier,
            'SUPABASE', f->>'checksum', true, now(), now() + interval '24 months')
    on conflict (commande_id, nom) do update
      set chemin = excluded.chemin, checksum = excluded.checksum, taille_octets = excluded.taille_octets,
          verifie = true, verifie_le = now(), expire_le = excluded.expire_le;
    n := n + 1;
  end loop;
  insert into public.journal_audit (acteur, action, entite, entite_id, avant, apres)
  values (null, 'VISUEL_BANDEROLE_ARCHIVE', 'commandes', p_commande_id::text, null, jsonb_build_object('fichiers', n));
  return n;
end;
$$;

/* ------------------------------------------------------------------ RLS ---- */

alter table public.profils_impression enable row level security;
drop policy if exists profils_impression_select_staff on public.profils_impression;
create policy profils_impression_select_staff on public.profils_impression
  for select to authenticated
  using (public.has_role(array['admin', 'commercial', 'finance', 'atelier']));

revoke all on public.profils_impression from anon, authenticated;
grant select on public.profils_impression to authenticated;
grant all on public.profils_impression to service_role;

revoke all on function public.reinitialiser_validation_profil_impression() from public, anon, authenticated;
revoke all on function public.reserver_visuel_banderole(uuid, text, jsonb, integer, text, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.archiver_visuel_commande(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.reserver_visuel_banderole(uuid, text, jsonb, integer, text, uuid, integer, text) to service_role;
grant execute on function public.archiver_visuel_commande(uuid, jsonb) to service_role;
