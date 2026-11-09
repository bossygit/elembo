-- Elembo — socle Supabase, migration 0005 : stockage privé.
--
-- Deux buckets privés :
--   • `devis`      : fichiers transmis avec une demande de devis ;
--   • `production` : visuels, fiches et BAT d'une commande.
--
-- Aucune politique d'accès n'est créée pour `anon` ou `authenticated` : le navigateur ne lit
-- jamais le bucket directement. Le serveur (service_role) délivre des URL signées d'envoi et
-- de téléchargement, après validation du devis ou de la commande et du rôle de l'utilisateur.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'devis',
    'devis',
    false,
    26214400,
    array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/zip']
  ),
  (
    'production',
    'production',
    false,
    52428800,
    array['application/pdf', 'image/png', 'image/jpeg', 'application/json', 'text/plain']
  )
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- La RLS de `storage.objects` est déjà activée et gérée par Supabase ; le rôle de migration
-- n'en est pas propriétaire, donc on ne la réactive pas ici. Aucune politique n'est créée pour
-- `anon` / `authenticated` : l'accès direct reste refusé par défaut. Le service_role contourne
-- la RLS et reste le seul chemin d'écriture/lecture.
