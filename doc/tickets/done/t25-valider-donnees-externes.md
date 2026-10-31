---
id: t25
title: Valider par schéma les données externes encore castées (historique JSON des révisions, réponse DeepL)
status: done
priority: normal
story:
plan_required: false
review:
model: opus
effort:
zones: [apps/web/src/lib/server/domain/reviews, apps/web/src/lib/server/domain/time.ts, apps/web/src/lib/server/deepl, apps/web/src/lib/components/CardForm.svelte, apps/web/src/lib/server/web/card-form.ts, apps/web/src/lib/server/web/form-data.ts, apps/web/scripts/sandbox.ts]
branch: ticket/t25-validation-donnees-externes
agent: ace02a07eafa82bda
depends_on: [t17]
created: 2026-10-31
updated: 2026-10-31
---

## Context
Analyse du typage (ork:scout, 2026-10-31), demandée par le développeur après l'`AnyRemoteForm` de t17 : « les any ne sont jamais bon signe ». Le typage est solide dans l'ensemble (0 `any`, 0 `@ts-*`, formulaires validés par Zod), mais quelques données externes sont castées sans validation :
- **`stateBefore`** (JSON Prisma, `prisma/schema.prisma:254`) casté en `SerializedState` : `domain/reviews/review-day.ts:155`, `reviews.service.ts:201` et `:312` (`as unknown as`). Une ligne malformée casse `parseState` à l'exécution. Correctif type : un schéma Zod près de `scheduler.ts:131`, type dérivé par `z.infer`, puis `parseState(schema.parse(json))`.
- **Réponse DeepL** castée, `deepl/deepl.ts:51`. Correctif type : `safeParse`, et `TranslatorError('unavailable')` si la forme est mauvaise.
- **Type `Suggestion`** écrit à la main dans `components/CardForm.svelte:2`, doublon de `SuggestionView` (`server/web/card-form.ts:23`). Peut-être déjà réglé par t17 : ne traiter que s'il reste.
- **`!` sans garde** en prod : `domain/reviews/review-day.ts:89` (`Map.get(...)!`), `domain/time.ts:15` (`find(...)!.value`), `scripts/sandbox.ts:36` et `:56` (`url!`). Garde explicite ou `throw` avec message. (Si t26 est fait avant, ces points y sont déjà couverts.)
- Mineur : `web/form-data.ts:20` `issue.path[0] as K` (garde de type), si le fichier existe encore après t17.

## Done criteria
- [ ] Plus aucun `as unknown as SerializedState` : l'historique JSON passe par un schéma Zod, avec un test sur un JSON malformé.
- [ ] La réponse DeepL est validée, avec un test de forme invalide.
- [ ] Le type de suggestion DeepL n'est défini qu'à un endroit (dérivé du serveur).
- [ ] Les `!` listés ci-dessus sont remplacés par une garde ou une erreur explicite.
- [ ] Les tests passent.

## Plan

## Questions

## Review
Rapport DONE du 2026-10-31. 281 tests verts, contrat inchangé. `serializedStateSchema` (dans `scheduler.ts`) valide `stateBefore` ; `parseState(json: unknown)` lève `Malformed review state: …` ; les 3 `as unknown as` ont disparu. DeepL via `safeParse` → `TranslatorError('unavailable')`. `Suggestion` dérivé de `SuggestionView`. `!` remplacés (`review-day.ts`, `time.ts`, `sandbox.ts`). Tests : état malformé (scheduler, `lastAnswer`/`amend`), 4 réponses DeepL invalides.
- Décisions : état malformé = erreur explicite partout, calendrier compris (une ligne malformée vient d'un bug ; mieux qu'un calendrier faux en silence) ; `Map.get(...)!` → `?.find` (absence = pas de sens inverse) ; `form-data.ts` laissé à t22 ; enum `state` tiré de `Object.values(fromFsrsState)` (pas d'import de valeur Prisma dans le domaine).
- [x] remaining — `review-day.ts:155` : chaque log validé en entier alors que seul `due` sert (coût mineur ; la vraie correction est de borner la requête de `progress()`).
- [x] remaining — `scripts/sandbox.ts:32` : motif « variable d'env requise sinon exit(1) » en trois copies (`sandbox.ts`, `e2e.ts`, `worktree.ts`).
- [x] remaining — `review-day.ts:90` : map indexable par carte et sens (restructuration hors ticket).
- [x] REVIEW FIRST — `apps/web/src/lib/server/domain/reviews/scheduler.ts:159` : une ligne `stateBefore` malformée fait échouer `lastAnswer`, `amend` et le calcul des jours (accueil, `/cards`) au lieu de produire des dates invalides.
- [x] REVIEW FIRST — `scheduler.ts:136` : dates en ISO strict avec `Z` (seul `serializeState` écrit la colonne, via `toISOString`).

## Log
- 2026-10-31 — créé depuis l'analyse du typage. Part après t17.
- 2026-10-31 — t17 intégré ; lancé en EXECUTION MODE (opus), AUTO REVIEW /simplify, en parallèle de t21.
- 2026-10-31 — DONE, 281 tests verts. Statut in-review : un choix de comportement à valider (état malformé → erreur). [delivered] prêt à relire.
- 2026-10-31 — relecture validée (erreur explicite acceptée). Le développeur retient aussi des colonnes typées à la place du JSON `state_before` (ticket t27, qui supprimera `serializedStateSchema`). Intégration : ouvrier relancé en INTEGRATION MODE (dev a avancé avec t11).
- 2026-10-31 — intégré dans dev par avance rapide (ca00e4e), sans conflit, 284 tests verts. Worktree et branche supprimés.
