-- Banner Studio, lot 4 : le projet (JSON) accompagne la demande de banderole.
--
-- Additif : le bucket privé `devis` accepte en plus `application/json`. Le serveur n'annonce ce
-- type que pour le projet du Studio (nom et structure vérifiés, 1 Mo au plus) ; le formulaire de
-- devis général continue de le refuser. Aucun accès `anon`/`authenticated` n'est ouvert.

update storage.buckets
set allowed_mime_types = array_append(allowed_mime_types, 'application/json')
where id = 'devis'
  and not ('application/json' = any (coalesce(allowed_mime_types, array[]::text[])));
