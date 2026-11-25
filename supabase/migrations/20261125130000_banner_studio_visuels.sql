-- Banner Studio, lot 5 : visuels d'impression rendus par le serveur.
--
-- Additif. Un visuel est une version du document du Studio attachée à un devis, avec son PDF de
-- production. Aucun statut de devis, de commande ou de paiement n'est modifié, et aucun prix n'est lu.
-- Les profils d'imprimeur (`profil_id`) arrivent au lot 6.
--
-- Écriture par `service_role` uniquement, à travers trois fonctions qui tiennent la numérotation des
-- versions et l'idempotence sous verrou du devis.

-- La fiche de production est un texte déposé par le serveur (jamais annoncé par un formulaire). Le PDF
-- peut atteindre 50 Mo ; un fichier envoyé par un client reste limité à 25 Mo par la vérification.
update storage.buckets set file_size_limit = 52428800 where id = 'devis' and file_size_limit < 52428800;
update storage.buckets
set allowed_mime_types = array_append(allowed_mime_types, 'text/plain')
where id = 'devis'
  and not ('text/plain' = any (coalesce(allowed_mime_types, array[]::text[])));

create table if not exists public.visuels_banderole (
  id uuid primary key default gen_random_uuid(),
  devis_id uuid not null references public.devis (id) on delete cascade,
  version integer not null check (version between 1 and 50),
  statut text not null default 'EN_COURS'
    check (statut in ('EN_COURS', 'RENDU', 'A_REVOIR', 'ECHEC', 'ARCHIVE')),
  categorie_modele text check (categorie_modele in (
    'DEUIL', 'EGLISE', 'MARIAGE', 'ANNIVERSAIRE', 'PUBLICITE', 'EVENEMENT_CONFERENCE', 'INSTITUTION')),
  projet jsonb not null check (jsonb_typeof(projet) = 'object'),
  projet_version integer not null check (projet_version >= 1),
  contraintes jsonb not null default '{}'::jsonb check (jsonb_typeof(contraintes) = 'object'),
  preflight jsonb not null default '{}'::jsonb check (jsonb_typeof(preflight) = 'object'),
  avertissements jsonb not null default '[]'::jsonb check (jsonb_typeof(avertissements) = 'array'),
  fichier_projet_id uuid references public.fichiers_devis (id) on delete set null,
  fichier_production_id uuid references public.fichiers_devis (id) on delete set null,
  fichier_fiche_id uuid references public.fichiers_devis (id) on delete set null,
  apercu_chemin text check (apercu_chemin is null or apercu_chemin like 'visuels/%'),
  checksum_projet text not null check (checksum_projet ~ '^[0-9a-f]{64}$'),
  checksum_production text check (checksum_production ~ '^[0-9a-f]{64}$'),
  erreur text check (erreur is null or char_length(erreur) <= 500),
  rendu_le timestamptz,
  cree_le timestamptz not null default now(),
  maj_le timestamptz not null default now(),
  unique (devis_id, version),
  unique (devis_id, id),
  check (octet_length(projet::text) < 1048576),
  -- Le PDF peut être purgé plus tard (conservation) : seule son empreinte est exigée.
  check (statut <> 'RENDU' or (checksum_production is not null and rendu_le is not null))
);

comment on table public.visuels_banderole is
  'Versions d''un visuel Banner Studio rattachées à un devis : document canonique, préflight et PDF de production.';

create index if not exists visuels_banderole_devis_idx on public.visuels_banderole (devis_id, version desc);

drop trigger if exists visuels_banderole_maj_le on public.visuels_banderole;
create trigger visuels_banderole_maj_le before update on public.visuels_banderole
  for each row execute function public.set_maj_le();

alter table public.demandes_grand_format
  add column if not exists visuel_courant_id uuid;

alter table public.demandes_grand_format
  drop constraint if exists demandes_grand_format_visuel_courant_fk;
alter table public.demandes_grand_format
  add constraint demandes_grand_format_visuel_courant_fk
  foreign key (devis_id, visuel_courant_id)
  references public.visuels_banderole (devis_id, id)
  on delete set null (visuel_courant_id);

/* ------------------------------------------------------------------ RLS ---- */

alter table public.visuels_banderole enable row level security;

drop policy if exists visuels_banderole_select_staff on public.visuels_banderole;
create policy visuels_banderole_select_staff on public.visuels_banderole
  for select to authenticated
  using (public.has_role(array['admin', 'commercial', 'finance', 'atelier']));

revoke all on public.visuels_banderole from anon, authenticated;
grant select on public.visuels_banderole to authenticated;
grant all on public.visuels_banderole to service_role;

/* ------------------------------------------------------------ fonctions ---- */

/**
 * Réserve une version à rendre. Sous verrou du devis :
 *   DEJA     le même projet est déjà rendu (ou à revoir) : rien à refaire ;
 *   EN_COURS un rendu du même projet a commencé il y a moins de 5 minutes ;
 *   NOUVEAU  une version est créée, à rendre par l'appelant.
 */
