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

alter table storage.objects enable row level security;

-- Aucune politique anon/authenticated : l'accès direct est refusé.
-- Le service_role contourne la RLS et reste le seul chemin d'écriture/lecture.
comment on table storage.objects is
  'Accès direct refusé à anon/authenticated. Les buckets devis/production sont servis par URL signée côté serveur.';
