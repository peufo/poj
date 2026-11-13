---
id: t39
title: Le compte des cartes dues prend plusieurs secondes sur un gros paquet
status: done
priority: normal
story:
depends_on: []
plan_required: false
lane:
review:
model: opus
effort: défaut
zones: [apps/web/src/lib/server/domain/reviews, apps/web/src/routes/(app)/+layout.server.ts]
branch: ticket/t39-count-due-lent
agent: ada0571cc1b0f048e
paused:
created: 2026-11-07
updated: 2026-11-13
---

## Context
Relevé par l'ouvrier de `t34-tapis-roulant` en mesurant le tapis sur un bac à sable dense : sur 5 025 cartes, dont des milliers en attente (stock de cartes neuves), `reviews.countDue` met 2 à 6 s. La mise en page l'appelle à chaque page (pastille de navigation), donc chaque navigation en paie le prix. Problème antérieur à t34, non causé par lui. Après un ajout en lot (t29, t31), un paquet de plusieurs milliers de cartes est un cas réel.

Pour comparaison, `cards.belt()` (t34) calcule le même chiffre « prêtes » en mémoire en 134 ms sur ces 5 025 cartes, base comprise ; deux tests de t34 vérifient que les deux chiffres coïncident.

## Done criteria
- [x] Sur un bac à sable de plus de 5 000 cartes dont des milliers en attente, `reviews.countDue` répond en moins de 200 ms ; mesure avant et après notée dans le journal.
- [x] Le résultat est inchangé : mêmes comptes qu'avant sur les cas des specs existantes (quota par deck, sens mis de côté, `?deck=`, cartes supprimées), et toujours égal au chiffre « prêtes » du tapis.
- [x] Les tests passent.

## Plan

## Questions

## Review
/simplify : 1 correction appliquée (`notBuried` prend `now` et calcule lui-même la fenêtre de 24 h).
- [x] apps/web/src/lib/server/domain/reviews/reviews.service.ts:62 · 9/10 · Mise de côté du sens inverse : au lieu d'une liste de paires (carte, sens) chargée à chaque appel, un `EXISTS` corrélé sur la révision sœur (index unique `card_id, direction`). Sert `countDue`, `next` et `lead`. Le sens inverse ne compte toujours que s'il est révisé (`reviewedDirections`) ; nouveau test pour un deck passé à sens unique.
- [x] apps/web/src/lib/server/domain/reviews/reviews.service.ts:105 · 8/10 · /simplify : `buried` ne dépend plus que de `now` et pourrait sortir de `Presentability` (qui deviendrait `NewCards`). Laissé tel quel : changerait les signatures de `pick`, `upcoming` et `availableFilter`, hors du diff.
- [x] apps/web/src/lib/server/domain/reviews/reviews.service.ts:70 · 8/10 · /simplify : le sens inverse `a_to_b` est toujours révisé, donc `...reviewedDirections` ajoute une jointure inutile au deck dans cette branche. Gardé pour une seule définition générique ; les 30 ms mesurées l'incluent. Remarque écartée : pas d'index manquant sur `last_review`, le SQL est un `EXISTS` corrélé sur `card_id`.

## Log
- 2026-11-07 — créé depuis le rapport de `t34-tapis-roulant` (problème hors ticket). Part après l'intégration de t34, dont les zones recoupent `domain/reviews`.
- 2026-11-08 — `t34-tapis-roulant` intégré : plus rien ne bloque ce ticket, non lancé à cause de l'arrêt demandé par le développeur. À lancer à la prochaine session.
- 2026-11-13 — lancé en EXECUTION MODE (opus, effort par défaut, sans plan : aucune règle « Plan required when »).
- 2026-11-13 — (reporté par le chef : l'écriture du ticket a été refusée à l'ouvrier depuis son worktree.) Cause : le filtre de mise de côté chargeait les réponses des dernières 24 h dans un `NOT (OR …)` de paires (carte, sens), évalué pour chaque révision : coût en réponses récentes × révisions. Remplacé par un filtre relationnel sur la révision sœur (une requête de moins). Test ajouté : un deck passé à sens unique ne met plus de côté aucun a_to_b. Commit `6526ece` « read buried siblings through the review relation ».
  - Mesure sur le bac à sable du worktree : seed + 5 000 cartes neuves (`createBatch`) + 2 000 cartes répondues sur les dernières 24 h, soit 5 025 cartes dont 3 005 en attente.
  - Avec seulement des cartes neuves en attente, sans réponses récentes : 45–60 ms avant, donc pas lent.
  - Avant : 1 422–2 282 ms. Après : 24–72 ms (premier appel à froid le plus lent).
  - Compte : 2 009 avant et après, égal à `belt().due`.
  - Commande de tests complète verte (355 tests, contrat inchangé). Rebasé sur `dev` sans conflit. Rien à faire après intégration (ni migration, ni contrat). `+layout.server.ts` inchangé.
  - Le bac à sable du worktree garde les cartes de mesure (`sandbox:reset` le nettoie). Script de mesure hors dépôt : `/private/tmp/claude-501/-Users-jonasvoisard-dev-poj/4d415b55-cb3f-46ee-8a86-822a506e50b7/scratchpad/bench-t39.ts`.
- 2026-11-13 — pas d'intégration directe : `confidence_threshold` absent, les 3 points de `## Review` attendent le développeur. Reste `in-review`.
- 2026-11-13 — relecture du développeur terminée, 3 points validés. Critères de fin cochés par le chef d'après le rapport de l'ouvrier (24–72 ms, compte inchangé, tests verts).
- 2026-11-13 — intégré sur `dev` par avance rapide (1 commit, `6526ece`), sans conflit. Worktree et branche supprimés.
