---
id: t15
title: Préparer la mise en ligne (migration unique, vérification de la stack de prod, checklist de déploiement)
status: done
priority: high
story: doc/story/connexion-assistants.md
plan_required: true
review: required
model: opus
effort: high
zones: [apps/web/prisma, apps/web/Dockerfile, compose.yaml, .github/workflows, doc/deploiement.md, apps/web/src/lib/server/testing/seed.ts]
branch: ticket/t15-preparer-mise-en-ligne
agent: a38ed2f5ccb0cb921
created: 2026-10-29
updated: 2026-10-29
---

## Context
Rien n'est encore en ligne. Le développeur veut mettre l'app en ligne, notamment pour tester le connecteur Claude.ai : t8-comportement-claude en dépend, et l'arrivée des testeurs de t7 aussi. Il avait prévu de remplacer `prisma/migrations` par une seule migration propre avant la mise en ligne (note de `.ork/config.md`). Le déploiement passe par `main` (GitHub Actions → GHCR → webhook Dokploy), voir `doc/deploiement.md`.

Le push sur `main` et les réglages Dokploy reviennent au développeur. L'ouvrier prépare le dépôt et la checklist.

## Done criteria
- [ ] `apps/web/prisma/migrations` ne contient plus qu'une migration initiale, générée depuis le `schema.prisma` courant. Les conventions sont respectées (`@map` snake_case, `uuid(7)`, `deletedAt`).
- [ ] La marche à suivre pour la base de dev locale et pour `poj_test` (reset) est donnée au développeur.
- [ ] `bun run sandbox:reset` et la seed passent sur la migration unique.
- [ ] `bun run stack:up` démarre l'image de prod en local. `prisma migrate deploy` s'applique sur une base vide, et `/register` crée le premier compte, qui est admin.
- [ ] `doc/deploiement.md` contient une checklist de mise en ligne :
  - variables d'environnement requises (`ORIGIN`, secret Better Auth, `DATABASE_URL`, clé DeepL…) ;
  - `ORIGIN` et l'en-tête `Host` / `PROTOCOL_HEADER` derrière le proxy (piège d'adapter-node, voir `CLAUDE.md`) ;
  - découverte OAuth (`/.well-known/...`) et JWKS joignables sur l'`ORIGIN` de prod ;
  - création du compte admin ;
  - ajout du connecteur MCP sur Claude.ai (URL `${ORIGIN}/mcp`).
- [ ] Une vérification de fumée après le déploiement est décrite (login, `/admin`, invitation, `/mcp` en 401 sans jeton avec `WWW-Authenticate`).
- [ ] La note « Migrations » de `.ork/config.md` sera retirée par le chef après l'intégration.
- [ ] `compose.yaml` fixe `name: poj`, pour que `stack:up` lancé depuis un worktree réutilise les conteneurs du projet au lieu d'en créer de nouveaux (découverte de t14).
- [ ] Les tests passent.

