---
id: t28
title: Formulaire de carte : traduire aussi de la langue apprise vers la langue connue
status: done
priority: normal
story: doc/story/web.md
depends_on: []
plan_required: false
review:
model: opus
effort:
zones: [apps/web/src/lib/components/CardForm.svelte, apps/web/src/lib/server/web/card-form.ts, apps/web/src/lib/server/web/schemas/cards.ts, apps/web/src/routes/(app)/cards, apps/web/src/lib/server/domain/translation]
branch: ticket/t28-traduire-langue-apprise-vers-connue
agent: a6011226a894fc737
created: 2026-10-31
updated: 2026-10-31
---

## Context
Remarque du développeur (2026-10-31) : « Il faudrait aussi pouvoir ajouter une carte dans la langue apprise, et traduire vers la langue connue. »

État actuel (enquête scout, branche dev) : dans un deck de langue, le bouton « Traduire avec DeepL » ne traduit que de la face A (langue connue) vers la face B (langue apprise) :
- `apps/web/src/lib/components/CardForm.svelte:73-90,148-165` : le bouton (`intent=translate`) est désactivé si `sideA` est vide ; « Reprendre » remplit `sideB` ;
- `apps/web/src/lib/server/web/card-form.ts:82-94` : `translateCard` ne lit que `sideA` et `context` ;
- `apps/web/src/lib/server/domain/translation/translation.service.ts:35` : `suggest` va de A vers B, en dur. `check` (`:45`, utilisé par l'outil MCP `check_card`) fait déjà les deux sens ;
- `apps/web/src/lib/server/web/schemas/cards.ts:44-45` : le schéma `translate` exige `sideA`.

Ordre des champs : sideA, puis « Contexte d'origine », puis sideB. Ni le contrat OpenAPI ni le MCP ne sont touchés (la traduction passe par une remote function web).

## Done criteria
- [ ] Dans un deck de langue, avec seulement la langue apprise (sideB) remplie, on peut demander la traduction DeepL vers la langue connue, et « Reprendre » remplit sideA.
- [ ] Le sens actuel (A vers B) ne change pas.
- [ ] Même comportement en création et en modification (`translateCard` est partagé).
- [ ] Un test couvre le sens B vers A (`translation.service` et/ou `translateCard`).
- [ ] Les tests passent.

## Plan

## Questions

## Review
Rapport DONE du 2026-10-31. 286 tests verts, e2e `cards.e2e.ts` 5/5, contrat inchangé, dev n'a pas bougé. Aucun appel DeepL réel : le sens B → A n'a pas été vérifié de bout en bout dans un navigateur.
- `translation.suggest` prend une `Direction` (`a_to_b` / `b_to_a`) et partage `requestFor` avec `check`. Nouvel intent `translate_back` dans les deux schémas de formulaire. `translateCard` est partagé entre création et modification.
- CardForm : un bouton « Traduire avec DeepL » sur chaque face, qui traduit l'autre face. La suggestion et « Reprendre » s'affichent sous la face à remplir, et une seule suggestion est visible à la fois. Chaque bouton a un nom accessible (« … vers l'anglais » / « … vers le français »).
- Revue auto /simplify : 4 corrections appliquées.
- [x] remaining — `apps/web/src/lib/server/web/card-form.ts:86` : la correspondance entre intent et direction est écrite deux fois, côté serveur et dans le composant (`CardForm.svelte:26`). Pour l'unifier, il faudrait renommer les intents en `translate_a_to_b` / `translate_b_to_a`.
- [x] REVIEW FIRST — `apps/web/src/lib/components/CardForm.svelte:140` : second bouton DeepL sur sideA, et la suggestion s'affiche sous le champ qu'elle remplit. La mise en page est-elle bonne ?
- [x] REVIEW FIRST — `apps/web/src/lib/components/CardForm.svelte:149` : nouvel aria-label sur les deux boutons (le nom accessible du bouton existant change), sur lequel s'appuie le spec e2e.

## Log
- 2026-10-31 — créé depuis une remarque, avec l'enquête scout. Prêt. Attend une place (max_parallel atteint : t27 et t21 en cours).
- 2026-10-31 — place libérée par t27 : lancé en EXECUTION MODE (opus, effort par défaut), AUTO REVIEW /simplify.
- 2026-10-31 — DONE, 286 tests et e2e cards verts. In-review : il reste un point remaining et 2 REVIEW FIRST, donc pas d'intégration directe. [delivered] prêt à relire.
- 2026-10-31 — relecture ouverte. Coché sans présentation (No need to ask) : aria-label des boutons DeepL. dev a avancé de 4 commits : rebase à faire avant d'intégrer.
- 2026-10-31 — relecture : tous les points validés par le développeur (mise en page, double correspondance intent → direction acceptée telle quelle). Relecture terminée.
- 2026-10-31 — le développeur : intégrer sans demander, sauf vrai conflit de logique métier. Ancien worktree (propre) supprimé pour libérer la branche ; ouvrier en INTEGRATION MODE (opus) sur la branche existante.
- 2026-10-31 — DONE (INTEGRATION MODE) : rebase sans conflit sur 3554819, 292 tests et e2e cards verts. dev a avancé (t27 intégré) : ouvrier relancé pour un second rebase.
- 2026-10-31 — second rebase sans conflit (sur c4b3657), 287 tests verts. Intégré dans dev par avance rapide (4ad1031), sans relecture supplémentaire.
