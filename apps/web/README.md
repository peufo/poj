# poj — web (`apps/web`)

App SvelteKit full-stack (Bun, TypeScript strict) qui expose aussi l'API REST versionnée consommée par l'app iOS (`apps/ios`). Voir le [README racine](../../README.md) pour la vue d'ensemble du monorepo.

Les commandes ci-dessous se lancent depuis `apps/web` (les plus courantes existent aussi à la racine).

**Stack** : SvelteKit 3 · PostgreSQL + Prisma 7 · Better Auth (email/mot de passe + `bearer`, serveur OAuth via `jwt` + `@better-auth/mcp`) · MCP (SDK TypeScript v2) · Hono + `@hono/zod-openapi` · Vitest.

## Structure

```
prisma/
  schema.prisma          schéma unique : modèles d'auth + modèles métier
  migrations/            migrations SQL (commitées)
prisma.config.ts         config de la CLI Prisma (URL de la base, chemins)
src/env.ts               variables d'environnement déclarées pour SvelteKit
src/hooks.server.ts      Better Auth : sert /api/auth/*, met la session dans event.locals
src/lib/server/
  domain/                logique métier en TS pur (aucun import SvelteKit ni Hono)
  db/                    singleton PrismaClient ; generated/ = client généré (ignoré par git)
  auth-config.ts         options Better Auth partagées (plugins bearer, jwt, mcp)
  auth.ts                instance Better Auth de l'app (+ sveltekitCookies)
  oauth-flow.ts          reprise du flux OAuth depuis /login et /oauth/consent
  mcp/                   serveur MCP (outils), route protégée (endpoint.ts)
  testing/               outils de test et de bac à sable (base jetable, fabriques, seed) ; interdit en prod
  api/                   app Hono (basePath /api)
    index.ts             OpenAPI, doc, gestion d'erreurs, montage de /v1
    auth-docs.ts         endpoints Better Auth documentés dans le contrat (pour les clients mobiles)
    middleware/          requireAuth (cookie ou Bearer)
    v1/                  routes versionnées + schémas Zod
scripts/export-openapi.ts  export du contrat vers packages/api-contract/openapi.json
scripts/sandbox.ts         bac à sable : reset, seed, serveur de dev sur la base poj_sandbox
src/routes/
  api/[...path]/         délègue toutes les méthodes HTTP à l'app Hono
  (auth)/                /login, /register
  oauth/consent/         consentement OAuth (connecteur Claude)
  mcp/                   serveur MCP, Streamable HTTP sans état (POST, jeton OAuth)
  .well-known/           métadonnées OAuth (ressource protégée, serveur d'autorisation)
  (app)/                 pages authentifiées (/cards, /logout)
```

**Règle** : les `load` / form actions et les routes API sont de fines couches (validation → appel `domain/` → sérialisation). Toute logique métier vit dans `domain/`. Les services reçoivent le client Prisma en paramètre (`createCardsService(db)`), ce qui les rend testables.

### Conventions du schéma (pensées pour une future synchro hors ligne)

- `id String @id @default(uuid(7)) @db.Uuid` : UUID v7 généré côté serveur, mais un id fourni par le client est accepté.
- `createdAt`, `updatedAt @updatedAt`, suppression logique via `deletedAt`.
- Tables et colonnes en snake_case via `@@map` / `@map`.
- Mutations idempotentes : un `POST` rejoué avec le même `id` renvoie l'existant (200), `PUT /{id}` crée ou remplace, `DELETE` réussit aussi sur une ressource déjà supprimée.

## Démarrage

```sh
cp .env.example .env        # puis renseigner BETTER_AUTH_SECRET (openssl rand -base64 32)
bun install                 # lance aussi `prisma generate`
bun run db:start            # Postgres dans Docker (compose.yaml à la racine), port 5433
bun run db:migrate          # applique les migrations et régénère le client
bun run dev
```

## Commandes

| Commande                                      | Rôle                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| `bun run dev`                                 | serveur de dev                                                            |
| `bun run db:start`                            | démarre Postgres (Docker)                                                 |
| `bun run db:migrate -- --name <nom>`          | crée/applique une migration après modification du schéma, puis `generate` |
| `bun run db:deploy`                           | applique les migrations (CI / prod)                                       |
| `bun run db:generate`                         | régénère le client Prisma                                                 |
| `bun run db:reset`                            | recrée la base de dev                                                     |
| `bun run db:studio`                           | Prisma Studio                                                             |
| `bun run auth:schema`                         | régénère les modèles d'auth dans `schema.prisma` (CLI Better Auth)        |
| `bun run sandbox`                             | `sandbox:reset`, puis l'app sur le port 5174 branchée sur `poj_sandbox`   |
| `bun run sandbox:reset`                       | recrée la base `poj_sandbox` (migrations) et charge la seed               |
| `bun run sandbox:seed`                        | recharge seulement la seed du bac à sable                                 |
| `bun run test:unit -- --run`                  | tests Vitest                                                              |
| `bun run test:unit -- --run --project server` | tests serveur uniquement (services du domaine)                            |
| `bun run check` / `bun run lint`              | vérification des types / lint                                             |
| `bun run api:export`                          | exporte le contrat OpenAPI vers `packages/api-contract/openapi.json`      |
| `bun run api:check`                           | échoue si le contrat versionné n'est plus à jour (à lancer en CI)         |