## Plan
(rendu par l'ouvrier le 2026-10-29)

1. **Préparer le worktree :** `bun install`, puis copier `apps/web/.env` et le `.env` racine.
2. **Remplacer les migrations :**
   - supprimer les 8 migrations ;
   - générer `<horodatage>_init` avec `prisma migrate diff --from-empty --to-schema` ;
   - ajouter à la main l'extension `unaccent` et le CHECK `decks_language_pair`, que Prisma ne génère pas ;
   - le backfill admin disparaît, puisque `signUpHooks` rend déjà admin le premier compte ;
   - garder `migration_lock.toml`.
3. **Vérifier la migration :**
   - supprimer `poj_test`, que le global-setup recrée ;
   - `sandbox:reset` ;
   - `migrate diff --from-url <sandbox> --exit-code` doit être vide ;
   - contrôler `unaccent` et le CHECK par psql.
4. **`compose.yaml` :** ajouter `name: poj`. C'est déjà le nom de projet effectif, donc rien n'est recréé.
5. **Stack de prod depuis le worktree :**
   - vider la base locale `poj`, puis `stack:up` ;
   - contrôler : `migrate deploy` sur base vide, `/register` qui crée un admin, `/admin`, la découverte OAuth, le JWKS (y compris depuis le conteneur) et `/mcp` en 401 ;
   - `stack:stop`.
6. **`doc/deploiement.md`, checklist de mise en ligne,** dans l'ordre : DNS, Postgres Dokploy, image, variables (`ORIGIN` sans barre finale, `BETTER_AUTH_SECRET` immuable, `DATABASE_URL` interne, `DEEPL_API_KEY` facultative), HTTPS, webhook, secret GitHub, push. Elle explique aussi le piège `Host` / `PROTOCOL_HEADER` derrière Traefik.
7. **`doc/deploiement.md`, vérification après déploiement :**
   - les commandes curl : découverte, JWKS, `/mcp` en 401 avec `WWW-Authenticate` ;
   - le parcours manuel : admin, invitation en navigation privée, connecteur claude.ai ;
   - corriger au passage la puce « Poj n'a qu'un compte ».
8. **Finaliser :** lancer les tests, faire 3 commits, rebaser sur dev et relancer les tests.

**Décisions proposées :**
- **Nom de la migration :** un nouveau nom horodaté, plutôt que de réutiliser `…_init`. Une base restée sur l'ancien historique échoue alors bruyamment, au lieu de diverger en silence.
- **Migrations à venir :** celles de t5, t6 et t12 s'empileront sur l'init, à condition qu'aucune ne soit générée avant l'intégration de t15.
- **`PROTOCOL_HEADER` :** facultatif derrière Traefik. L'essentiel est un `Host` égal au domaine, et un accès par le domaine seulement.
- **Ni CI ni Dockerfile modifiés,** sauf si un problème apparaît.

**Risques :**
- **`poj_test` est partagée :** il faut intégrer t14 avant l'exécution de t15.
- **Base de dev locale :** elle sera en dérive après l'intégration.
- **`unaccent` et le CHECK** sont invisibles pour `migrate diff`, d'où le contrôle par psql.
- **OAuth et JWKS de prod :** vérifiables seulement une fois en ligne.

**Hors périmètre signalé :** `doc/specs/mcp.md` (« Exposition : mon compte, le seul existant ») est à corriger, et la note « Migrations » de `.ork/config.md` est à retirer après l'intégration.

## Questions
- 2026-10-29 — **Q1, base de dev locale après l'intégration** (à faire par le développeur) :
  - A, garder les données : vérifier l'écart par `migrate diff`, puis `DELETE FROM _prisma_migrations` et `migrate resolve --applied <init>` ;
  - B, tout recréer : `db:reset`, qui détruit les données de dev ;
  - l'ouvrier recommande A si les données ont de la valeur, sinon B.
- 2026-10-29 — **Q2, base locale `poj` de la stack** (0 utilisateur) :
  - A, autoriser `DROP DATABASE poj WITH (FORCE)` avant `stack:up`, pour tester sur une base vide ;
  - B, ne pas y toucher, et le critère n'est pas vérifié ;
  - l'ouvrier recommande A.
- 2026-10-29 — **Q3, global-setup qui recrée `poj_test` si l'historique diverge :**
  - A, oui (une dizaine de lignes) ;
  - B, non : une consigne manuelle, car la divergence n'arrive qu'une fois ;
  - l'ouvrier recommande B.
- 2026-10-30 — **Réponses du développeur :**
  - Q1 : B, il lancera lui-même `db:reset` sur sa base de dev après l'intégration ;
  - Q2 : oui, vider la base locale `poj` est autorisé ;
  - Q3 : non, une consigne manuelle suffit.
  - **Plan validé.**

## Review
- **Rapport DONE du 2026-10-30.** 3 commits, worktree `.claude/worktrees/t15-preparer-mise-en-ligne` (recréé par l'ouvrier, l'original avait disparu).
  - Migration unique `20261030084028_init`, avec `unaccent` et le CHECK ajoutés à la main ; `CREATE SCHEMA public` et l'`UPDATE` admin sont retirés.
  - `name: poj` dans `compose.yaml`.
  - Checklist de mise en ligne et vérification après déploiement dans `doc/deploiement.md` ; ligne « Exposition » de `doc/specs/mcp.md` corrigée.
  - Vérifié : `sandbox:reset` ; `stack:up` sur base vide (admin créé, découverte OAuth, JWKS, `/mcp` en 401).
  - Tests : 201 au vert, contrat à jour.
- **À relire en premier :**
  - `apps/web/prisma/migrations/20261030084028_init/migration.sql:1` : en-tête et ajouts manuels (lignes 8 et 506) ; le CHECK est invisible pour `migrate diff` et a été contrôlé par psql.
  - `doc/deploiement.md:56` : la checklist renvoie aux sections existantes ; les variables sont listées à la ligne 31, avec `PROTOCOL_HEADER`.
  - `doc/specs/mcp.md:20` : nouvelle formulation de « Exposition ».
- **Revue auto `/simplify` :** 1 correction appliquée. Points restants :
  - `migration.sql:395` : un index redondant, qui vient du modèle Better Auth ; laissé en place.
  - `vitest.global-setup.ts` : la recréation automatique est écartée (Q3).
- **Pour le développeur :**
  - `bun --filter @poj/web db:reset` après l'intégration ;
  - `poj_test` est déjà recréée ;
  - la base `poj` locale contient un compte de test, `admin@poj.local` / `admin-poj-local` ;
  - suivre la checklist de `doc/deploiement.md`.
- **Relecture du développeur (2026-10-30) :**
  - Point 1 (index redondant) : ok, on le laisse.
  - Point 2 (`unaccent` et CHECK ajoutés à la main) : ok.
  - Point 3 (checklist de déploiement) : ok.
  - Point 4 (spec MCP, « Exposition ») : ok. Relecture terminée, sans correction.
- **Attention :** `poj_test` est déjà sur la nouvelle init. Aucun ticket ne peut lancer ses tests depuis un worktree basé sur l'ancien dev avant l'intégration de t15.

## Log
- 2026-10-29 — créé à la demande du développeur. Débloque t8-comportement-claude. Passe après t4-interface-multi-decks et t14-sveltekit-stable, pour mettre en ligne une version stable. Les tickets qui ajouteraient une migration avant lui la verront fondue dans la migration unique.
- 2026-10-29 — ouvrier lancé en PLAN MODE (opus, high), pendant que t14 attend sa relecture (aucune zone commune).
- 2026-10-29 — plan prêt avec 3 questions, en attente de validation. Il recommande d'intégrer t14 avant l'exécution.
- 2026-10-30 — plan validé (Q1 B, Q2 oui, Q3 non). t14 est intégré, dev est à a28dd8e. Ouvrier relancé en EXECUTION MODE.
- 2026-10-30 — **DONE**, 3 commits, 201 tests au vert. Relecture obligatoire (`review: required`).
- 2026-10-30 — **intégré** par avance rapide a28dd8e..e674b1b (3 commits), sans conflit. Il reste au développeur : `db:reset` sur sa base de dev, puis la mise en ligne selon `doc/deploiement.md`.
