-- Elembo — socle Supabase, migration 0003 : fonctions, transitions, index.

/* ------------------------------------------------------------ updated_at ---- */

create or replace function public.set_maj_le()
returns trigger
language plpgsql
as $$
begin
  new.maj_le = now();
  return new;
end;
$$;

create trigger clients_maj_le before update on public.clients
  for each row execute function public.set_maj_le();
create trigger produits_maj_le before update on public.produits
  for each row execute function public.set_maj_le();
create trigger variantes_produit_maj_le before update on public.variantes_produit
  for each row execute function public.set_maj_le();
create trigger devis_maj_le before update on public.devis
  for each row execute function public.set_maj_le();
create trigger commandes_maj_le before update on public.commandes
  for each row execute function public.set_maj_le();
create trigger paiements_maj_le before update on public.paiements
  for each row execute function public.set_maj_le();
create trigger partenaires_maj_le before update on public.partenaires
  for each row execute function public.set_maj_le();
create trigger travaux_production_maj_le before update on public.travaux_production
  for each row execute function public.set_maj_le();
create trigger notifications_maj_le before update on public.notifications
  for each row execute function public.set_maj_le();
create trigger taches_reconciliation_maj_le before update on public.taches_reconciliation
  for each row execute function public.set_maj_le();
create trigger parametres_maj_le before update on public.parametres
  for each row execute function public.set_maj_le();

/* ------------------------------------------------------ machine à états ------ */

/**
 * Transitions autorisées d'une commande. `PAYEE` est un état daté : il ne signifie jamais
 * « produite ». Toute transition absente de cette liste est refusée par la base.
 */
create or replace function public.transition_commande_autorisee(
  ancien public.statut_commande,
  nouveau public.statut_commande
)
returns boolean
language sql
immutable
as $$
  select case
    when ancien = nouveau then true
    when ancien = 'BROUILLON'
      and nouveau in ('EN_ATTENTE_DE_VALIDATION', 'EN_ATTENTE_DE_PAIEMENT', 'ANNULEE') then true
    when ancien = 'EN_ATTENTE_DE_VALIDATION'
      and nouveau in ('EN_ATTENTE_DE_PAIEMENT', 'BROUILLON', 'ANNULEE') then true
    when ancien = 'EN_ATTENTE_DE_PAIEMENT'
      and nouveau in ('PAYEE', 'ANNULEE', 'EN_ATTENTE_DE_VALIDATION') then true
    when ancien = 'PAYEE'
      and nouveau in ('A_PRODUIRE', 'REMBOURSEMENT_A_TRAITER') then true
    when ancien = 'A_PRODUIRE'
      and nouveau in ('EN_PRODUCTION', 'REMBOURSEMENT_A_TRAITER') then true
    when ancien = 'EN_PRODUCTION'
      and nouveau in ('CONTROLE_QUALITE', 'A_PRODUIRE') then true
    when ancien = 'CONTROLE_QUALITE'
      and nouveau in ('PRETE', 'EN_PRODUCTION') then true
    when ancien = 'PRETE'
      and nouveau in ('EN_LIVRAISON', 'CONTROLE_QUALITE') then true
    when ancien = 'EN_LIVRAISON'
      and nouveau in ('LIVREE', 'PRETE') then true
    when ancien = 'LIVREE'
      and nouveau in ('REMBOURSEMENT_A_TRAITER') then true
    when ancien = 'REMBOURSEMENT_A_TRAITER'
      and nouveau in ('ANNULEE') then true
    else false
  end;
$$;

create or replace function public.verifier_transition_commande()
returns trigger
language plpgsql
as $$
begin
  if new.statut is distinct from old.statut then
    if not public.transition_commande_autorisee(old.statut, new.statut) then
      raise exception 'Transition de commande interdite : % → % (commande %)',
        old.statut, new.statut, old.reference
        using errcode = '23514';
    end if;

    if new.statut = 'PAYEE' and not exists (
      select 1 from public.paiements p
      where p.commande_id = new.id and p.statut = 'PAYE'
    ) then
      raise exception 'La commande % ne peut pas passer PAYEE sans paiement confirmé', new.reference
        using errcode = '23514';
    end if;

    insert into public.historique_statuts_commande
      (commande_id, ancien_statut, nouveau_statut, acteur)
    values
      (new.id, old.statut, new.statut, auth.uid());
  end if;
  return new;
end;
$$;

