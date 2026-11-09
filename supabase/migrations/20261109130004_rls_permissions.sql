-- Elembo — socle Supabase, migration 0004 : rôles, RLS et permissions.
--
-- Principe : le navigateur ne parle JAMAIS directement aux tables métier.
--   • `anon`     : lecture des seuls produits validés (futur catalogue public) ;
--   • `authenticated` : lecture filtrée par rôle, aucune écriture directe ;
--   • `service_role` : seul rôle qui écrit, utilisé exclusivement par les routes serveur
--     de Next.js après vérification du rôle de l'utilisateur.
--
-- Les écritures passent donc par le serveur, qui porte la logique métier et l'audit. La RLS
-- reste une seconde barrière si une requête directe est tentée avec la clé anon.

/* --------------------------------------------------------------- helpers ----- */

create or replace function public.jwt_role()
returns text
language sql
stable
security invoker
set search_path = public, auth
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');
$$;

create or replace function public.has_role(roles text[])
returns boolean
language sql
stable
security invoker
set search_path = public, auth
as $$
  select public.jwt_role() = any(roles);
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security invoker
set search_path = public, auth
as $$
  select public.has_role(array['admin', 'commercial', 'atelier', 'finance']);
$$;

/**
 * Accessible au personnel, ou au client propriétaire de la commande.
 * `security definer` évite une récursion RLS quand la politique d'une table enfant
 * interroge `commandes` / `clients`.
 */
