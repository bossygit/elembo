-- Elembo — famille de produits « Objets » (mug personnalisé, objets à venir).
--
-- Migration séparée : une valeur ajoutée à un type énuméré n'est utilisable qu'après la
-- validation de la transaction qui l'ajoute. La migration suivante l'emploie.

alter type public.famille_produit add value if not exists 'OBJETS';
