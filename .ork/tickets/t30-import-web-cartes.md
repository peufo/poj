---
id: t30
title: Importer des cartes depuis le web (CSV ou presse-papiers, mise en correspondance des colonnes)
status: idea
priority: low
story: doc/story/ajout-en-masse.md
depends_on: [t29]
plan_required: true
review:
model:
effort:
zones: [apps/web/src/routes/(app)/cards, apps/web/src/lib/server/domain/cards, apps/web/src/lib/server/web/schemas]
branch:
agent:
created: 2026-11-01
updated: 2026-11-01
---

## Context
Volet web de l'ajout en masse, reporté par le développeur le 2026-11-01 (story `doc/story/ajout-en-masse.md`) : « l'app devrait quand même intégrer la fonctionnalité à terme ». Importer un fichier classique (CSV) ou le contenu du presse-papiers dans un deck, avec une étape de mise en correspondance des colonnes vers les faces et le contexte.

Enquête du 2026-11-01 : le plus gros des trois volets (~8-15 fichiers, sans migration) ; nouvelle route, parsing, écran de mise en correspondance, création transactionnelle, doublons. Les cartes ne sont pas dans le contrat OpenAPI. Part après t29, dont il réutilise la limite de nouvelles cartes et, si elle existe, la création en lot.

## Done criteria
(à préciser au moment de le lancer)

## Plan

## Questions

## Review

## Log
- 2026-11-01 — créé pendant l'idéation de t29 : volet web reporté à plus tard.
- 2026-11-05 — mis de côté par le développeur (priorité au comportement de Claude). [pause]
