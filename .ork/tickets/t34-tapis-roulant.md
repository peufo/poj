---
id: t34
title: Le tapis roulant remplace l'horizon (axe logarithmique continu)
status: idea
priority: normal
story: doc/story/tapis-roulant.md
depends_on: [t29]
plan_required: true
review:
model:
effort:
zones: [apps/web/src/routes/(app)/cards, apps/web/src/lib/components, apps/web/src/lib/server/domain/cards]
branch:
agent:
created: 2026-11-05
updated: 2026-11-05
---

## Context
Story `doc/story/tapis-roulant.md` (décisions du 2026-11-01). L'interface principale montre l'avenir : un tapis roulant où les cartes avancent vers leur prochaine révision, sur un axe logarithmique continu, des minutes (étapes d'apprentissage, plusieurs révisions par jour) aux mois et aux années ; au bout du tapis, les cartes prêtes à être révisées. Le stock de cartes neuves de t29 apparaît en tête du tapis.

Existant : `Horizon.svelte` (barres par jour sur 14 jours, comptes seulement, clic = filtre de la liste), `cards.service.ts` `horizon()`. L'échéance (`due`) suffit pour placer une révision ; stabilité et état FSRS peuvent servir à colorer. Coût estimé : un calcul serveur + un composant, 3-5 fichiers, sans migration.

Densité : des centaines de cartes après un lot (t31) ; regroupement nécessaire, lisible et joli sur mobile. Passage design d'abord (skill `impeccable`).

## Done criteria
- [ ] `/cards` affiche le tapis à la place de l'horizon : axe log continu de maintenant aux années, cartes regroupées quand elles sont denses, cartes dues au bout du tapis.
- [ ] Le stock de cartes neuves (t29) est visible en tête du tapis.
- [ ] Lisible à la largeur d'un téléphone ; le filtre de la liste par tranche reste possible.
- [ ] Test serveur du calcul des positions ; les tests passent.

## Plan

## Questions

## Review

## Log
- 2026-11-05 — créé au découpage de la story tapis-roulant (en pause). Part après t29 (stock de cartes neuves). [pause]
