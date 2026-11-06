---
id: t36
title: Outil MCP unique `review` avec une carte d'avance
status: done
priority: normal
story: doc/story/revision-une-carte-d-avance.md
depends_on: [t29]
plan_required: true
review:
model: opus
effort: high
zones: [apps/web/src/lib/server/mcp, apps/web/src/lib/server/domain/reviews, doc/specs/mcp.md]
branch: ticket/t36-review-carte-d-avance
agent: ad25487197614a908
created: 2026-11-05
updated: 2026-11-06
---

## Context
Story `doc/story/revision-une-carte-d-avance.md` (validée le 2026-11-05). En révision vocale, chaque appel d'outil crée un silence ; avec t8, `submit_review` reste sur le chemin critique entre la réponse et la question suivante. Claude doit toujours avoir **une carte d'avance** : il juge, annonce et pose la carte suivante tout de suite, puis enregistre la note.

Décisions :
- **un seul outil `review`** remplace `next_review` et `submit_review` (introduits/modifiés par t8, pas encore déployés) ; `get_hint` et `amend_review` restent à part ; `deck` et `ahead` restent des options ;
- le serveur **renvoie toujours de quoi avoir une carte d'avance** : deux cartes si Claude n'en tient aucune, une sinon ;
- l'appel porte la réponse précédente (`answer` : id, note, version) et la carte que Claude tient déjà (`holding` : **id de la révision**) ; le serveur reste **sans état** ;
- `holding` ne sert qu'à exclure (la carte et son autre sens) ; un id inconnu ou étranger est ignoré ;
- la carte d'avance est choisie **après** l'enregistrement de la note : une carte ratée qui doit revenir vite peut revenir ;
- consignes : juger, annoncer, poser la carte d'avance, **puis** appeler `review` dans le même tour ; après again/hard, la règle de t8 reste (corriger, faire répéter, attendre) ; si la note échoue (conflit de version), Claude le dit et rejoue la note, la carte d'avance reste valable.

Séquence cible :
```
review()                      → carte 1, carte 2
review(réponse 1, holding: 2) → carte 3
review(réponse 2, holding: 3) → carte 4
review(réponse 3)             → carte 4, carte 5   (Claude ne tenait rien)
```

Dépend de t29 (nouvelle règle de `next` : limite de nouvelles cartes, stock). Passe après t31, qui modifie aussi `mcp/server.ts` et les consignes. Le test MCP de t29 (`next_review` / `remaining`) et les consignes de t8 et t31 sont à réécrire pour `review`.

À vérifier après déploiement (hors ticket) : que Claude.ai prononce en vocal le texte écrit avant l'appel d'outil sans attendre sa réponse.

## Done criteria
- [ ] Un outil `review` (entrées `answer?`, `holding?`, `deck?`, `ahead?`) remplace `next_review` et `submit_review` ; il renvoie deux cartes sans `holding`, une avec.
- [ ] La carte renvoyée n'est jamais la carte tenue ni son autre sens ; un `holding` inconnu ou étranger est ignoré.
- [ ] La note est enregistrée avant le choix de la carte d'avance ; un `answer` rejoué (même version) ne double pas la note.
- [ ] `remaining`, la fin de session (rien de dû, stock de t29) et `ahead` restent justes.
- [ ] Consignes et descriptions : après good/easy, aucun appel d'outil entre la réponse et la question suivante ; après again/hard, règle de t8 ; conflit de version géré.
- [ ] `doc/specs/mcp.md` à jour ; tests serveur ; les tests passent.