create trigger commandes_transition
  before update of statut on public.commandes
  for each row execute function public.verifier_transition_commande();

/* --------------------------------------------- synchronisation paiement ------ */

/**
 * Un paiement ne peut être créé que pour une commande en attente de paiement, et pour
 * exactement son total. La base refuse donc une transaction orpheline ou d'un montant
 * différent de la commande, même si le serveur se trompe.
 */
create or replace function public.verifier_paiement_avant_insert()
returns trigger
language plpgsql
as $$
declare
  attendu integer;
begin
  select c.total_fcfa
    into attendu
    from public.commandes c
   where c.id = new.commande_id;

  if attendu is null then
    raise exception 'Paiement refusé : commande % inconnue', new.commande_id
      using errcode = '23503';
  end if;

  if new.montant_fcfa <> attendu then
    raise exception 'Paiement refusé : montant % ≠ total de la commande %', new.montant_fcfa, attendu
      using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.commandes c
     where c.id = new.commande_id
       and c.statut = 'EN_ATTENTE_DE_PAIEMENT'
       and c.statut_paiement <> 'PAYE'
  ) then
    raise exception 'Paiement refusé : la commande % n’est pas en attente de paiement', new.commande_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger paiements_avant_insert
  before insert on public.paiements
  for each row execute function public.verifier_paiement_avant_insert();

/**
 * Le paiement est un enfant de la commande. Une transaction PAYE met à jour la commande une
 * seule fois ; une transaction ECHEC/ANOMALIE ne rétrograde jamais une commande déjà payée.
 */
create or replace function public.synchroniser_paiement_commande()
returns trigger
language plpgsql
as $$
begin
  if new.statut = 'PAYE' then
    if not exists (
      select 1 from public.commandes c
       where c.id = new.commande_id
         and c.statut in (
           'EN_ATTENTE_DE_PAIEMENT', 'PAYEE', 'A_PRODUIRE', 'EN_PRODUCTION',
           'CONTROLE_QUALITE', 'PRETE', 'EN_LIVRAISON', 'LIVREE'
         )
    ) then
      raise exception 'Paiement confirmé pour une commande non payable (%): %', new.commande_id, new.statut
        using errcode = '23514';
    end if;

    update public.commandes
       set statut_paiement = 'PAYE',
           paye_le = coalesce(paye_le, now()),
           statut = case
             when statut = 'EN_ATTENTE_DE_PAIEMENT' then 'PAYEE'::public.statut_commande
             else statut
           end
     where id = new.commande_id
       and statut_paiement <> 'PAYE';

    -- Même si le serveur tombe juste après la confirmation MTN, une tâche de production
    -- existe déjà. L'atelier ne dépend pas d'un appel applicatif ultérieur.
    insert into public.travaux_production
      (commande_id, etape, statut, interne, instructions)
    values
      (new.commande_id, 'INITIALISATION', 'A_FAIRE', true, 'Créée automatiquement après paiement confirmé')
    on conflict (commande_id, etape) do nothing;
  elsif new.statut = 'ANOMALIE' then
    update public.commandes
       set statut_paiement = 'ANOMALIE'
     where id = new.commande_id
       and statut_paiement not in ('PAYE', 'REMBOURSE');
  elsif new.statut = 'ECHEC' then
    update public.commandes
       set statut_paiement = 'ECHEC'
     where id = new.commande_id
       and statut_paiement not in ('PAYE', 'REMBOURSE', 'ANOMALIE');
  elsif new.statut = 'REMBOURSE' then
    update public.commandes
       set statut_paiement = 'REMBOURSE'
     where id = new.commande_id;
  end if;
  return new;
end;
$$;

create trigger paiements_synchronisation
  after update of statut on public.paiements
  for each row execute function public.synchroniser_paiement_commande();

/* --------------------------------------------------------- cycle des devis ---- */

create or replace function public.transition_devis_autorisee(
  ancien public.statut_devis,
  nouveau public.statut_devis
)
returns boolean
language sql
immutable
as $$
  select case
    when ancien = nouveau then true
    when ancien = 'NOUVEAU' and nouveau in ('EN_ANALYSE', 'REFUSE', 'EXPIRE') then true
    when ancien = 'EN_ANALYSE' and nouveau in ('PROPOSE', 'REFUSE', 'EXPIRE') then true
    when ancien = 'PROPOSE' and nouveau in ('ACCEPTE', 'REFUSE', 'EXPIRE') then true
    else false
  end;
