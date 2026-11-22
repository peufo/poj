---
id: t47
title: Passer à Node 24, puis à ts-fsrs 6 (FSRS-7)
status: ready
priority: normal
story:
depends_on: []
plan_required: true
lane:
review: required
model: opus
effort: high
zones: [Dockerfile, .github/workflows, apps/web/package.json, apps/web/src/lib/server/domain/reviews, apps/web/src/lib/format/mastery.ts, apps/web/prisma]
branch:
agent:
paused:
created: 2026-11-22
updated: 2026-11-22
---

## Context
Lors de la mise à jour des dépendances (branche `upgrade-deps`, pas encore intégrée), ts-fsrs est resté en 5.4.2 pour deux raisons :

- **Node 24 :** ts-fsrs 6 exige Node ≥ 24 (`engines`). L'image de prod part de `node:22.23.0-bookworm-slim` (`Dockerfile`), et `@types/node` est resté en 22.x pour suivre ce runtime. La machine de dev tourne sous Node 22.18. La CI (`.github/workflows/deploy.yml`) installe Bun, mais Vitest et Playwright tournent sous le Node du runner : vérifier sa version.
- **Changement de comportement :** ts-fsrs 6 change la planification des cartes.
  - Le nouveau `DefaultScheduler` (asynchrone : `newCard`, `preview`, `review`, `rollback`, `forget`, résultats `{ card, revlog }`) utilise FSRS-7 par défaut. `fsrs()` / `FSRS` sont dépréciés et restent en FSRS-6.
  - Le tirage aléatoire des intervalles change (FNV-1a et Mulberry32 au lieu d'Alea, graine `cardId + reps`) : les dates fuzzées ne seront plus les mêmes.
  - `Card.elapsed_days` et `ReviewLog.elapsed_days` disparaissent, `Rating` et `State` deviennent des objets figés, `delta_t` devient `deltaT`. Plusieurs exports sont supprimés ou renommés (voir les notes de version de ts-fsrs 6.0.0).

Aujourd'hui, `apps/web/src/lib/server/domain/reviews/scheduler.ts` appelle `fsrs({ request_retention, enable_fuzz })` avec les paramètres par défaut, sans optimisation par utilisateur. Les étapes d'apprentissage restent celles par défaut (`1m`, `10m`), donc les cartes neuves et oubliées repassent dans la journée. Les cartes et les révisions stockent `stability`, `difficulty`, `scheduledDays`, `learningSteps`, `reps` et `lapses` (`apps/web/prisma/schema.prisma`).

Pourquoi FSRS-7 (srs-benchmark, 10 000 collections Anki, log loss, plus bas = mieux) :
- **Avec les révisions du jour même :** FSRS-6 optimisé 0,3842, FSRS-7 optimisé 0,3206, FSRS-7 avec paramètres par défaut 0,3399.
- **Sans elles :** FSRS-6 optimisé 0,3460, FSRS-7 optimisé 0,3401.

FSRS-7 ajoute une stabilité à court terme (trois variables d'état au lieu de deux) et une courbe d'oubli mixte, avec des intervalles en fractions de jour. Le gain porte surtout sur les révisions du jour même, que Poj fait.

Sources : https://github.com/open-spaced-repetition/srs-benchmark, https://github.com/open-spaced-repetition/awesome-fsrs/wiki/The-Algorithm, https://github.com/open-spaced-repetition/ts-fsrs/releases

## Done criteria
- [ ] L'image de prod, la CI et `@types/node` passent à Node 24, et le build Docker local (`bun run stack:up`) démarre.
- [ ] `ts-fsrs` est en 6.x et `scheduler.ts` utilise l'API non dépréciée, avec le modèle choisi dans le plan (FSRS-7, ou FSRS-6 en transition).
- [ ] Les cartes déjà en cours passent au nouveau modèle sans perdre leur état : migration écrite et testée sur la seed du bac à sable. La stabilité à court terme est initialisée d'une façon documentée dans le plan.
- [ ] Les tests du planificateur (`scheduler.spec.ts`, `forecast.spec.ts`) vérifient le nouveau comportement, y compris les révisions du jour même.
- [ ] `bun run check`, `bun run lint`, `bun run test` et les e2e passent.

## Plan
(rempli par l'ouvrier, validé par le développeur avant implémentation)

## Questions
- 2026-11-22 — Adopter FSRS-7 tout de suite, ou passer d'abord à ts-fsrs 6 en `version: 'FSRS-6'`, puis à FSRS-7 dans un second temps ? Le plan doit chiffrer l'écart sur les cartes de la seed (dates de prochaine révision avant et après).
- 2026-11-22 — La FSRS-7 de ts-fsrs 6 est-elle identique à celle de fsrs-rs 7.0 ? Les sources ne s'accordent pas sur le nombre de paramètres (34 ou 35).

## Review

## Log
- 2026-11-22 — créé à la demande du développeur, après la mise à jour des dépendances (branche `upgrade-deps`), où ts-fsrs 6 a été laissé de côté faute de Node 24
