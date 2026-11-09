-- Elembo — migration 0008 : parcours commercial et cycle de vie des commandes.
--
-- La table `commandes` existe depuis 0002. Cette migration ajoute les données
-- commerciales manquantes (mode de paiement, instantané des coordonnées, dates de
-- jalons) et les RPC atomiques de création depuis un devis et de transition.
--
-- Aucune commande n'est créée directement dans le navigateur : `service_role` reste
-- le seul rôle autorisé à écrire, après contrôle du rôle staff côté route.

alter type public.operateur_paiement add value if not exists 'ESPECES';
alter type public.operateur_paiement add value if not exists 'VIREMENT';

do $$ begin
  create type public.mode_paiement_commande as enum (
    'MTN_MOMO',
    'AIRTEL_MONEY',
    'ESPECES',
    'VIREMENT',
    'A_CONFIRMER'
  );
exception when duplicate_object then null; end $$;

alter table public.commandes
  add column if not exists mode_paiement public.mode_paiement_commande not null default 'A_CONFIRMER',
  add column if not exists contact_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists valide_le timestamptz,
  add column if not exists controle_qualite_le timestamptz,
  add column if not exists livraison_demarree_le timestamptz,
  add column if not exists livraison_prevue_le date,
  add column if not exists cloture_le timestamptz,
  add column if not exists remboursement_demande_le timestamptz;

do $$ begin
  alter table public.commandes
    add constraint commandes_contact_snapshot_object
    check (jsonb_typeof(contact_snapshot) = 'object');
exception when duplicate_object then null; end $$;

-- Les commandes antérieures à 0008 n'avaient pas d'instantané de contact. On le
-- complète depuis la fiche client sans écraser une valeur déjà posée.
update public.commandes c
   set contact_snapshot = jsonb_build_object(
     'nom', cl.nom,
     'societe', cl.societe,
     'email', cl.email,
     'telephone', cl.telephone,
     'ville', cl.ville
   )
  from public.clients cl
 where cl.id = c.client_id
   and c.contact_snapshot = '{}'::jsonb;

create index if not exists commandes_mode_paiement_idx
  on public.commandes (mode_paiement);
create index if not exists commandes_livraison_prevue_idx
  on public.commandes (livraison_prevue_le)
  where livraison_prevue_le is not null;

/*
 * Dates de jalons : elles sont posées dans la même transaction que le changement de
 * statut, jamais par un appel applicatif séparé. `PAYEE` reste une étape de paiement ;
 * la production a ses propres dates et son propre statut.
 */
create or replace function public.marquer_dates_commande()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
begin
  if new.statut is not distinct from old.statut then
    return new;
  end if;

  case new.statut
    when 'EN_ATTENTE_DE_PAIEMENT' then
      new.valide_le := coalesce(new.valide_le, now());
      new.statut_paiement := 'EN_ATTENTE';
    when 'PAYEE' then
      new.paye_le := coalesce(new.paye_le, now());
    when 'A_PRODUIRE' then
      new.statut_production := 'A_FAIRE';
    when 'EN_PRODUCTION' then
      new.production_demarree_le := coalesce(new.production_demarree_le, now());
      new.statut_production := 'EN_COURS';
    when 'CONTROLE_QUALITE' then
      new.controle_qualite_le := coalesce(new.controle_qualite_le, now());
      new.statut_production := 'EN_COURS';
    when 'PRETE' then
      new.prete_le := coalesce(new.prete_le, now());
      new.statut_production := 'TERMINE';
    when 'EN_LIVRAISON' then
      new.livraison_demarree_le := coalesce(new.livraison_demarree_le, now());
      new.statut_production := 'TERMINE';
      new.statut_livraison := 'EN_LIVRAISON';
    when 'LIVREE' then
      new.livree_le := coalesce(new.livree_le, now());
      new.cloture_le := coalesce(new.cloture_le, now());
      new.statut_production := 'TERMINE';
      new.statut_livraison := 'LIVREE';
    when 'ANNULEE' then
      new.annulee_le := coalesce(new.annulee_le, now());
      new.statut_production := 'ANNULE';
      new.statut_livraison := 'ECHEC';
    when 'REMBOURSEMENT_A_TRAITER' then
      new.remboursement_demande_le := coalesce(new.remboursement_demande_le, now());
    else
      null;
  end case;

  return new;
