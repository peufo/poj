---
id: t19
title: Appliquer aux cartes créées par Claude les mêmes limites de longueur que sur le web
status: done
priority: normal
story:
plan_required: false
review:
model: sonnet
effort: medium
zones: [apps/web/src/lib/server/mcp, apps/web/src/lib/server/web/schemas, apps/web/src/lib/server/domain/cards]
branch: ticket/t19-limites-mcp
agent: abc5c4610bf86e934
depends_on: [t12]
created: 2026-10-30
updated: 2026-10-30
---

## Context
Relevé par la revue auto de t12 (`apps/web/src/lib/server/mcp/server.ts:175`) : sur le web, une face de carte est limitée à 300 caractères et la note à 1000 (`CARD_LIMITS`). Les entrées carte des outils MCP n'ont aucune limite. Le développeur veut les mêmes limites des deux côtés.

Suivre la convention de t12 : la forme des données est validée à la frontière par un schéma Zod (ici, le schéma d'entrée des outils MCP), pas une seconde fois dans le domaine. Les limites sont des constantes partagées entre les schémas web et MCP ; à l'ouvrier de choisir où elles vivent (domaine ou module partagé) sans dupliquer les valeurs.

## Done criteria
- [ ] Les outils MCP qui reçoivent le contenu d'une carte (création, vérification, correction s'il y en a) refusent une face de plus de 300 caractères et une note de plus de 1000, avec un message clair pour Claude.
- [ ] Les valeurs des limites ne sont écrites qu'à un seul endroit, partagé par les schémas web et MCP.
- [ ] Un test couvre le refus côté MCP.
- [ ] Les tests passent.

## Plan

## Questions

## Review
Rapport DONE du 2026-10-30 : `CARD_LIMITS` (300/300/1000) déplacé dans `domain/cards/limits.ts`, importé par les schémas web et par `cardInputSchema` du MCP (`check_card`, `create_card`) avec message « N caractères au plus : raccourcis le texte. ». Test MCP de refus. 260 tests verts. AUTO REVIEW /simplify : rien ; remaining : none ; REVIEW FIRST : none.

## Log
- 2026-10-30 — créé depuis la relecture de t12 (remaining de la revue auto). Part après l'intégration de t12. Ni plan ni relecture (MCP).
- 2026-10-30 — t12 et t18 intégrés ; lancé en EXECUTION MODE (sonnet, medium), AUTO REVIEW /simplify, en parallèle de t20.
- 2026-10-30 — DONE puis intégré sans relecture (revue auto propre, rien de signalé), avance rapide 1 commit. [deferred] intégré sans relecture.
