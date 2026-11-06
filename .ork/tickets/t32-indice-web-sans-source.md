---
id: t32
title: Révision web : l'indice n'affiche pas la source du contexte
status: ready
priority: normal
story: doc/story/ajout-en-masse.md
depends_on: [t31]
plan_required: false
review:
model:
effort:
zones: [apps/web/src/routes/(app)/review]
branch:
agent:
created: 2026-11-01
updated: 2026-11-01
---

## Context
Relevé au plan de t31 (2026-11-01). Depuis t8, la règle de vérification des faits fait écrire la source et sa date dans le contexte d'une carte de sujet. t31 ajoute `hintOf(context)` (domain/cards), qui retire les lignes « Source : … » de l'indice côté MCP (`get_hint`). Mais la révision web affiche toujours le contexte complet comme indice (`apps/web/src/routes/(app)/review/+page.svelte:152`) : la source peut y révéler la réponse.

## Done criteria
- [ ] La révision web affiche l'indice filtré par `hintOf` : sans ligne « Source : … », et pas de bouton d'indice si rien ne reste.
- [ ] La note n'est pas plafonnée quand l'indice filtré est vide (même règle que `get_hint`).
- [ ] Un test couvre un contexte « Source : … » seul et un contexte mixte.
- [ ] Les tests passent.

## Plan

## Questions

## Review

## Log
- 2026-11-01 — créé depuis un risque relevé au plan de t31. Part après l'intégration de t31 (réutilise `hintOf`).
- 2026-11-05 — mis de côté par le développeur (priorité au comportement de Claude). [pause]