$$;

create or replace function public.verifier_transition_devis()
returns trigger
language plpgsql
as $$
begin
  if new.statut is distinct from old.statut then
    if not public.transition_devis_autorisee(old.statut, new.statut) then
      raise exception 'Transition de devis interdite : % → % (devis %)',
        old.statut, new.statut, old.reference
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

    insert into public.historique_statuts_devis
      (devis_id, ancien_statut, nouveau_statut, acteur)
    values
      (new.id, old.statut, new.statut, auth.uid());
  end if;

  -- Un devis accepté conserve son prix, même si la grille change ensuite.
  if old.statut = 'ACCEPTE'
     and new.montant_propose_fcfa is distinct from old.montant_propose_fcfa then
    raise exception 'Le prix du devis accepté % est verrouillé', new.reference
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger devis_transition
  before update of statut on public.devis
  for each row execute function public.verifier_transition_devis();

/* ------------------------------------------------------------------ index ---- */

create unique index clients_email_unique on public.clients (lower(email)) where email is not null;
create index clients_telephone_idx on public.clients (telephone);
create index clients_telephone_normalise_idx on public.clients (telephone_normalise);
create index clients_user_id_idx on public.clients (user_id);

create index produits_famille_idx on public.produits (famille);
create index produits_actif_disponible_idx on public.produits (actif, disponible);

create index devis_client_idx on public.devis (client_id);
create index devis_statut_idx on public.devis (statut);
create index devis_cree_le_idx on public.devis (cree_le desc);
create index fichiers_devis_devis_idx on public.fichiers_devis (devis_id);

create index commandes_client_idx on public.commandes (client_id);
create index commandes_statut_idx on public.commandes (statut);
create index commandes_paiement_idx on public.commandes (statut_paiement);
create index commandes_cree_le_idx on public.commandes (cree_le desc);
create index lignes_commande_commande_idx on public.lignes_commande (commande_id);
create index lignes_commande_produit_idx on public.lignes_commande (produit_id);
create index fichiers_commande_commande_idx on public.fichiers_commande (commande_id);
create index fichiers_commande_expire_idx on public.fichiers_commande (expire_le) where expire_le is not null;
create index fichiers_devis_expire_idx on public.fichiers_devis (expire_le) where expire_le is not null;

create index paiement_evenements_reference_idx on public.paiement_evenements (reference_id, premier_recu_le desc);
create index paiement_evenements_traite_idx on public.paiement_evenements (traite) where not traite;
create index taches_reconciliation_a_faire_idx on public.taches_reconciliation (statut, prochaine_tentative)
  where statut in ('A_FAIRE', 'ECHEC');
create index taches_reconciliation_commande_idx on public.taches_reconciliation (commande_id);

create index paiements_commande_idx on public.paiements (commande_id);
create index paiements_statut_idx on public.paiements (statut);
create index paiements_cree_le_idx on public.paiements (cree_le desc);

create index travaux_production_commande_idx on public.travaux_production (commande_id);
create unique index travaux_production_etape_unique on public.travaux_production (commande_id, etape);
create index travaux_production_partenaire_idx on public.travaux_production (partenaire_id);
create index travaux_production_statut_idx on public.travaux_production (statut);
create index travaux_production_date_idx on public.travaux_production (date_prevue);

create index historique_commandes_commande_idx on public.historique_statuts_commande (commande_id, cree_le desc);
create index historique_devis_devis_idx on public.historique_statuts_devis (devis_id, cree_le desc);
create index mouvements_stock_produit_idx on public.mouvements_stock (produit_id, cree_le desc);
create index mouvements_stock_variante_idx on public.mouvements_stock (variante_id);
create index mouvements_stock_commande_idx on public.mouvements_stock (commande_id);
create index depenses_date_idx on public.depenses (date_depense desc);
create index depenses_categorie_idx on public.depenses (categorie);
create index depenses_budget_idx on public.depenses (ligne_budget_id);

create index journal_audit_entite_idx on public.journal_audit (entite, entite_id, cree_le desc);
create index journal_audit_cree_le_idx on public.journal_audit (cree_le desc);
create index notifications_statut_idx on public.notifications (statut, cree_le);
create index notifications_entite_idx on public.notifications (entite, entite_id);
create index parametres_public_idx on public.parametres (est_public) where est_public;
