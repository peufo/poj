---
id: t18
title: Une seule règle pour retrouver un deck (nom et choix par défaut) dans le domaine
status: done
priority: low
story: doc/story/decks.md
depends_on: []
plan_required: false
review:
model: opus
effort:
zones: [apps/web/src/lib/server/domain/decks, apps/web/src/lib/server/mcp, apps/web/src/lib/server/web]
branch: ticket/t18-resolve-deck
agent: a2f4746d0a669d84a
created: 2026-10-30
updated: 2026-10-30
---

## Context
Suggestions de la revue automatique de `t5-mcp-choix-deck`, retenues par Jonas en relecture :
- `decks.service.ts` : `assertNameFree` pourrait réutiliser `findDeckByName`, pour une seule règle de comparaison des noms (casse, espaces) ;
- la règle de choix du deck (aucun / seul deck / deck nommé) existe deux fois : côté MCP (`mcp/server.ts`, par nom) et côté web (`web/guards.ts` `deckInScope`, par id). Un `resolveDeck` commun dans le domaine serait plus juste.

## Done criteria
- [ ] La comparaison des noms de deck (unicité et recherche) passe par une seule fonction du domaine
- [ ] La règle « aucun / seul / nommé » est dans le domaine et utilisée par le MCP et le web
- [ ] Comportement inchangé côté MCP et côté web
- [ ] Les tests passent

## Plan

## Questions

## Review
Rapport DONE du 2026-10-30 : `resolveDeck(decks, { id } | { name })` dans le domaine (none / unknown / several / found), utilisé par `deckInScope` (web) et `captureDeck` (MCP) ; `assertNameFree` passe par `findDeckByName`. 259 tests verts.
- Décisions : `explicit` dérivé côté web ; `unknown` renvoie la requête pour nommer le deck dans l'erreur MCP ; `next_review`/`remaining` gardent la règle « deck nommé ou tous ».
- REVIEW FIRST : `mcp/server.ts:306` messages d'outil inchangés dans les quatre cas (couvert par les tests).
- remaining (mineurs, sans choix) : `guards.ts:43` `name` requis sur les decks ; `guards.ts:2` import via le barrel ; `AppShell.svelte:50` copie client de la règle « seul deck », acceptée.
- Intégré sans relecture : ticket MCP (préférence du développeur), points restants évidents.

## Log
- 2026-10-30 — créé depuis la relecture de t5 (suggestions de /simplify)
- 2026-10-30 — lancé en EXECUTION MODE (opus, effort par défaut), AUTO REVIEW /simplify, en parallèle du plan de t17.
- 2026-10-30 — DONE puis intégré sans relecture (ticket MCP, points restants évidents), avance rapide 1 commit. [deferred] intégré sans relecture.