create or replace function public.reserver_visuel_banderole(
  p_devis_id uuid,
  p_checksum text,
  p_projet jsonb,
  p_projet_version integer,
  p_categorie text
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
  select * into v_devis from public.devis d where d.id = p_devis_id for update;
  if not found then raise exception 'Devis introuvable' using errcode = 'P0002'; end if;
  if v_devis.statut not in ('NOUVEAU', 'EN_ANALYSE') then
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

  insert into public.visuels_banderole (devis_id, version, categorie_modele, projet, projet_version, checksum_projet)
  values (p_devis_id, v_version, p_categorie, p_projet, p_projet_version, p_checksum)
  returning * into v;
  visuel_id := v.id; version := v.version; statut := v.statut; etat := 'NOUVEAU';
  return next;
end;
$$;

/**
 * Enregistre le résultat d'un rendu : fichiers du serveur (PROPRE), visuel, pointeur courant.
 * Le visuel rendu précédent est archivé ; ses fichiers restent téléchargeables.
 */
create or replace function public.terminer_visuel_banderole(
  p_visuel_id uuid,
  p_statut text,
  p_projet jsonb,
  p_contraintes jsonb,
  p_preflight jsonb,
  p_avertissements jsonb,
  p_fichiers jsonb,
  p_apercu_chemin text,
  p_checksum_production text
) returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v public.visuels_banderole;
  f jsonb;
  v_id uuid;
  v_projet uuid;
  v_production uuid;
  v_fiche uuid;
begin
  if p_statut not in ('RENDU', 'A_REVOIR') then raise exception 'Statut inattendu' using errcode = '22023'; end if;
  select * into v from public.visuels_banderole b where b.id = p_visuel_id for update;
  if not found then raise exception 'Visuel introuvable' using errcode = 'P0002'; end if;
  perform 1 from public.devis d where d.id = v.devis_id for update;
  if v.statut <> 'EN_COURS' then raise exception 'VISUEL_ETAT : ce visuel n''est plus en cours' using errcode = '55000'; end if;

  for f in select * from jsonb_array_elements(coalesce(p_fichiers, '[]'::jsonb)) loop
    if (f->>'chemin') not like 'devis/' || v.devis_id || '/%' then
      raise exception 'Chemin de fichier inattendu' using errcode = '22023';
    end if;
    insert into public.fichiers_devis (
      devis_id, nom, chemin, type_mime, taille_octets, type_fichier, fournisseur,
      checksum, verifie, verifie_le, statut_analyse, analyse_moteur, analyse_le, expire_le
    ) values (
      v.devis_id, f->>'nom', f->>'chemin', f->>'type_mime', (f->>'taille_octets')::bigint,
      (f->>'type_fichier')::public.type_fichier, 'SUPABASE',
      f->>'checksum', true, now(), 'PROPRE', 'elembo-banner', now(), now() + interval '90 days'
    ) returning id into v_id;
    case f->>'role'
      when 'projet' then v_projet := v_id;
      when 'production' then v_production := v_id;
      when 'fiche' then v_fiche := v_id;
      else raise exception 'Rôle de fichier inattendu' using errcode = '22023';
    end case;
  end loop;
  if p_statut = 'RENDU' and v_production is null then
    raise exception 'VISUEL_PDF : un visuel rendu a un PDF' using errcode = '22023';
  end if;

  if p_statut = 'RENDU' then
    update public.visuels_banderole b set statut = 'ARCHIVE'
      where b.devis_id = v.devis_id and b.statut = 'RENDU';
  end if;

  update public.visuels_banderole b set
    statut = p_statut, projet = p_projet, contraintes = p_contraintes, preflight = p_preflight,
    avertissements = p_avertissements, fichier_projet_id = v_projet, fichier_production_id = v_production,
    fichier_fiche_id = v_fiche, apercu_chemin = p_apercu_chemin, checksum_production = p_checksum_production,
    erreur = null, rendu_le = case when p_statut = 'RENDU' then now() end
  where b.id = v.id;

  update public.demandes_grand_format g set visuel_courant_id = v.id where g.devis_id = v.devis_id;

  insert into public.journal_audit (acteur, action, entite, entite_id, avant, apres)
  values (null, 'VISUEL_BANDEROLE_' || p_statut, 'visuels_banderole', v.id::text, null,
          jsonb_build_object('devis_id', v.devis_id, 'version', v.version, 'checksum_production', p_checksum_production));
end;
$$;

create or replace function public.echouer_visuel_banderole(p_visuel_id uuid, p_erreur text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v public.visuels_banderole;
begin
  update public.visuels_banderole b set statut = 'ECHEC', erreur = left(p_erreur, 500)
    where b.id = p_visuel_id and b.statut = 'EN_COURS' returning * into v;
  if not found then return; end if;
  insert into public.journal_audit (acteur, action, entite, entite_id, avant, apres)
  values (null, 'VISUEL_BANDEROLE_ECHEC', 'visuels_banderole', v.id::text, null,
          jsonb_build_object('devis_id', v.devis_id, 'version', v.version, 'erreur', left(p_erreur, 500)));
end;
$$;

revoke all on function public.reserver_visuel_banderole(uuid, text, jsonb, integer, text) from public, anon, authenticated;
revoke all on function public.terminer_visuel_banderole(uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.echouer_visuel_banderole(uuid, text) from public, anon, authenticated;
grant execute on function public.reserver_visuel_banderole(uuid, text, jsonb, integer, text) to service_role;
grant execute on function public.terminer_visuel_banderole(uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, text, text) to service_role;
grant execute on function public.echouer_visuel_banderole(uuid, text) to service_role;
