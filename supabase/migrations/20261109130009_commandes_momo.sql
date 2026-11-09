-- Elembo — migration 0009 : commandes directes MTN MoMo et synchronisation Supabase.
--
-- Le tunnel direct du configurateur crée la commande AVANT l'appel à MTN. Le paiement
-- n'est pas considéré comme confirmé avant l'enregistrement d'un paiement PAYE ; la
-- production reste donc à faire même après un paiement réussi.
--
-- Cette migration complète 0008 sans la modifier : 0008 reste la base du cycle commercial
-- issu des devis, 0009 ajoute l'entrée directe et la synchronisation MTN.

create or replace function public.creer_commande_directe(
  p_reference text,
  p_nom text,
  p_email text,
  p_telephone text,
  p_telephone_normalise text,
  p_ville text,
  p_adresse text,
  p_sous_total_fcfa integer,
  p_livraison_fcfa integer,
  p_total_fcfa integer,
  p_lignes jsonb,
  p_design_snapshot jsonb default '{}'::jsonb,
  p_mode_paiement public.mode_paiement_commande default 'MTN_MOMO'
) returns public.commandes
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_commande public.commandes;
  v_client public.clients;
  v_ligne jsonb;
  v_produit_id text;
  v_quantite integer;
  v_prix integer;
  v_total_ligne integer;
  v_somme integer := 0;
begin
  if p_reference is null or p_reference !~ '^ELB-[A-Z0-9-]{6,40}$' then
    raise exception 'Référence de commande invalide' using errcode = '23514';
  end if;
  if p_nom is null or length(trim(p_nom)) < 2 then
    raise exception 'Nom du client obligatoire' using errcode = '23514';
  end if;
  if p_telephone is null or length(trim(p_telephone)) < 6 then
    raise exception 'Téléphone du client obligatoire' using errcode = '23514';
  end if;
  if p_sous_total_fcfa is null or p_livraison_fcfa is null or p_total_fcfa is null
     or p_sous_total_fcfa < 0 or p_livraison_fcfa < 0
     or p_total_fcfa <> p_sous_total_fcfa + p_livraison_fcfa then
    raise exception 'Montants de commande incohérents' using errcode = '23514';
  end if;
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) = 0 then
    raise exception 'Commande sans ligne' using errcode = '23514';
  end if;
  if p_mode_paiement is null or p_mode_paiement <> 'MTN_MOMO' then
    raise exception 'La commande directe du configurateur doit être payée par MTN MoMo'
      using errcode = '23514';
  end if;

  select * into v_commande from public.commandes where reference = p_reference;
  if found then
    return v_commande;
  end if;

  -- Réutilisation de la fiche client si l'email ou le téléphone est déjà connu.
  if nullif(trim(p_email), '') is not null then
    select * into v_client
      from public.clients
     where lower(email) = lower(trim(p_email))
     limit 1;
  end if;
  if not found and nullif(trim(p_telephone_normalise), '') is not null then
    select * into v_client
      from public.clients
     where telephone_normalise = trim(p_telephone_normalise)
     limit 1;
  end if;
  if not found then
    insert into public.clients (
      type_client, nom, email, telephone, telephone_normalise, ville, adresse
    ) values (
      'PARTICULIER', trim(p_nom), nullif(lower(trim(p_email)), ''),
      trim(p_telephone), nullif(trim(p_telephone_normalise), ''),
      nullif(trim(p_ville), ''), nullif(trim(p_adresse), '')
    ) returning * into v_client;
  end if;

  insert into public.commandes (
    reference, client_id, statut, statut_paiement, statut_production, statut_livraison,
    sous_total_fcfa, livraison_fcfa, total_fcfa, cout_fcfa, marge_fcfa,
    ville, adresse, notes, design_snapshot, contact_snapshot, mode_paiement,
    idempotency_key, valide_le
  ) values (
    p_reference, v_client.id, 'EN_ATTENTE_DE_PAIEMENT', 'EN_ATTENTE', 'A_FAIRE', 'A_LIVRER',
    p_sous_total_fcfa, p_livraison_fcfa, p_total_fcfa, 0, 0,
    nullif(trim(p_ville), ''), nullif(trim(p_adresse), ''),
    'Commande directe depuis le configurateur',
    coalesce(p_design_snapshot, '{}'::jsonb),
    jsonb_build_object(
      'nom', v_client.nom,
      'societe', v_client.societe,
      'email', v_client.email,
      'telephone', v_client.telephone,
      'ville', v_client.ville
    ),
    'MTN_MOMO',
    'direct:' || p_reference,
    now()
  ) returning * into v_commande;

  for v_ligne in select value from jsonb_array_elements(p_lignes)
  loop
    v_produit_id := nullif(trim(v_ligne->>'produit_id'), '');
    v_quantite := coalesce((v_ligne->>'quantite')::integer, 0);
    v_prix := coalesce((v_ligne->>'prix_unitaire_fcfa')::integer, 0);
    v_total_ligne := coalesce((v_ligne->>'total_ligne_fcfa')::integer, 0);

    if v_quantite <= 0 or v_prix < 0 or v_total_ligne < 0 then
      raise exception 'Ligne de commande invalide' using errcode = '23514';
    end if;
    if v_total_ligne <> v_prix * v_quantite then
      raise exception 'Total de ligne incohérent pour %', coalesce(v_ligne->>'designation', '?')
        using errcode = '23514';
    end if;

    insert into public.lignes_commande (
      commande_id, produit_id, designation, quantite, prix_unitaire_fcfa,
      cout_unitaire_fcfa, total_ligne_fcfa, options
    ) values (
      v_commande.id, v_produit_id,
      coalesce(nullif(trim(v_ligne->>'designation'), ''), 'Article personnalisé'),
      v_quantite, v_prix, 0, v_total_ligne,
      coalesce(v_ligne->'options', '{}'::jsonb)
    );
    v_somme := v_somme + v_total_ligne;
  end loop;

  if v_somme <> p_sous_total_fcfa then
    raise exception 'Somme des lignes % ≠ sous-total %', v_somme, p_sous_total_fcfa
      using errcode = '23514';
  end if;

  insert into public.historique_statuts_commande
    (commande_id, ancien_statut, nouveau_statut, acteur, note)
  values
    (v_commande.id, 'EN_ATTENTE_DE_PAIEMENT', 'EN_ATTENTE_DE_PAIEMENT', null,
     'Création directe configurateur');

  return v_commande;
