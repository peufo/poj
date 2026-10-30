---
id: t12
title: Valider les entrées par des schémas, de façon homogène dans toute la codebase
status: done
priority: normal
story:
plan_required: true
review:
model: opus
effort: high
zones: [apps/web/src/routes, apps/web/src/lib/server]
branch: ticket/t12-validation-par-schemas
agent: a9876a850527998eb
created: 2026-10-29
updated: 2026-10-30
---

## Context
Remarque du développeur pendant la relecture de t7 : les form actions (et d'autres points d'entrée) valident les données à la main, ce qui se maintient mal. Il veut des schémas de validation (il cite Valibot) et une structure identique dans toute la codebase.

L'API Hono valide déjà avec Zod (`@hono/zod-openapi`), et le contrat OpenAPI en dépend.

Constaté pendant la relecture de t7 : `invite/[token]/+page.server.ts:39` vérifie la longueur du mot de passe, et `invitations.accept` la revérifie (`RangeError`).

**Comparatif (2026-10-29)**, rapport complet dans `doc/tickets/annexes/t12-validation-comparatif.md`. Scores sur 45, sans tenir compte de l'usage actuel de Zod :

| Zod 4 | zod/mini | Valibot | ArkType | Effect 4 | TypeBox 1 |
|---|---|---|---|---|---|
| 40 | 34 | 34 | 29 | 26 | 23 |

- **Recommandation : Zod 4 classique partout.** C'est le seul à 5/5 sur trois critères : OpenAPI avec Hono (`@hono/zod-openapi` officiel), le SDK MCP v2 (qui dépend de `zod ^4.2`, et Better Auth l'embarque déjà) et les formulaires (superforms, remote functions, `z.locales.fr()`).
- **Règles à imposer :**
  - imposer `import * as z from 'zod'` par une règle ESLint (`import { z }` fait 92 Ko gzip contre 27 Ko avec esbuild) ;
  - garder l'interdiction de `.extend()` sur un schéma nommé.
- **Solution de repli :** Valibot avec `hono-openapi`. Il faudrait emballer les outils MCP, les `transform` seraient impossibles dans les réponses, et Zod resterait présent via Better Auth.
- **Réserves :**
  - Zod pèse environ 24 Ko gzip côté client ;
  - `hono-openapi` est moins mûr ;
  - le fonctionnement de `zod/mini` avec le SDK MCP n'a pas été vérifié.

## Done criteria
- [ ] Zod 4 (classique, pas `zod/mini`) pour tous les points d'entrée : form actions, `load` avec paramètres, API, MCP
- [ ] Chaque formulaire a son schéma Zod, prêt à être passé à `form(schema, fn)` des remote functions (t17). Pas de helper de form actions : t17 remplace toutes les actions.
- [ ] Toutes les validations manuelles sont migrées vers ces schémas (les actions existantes les utilisent en attendant t17)
- [ ] Une règle ESLint impose `import * as z from 'zod'` (pas `import { z }`, qui gonfle le bundle client)
- [ ] La convention est notée dans `CLAUDE.md`
- [ ] Les tests passent

## Plan
Rendu le 2026-10-30 (opus, high). Le worktree du plan a disparu pendant l'interruption, sans aucun changement : l'exécution repartira d'un nouveau worktree.
1. **Emplacement :** `lib/server/web/schemas/`, un fichier par domaine (`accounts`, `cards`, `decks`, `reviews`, `oauth`), chacun avec sa spec. Les bornes restent des constantes du domaine (`PASSWORD_*`, `MIN/MAX_DAILY_GOAL`), importées par les schémas. MCP et l'API gardent leurs propres schémas.
2. **Compatibilité avec `form(schema, fn)`** (vérifiée dans kit 3.1.0) : un `z.object` statique par formulaire. Les nombres arrivent en `number`, les booléens ont un défaut. Des `transform` produisent l'entrée du service. Le schéma « nouveau deck » est plat, avec `superRefine` selon `kind`.
3. **Schémas :**
   - comptes : login, register, invite (`passwordSchema` partagé), admin invite et revoke ;
   - cartes : création, modification, translate, goal ;
   - decks : création, modification ;
   - révision : hint, answer, amend ;
   - OAuth : consent.
