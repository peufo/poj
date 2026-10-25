# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Monorepo contenant :

- `apps/web` : SvelteKit 3, qui porte aussi l'API REST ;
- `apps/ios` : app SwiftUI ;
- `packages/api-contract/openapi.json` : le contrat versionné qui relie les deux.

La documentation du projet est en français.

## Commandes

Depuis la racine (délèguent à `@poj/web` via `bun --filter`) :

```sh
bun run dev                 # http://localhost:5173 (docs API : /api/docs)
bun run check               # svelte-check (types)
bun run lint                # prettier --check + eslint
bun run test                # Vitest : projets "client" (navigateur) et "server" (node)
bun run db:start            # Postgres Docker (compose.yaml racine), port 5433
bun run db:migrate          # prisma migrate dev
bun run sandbox             # sandbox:reset, puis l'app sur http://localhost:5174 branchée sur poj_sandbox
bun run sandbox:reset       # recrée poj_sandbox (migrations) et charge la seed
bun run sandbox:seed        # recharge seulement la seed (vide d'abord toutes les tables)
bun run api:export          # régénère packages/api-contract/openapi.json
bun run api:check           # échoue si le contrat versionné est obsolète
bun run ios:project         # XcodeGen : apps/ios/project.yml → Poj.xcodeproj (ignoré par git)
bun run ios:build           # xcodebuild simulateur (-skipPackagePluginValidation)
bun run ios:test            # swift test du package PojAPI
```

Depuis `apps/web`, pour un test ciblé :

```sh
bunx vitest --run --project server                                  # tests serveur seulement
bunx vitest --run src/lib/server/domain/cards/cards.service.spec.ts -t "soft-deletes"
```

- **Base de test :** les tests serveur tournent contre une vraie base PostgreSQL, désignée par `DATABASE_URL_TEST` (`poj_test`).
  - `vitest.global-setup.ts` la crée si besoin, y applique les migrations en attente (`migrate deploy` est sauté si tout est à jour), puis transmet l'URL aux tests via `inject('databaseUrl')`.
  - Les specs passent par `src/lib/server/testing/` : `useTestDatabase()` (client Prisma, toutes les tables vidées avant chaque test), `createUser` / `createCard`, `createTestAuth` (Better Auth minimal). Ce dossier est interdit au code de prod (règle ESLint).
  - Le projet `server` tourne un fichier à la fois et sans isolation (`isolate: false`) : pas d'état global ni de `vi.mock` dans les specs serveur.
- **Bac à sable :** base `poj_sandbox` (`DATABASE_URL_SANDBOX`), jamais la base de dev. La seed (`testing/seed.ts`) crée le compte `sandbox@poj.local` / `sandbox-poj` et ~25 cartes dont l'historique est rejoué par les services à des dates relatives à maintenant. Les outils destructifs refusent toute base autre que `poj_sandbox` / `poj_test`, et `DATABASE_URL`.
- **Projet `client` :** il a besoin du Chromium de Playwright (`bunx playwright install chromium`).

## Architecture web (`apps/web`)

### Couches

`src/lib/server/domain/` contient toute la logique métier. C'est du TS pur :

- aucun import de SvelteKit (`$app/*`) ni de Hono ;
- les imports venant de Prisma sont des imports de **types** uniquement ;
- les services sont des fabriques qui reçoivent le client Prisma (`createNotesService(db)`). Les tests leur passent leur propre `PrismaClient`.

Les `load`, les form actions et les handlers Hono sont de fines couches : validation, puis appel au domaine, puis sérialisation. Les erreurs du domaine (`NotFoundError`, `ConflictError`) sont traduites en 404 et 409 par `api.onError`.

### Requêtes et authentification

- **`hooks.server.ts` :**
  - appelle `auth.api.getSession()`, qui accepte un cookie **ou** un `Authorization: Bearer`, grâce au plugin `bearer` ;
  - remplit `event.locals.user` et `event.locals.session` ;
  - `svelteKitHandler` sert `/api/auth/*` (Better Auth) avant le routage.
