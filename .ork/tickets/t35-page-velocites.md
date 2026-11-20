---
id: t35
title: Page de détail des vélocités (graphe dans le temps)
status: idea
priority: low
story: doc/story/tapis-roulant.md
depends_on: [t33]
plan_required: false
review:
model:
effort:
zones: [apps/web/src/routes/(app)]
branch:
agent:
paused: jusqu'à l'intégration de t34
created: 2026-11-05
updated: 2026-11-05
---

## Context
Story `doc/story/tapis-roulant.md` : le passé se résume en deux vélocités sur `/cards` (t33) ; un graphe plus détaillé a sa propre page.

## Done criteria
(à préciser au moment de le lancer)

## Plan

## Questions

## Review

## Log
- 2026-11-05 — créé au découpage de la story tapis-roulant, pour plus tard. [pause]
- 2026-11-06 — la distribution des cartes acquises quitte `/cards` avec `t34-tapis-roulant` : le développeur la veut sur une autre page. À loger ici, sauf décision contraire au lancement.
- 2026-11-06 — le développeur le laisse en pause jusqu'à l'intégration de `t34-tapis-roulant`, dont dépend ce qu'il récupère. [pause]
- 2026-11-06 — prévu par le plan de `t34-tapis-roulant`, à confirmer à sa validation : `MasteryBar.svelte` reste sans lecteur en attendant cette page, qui refera le calcul dans son load.