4. **Actions existantes :** `schema.safeParse` après une conversion FormData → objet propre à chaque formulaire. Les formes de `fail` restent les mêmes, et les erreurs sont lues par `z.flattenError`. Aucun helper générique (t17 jettera la conversion).
5. **`load` avec paramètres :** `idOf` et `deckParam` passent sur `z.uuid()` (toujours 404). Schémas de search params pour `/cards` (`q`) et `/review` (`ahead`, `reveal`).
6. **Qui valide quoi :** le schéma valide la forme à la frontière. Le domaine ne garde que les règles qui demandent l'état de la base. On retire donc les `RangeError` de `invitations.accept` et de `dailyGoal.setGoal`. Better Auth garde ses vérifications.
7. **Messages en français :** un message explicite pour chaque règle visible, et en repli `z.config(z.locales.fr())` dans `hooks.server.ts`, qui couvre aussi l'API et MCP.
8. **Import unique :** `import * as z from 'zod'` partout. Les fichiers de l'API ajoutent `import '@hono/zod-openapi'` pour l'extension `.openapi()`.
9. **Règle ESLint `no-restricted-syntax`** : elle refuse les imports nommés ou par défaut de `'zod'`, `zod/*`, et `z` importé depuis `@hono/zod-openapi`.
10. **Fin :** section « Validation (Zod) » dans CLAUDE.md, `api:export` sans changement de contrat, puis les tests.

**Décisions de l'ouvrier :**
- les actions sont branchées dès t12, car le retrait des vérifications du domaine l'exige ;
- les drapeaux de flux et l'affichage des erreurs restent pour t17.

**Messages visibles qui changent** (un schéma statique ne connaît pas le deck) :
- « L'anglais est obligatoire. » devient « Ce champ est obligatoire. » ;
- « Texte trop long pour DeepL. » devient « 300 caractères au plus. », affiché sur le bon champ ;
- l'erreur de deck s'affiche avec les autres erreurs ;
- `z.email()` est plus strict que la regex actuelle de `/admin` ;
- `z.uuid()` (RFC strict) remplace la regex souple de `idOf`.

**À relire en premier :**
- `domain/accounts/invitations.service.ts:142` : le domaine fait confiance à l'appelant pour le nom et le mot de passe ;
- `web/card-form.ts` : messages génériques.

**Risques :**
- l'extension `.openapi()` doit être chargée avant l'évaluation des modules de l'API ;
- `z.config` est global, et les specs ne vérifient que les messages explicites ;
- les schémas sont sous `$lib/server`, donc pas de `preflight` client en t17 ;
- aucune spec e2e n'existe ;
- MCP n'a pas de longueur maximale sur les faces (hors périmètre).

## Questions
- 2026-10-30 — Le domaine doit-il faire confiance à l'appelant (plan) ou garder ses invariants (longueurs, mot de passe) en réutilisant les schémas ? Reco du chef : garder les invariants dans le domaine.
  - 2026-10-30, Jonas : non, on ne valide pas la forme deux fois. Plan validé tel quel : le schéma valide à la frontière, le domaine ne garde que les règles qui dépendent de la base. Chaque entrée (formulaire, API, MCP) a son schéma.
- 2026-10-29 — Valibot ou Zod ? Zod est déjà utilisé par l'API et le contrat. Ajouter Valibot ferait cohabiter deux bibliothèques, l'inverse de la cohérence voulue. Recommandation : Zod partout.
- 2026-10-29 — Le développeur demande un comparatif des bibliothèques qui ne tienne pas compte de l'usage actuel de Zod. Recherche lancée. `hono-openapi` (Standard Schema) rendrait Valibot possible côté API.
- 2026-10-29 — **Décision du développeur :** Zod 4 partout.

## Review
Rapport DONE du 2026-10-30. Worktree `.claude/worktrees/t12-validation-par-schemas`, rebasé sur dev, 237 tests verts, contrat inchangé, pas de migration. Relecture requise (passé par un plan).