end;
$$;

drop trigger if exists commandes_dates on public.commandes;
create trigger commandes_dates
  before update of statut on public.commandes
  for each row execute function public.marquer_dates_commande();

/*
 * La fonction de transition existante est remplacée pour :
 *  - lire l'acteur passé par la RPC dans `app.acteur_id` (service_role n'a pas auth.uid()) ;
 *  - conserver exactement les mêmes règles de transition et le même contrôle de paiement.
 */
create or replace function public.verifier_transition_commande()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_acteur uuid;
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

    v_acteur := coalesce(
      auth.uid(),
      nullif(current_setting('app.acteur_id', true), '')::uuid
    );

    insert into public.historique_statuts_commande
      (commande_id, ancien_statut, nouveau_statut, acteur)
    values
      (new.id, old.statut, new.statut, v_acteur);
  end if;
  return new;
end;
$$;

/*
 * Création d'une commande depuis un devis ACCEPTE. Une seule commande par devis
 * (`devis_id` est unique) ; une clé d'idempotence protège les rejeux réseau.
 * Les fichiers du devis sont copiés dans `fichiers_commande` dans la même transaction.
 */
create or replace function public.creer_commande_depuis_devis(
  p_devis_id uuid,
  p_reference text,
  p_mode_paiement public.mode_paiement_commande,
  p_livraison_fcfa integer,
  p_ville text default null,
  p_adresse text default null,
  p_livraison_prevue date default null,
  p_idempotency_key text default null,
  p_acteur uuid default null
) returns public.commandes
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_devis public.devis;
  v_client public.clients;
  v_commande public.commandes;
  v_total integer;
  v_produit_id text;