## Plan
Rendu le 2026-11-06 (opus, high). Branche `ticket/t36-review-carte-d-avance`.
1. Domaine (`reviews.service.ts`, `types.ts`) : `lead(ownerId, now, { ahead, deckId, holding })` ; `presentability` calculée une fois ; `holding` résolu en carte via `card.ownerId` (tenue puis supprimée = toujours tenue ; inconnu ou étranger ignoré) ; 1 révision si une carte est tenue, 2 sinon, de cartes différentes (exclusion par `cardId`, donc les deux sens) ; renvoie `{ reviews, remaining, nextDue, waiting }`. `next` (web) garde sa signature et partage la sélection.
2. MCP (`server.ts`) : outil `review` à la place de `next_review` et `submit_review`. Entrées `answer?` `{review_id, version, rating}`, `holding?` (uuid), `deck?`, `ahead?`. Ordre : deck validé, puis `reviews.answer`, puis `reviews.lead`. Sortie : `answer?` (rating, capped, replayed, next_due, next_due_in, context), `cards[]`, `remaining` à la racine, `nothing_due`, `next_due?`. Annotations : ni lecture seule, idempotent.
3. Textes de résultat : 2 cartes « à poser maintenant » / « à garder » ; carte tenue seule : « la carte que tu tiens est la dernière » ; rien de dû : prochaine échéance ou « Session terminée » ; après again/hard : « attends sa répétition avant de poser la carte que tu tiens ».
4. Consignes (`guidance.ts`) : REVIEW_RULE (toujours une carte d'avance ; juger, annoncer, poser la carte tenue, puis `review` dans le même tour), CORRECTION_RULE (règle de t8), RETRY_LINE, SESSION_OVER_LINE, ligne « erreur de note », ligne « dernière carte » ; règle multi-decks et descriptions de `deck`, `amend_review`, REVIEW_NOT_FOUND.
5. `prompts.ts` : le prompt « Réviser » appelle `review` ; en avance, `ahead` à chaque appel.
6. Tests : `reviews.service.spec.ts` (`lead` : 2 cartes distinctes, exclusion tenue + autre sens, holding inconnu/étranger, deck, stock t29) ; `server.spec.ts` réécrit pour `review` (séquence cible, note avant choix, rejeu sans double note, `remaining`, limite 10, `ahead`, isolation, consignes) ; `oauth.spec.ts` (8 outils).
7. `doc/specs/mcp.md` : section `review`, principes, déroulé vocal à une carte d'avance, prompts. Docs historiques inchangées.
8. test_command, commit, rebase, tests relancés.

**Décisions de l'ouvrier :**
- `remaining` = révisions encore à présenter (une par carte), carte tenue et cartes renvoyées comprises ; baisse d'un à chaque réponse.
- Échec de la note (conflit, révision supprimée) : erreur d'outil, rien enregistré, aucune carte ; Claude le dit et rappelle `review` sans `answer`, même `holding`. Coupure réseau : rejouer le même appel, la note n'est jamais comptée deux fois.
- `holding` mal formé : refusé par le schéma ; seul un uuid valide inconnu/étranger est ignoré.
- `deck` inconnu : erreur avant toute écriture (plus ignoré comme dans `submit_review`).
- Après again/hard, le serveur renvoie quand même la carte d'avance ; la retenue vient des consignes.

**Risques :** en `ahead`, une carte notée again peut revenir aussitôt comme carte d'avance (conforme) ; forme du contenu structuré changée (non déployé) ; si Claude oublie `holding`, il reçoit deux cartes (sans gravité).

**À relire en premier (à l'exécution) :**
- `apps/web/src/lib/server/mcp/guidance.ts` · 6/10 · formulation de REVIEW_RULE et CORRECTION_RULE (ordre parole/appel, vérifiable seulement après déploiement).
- `apps/web/src/lib/server/mcp/server.ts` (outil review, erreur de note) · 6/10 · erreur d'outil sans carte plutôt que note perdue avec carte d'avance.

## Questions

## Review
DONE le 2026-11-06. 9 fichiers · +630 −370 · 1 commit (7577902). Worktree `.claude/worktrees/t36-review` (recréé par l'ouvrier). 345 tests verts, contrat inchangé, pas de migration.
- Décisions : `remaining` compte carte tenue et cartes renvoyées ; erreur de note = erreur d'outil sans carte, rappel sans `answer` avec le même `holding` ; carte tenue puis supprimée = toujours tenue ; `holding` mal formé refusé ; `deck` inconnu = erreur avant écriture ; sortie `cards[]`, `answer` imbriqué, `remaining` à la racine, `nothing_due` seulement si rien renvoyé ni tenu.
- AUTO REVIEW /simplify : 5 corrections (`countPresentable` en parallèle, `waiting` retiré, garde et copie inutiles, `while`, commentaire de `lead`).
- Note du chef : le `remaining` sur `doc/tickets/T-0002-inspiration-claude.md` vise un ancien nom de fichier, déjà clos (`done/t2-inspiration-claude.md`) : rien à faire.

- [ ] REVIEW FIRST — `apps/web/src/lib/server/mcp/guidance.ts:13` · 6/10 · REVIEW_RULE et CORRECTION_RULE : ordre parole puis appel, appel dans le même tour après again/hard ; vocal réel vérifiable après déploiement. → non relu : le développeur intègre, le test se fera en conditions réelles.
- [x] REVIEW FIRST — `apps/web/src/lib/server/mcp/server.ts:924` · 6/10 · conflit de note : erreur sans carte. (évident : choix présenté au plan, validé)
- [x] REVIEW FIRST — `apps/web/src/lib/server/domain/reviews/reviews.service.ts:237` · 7/10 · règle « 2 ou 1 » dans le domaine (`lead`) à côté de `next`, partage de `pick` et `upcoming` ; remaining 6/10 : l'agent altitude propose un `upcoming({ count, exclude })` générique à la place.
- [x] remaining — `apps/web/src/lib/server/mcp/server.ts:882` · 7/10 · `nothingDue` recalculé côté MCP. (évident)
- [x] remaining — `apps/web/src/lib/server/mcp/server.ts:887` · 8/10 · test again/hard écrit à la main comme ailleurs. (évident)
- [x] remaining — `apps/web/src/lib/server/domain/reviews/reviews.service.ts:237` · 8/10 · `findMany take: 3` et saut d'`upcoming` en `ahead` non appliqués (gain marginal). (évident)
- [x] remaining — mode `ahead` : carte notée peut revenir aussitôt (risque du plan, accepté). (évident)

## Log
- 2026-11-05 — créé depuis l'idéation « une carte d'avance ». Part après t29 (dépendance) et t31 (zones). Plan requis.
- 2026-11-05 — déploiement (dev → main) reporté par le développeur après l'intégration de t36 ; le test en conditions réelles (prompts t8, vocal) se fera alors.
- 2026-11-06 — t31 intégré : lancé en PLAN MODE (opus, high).
- 2026-11-06 — PLAN READY, attend la validation du développeur.
- 2026-11-06 — plan validé par le développeur sans correction. Même ouvrier en EXECUTION MODE (opus, high), AUTO REVIEW /simplify.
- 2026-11-06 — DONE (opus, high). Passé par un plan : in-review, 2 points à relire.
- 2026-11-06 — point 2 validé (découpage `lead`/`next` gardé) ; « ok intègre ». Intégré dans dev par avance rapide (7577902, sans conflit).
- 2026-11-06 — worktree et branche supprimés, worktree:prune lancé.
- 2026-11-06 — le développeur annonce le déploiement, mais origin/main est encore à 14a5541 (dev à ad8ef2c) : push non constaté.
- 2026-11-06 — déploiement constaté : origin/main = ad8ef2c. Test en conditions réelles sur Claude.ai à faire par le développeur.