**Décisions de l'ouvrier :**
- `newDeckSchema` plat avec `superRefine` sur `kind` (pas d'union discriminée) pour garder typés les `fields` des remote forms de t17 ; la règle des 40 caractères des faces est écrite deux fois.
- `decks.update` ignore les noms de faces d'un deck de langue (règle déplacée de l'action vers le domaine, couverte par une spec).
- `deckError` supprimé de la création de carte, qui lit `errors.deckId`.
- L'édition de carte valide le formulaire avant de charger la carte (un id invalide donne toujours 404 d'abord).
- `invitations.accept` garde le trim du nom (normalisation).
- Id vérifié par `z.uuid()`, plus strict que l'ancienne regex.
- Règle ESLint `import * as z from 'zod'`, messages Zod en français via `hooks.server.ts`, convention dans CLAUDE.md.

**Revue auto (/simplify) :** ~10 corrections appliquées.
- [x] remaining — `apps/web/src/lib/server/web/schemas/decks.ts:44` : règle des noms de faces dupliquée dans le `superRefine` (une union discriminée casserait le typage des `fields` de t17).
- [x] remaining — `apps/web/src/lib/server/mcp/server.ts:175` → **décision : ticket séparé t19-limites-cartes-mcp.** : les entrées carte du MCP n'ont pas de longueur max, contrairement au web (300/1000). Corriger = déplacer `CARD_LIMITS` dans le domaine et changer le comportement MCP : décision à prendre.

**À relire en premier :**
- [x] `apps/web/src/lib/server/domain/decks/decks.service.ts:120` : changement de comportement du domaine (noms de faces ignorés pour un deck de langue).
- [x] `apps/web/src/lib/server/domain/accounts/invitations.service.ts:136` : `accept` fait confiance au nom et au mot de passe reçus ; un futur point d'entrée sans `inviteSchema` créerait un compte sans bornes de longueur.
- [x] `apps/web/src/lib/server/web/schemas/cards.ts:13` : messages de carte génériques, sans les noms des faces du deck (accepté au plan).

## Log
- 2026-10-29 — créé depuis une remarque faite pendant la relecture de t7. Il faudra un état des lieux par `ork:scout` avant le plan.
- 2026-10-29 — comparatif lancé (Zod 4, Valibot, ArkType, TypeBox, Effect Schema), sur des critères propres à la stack : OpenAPI pour Hono, SDK MCP, formulaires SvelteKit.
- 2026-10-29 — comparatif rendu. Recommandation : Zod 4 partout, plus une règle ESLint sur la forme de l'import. Le développeur doit trancher.
- 2026-10-29 — Zod 4 retenu. Ticket prêt (avec plan) : l'état des lieux sera fait dans le plan.
- 2026-10-30 — périmètre ajusté après la décision C de t17 (tout en remote functions) : pas de helper de form actions, des schémas prêts pour `form(schema)`. Ouvrier lancé en PLAN MODE (opus, high).
- 2026-10-30 — plan interrompu par la limite d'usage (levée à 14:10), repris par SendMessage à 14:28
- 2026-10-30 — PLAN READY, attend la validation du développeur
- 2026-10-30 — plan validé tel quel, ouvrier relancé en EXECUTION MODE (nouveau worktree)
- 2026-10-30 — DONE : schémas Zod partout, RangeError retirés du domaine, 237 tests verts après rebase. Statut in-review (relecture requise : passé par un plan).
- 2026-10-30 — relecture guidée commencée ; 4 points évidents cochés par le chef (doublon assumé pour t17, règle déplacée sans changement visible, confiance au schéma conforme à la décision, messages génériques acceptés au plan).
- 2026-10-30 — relecture terminée. Limites MCP reportées dans t19.
- 2026-10-30 — intégration demandée ; dev a avancé (doc/ork.md), ouvrier relancé en INTEGRATION MODE pour rebaser.
- 2026-10-30 — intégré dans dev par avance rapide (4dd92c6, 9435780), sans conflit, 237 tests verts. Worktree et branche supprimés.
