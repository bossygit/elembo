-- Elembo — lot 2.2 : suivi des devis, sessions, fichiers analysés.
-- Migration 0007. À appliquer après 0006. Aucune donnée existante n'est supprimée.

/* --------------------------------------------------------------- devis ------- */

alter table public.devis
  add column suivi_token_hash text,
  add column suivi_token_expire_le timestamptz,
  add column contact_snapshot jsonb not null default '{}'::jsonb,
  add constraint devis_contact_snapshot_object
    check (jsonb_typeof(contact_snapshot) = 'object');

create unique index devis_suivi_token_hash_unique
  on public.devis (suivi_token_hash)
  where suivi_token_hash is not null;

create index devis_suivi_token_expire_idx
  on public.devis (suivi_token_expire_le)
  where suivi_token_expire_le is not null;

/* ------------------------------------------- historique statuts et prix ----- */

alter table public.historique_statuts_devis
  add column type_evenement text not null default 'STATUT'
    check (type_evenement in ('STATUT', 'PRIX', 'DECISION', 'NOTE')),
  add column ancien_montant_fcfa integer,
  add column nouveau_montant_fcfa integer,
  add column source text not null default 'STAFF'
    check (source in ('STAFF', 'CLIENT', 'SYSTEME'));

create index historique_devis_evenements_idx
  on public.historique_statuts_devis (devis_id, cree_le desc);

/* ------------------------------------------------------- fichiers devis ----- */

alter table public.fichiers_devis
  add column statut_analyse text not null default 'NON_ANALYSE'
    check (statut_analyse in ('NON_ANALYSE', 'EN_ATTENTE', 'PROPRE', 'INFECTE', 'ERREUR')),
  add column analyse_le timestamptz,
  add column analyse_moteur text,
  add constraint fichiers_devis_propre_verifie
    check (statut_analyse <> 'PROPRE' or verifie);

create index fichiers_devis_analyse_idx
  on public.fichiers_devis (statut_analyse)
  where statut_analyse <> 'PROPRE';

/* ------------------------------------------------------- notifications ----- */

alter table public.notifications
  add column prochaine_tentative timestamptz not null default now(),
  add column derniere_tentative timestamptz;

create index notifications_a_envoyer_idx
  on public.notifications (statut, prochaine_tentative)
  where statut in ('A_ENVOYER', 'ECHEC');

/* ---------------------------------------------------- sessions client ------- */

create table public.devis_sessions (
  id uuid primary key default gen_random_uuid(),
  devis_id uuid not null references public.devis (id) on delete cascade,
  sid_hash text not null unique,
  cree_le timestamptz not null default now(),
  expire_le timestamptz not null,
  revoque_le timestamptz,
  revoque_motif text,
  derniere_utilisation_le timestamptz,
  user_agent_hash text,
  ip_hash text
);

create index devis_sessions_actives_idx
  on public.devis_sessions (devis_id)
  where revoque_le is null;

create index devis_sessions_expire_idx
  on public.devis_sessions (expire_le);

alter table public.devis_sessions enable row level security;

revoke all on public.devis_sessions from anon, authenticated;
grant select, insert, update, delete on public.devis_sessions to service_role;

-- Aucune policy anon/authenticated : service_role uniquement.

/* ------------------------------------- historique : statuts + prix traces --- */

-- Fonction existante remplacée, même signature et même trigger.
create or replace function public.verifier_transition_devis()
returns trigger
language plpgsql
as $$
declare
  v_acteur uuid;
  v_source text;
begin
  if new.statut is distinct from old.statut then
    if not public.transition_devis_autorisee(old.statut, new.statut) then
      raise exception 'Transition de devis interdite : % → % (devis %)',
        old.statut, new.statut, old.reference
        using errcode = '23514';
    end if;

    if new.statut = 'PROPOSE' and new.montant_propose_fcfa is null then
      raise exception 'Un devis PROPOSE doit avoir un montant (devis %)', new.reference
        using errcode = '23514';
    end if;

    if new.statut = 'ACCEPTE' then
      if new.montant_propose_fcfa is null then
        raise exception 'Un devis ACCEPTE doit avoir un montant proposé (devis %)', new.reference
          using errcode = '23514';
      end if;
      new.prix_valide := true;
      new.prix_verrouille := true;
    end if;

    v_acteur := coalesce(
      auth.uid(),
      nullif(current_setting('app.acteur_id', true), '')::uuid
    );
    v_source := coalesce(nullif(current_setting('app.source', true), ''), 'STAFF');

    insert into public.historique_statuts_devis
      (devis_id, ancien_statut, nouveau_statut, acteur, note,
       type_evenement, source)
    values
      (new.id, old.statut, new.statut, v_acteur, null, 'STATUT', v_source);
  end if;

  if old.statut = 'ACCEPTE'
     and new.montant_propose_fcfa is distinct from old.montant_propose_fcfa then
    raise exception 'Le prix du devis accepté % est verrouillé', new.reference
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.tracer_prix_devis()
returns trigger
language plpgsql
as $$
declare
  v_acteur uuid;
  v_source text;