begin
  if p_reference is null or p_reference !~ '^ELB-[A-Z0-9-]{6,40}$' then
    raise exception 'Référence de commande invalide' using errcode = '23514';
  end if;
  if p_livraison_fcfa is null or p_livraison_fcfa < 0 then
    raise exception 'Frais de livraison invalides' using errcode = '23514';
  end if;

  select * into v_commande
    from public.commandes
   where devis_id = p_devis_id
      or (p_idempotency_key is not null and idempotency_key = p_idempotency_key)
   limit 1;
  if found then
    return v_commande;
  end if;

  select * into v_devis
    from public.devis
   where id = p_devis_id
   for update;
  if not found then
    raise exception 'Devis inconnu : %', p_devis_id using errcode = '23503';
  end if;
  if v_devis.statut <> 'ACCEPTE' then
    raise exception 'Le devis % doit être accepté avant de créer une commande', v_devis.reference
      using errcode = '23514';
  end if;
  if v_devis.montant_propose_fcfa is null then
    raise exception 'Le devis % n’a pas de montant proposé', v_devis.reference
      using errcode = '23514';
  end if;

  select * into v_client from public.clients where id = v_devis.client_id;
  if not found then
    raise exception 'Client du devis % introuvable', v_devis.reference using errcode = '23503';
  end if;

  v_total := v_devis.montant_propose_fcfa + p_livraison_fcfa;

  -- Le produit est facultatif : un devis de service n'en a pas. On ne crée jamais
  -- de lien vers un produit inexistant ou non fiable.
  v_produit_id := nullif(v_devis.specifications->>'produit', '');
  if v_produit_id is not null and not exists (
    select 1 from public.produits where id = v_produit_id
  ) then
    v_produit_id := null;
  end if;

  insert into public.commandes (
    reference, client_id, devis_id,
    statut, statut_paiement, statut_production, statut_livraison,
    sous_total_fcfa, livraison_fcfa, total_fcfa, cout_fcfa, marge_fcfa,
    ville, adresse, notes, design_snapshot, livraison_prevue_le, idempotency_key,
    mode_paiement, contact_snapshot
  ) values (
    p_reference, v_devis.client_id, v_devis.id,
    'BROUILLON', 'EN_ATTENTE', 'A_FAIRE', 'A_LIVRER',
    v_devis.montant_propose_fcfa, p_livraison_fcfa, v_total, 0, 0,
    coalesce(nullif(trim(p_ville), ''), v_client.ville),
    nullif(trim(p_adresse), ''),
    format('Créée depuis le devis %s', v_devis.reference),
    jsonb_build_object(
      'source', 'DEVIS',
      'devis_reference', v_devis.reference,
      'famille', v_devis.famille,
      'besoin', v_devis.besoin,
      'format', v_devis.format,
      'quantite', v_devis.quantite,
      'specifications', v_devis.specifications
    ),
    p_livraison_prevue,
    p_idempotency_key,
    coalesce(p_mode_paiement, 'A_CONFIRMER'),
    jsonb_build_object(
      'nom', v_client.nom,
      'societe', v_client.societe,
      'email', v_client.email,
      'telephone', v_client.telephone,
      'ville', v_client.ville
    )
  ) returning * into v_commande;

  -- Le devis est une prestation globale : une ligne unique porte le montant accepté.
  -- La quantité demandée et les spécifications restent tracées dans les options.
  insert into public.lignes_commande (
    commande_id, produit_id, designation, quantite, prix_unitaire_fcfa,
    cout_unitaire_fcfa, total_ligne_fcfa, options
  ) values (
    v_commande.id,
    v_produit_id,
    format('Prestation %s — %s', v_devis.famille, left(v_devis.besoin, 120)),
    coalesce(v_devis.quantite, 1),
    case
      when coalesce(v_devis.quantite, 1) > 0
        then floor(v_devis.montant_propose_fcfa::numeric / coalesce(v_devis.quantite, 1))::integer
      else v_devis.montant_propose_fcfa
    end,
    0,
    v_devis.montant_propose_fcfa,
    jsonb_build_object(
      'devis_id', v_devis.id,
      'devis_reference', v_devis.reference,
      'quantite_demandee', v_devis.quantite,
      'specifications', v_devis.specifications
    )
  );

  insert into public.fichiers_commande (
    commande_id, nom, chemin, type_mime, taille_octets, type_fichier,
    fournisseur, checksum, verifie, verifie_le, expire_le
  )
  select
    v_commande.id, nom, chemin, type_mime, taille_octets, type_fichier,
    fournisseur, checksum, verifie, verifie_le, expire_le
  from public.fichiers_devis
  where devis_id = v_devis.id;

  insert into public.historique_statuts_commande
    (commande_id, ancien_statut, nouveau_statut, acteur, note)
  values
    (v_commande.id, 'BROUILLON', 'BROUILLON', p_acteur,
     format('Création depuis le devis %s', v_devis.reference));

  return v_commande;
end;
$$;

/*
 * Transition staff. Les règles sont dans le trigger ; la RPC ne fait que poser le
 * statut et l'acteur dans la même transaction. Une transition refusée ne laisse
 * aucune date partielle.
 */
create or replace function public.transitionner_commande(
  p_commande_id uuid,
  p_statut public.statut_commande,
  p_note text default null,
  p_acteur uuid default null
) returns public.commandes
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_commande public.commandes;
begin
  perform set_config('app.acteur_id', coalesce(p_acteur::text, ''), true);

  update public.commandes
     set statut = p_statut,
         notes = coalesce(nullif(trim(p_note), ''), notes)
   where id = p_commande_id
   returning * into v_commande;

  if not found then
    raise exception 'Commande inconnue : %', p_commande_id using errcode = '23503';
  end if;

  return v_commande;
end;
$$;


/*
 * Confirmation d'un paiement hors passerelle (espèces, virement, ou encaissement
 * Mobile Money saisi par un staff). Le paiement est un enregistrement réel dans
 * `paiements` ; la commande ne passe PAYEE que par le trigger de synchronisation.
 * Aucun appel MTN n'est effectué par cette fonction.
 */