- **Le reste de `/api/*` :** `src/routes/api/[...path]/+server.ts` appelle `api.fetch(request, { locals })`.
- **Côté Hono :** le middleware `requireAuth` réutilise `c.env.locals`. Il ne rappelle `getSession` que si ces `locals` sont absents (app montée seule).
- **App Hono :** `api/index.ts` (basePath `/api`), avec les routes versionnées dans `api/v1/`. Toute sous-app se crée avec `createApp()` (`api/factory.ts`), qui partage le `defaultHook` : erreur 422 `validation_error`.

### Serveur MCP et OAuth (connecteur Claude)

- **Serveur d'autorisation :** Better Auth, avec les plugins `jwt` et `mcp` (`@better-auth/mcp`), configurés dans `auth-config.ts` (options partagées par `auth.ts` et `testing/auth.ts`). DCR ouvert, connexion par `/login`, consentement par `/oauth/consent`, scope `cards`, ressource `${ORIGIN}/mcp`, émetteur `${ORIGIN}/api/auth`.
- **Route `/mcp` :** `routes/mcp/+server.ts` (POST seulement, GET/DELETE → 405) appelle `createMcpEndpoint` (`mcp/endpoint.ts`) : `requireMcpAuth` vérifie le JWT via le JWKS, puis l'utilisateur `sub` doit exister. Sans jeton valide : 401 + `WWW-Authenticate` (`resource_metadata`).
- **Découverte :** `svelteKitHandler` ne sert que `/api/auth/*`. Les routes `routes/.well-known/oauth-{protected-resource,authorization-server}/[...path]` passent donc la requête à `auth.handler`, dont les hooks `onRequest` des plugins servent ces chemins.
- **Reprise du flux (`oauth-flow.ts`) :** le plugin redirige vers `/login` ou `/oauth/consent` avec une requête signée (`…&sig=`). Les actions la renvoient en `oauth_query` à `signInEmail` / `oauth2Consent`, avec `oauthApiContext(request)`, puis suivent `{ redirect, url }`.

### Contrat OpenAPI

La spec est construite à partir des `createRoute` et des schémas Zod de `@hono/zod-openapi`.

- **`operationId` :** chaque route doit avoir un `operationId` stable. Il devient le nom de la méthode dans le client Swift.
- **Schémas plats :** éviter `.extend()` sur un schéma déjà nommé avec `.openapi('X')`. Il est exporté en `allOf`, ce qui donne des types Swift illisibles.
- **Endpoints d'auth :** ceux de Better Auth sont _documentés_ dans `api/auth-docs.ts` (`registerPath`) pour que les clients mobiles les génèrent. Le basePath `/api` est ajouté automatiquement : déclarer `/auth/...`.
- **Export :** `scripts/export-openapi.ts` charge le module de l'API via un serveur Vite en `middlewareMode` (`ssrLoadModule`). C'est nécessaire pour que `$app/*` et `#lib/*` soient résolus.
- **Après toute modification d'une route ou d'un schéma :** `bun run api:export`, puis commiter `openapi.json` avec le changement.

### Pièges SvelteKit 3 (version `next`)

- **Alias `#lib/*` :** il passe par le champ `imports` du package.json. Il ne fait **aucune** résolution d'extension ni d'`index` implicite. Écrire le chemin complet en `.js` : `import { db } from '#lib/server/db/index.js'`. Le `.ts` est refusé à cause de `rewriteRelativeImportExtensions`.
- **Types de hooks :** `Handle` s'importe depuis `@sveltejs/kit/hooks`, pas `@sveltejs/kit`.
- **Variables d'environnement :** elles sont déclarées dans `src/env.ts` (`defineEnvVars`) et lues via `$app/env/private`. `DATABASE_URL_TEST` et `DATABASE_URL_SANDBOX` n'y figurent pas : Vitest et `scripts/sandbox.ts` les lisent via `process.env`.

### Prisma 7 et Better Auth

