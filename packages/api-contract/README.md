# api-contract

`openapi.json` : spec OpenAPI 3.1 de l'API poj (routes `/api/v1/*` et endpoints d'auth utiles aux clients mobiles).

**Fichier généré, ne pas l'éditer à la main.** Il est produit par `bun run api:export`, à partir des routes Hono et des schémas Zod de `apps/web`. `bun run api:check` vérifie qu'il est à jour.

Consommateurs :

- `apps/ios/Packages/PojAPI` : client Swift généré par swift-openapi-generator (lien symbolique vers ce fichier).
