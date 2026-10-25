-- Recherche de cartes insensible aux accents (`cards.list`) : « ecole » trouve « école ».
-- `unaccent` est une extension de confiance (PostgreSQL 13+) : le propriétaire de la base
-- peut la créer sans être superutilisateur.
CREATE EXTENSION IF NOT EXISTS unaccent;