> **`auth:schema`** réécrit les modèles d'auth avec les conventions de Better Auth (camelCase, `gen_random_uuid()`). Après l'avoir lancé, il faut remettre les `@map` / `@@map` en snake_case et `@default(uuid(7))` (voir le diff), puis lancer `db:migrate`.

Les tests du domaine tournent contre une vraie base PostgreSQL (`DATABASE_URL_TEST`) : la base est créée si besoin et les migrations y sont appliquées automatiquement (`vitest.global-setup.ts`). Chaque spec obtient son client par `useTestDatabase()` (`src/lib/server/testing/db.ts`), qui vide toutes les tables avant chaque test.

### Bac à sable

`bun run sandbox` lance l'app sur [localhost:5174](http://localhost:5174) avec une base dédiée, `poj_sandbox` (`DATABASE_URL_SANDBOX`), recréée à chaque lancement. La base de dev et le `.env` ne sont pas touchés.

- Compte : `sandbox@poj.local` / `sandbox-poj`.
- Seed (`src/lib/server/testing/seed.ts`) : ~25 vraies cartes FR→EN dont l'historique est rejoué par les services du domaine, à des dates relatives à maintenant. Elle couvre les cartes neuves, dues, très en retard, en apprentissage, mûres (avec un oubli), une note encore corrigeable, un indice, un sens inverse mis de côté, un doublon, une carte supprimée, une carte modifiée et les deux origines.
- Le fuzz de FSRS dépend de la date de réponse : d'un chargement à l'autre, les intervalles varient de quelques pour cent, sans changer de catégorie.
- Garde-fou : la remise à zéro et la seed refusent toute base autre que `poj_sandbox` ou `poj_test`, ainsi que `DATABASE_URL`.

## API

- Base : `/api/v1`
- Spécification OpenAPI 3.1 : [`/api/openapi.json`](http://localhost:5173/api/openapi.json)
- Documentation interactive (Scalar) : [`/api/docs`](http://localhost:5173/api/docs)
- Authentification : cookie de session (web) **ou** `Authorization: Bearer <token>` (mobile).
- Erreurs : `{ "error": "unauthorized" | "not_found" | "conflict" | "validation_error", ... }` avec 401 / 404 / 409 / 422.

### Appeler l'API avec un token bearer

Les routes d'auth de Better Auth sont sous `/api/auth/*`. Le token de session est renvoyé dans le header `set-auth-token` :

```sh
BASE=http://localhost:5173

# Inscription (une fois)
curl -X POST $BASE/api/auth/sign-up/email -H 'content-type: application/json' -H "origin: $BASE" \
  -d '{"name":"Ada","email":"ada@example.com","password":"motdepasse123"}'

# Connexion → récupérer le token
TOKEN=$(curl -si -X POST $BASE/api/auth/sign-in/email -H 'content-type: application/json' -H "origin: $BASE" \
  -d '{"email":"ada@example.com","password":"motdepasse123"}' \
  | grep -i '^set-auth-token:' | cut -d' ' -f2 | tr -d '\r')

# Utiliser le token
curl $BASE/api/auth/get-session -H "Authorization: Bearer $TOKEN"
```

Côté mobile : stocker le token dans le Keystore Android et l'envoyer dans le header `Authorization` à chaque requête.

## Connecteur Claude (MCP + OAuth)

Le serveur MCP est servi en `POST /mcp`, protégé par OAuth. Better Auth est le serveur d'autorisation : émetteur `${ORIGIN}/api/auth`, enregistrement dynamique des clients (DCR) sur `/api/auth/oauth2/register`, scope `cards`. Le parcours complet est décrit dans [doc/specs/mcp.md](../../doc/specs/mcp.md).

```sh
BASE=http://localhost:5174   # bac à sable
curl $BASE/.well-known/oauth-protected-resource/mcp
curl $BASE/.well-known/oauth-authorization-server/api/auth
curl -i -X POST $BASE/mcp -H 'content-type: application/json' -d '{}'   # 401 + WWW-Authenticate
```

Avec un jeton d'accès, le MCP Inspector en ligne de commande liste les outils :

```sh
npx @modelcontextprotocol/inspector --cli $BASE/mcp --transport http --method tools/list \
  --header "Authorization: Bearer $ACCESS_TOKEN"
```

Claude ne peut pas joindre `localhost`. Pour le brancher, il faut une URL publique en HTTPS (déploiement ou tunnel) avec `ORIGIN` réglé dessus. On ajoute ensuite `${ORIGIN}/mcp` comme connecteur personnalisé sur claude.ai.