create or replace function public.confirmer_paiement_manuel(
  p_commande_id uuid,
  p_mode_paiement public.mode_paiement_commande,
  p_reference text,
  p_acteur uuid default null
) returns public.commandes
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_commande public.commandes;
  v_operateur public.operateur_paiement;
  v_telephone text;
begin
  if p_reference is null or length(trim(p_reference)) < 3 then
    raise exception 'Référence de paiement obligatoire' using errcode = '23514';
  end if;
  if p_mode_paiement is null or p_mode_paiement = 'A_CONFIRMER' then
    raise exception 'Mode de paiement à confirmer' using errcode = '23514';
  end if;

  select * into v_commande from public.commandes where id = p_commande_id for update;
  if not found then
    raise exception 'Commande inconnue : %', p_commande_id using errcode = '23503';
  end if;
  if v_commande.statut <> 'EN_ATTENTE_DE_PAIEMENT' then
    raise exception 'La commande % n’est pas en attente de paiement', v_commande.reference
      using errcode = '23514';
  end if;
  if exists (
    select 1 from public.paiements
    where commande_id = p_commande_id and statut = 'PAYE'
  ) then
    raise exception 'Un paiement est déjà confirmé pour la commande %', v_commande.reference
      using errcode = '23505';
  end if;

  v_operateur := case p_mode_paiement
    when 'MTN_MOMO' then 'MTN_MOMO'::public.operateur_paiement
    when 'AIRTEL_MONEY' then 'AIRTEL_MONEY'::public.operateur_paiement
    when 'ESPECES' then 'ESPECES'::public.operateur_paiement
    when 'VIREMENT' then 'VIREMENT'::public.operateur_paiement
  end;
  v_telephone := coalesce(v_commande.contact_snapshot->>'telephone', 'MANUEL');

  perform set_config('app.acteur_id', coalesce(p_acteur::text, ''), true);

  insert into public.paiements (
    commande_id, operateur, montant_fcfa, montant_envoye, msisdn,
    statut, financial_tx_id, raison, idempotency_key, payload
  ) values (
    p_commande_id, v_operateur, v_commande.total_fcfa, v_commande.total_fcfa::text,
    v_telephone, 'PENDING', null,
    'Paiement confirmé manuellement par le staff',
    'manuel:' || p_commande_id::text,
    jsonb_build_object('saisie', 'MANUELLE', 'acteur', p_acteur, 'mode', p_mode_paiement)
  );

  -- Le trigger de synchronisation écoute UPDATE OF statut : on confirme donc par
  -- une transition PENDING → PAYE, jamais par un INSERT déjà PAYE.
  update public.paiements
     set statut = 'PAYE', financial_tx_id = trim(p_reference)
   where idempotency_key = 'manuel:' || p_commande_id::text;

  update public.commandes
     set mode_paiement = p_mode_paiement
   where id = p_commande_id
   returning * into v_commande;

  return v_commande;
end;
$$;

revoke all on function public.confirmer_paiement_manuel(uuid, public.mode_paiement_commande, text, uuid) from public, anon, authenticated;
grant execute on function public.confirmer_paiement_manuel(uuid, public.mode_paiement_commande, text, uuid) to service_role;

/* Privilèges : aucun accès direct aux RPC pour le navigateur. */
revoke all on function public.marquer_dates_commande() from public, anon, authenticated;
revoke all on function public.verifier_transition_commande() from public, anon, authenticated;
revoke all on function public.creer_commande_depuis_devis(uuid, text, public.mode_paiement_commande, integer, text, text, date, text, uuid) from public, anon, authenticated;
revoke all on function public.transitionner_commande(uuid, public.statut_commande, text, uuid) from public, anon, authenticated;

grant execute on function public.creer_commande_depuis_devis(uuid, text, public.mode_paiement_commande, integer, text, text, date, text, uuid) to service_role;
grant execute on function public.transitionner_commande(uuid, public.statut_commande, text, uuid) to service_role;
