---
id: t37
title: Nouvelle tentative DeepL après un 429
status: done
priority: low
story: doc/story/ajout-en-masse.md
depends_on: []
plan_required: false
review:
model: sonnet
effort: medium
zones: [apps/web/src/lib/server/deepl]
branch: ticket/t37-deepl-retry-429
agent: a918aff296cca2bd8
created: 2026-11-06
updated: 2026-11-06
---

## Context
Point `remaining` de la relecture de t31 (`apps/web/src/lib/server/deepl/deepl.ts:93`) : un 429 de DeepL est traduit en `unavailable` sans nouvelle tentative. Avec la limite de 4 requêtes simultanées (t31), c'est rare, mais une rafale (plusieurs instances, quota DeepL) fait échouer tout un lot `check_cards`. Le développeur a choisi d'intégrer t31 tel quel et de traiter ça à part.

## Done criteria
- [ ] Sur un 429, le client DeepL refait la requête une fois, après le délai de `Retry-After` (borné, par ex. ≤ 5 s ; délai court par défaut si l'en-tête manque).
- [ ] Un second 429, ou un `Retry-After` au-delà de la borne, donne `unavailable` comme aujourd'hui.
- [ ] La place dans la file de concurrence (limite de 4) reste cohérente pendant l'attente (pas de fuite de place).
- [ ] Test dans `deepl.spec.ts` (fetch simulé : 429 puis 200 ; 429 deux fois).
- [ ] Les tests passent.

## Plan

## Questions

## Review
DONE le 2026-11-06. 2 fichiers · +114 −5. Nouvelle tentative unique sur 429 après `Retry-After` (1 s par défaut, borne 5 s ; au-delà ou second 429 → `unavailable`), dans la tâche du limiteur (place gardée pendant l'attente). `sleep` injectable pour les tests. AUTO REVIEW /simplify : 1 correction ; remaining : none. REVIEW FIRST : none. 338 tests verts.

## Log
- 2026-11-06 — créé depuis la relecture de t31 (choix 1 du développeur). Lancé en EXECUTION MODE (sonnet, medium).
- 2026-11-06 — DONE. Intégré sans relecture (review per-ticket, aucune règle) par avance rapide (232b9da). [delivered] [OK] sans relecture.