begin
  if new.montant_propose_fcfa is distinct from old.montant_propose_fcfa then
    v_acteur := coalesce(
      auth.uid(),
      nullif(current_setting('app.acteur_id', true), '')::uuid
    );
    v_source := coalesce(nullif(current_setting('app.source', true), ''), 'STAFF');

    insert into public.historique_statuts_devis
      (devis_id, ancien_statut, nouveau_statut, acteur, note,
       type_evenement, ancien_montant_fcfa, nouveau_montant_fcfa, source)
    values
      (new.id, new.statut, new.statut, v_acteur, null, 'PRIX',
       old.montant_propose_fcfa, new.montant_propose_fcfa, v_source);
  end if;
  return new;
end;
$$;

create trigger devis_prix_trace
  after update of montant_propose_fcfa on public.devis
  for each row execute function public.tracer_prix_devis();

/* ------------------------------------------------------ sessions : RPC ----- */

create or replace function public.creer_session_devis(
  p_devis_id uuid,
  p_sid_hash text,
  p_expire_le timestamptz,
  p_user_agent_hash text default null,
  p_ip_hash text default null
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_id uuid;
  v_actives integer;
  v_a_revoquer integer;
begin
  if not exists (select 1 from public.devis where id = p_devis_id) then
    raise exception 'Devis inconnu : %', p_devis_id using errcode = '23503';
  end if;
  if p_expire_le <= now() then
    raise exception 'Session déjà expirée' using errcode = '23514';
  end if;

  -- Sérialise toutes les créations de session d'un même devis : la limite de 5
  -- est garantie atomiquement, même avec des requêtes concurrentes.
  perform pg_advisory_xact_lock(
    hashtextextended('devis-sessions:' || p_devis_id::text, 0)
  );

  select count(*) into v_actives
    from public.devis_sessions
   where devis_id = p_devis_id
     and revoque_le is null
     and expire_le > now();

  if v_actives >= 5 then
    v_a_revoquer := greatest(v_actives - 4, 0);
    update public.devis_sessions
       set revoque_le = now(),
           revoque_motif = 'limite de 5 sessions actives'
     where id in (
       select id
         from public.devis_sessions
        where devis_id = p_devis_id
          and revoque_le is null
          and expire_le > now()
        order by cree_le asc
        limit v_a_revoquer
     );
  end if;

  insert into public.devis_sessions
    (devis_id, sid_hash, expire_le, user_agent_hash, ip_hash)
  values
    (p_devis_id, p_sid_hash, p_expire_le, p_user_agent_hash, p_ip_hash)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.session_devis_valide(
  p_sid_hash text,
  p_reference text
) returns uuid
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  select s.devis_id
    from public.devis_sessions s
    join public.devis d on d.id = s.devis_id
   where s.sid_hash = p_sid_hash
     and d.reference = p_reference
     and s.revoque_le is null
     and s.expire_le > now()
   limit 1;
$$;

create or replace function public.revoquer_session_devis(
  p_sid_hash text,
  p_motif text default 'deconnexion'
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_count integer;
begin
  update public.devis_sessions
     set revoque_le = now(),
         revoque_motif = left(coalesce(p_motif, 'deconnexion'), 500)
   where sid_hash = p_sid_hash
     and revoque_le is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.revoquer_sessions_devis(
  p_devis_id uuid,
  p_motif text default 'revocation'
) returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_count integer;
begin
  update public.devis_sessions
     set revoque_le = now(),
         revoque_motif = left(coalesce(p_motif, 'revocation'), 500)
   where devis_id = p_devis_id
     and revoque_le is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.nettoyer_sessions_devis()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_count integer;
begin
  delete from public.devis_sessions
   where expire_le < now() - interval '90 days'
      or (revoque_le is not null and revoque_le < now() - interval '90 days');
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

/* ------------------------------------------------ création atomique --------- */

create or replace function public.creer_devis_atomique(
  p_idempotency_key text,
  p_reference text,
  p_suivi_token_hash text,
  p_suivi_token_expire_le timestamptz,
  p_nom text,
  p_societe text,
  p_email text,
  p_telephone text,
  p_telephone_normalise text,
  p_type_client public.type_client,
  p_ville text,
  p_famille public.famille_produit,
  p_besoin text,
  p_format text,
  p_quantite integer,
  p_specifications jsonb,
  p_contact_snapshot jsonb,
  p_staff_email text,
  p_staff_telegram text,
  p_source text default 'SITE'
) returns table (
  devis_id uuid,
  client_id uuid,
  reference text,
  deja_existant boolean
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_devis public.devis%rowtype;
  v_client_id uuid;
  v_client_count integer;
  v_reference text;
  v_meta jsonb;
  v_corps text;
begin
  if coalesce(trim(p_idempotency_key), '') = '' then
    raise exception 'Clé d''idempotence obligatoire' using errcode = '23514';
  end if;
  if coalesce(trim(p_reference), '') = '' then
    raise exception 'Référence obligatoire' using errcode = '23514';
  end if;
  if p_famille not in ('TEXTILE', 'TABLEAUX', 'IMPRESSION', 'SERVICES') then
    raise exception 'Famille invalide' using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('devis:' || p_idempotency_key, 0));
  if p_email is not null and trim(p_email) <> '' then
    perform pg_advisory_xact_lock(hashtextextended('email:' || lower(trim(p_email)), 0));
  end if;
  if p_telephone_normalise is not null and trim(p_telephone_normalise) <> '' then
    perform pg_advisory_xact_lock(hashtextextended('tel:' || p_telephone_normalise, 0));
  end if;

  select * into v_devis
    from public.devis
   where idempotency_key = p_idempotency_key
   limit 1;
  if found then
    return query
      select v_devis.id, v_devis.client_id, v_devis.reference, true;
    return;
  end if;

  -- Rapprochement conservateur : email d'abord, jamais de fusion contradictoire.
  if p_email is not null and trim(p_email) <> '' then
    select c.id into v_client_id
      from public.clients c
     where lower(c.email) = lower(trim(p_email))
     limit 1;

    if v_client_id is null then
      select count(*) into v_client_count
        from public.clients c
       where c.telephone_normalise = p_telephone_normalise;
      v_meta := jsonb_build_object(
        'source', 'DEVIS',
        'coordonnees_divergentes', v_client_count > 0
      );
      insert into public.clients
        (nom, societe, email, telephone, telephone_normalise, type_client, ville, metadata)
      values
        (trim(p_nom), nullif(trim(p_societe), ''), lower(trim(p_email)),
         trim(p_telephone), p_telephone_normalise, p_type_client, p_ville, v_meta)
      returning id into v_client_id;
    else
      if p_telephone_normalise is not null
         and p_telephone_normalise <> ''
         and exists (
           select 1 from public.clients c
            where c.id = v_client_id
              and coalesce(c.telephone_normalise, '') <> p_telephone_normalise
         ) then
        update public.clients
           set metadata = metadata || jsonb_build_object('telephone_a_verifier', true)
         where id = v_client_id;
      end if;
    end if;
  else
    select count(*) into v_client_count
      from public.clients c
     where c.telephone_normalise = p_telephone_normalise;

    if v_client_count = 1 then
      select c.id into v_client_id
        from public.clients c
       where c.telephone_normalise = p_telephone_normalise
         and lower(trim(c.nom)) = lower(trim(p_nom))
       order by c.cree_le
       limit 1;
    end if;

    if v_client_id is null then
      v_meta := jsonb_build_object(
        'source', 'DEVIS',
        'a_rapprocher', v_client_count > 0
      );
      insert into public.clients
        (nom, societe, email, telephone, telephone_normalise, type_client, ville, metadata)
      values
        (trim(p_nom), nullif(trim(p_societe), ''), null,
         trim(p_telephone), p_telephone_normalise, p_type_client, p_ville, v_meta)
      returning id into v_client_id;
    end if;
  end if;

  insert into public.devis
    (reference, client_id, famille, besoin, format, quantite, specifications,
     statut, source, idempotency_key, suivi_token_hash, suivi_token_expire_le,
     contact_snapshot)
  values
    (p_reference, v_client_id, p_famille, trim(p_besoin), p_format, p_quantite,
     coalesce(p_specifications, '{}'::jsonb), 'NOUVEAU', coalesce(p_source, 'SITE'),
     p_idempotency_key, p_suivi_token_hash, p_suivi_token_expire_le,
     coalesce(p_contact_snapshot, '{}'::jsonb))
  returning * into v_devis;

  v_corps := format(
    'Votre demande de devis %s a bien été reçue. Suivi : %s',
    v_devis.reference,
    '/devis/suivi'
  );

  if p_email is not null and trim(p_email) <> '' then
    insert into public.notifications
      (canal, destinataire, sujet, corps, statut, entite, entite_id,
       cle_idempotence, metadata)
    values
      ('EMAIL', lower(trim(p_email)), 'Demande de devis reçue',
       v_corps, 'A_ENVOYER', 'devis', v_devis.id::text,
       'devis:' || v_devis.id::text || ':client-recu',
       jsonb_build_object('reference', v_devis.reference))
    on conflict (cle_idempotence) do nothing;
  end if;

  if p_staff_email is not null and trim(p_staff_email) <> '' then
    insert into public.notifications
      (canal, destinataire, sujet, corps, statut, entite, entite_id,
       cle_idempotence, metadata)
    values
      ('EMAIL', lower(trim(p_staff_email)), 'Nouvelle demande de devis',
       format('Devis %s — %s — %s', v_devis.reference, p_nom, p_famille),
       'A_ENVOYER', 'devis', v_devis.id::text,
       'devis:' || v_devis.id::text || ':staff-recu-email',
       jsonb_build_object('reference', v_devis.reference))
    on conflict (cle_idempotence) do nothing;
  end if;

  if p_staff_telegram is not null and trim(p_staff_telegram) <> '' then
    insert into public.notifications
      (canal, destinataire, sujet, corps, statut, entite, entite_id,
       cle_idempotence, metadata)
    values
      ('TELEGRAM', p_staff_telegram, 'Nouvelle demande de devis',
       format('Devis %s — %s — %s', v_devis.reference, p_nom, p_famille),
       'A_ENVOYER', 'devis', v_devis.id::text,
       'devis:' || v_devis.id::text || ':staff-recu-telegram',
       jsonb_build_object('reference', v_devis.reference))
    on conflict (cle_idempotence) do nothing;
  end if;

  return query
    select v_devis.id, v_devis.client_id, v_devis.reference, false;
end;
$$;

/* ------------------------------------------------ transitions contrôlées --- */

create or replace function public.transitionner_devis(
  p_devis_id uuid,
  p_nouveau_statut public.statut_devis,
  p_montant integer,
  p_note text,
  p_acteur uuid,
  p_source text default 'STAFF'
) returns public.devis
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_avant public.devis%rowtype;
  v_apres public.devis%rowtype;
begin
  select * into v_avant from public.devis where id = p_devis_id for update;
  if not found then
    raise exception 'Devis inconnu : %', p_devis_id using errcode = '23503';
  end if;
  if not public.transition_devis_autorisee(v_avant.statut, p_nouveau_statut) then
    raise exception 'Transition de devis interdite : % → %', v_avant.statut, p_nouveau_statut
      using errcode = '23514';
  end if;
  if p_nouveau_statut = 'PROPOSE' and p_montant is null then
    raise exception 'Un devis PROPOSE doit avoir un montant' using errcode = '23514';
  end if;
  if p_nouveau_statut = 'ACCEPTE'
     and coalesce(p_montant, v_avant.montant_propose_fcfa) is null then
    raise exception 'Un devis ACCEPTE doit avoir un montant' using errcode = '23514';
  end if;
  if p_source not in ('STAFF', 'CLIENT', 'SYSTEME') then
    raise exception 'Source invalide' using errcode = '23514';
  end if;

  perform set_config('app.acteur_id', coalesce(p_acteur::text, ''), true);
  perform set_config('app.source', p_source, true);

  update public.devis
     set statut = p_nouveau_statut,
         montant_propose_fcfa = coalesce(p_montant, montant_propose_fcfa),
         notes_internes = coalesce(p_note, notes_internes)
   where id = p_devis_id
   returning * into v_apres;

  if p_nouveau_statut in ('REFUSE', 'EXPIRE') then
    perform public.revoquer_sessions_devis(p_devis_id, 'devis ' || p_nouveau_statut);
  end if;

  insert into public.journal_audit
    (acteur, action, entite, entite_id, avant, apres)
  values
    (p_acteur, 'DEVIS_STATUT', 'devis', p_devis_id::text,
     to_jsonb(v_avant), to_jsonb(v_apres));

  return v_apres;
end;
$$;

create or replace function public.decider_devis_public(
  p_devis_id uuid,
  p_decision public.statut_devis
) returns public.devis
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_avant public.devis%rowtype;
  v_apres public.devis%rowtype;
begin
  if p_decision not in ('ACCEPTE', 'REFUSE') then
    raise exception 'Décision client invalide' using errcode = '23514';
  end if;

  select * into v_avant from public.devis where id = p_devis_id for update;
  if not found then
    raise exception 'Devis inconnu : %', p_devis_id using errcode = '23503';
  end if;
  if v_avant.statut <> 'PROPOSE' then
    raise exception 'Le devis n''est pas en attente de décision' using errcode = '23514';
  end if;

  perform set_config('app.acteur_id', '', true);
  perform set_config('app.source', 'CLIENT', true);

  update public.devis
     set statut = p_decision
   where id = p_devis_id
   returning * into v_apres;

  if p_decision = 'REFUSE' then
    perform public.revoquer_sessions_devis(p_devis_id, 'devis REFUSE par le client');
  end if;

  insert into public.journal_audit
    (acteur, action, entite, entite_id, avant, apres)
  values
    (null, 'DEVIS_DECISION_CLIENT', 'devis', p_devis_id::text,
     to_jsonb(v_avant), to_jsonb(v_apres));

  return v_apres;
end;
$$;

/* --------------------------------------------------------- nettoyage ------- */

create or replace function public.lister_devis_a_nettoyer(p_limit integer default 100)
returns table (
  action text,
  devis_id uuid,
  reference text,
  fichier_id uuid,
  chemin text
)
language sql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
  with devis_eligibles as (
    select d.id, d.reference
      from public.devis d
     where d.statut in ('NOUVEAU', 'EN_ANALYSE', 'PROPOSE', 'REFUSE', 'EXPIRE')
       and d.expire_le is not null
       and d.expire_le < now()
       and not exists (
         select 1 from public.commandes c where c.devis_id = d.id
       )
     order by d.expire_le
     limit greatest(p_limit, 0)
  ),
  fichiers_eligibles as (
    select f.id, f.devis_id, f.chemin
      from public.fichiers_devis f
      join public.devis d on d.id = f.devis_id
     where f.expire_le is not null
       and f.expire_le < now()
       and d.statut in ('REFUSE', 'EXPIRE')
       and not exists (
         select 1 from public.commandes c where c.devis_id = d.id
       )
     order by f.expire_le
     limit greatest(p_limit, 0)
  )
  select 'DEVIS'::text, d.id, d.reference, null::uuid, null::text
    from devis_eligibles d
  union all
  select 'FICHIER'::text, f.devis_id, d.reference, f.id, f.chemin
    from fichiers_eligibles f
    join public.devis d on d.id = f.devis_id;
$$;

/* --------------------------------------------------------- privilèges ------ */

revoke all on function public.verifier_transition_devis() from public, anon, authenticated;
revoke all on function public.tracer_prix_devis() from public, anon, authenticated;
revoke all on function public.creer_session_devis(uuid, text, timestamptz, text, text) from public, anon, authenticated;
revoke all on function public.session_devis_valide(text, text) from public, anon, authenticated;
revoke all on function public.revoquer_session_devis(text, text) from public, anon, authenticated;
revoke all on function public.revoquer_sessions_devis(uuid, text) from public, anon, authenticated;
revoke all on function public.nettoyer_sessions_devis() from public, anon, authenticated;
revoke all on function public.creer_devis_atomique(text, text, text, timestamptz, text, text, text, text, text, public.type_client, text, public.famille_produit, text, text, integer, jsonb, jsonb, text, text, text) from public, anon, authenticated;
revoke all on function public.transitionner_devis(uuid, public.statut_devis, integer, text, uuid, text) from public, anon, authenticated;
revoke all on function public.decider_devis_public(uuid, public.statut_devis) from public, anon, authenticated;
revoke all on function public.lister_devis_a_nettoyer(integer) from public, anon, authenticated;

grant execute on function public.creer_session_devis(uuid, text, timestamptz, text, text) to service_role;
grant execute on function public.session_devis_valide(text, text) to service_role;
grant execute on function public.revoquer_session_devis(text, text) to service_role;
grant execute on function public.revoquer_sessions_devis(uuid, text) to service_role;
grant execute on function public.nettoyer_sessions_devis() to service_role;
grant execute on function public.creer_devis_atomique(text, text, text, timestamptz, text, text, text, text, text, public.type_client, text, public.famille_produit, text, text, integer, jsonb, jsonb, text, text, text) to service_role;
grant execute on function public.transitionner_devis(uuid, public.statut_devis, integer, text, uuid, text) to service_role;
grant execute on function public.decider_devis_public(uuid, public.statut_devis) to service_role;
grant execute on function public.lister_devis_a_nettoyer(integer) to service_role;