- **Configuration Prisma :**
  - la CLI lit `prisma.config.ts` (URL de la base), pas le schéma ;
  - le générateur est `prisma-client`, avec sortie dans `src/lib/server/db/generated/` (ignoré par git, produit par `prepare` / `db:generate`) ;
  - le client passe par l'adaptateur `PrismaPg` ;
  - les paquets `prisma`, `@prisma/client` et `@prisma/adapter-pg` sont épinglés en 7.10.0, car le tag npm `latest` de `prisma` pointe sur une rc 8.
- **Conventions de schéma** (pensées pour une future synchro hors ligne) :
  - `id String @id @default(uuid(7)) @db.Uuid`, et un id fourni par le client est accepté ;
  - `createdAt` et `updatedAt`, avec suppression logique via `deletedAt` ;
  - tables et colonnes en snake_case via `@@map` / `@map` ;
  - mutations idempotentes : un `POST` rejoué avec le même `id` renvoie l'existant, `PUT` crée ou remplace, `DELETE` réussit même si c'est déjà supprimé.
- **`bun run auth:schema` :** la CLI Better Auth réécrit les modèles d'auth dans `schema.prisma` avec ses propres conventions. Il faut ensuite réappliquer les `@map`/`@@map` en snake_case et `@default(uuid(7))`, puis lancer `db:migrate`.
- **`auth.ts` :** le plugin `sveltekitCookies` doit rester le dernier du tableau `plugins`.
- **Paquets Better Auth :** `better-auth`, `auth`, `@better-auth/mcp` et `@better-auth/oauth-provider` sont épinglés à la même version exacte (1.7.12). Les plugins exigent un `better-auth` de même version (peer deps).
- **Pièges OAuth :**
  - avec Prisma sur PostgreSQL, la ressource MCP doit être déclarée dans `resources` avec `allowedScopes` ;
  - appelé côté serveur, l'authorize du plugin exige `request` : Better Auth renvoie alors une `Response`, sauf si on passe `asResponse: false`. `oauthApiContext` règle les deux, et ajoute `accept: application/json` pour obtenir `{ redirect, url }` au lieu d'une redirection levée ;
  - SvelteKit 3 refuse `redirect()` vers une URL externe sans `{ external: true }`. C'est le cas du `redirect_uri` du client, déjà validé par le plugin ;
  - `requireMcpAuth` télécharge le JWKS par HTTP (`${ORIGIN}/api/auth/jwks`), avec un cache par URL et une recharge au plus toutes les 30 s. Les tests routent `fetch` vers l'instance et gardent la même clé de signature d'un test à l'autre.

## Architecture iOS (`apps/ios`)

- **Projet Xcode :** `project.yml` (XcodeGen) est la seule source. Ne pas éditer `Poj.xcodeproj` ni `Poj/Info.plist` : les deux sont générés.
- **Client API :** `Packages/PojAPI` (package Swift local) génère le client à la compilation avec swift-openapi-generator.
  - `Sources/PojAPI/openapi.json` est un **lien symbolique** vers `packages/api-contract/openapi.json`.
  - La config du générateur utilise `namingStrategy: idiomatic`. Par exemple, l'en-tête `set-auth-token` devient `ok.headers.setAuthToken`.
- **Authentification :** le token Bearer est lu dans l'en-tête `set-auth-token` à la connexion et stocké dans le Keychain (`TokenStore`). `AuthMiddleware` l'ajoute ensuite à chaque requête.
- **URL de l'API :** `API_BASE_URL` vient de `Config/*.xcconfig`. En Debug, c'est `http://localhost:5173`, autorisé par `NSAllowsLocalNetworking`.
- **Toolchain (Xcode 27 / Swift 6.4) :**
  - `swift-collections` est plafonné à `< 1.7.0` dans `Package.swift`. La 1.7.0 référence `swift_initBorrow`, absent des runtimes iOS/macOS 26 : l'app plante au lancement.
  - Seul le runtime simulateur iOS 26.5 est installé.

## Environnement local

- **Base de dev :** Postgres Docker exposé sur **5433**, car un Postgres natif occupe le 5432.
- **Fichier d'environnement :** `apps/web/.env`, modèle dans `apps/web/.env.example`.