create or replace function public.commande_accessible(p_commande_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_staff()
      or exists (
        select 1
          from public.commandes c
          join public.clients cl on cl.id = c.client_id
         where c.id = p_commande_id
           and cl.user_id = auth.uid()
      );
$$;

create or replace function public.devis_accessible(p_devis_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.has_role(array['admin', 'commercial', 'finance'])
      or exists (
        select 1
          from public.devis d
          join public.clients cl on cl.id = d.client_id
         where d.id = p_devis_id
           and cl.user_id = auth.uid()
      );
$$;

revoke all on function public.jwt_role() from public;
revoke all on function public.has_role(text[]) from public;
revoke all on function public.is_staff() from public;
revoke all on function public.commande_accessible(uuid) from public;
revoke all on function public.devis_accessible(uuid) from public;

grant execute on function public.jwt_role() to authenticated, service_role;
grant execute on function public.has_role(text[]) to authenticated, service_role;
grant execute on function public.is_staff() to authenticated, service_role;
grant execute on function public.commande_accessible(uuid) to authenticated, service_role;
grant execute on function public.devis_accessible(uuid) to authenticated, service_role;

/* ------------------------------------------------------------------ RLS ------ */

alter table public.clients enable row level security;
alter table public.produits enable row level security;
alter table public.variantes_produit enable row level security;
alter table public.devis enable row level security;
alter table public.fichiers_devis enable row level security;
alter table public.commandes enable row level security;
alter table public.lignes_commande enable row level security;
alter table public.fichiers_commande enable row level security;
alter table public.paiements enable row level security;
alter table public.partenaires enable row level security;
alter table public.travaux_production enable row level security;
alter table public.historique_statuts_commande enable row level security;
alter table public.historique_statuts_devis enable row level security;
alter table public.mouvements_stock enable row level security;
alter table public.lignes_budget enable row level security;
alter table public.depenses enable row level security;
alter table public.journal_audit enable row level security;
alter table public.notifications enable row level security;
alter table public.paiement_evenements enable row level security;
alter table public.taches_reconciliation enable row level security;
alter table public.parametres enable row level security;

/* --------------------------------------------------------------- clients ----- */

create policy clients_select_staff on public.clients
  for select to authenticated
  using (public.has_role(array['admin', 'commercial', 'atelier', 'finance']));

create policy clients_select_self on public.clients
  for select to authenticated
  using (user_id = auth.uid());

/* -------------------------------------------------------------- produits ----- */

create policy produits_select_public on public.produits
  for select to anon
  using (actif and disponible and statut_prix = 'VALIDE');

create policy produits_select_staff on public.produits
  for select to authenticated
  using (public.is_staff());

create policy variantes_select_public on public.variantes_produit
  for select to anon
  using (
    actif
    and exists (
      select 1 from public.produits p
      where p.id = variantes_produit.produit_id
        and p.actif and p.disponible and p.statut_prix = 'VALIDE'
    )
  );

create policy variantes_select_staff on public.variantes_produit
  for select to authenticated
  using (public.is_staff());

/* ----------------------------------------------------------------- devis ----- */

create policy devis_select_staff on public.devis
  for select to authenticated
  using (public.has_role(array['admin', 'commercial', 'finance']));

create policy devis_select_self on public.devis
  for select to authenticated
  using (
    exists (
      select 1 from public.clients cl
      where cl.id = devis.client_id and cl.user_id = auth.uid()
    )
  );

create policy fichiers_devis_select on public.fichiers_devis
  for select to authenticated
  using (public.devis_accessible(devis_id));

/* ------------------------------------------------------------- commandes ----- */

create policy commandes_select_staff on public.commandes
  for select to authenticated
  using (public.is_staff());

create policy commandes_select_self on public.commandes
  for select to authenticated
  using (
    exists (
      select 1 from public.clients cl
      where cl.id = commandes.client_id and cl.user_id = auth.uid()
    )
  );

create policy lignes_commande_select on public.lignes_commande
  for select to authenticated
  using (public.commande_accessible(commande_id));

create policy fichiers_commande_select on public.fichiers_commande
  for select to authenticated
  using (public.commande_accessible(commande_id));

create policy paiements_select_finance on public.paiements
  for select to authenticated
  using (public.has_role(array['admin', 'finance']));

create policy historique_commandes_select on public.historique_statuts_commande
  for select to authenticated
  using (public.has_role(array['admin', 'commercial', 'atelier', 'finance']));

create policy historique_devis_select on public.historique_statuts_devis
  for select to authenticated
  using (public.has_role(array['admin', 'commercial', 'finance']));

/* -------------------------------------------------------------- production --- */

create policy partenaires_select on public.partenaires
  for select to authenticated
  using (public.is_staff());

create policy travaux_production_select on public.travaux_production
  for select to authenticated
  using (public.has_role(array['admin', 'commercial', 'atelier', 'finance']));

/* ------------------------------------------------------- stock / finances ---- */

create policy mouvements_stock_select on public.mouvements_stock
  for select to authenticated
  using (public.has_role(array['admin', 'atelier', 'finance']));

create policy lignes_budget_select on public.lignes_budget
  for select to authenticated
  using (public.has_role(array['admin', 'finance']));

create policy depenses_select on public.depenses
  for select to authenticated
  using (public.has_role(array['admin', 'finance']));

create policy journal_audit_select on public.journal_audit
  for select to authenticated
  using (public.has_role(array['admin', 'finance']));

create policy notifications_select on public.notifications
  for select to authenticated
  using (public.has_role(array['admin', 'commercial']));

create policy paiement_evenements_select on public.paiement_evenements
  for select to authenticated
  using (public.has_role(array['admin', 'finance']));

create policy taches_reconciliation_select on public.taches_reconciliation
  for select to authenticated
  using (public.has_role(array['admin', 'finance']));

/* -------------------------------------------------------------- paramètres --- */

create policy parametres_select_public on public.parametres
  for select to anon, authenticated
  using (est_public);

create policy parametres_select_staff on public.parametres
  for select to authenticated
  using (public.is_staff());

/* --------------------------------------------------------------- grants ------ */

revoke all on all tables in schema public from anon, authenticated;

grant usage on schema public to anon, authenticated, service_role;

-- Lecture publique limitée aux produits validés (la RLS filtre les lignes).
grant select on public.produits, public.variantes_produit to anon;
grant select on public.parametres to anon;

-- Lecture authentifiée : la RLS filtre les lignes et les rôles.
grant select on public.clients to authenticated;
grant select on public.produits to authenticated;
grant select on public.variantes_produit to authenticated;
grant select on public.devis to authenticated;
grant select on public.fichiers_devis to authenticated;
grant select on public.commandes to authenticated;
grant select on public.lignes_commande to authenticated;
grant select on public.fichiers_commande to authenticated;
grant select on public.paiements to authenticated;
grant select on public.partenaires to authenticated;
grant select on public.travaux_production to authenticated;
grant select on public.historique_statuts_commande to authenticated;
grant select on public.historique_statuts_devis to authenticated;
grant select on public.mouvements_stock to authenticated;
grant select on public.lignes_budget to authenticated;
grant select on public.depenses to authenticated;
grant select on public.journal_audit to authenticated;
grant select on public.notifications to authenticated;
grant select on public.paiement_evenements to authenticated;
grant select on public.taches_reconciliation to authenticated;
grant select on public.parametres to authenticated;

-- Écritures : service_role uniquement. Aucun INSERT/UPDATE/DELETE n'est accordé au navigateur.
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
