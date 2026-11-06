---
id: t33
title: Les vélocités remplacent le calendrier, l'objectif quotidien et la série
status: idea
priority: normal
story: doc/story/tapis-roulant.md
depends_on: []
plan_required: true
review: required
model:
effort:
zones: [apps/web/src/routes/(app)/cards, apps/web/src/lib/components, apps/web/src/lib/server/domain/cards, apps/web/src/lib/server/domain/reviews, apps/web/prisma, apps/web/src/lib/server/web/schemas]
branch:
agent:
created: 2026-11-05
updated: 2026-11-05
---

## Context
Story `doc/story/tapis-roulant.md` (décisions du 2026-11-01). Le passé se résume en deux vélocités, qui deviennent l'objectif : le nombre de répétitions (moyenne glissante sur 7 jours) et le nombre de cartes mûres (stabilité FSRS au-delà d'un seuil, ~21 jours). La série, l'objectif quotidien et le calendrier d'accomplissement sont supprimés (révise `ajout-quotidien.md`, décisions des 29 et 30/10).

Existant (enquête du 2026-11-01) : `GoalCalendar.svelte` sur `/cards` (8 × 7 cases, objectif, série, record) ; `daily-goal.service.ts` (`progress`, `streaksOf`) ; `review-day.ts` ; `Celebration.svelte` (déclenchée par un jour plein) ; table de l'objectif quotidien (`DailyGoal`).

Zones recoupées avec t29 (`review-day.ts`, protégé par t29) : part après l'intégration de t29.

## Done criteria
- [ ] `/cards` affiche les deux vélocités (répétitions sur 7 jours glissants, cartes mûres) à la place du calendrier.
- [ ] Objectif quotidien (réglage compris), série, record, calendrier et journée de révision sont supprimés, code et docs (`ajout-quotidien.md`, specs) à jour.
- [ ] La célébration (`Celebration.svelte`) est supprimée.
- [ ] La table de l'objectif quotidien est supprimée par une migration.
- [ ] Les tests passent.

## Plan

## Questions
- 2026-11-01 — Ouvertes : (1) célébration : la rattacher à un palier de cartes mûres (10, 50, 100…) ou la supprimer ? (2) table de l'objectif quotidien : la supprimer par une migration, ou la garder inutilisée ?
- 2026-11-05 — Réponse (2) : supprimer l'objectif quotidien, table comprise (migration). (1) célébration : toujours ouverte.
- 2026-11-05 — Réponse (1) : supprimer la célébration (`Celebration.svelte`).

## Review

## Log
- 2026-11-05 — créé au découpage de la story tapis-roulant (en pause). En `idea` tant que les deux questions ne sont pas tranchées. [pause]
- 2026-11-05 — le développeur tranche : l'objectif quotidien est supprimé, table comprise.
- 2026-11-05 — questions tranchées (célébration et table supprimées). Critères clairs ; reste en `idea` tant que le tapis roulant est en pause. [pause]
