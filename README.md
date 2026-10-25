# poj

Monorepo : une app web SvelteKit, qui porte aussi l'API REST, et une app iOS SwiftUI. Les deux sont reliées par un contrat OpenAPI versionné.

```
apps/
  web/                SvelteKit + Prisma + Better Auth + API Hono (/api/v1)      → apps/web/README.md
  ios/                app SwiftUI, client API généré depuis le contrat           → apps/ios/README.md
packages/
  api-contract/       openapi.json exporté par le web, source de vérité des clients
compose.yaml          PostgreSQL de dev (port 5433)
```

## Prérequis

- [Bun](https://bun.sh) et Docker pour le web
- Xcode 26 ou plus récent, et [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`brew install xcodegen`) pour iOS

## Démarrage rapide

```sh
bun install                          # workspace bun (apps/web)
cp apps/web/.env.example apps/web/.env   # renseigner BETTER_AUTH_SECRET
bun run db:start && bun run db:migrate
bun run dev                          # http://localhost:5173 (API : /api/docs)

bun run ios:project                  # génère apps/ios/Poj.xcodeproj
open apps/ios/Poj.xcodeproj          # lancer sur un simulateur (pointe sur localhost:5173)
```

## Le contrat d'API

Le serveur est la source de vérité. Le client Swift est généré à la compilation depuis `packages/api-contract/openapi.json`, via un lien symbolique dans `apps/ios/Packages/PojAPI`.

1. Modifier une route ou un schéma Zod dans `apps/web/src/lib/server/api/`.
2. `bun run api:export`, puis commiter `openapi.json` avec le changement serveur.
3. Rebuilder l'app iOS : le client (`Client`, `Components.Schemas.*`) est régénéré. Les ruptures de contrat deviennent des erreurs de compilation.

`bun run api:check` échoue si le contrat versionné n'est plus à jour. À ajouter en CI.

## Commandes racine

| Commande                                        | Rôle                                                     |
| ----------------------------------------------- | -------------------------------------------------------- |
| `bun run dev` / `build`                         | app web                                                  |
| `bun run check` / `lint` / `test`               | vérifications et tests du web                            |
| `bun run db:start` / `db:migrate`               | Postgres Docker / migrations Prisma                      |
| `bun run sandbox` / `sandbox:reset`             | bac à sable : port 5174, base `poj_sandbox` + seed       |
| `bun run api:export` / `api:check`              | exporte / vérifie le contrat OpenAPI                     |
| `bun run ios:project`                           | (re)génère le projet Xcode depuis `apps/ios/project.yml` |
| `bun run ios:build`                             | build iOS simulateur en ligne de commande                |
| `bun run ios:test`                              | tests du package Swift `PojAPI`                          |