end;
$$;

/*
 * Synchronisation d'une transaction MTN dans Supabase.
 *
 * Le journal Redis reste la source rapide de la transaction ; Supabase conserve la
 * commande commerciale. La fonction est idempotente par `referenceId`. Le paiement est
 * créé en PENDING puis passé en PAYE : c'est le trigger de paiement qui met la commande
 * à PAYEE et crée la tâche d'atelier. La production reste A_FAIRE.
 */
create or replace function public.synchroniser_paiement_momo(
  p_reference_commande text,
  p_reference_id text,
  p_statut public.statut_transaction,
  p_montant_fcfa integer default null,
  p_financial_tx_id text default null,
  p_raison text default null,
  p_msisdn text default null
) returns public.commandes
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_commande public.commandes;
  v_paiement public.paiements;
  v_montant integer;
  v_msisdn text;
begin
  if p_reference_commande is null or p_reference_id is null or length(trim(p_reference_id)) < 8 then
    raise exception 'Référence de paiement incomplète' using errcode = '23514';
  end if;

  select * into v_commande
    from public.commandes
   where reference = p_reference_commande
   for update;
  if not found then
    return null;
  end if;

  v_montant := coalesce(p_montant_fcfa, v_commande.total_fcfa);
  if v_montant <> v_commande.total_fcfa then
    raise exception 'Paiement MTN % ≠ total commande %', v_montant, v_commande.total_fcfa
      using errcode = '23514';
  end if;
  v_msisdn := coalesce(nullif(trim(p_msisdn), ''), v_commande.contact_snapshot->>'telephone', 'MANUEL');

  select * into v_paiement
    from public.paiements
   where idempotency_key = 'momo:' || p_reference_id
   limit 1;

  if v_paiement.reference_id is null then
    insert into public.paiements (
      commande_id, operateur, montant_fcfa, montant_envoye, msisdn,
      statut, financial_tx_id, raison, idempotency_key, payload
    ) values (
      v_commande.id, 'MTN_MOMO', v_commande.total_fcfa, v_commande.total_fcfa::text,
      v_msisdn, 'PENDING', null, null, 'momo:' || p_reference_id,
      jsonb_build_object('referenceId', p_reference_id, 'source', 'MOMO_DIRECT')
    ) returning * into v_paiement;
  end if;

  -- Une transaction déjà tranchée ne se rejoue pas et ne se rétrograde pas.
  if v_paiement.statut in ('PAYE', 'ECHEC', 'ANOMALIE', 'REMBOURSE')
     and p_statut <> v_paiement.statut then
    return v_commande;
  end if;
  if p_statut = 'PAYE' and v_commande.statut = 'PAYEE' then
    return v_commande;
  end if;

  update public.paiements
     set statut = p_statut,
         financial_tx_id = coalesce(nullif(trim(p_financial_tx_id), ''), financial_tx_id),
         raison = nullif(trim(p_raison), '')
   where reference_id = v_paiement.reference_id;

  select * into v_commande from public.commandes where id = v_commande.id;
  return v_commande;
end;
$$;

revoke all on function public.creer_commande_directe(text, text, text, text, text, text, text, integer, integer, integer, jsonb, jsonb, public.mode_paiement_commande) from public, anon, authenticated;
revoke all on function public.synchroniser_paiement_momo(text, text, public.statut_transaction, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.creer_commande_directe(text, text, text, text, text, text, text, integer, integer, integer, jsonb, jsonb, public.mode_paiement_commande) to service_role;
grant execute on function public.synchroniser_paiement_momo(text, text, public.statut_transaction, integer, text, text, text) to service_role;
