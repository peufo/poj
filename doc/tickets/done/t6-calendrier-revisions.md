---
id: t6
title: Calendrier d'accomplissement des révisions, célébration et record de série
status: done
priority: normal
story: doc/story/ajout-quotidien.md
plan_required: true
review:
model: opus
effort: high
zones: [apps/web/src/lib/server/domain/reviews, apps/web/src/lib/server/domain/cards, apps/web/src/lib/components, apps/web/src/routes/(app), apps/web/DESIGN.md]
branch: ticket/t6-calendrier-revisions
agent: a6f7288d72f8e3059
created: 2026-10-29
updated: 2026-10-30
---

## Context
Ce ticket suit t1 (objectif quotidien d'ajout, série et calendrier `GoalCalendar` en tête de `/cards`). La gamification s'étend aux **révisions**, et deux leviers de motivation s'ajoutent. Voir la section « Suite » de `doc/story/ajout-quotidien.md`.

Le plan doit partir de l'état du code **après** l'intégration de t1 et de t3 (decks : les sens sont `a_to_b` et `b_to_a`).

## Règles
- **Jour de révision réussi**, en jour civil Europe/Zurich, si l'une de ces conditions est remplie :
  - chaque carte due ce jour-là a reçu au moins une réponse, quelle que soit la note : une carte notée *Again* qui revient dans la journée n'empêche pas le jour d'être réussi ;
  - 30 révisions au moins ont été faites dans la journée (plafond pour le retard accumulé).
- **Jour sans aucune carte due :** à trancher dans le plan, avec une recommandation (neutre, ou réussi).
- **Série :** même règle que pour les ajouts. Un jour manqué est toléré, deux d'affilée arrêtent la série, et aujourd'hui ne compte que s'il est réussi.
- **Toutes les révisions comptent,** sur le web comme par Claude, et tous les decks ensemble.
- **Leviers :**
  - un moment de célébration bref quand l'objectif du jour est atteint (ajout et révision) ;
  - le record de série affiché à côté de la série en cours (ajout et révision).
  - Pas de badges ni de trophées.

## Done criteria
- [ ] Un service du domaine calcule le calendrier et la série des révisions. Il est couvert par des tests :
  - [ ] le cas « à jour » ;
  - [ ] une note *Again* suivie d'une reprise dans la journée ;
  - [ ] le plafond de 30 ;
  - [ ] le jour toléré et deux jours manqués ;
  - [ ] la limite à minuit à Zurich ;
  - [ ] les révisions faites par Claude.
- [ ] Un seul calendrier sur le web réunit ajout et révision : case pleine (les deux objectifs), claire (un seul), vide (aucun). Le composant de t1 est réutilisé.
- [ ] Une seule série (jours pleins, un jour manqué toléré) et son record sont affichés.
- [ ] Un moment de célébration bref apparaît quand l'objectif du jour est atteint. Il ne revient pas à chaque chargement de page une fois vu, et il respecte `prefers-reduced-motion`.
- [ ] `apps/web/DESIGN.md` est amendé : célébration brève et record de série permis, ni badges ni trophées.
- [ ] Les tests passent.

## Plan
Révisé le 2026-10-30 (opus, high) pour un seul calendrier (option A). Branche `ticket/t6-calendrier-revisions` sur dev 63c42df, aucun commit, worktree à recréer à l'exécution.
1. **`domain/reviews/review-day.ts`** (fonction pure) : par jour `{ due, answered, reviews, reached }`. Échéance à minuit reconstruite à rebours (`review.due`, puis `stateBefore.due` du premier log postérieur) ; un sens existe dès `review.createdAt` ; sens inverse mis de côté exclu ; carte supprimée avant la fin du jour exclue. `reached` = chaque carte due a reçu un log ce jour-là, ou ≥ 30 logs. Toutes notes, origines, decks.
2. **Journée Poj** dans `cards/daily-goal.service.ts` : `progress` renvoie par jour `{ date, add, review (avec idle), level: full|partial|none }`, plus `today`, `streak`, `best`. Nouvelle méthode légère `today(userId, now)` pour `/review`.
3. **Série unique :** seuls les jours `full` comptent ; un jour non plein toléré, deux arrêtent ; aujourd'hui compte s'il est plein, jamais manqué. Record = max sur l'historique.
4. **Specs :** `review-day` (à jour, *Again* puis reprise, plafond 30, minuit à Zurich, origine mcp, sens mis de côté, carte supprimée) ; `daily-goal` (niveaux, série, jour toléré et deux manqués, record, jour sans carte due, `today`).
5. **`GoalCalendar.svelte` étendu** (pas de nouveau composant de calendrier) : niveau de cellule (`bg-level-3` / `bg-level-1` / `bg-line`), `title` qui nomme l'objectif manquant, deux lignes de progression, série et record, légende « Ajout et révision » / « Un des deux ». Formulaire `?/goal` intact.
6. **Pages :** `/cards` garde `dailyGoal.progress` ; `/review` ajoute `dailyGoal.today`.
7. **`Celebration.svelte`** client seulement : « Journée complète » en `aria-live=polite`, fondu et pulsation ~1,5 s, statique avec `prefers-reduced-motion`. Mémoire `localStorage` (`poj.celebrated` = date du jour). Aucun appel serveur.
8. Test client de `Celebration` (une fois, absente au rechargement, variante sans mouvement). `DESIGN.md` l. 212 et 392 : journée combinée, célébration brève et record permis ; ni badges, ni trophées, ni confettis.
9. check, lint, test, api:check (ni migration, ni contrat, ni MCP).

**Décisions de l'ouvrier (recommandations) :**
- **Jour sans carte due :** la moitié révision est « sans objet » et compte comme atteinte ; la journée ne dépend alors que de l'ajout.
- **Garde-fou :** pleine = ajout atteint et (révision atteinte ou rien de dû) ; claire = non pleine, et ajout atteint ou révision atteinte avec au moins une carte due. Un jour sans activité reste vide.
- **« Due ce jour-là » :** présentable à minuit (stable dans la journée).
- **Critère par carte**, pas par sens.
- **Affichage :** « 1/2 cartes ajoutées » et « 7/12 cartes à jour » avec coche ; variantes « Rien à réviser aujourd'hui » et « 30 révisions : à jour » ; « 5 jours de série · record 12 ».
- **Célébration :** là où la journée devient pleine (`/cards` après un ajout, `/review` après la réponse décisive), repli au prochain chargement de `/cards`.
- **Mémoire par navigateur** (`localStorage`) plutôt qu'en base (éviterait une migration).
- **Carte réinitialisée par une édition :** non due avant la réinitialisation (sens indulgent).

**Risques :**
- `/cards` charge tous les logs (avec `stateBefore`), acceptable à cette échelle ; `/review` ne fait que le calcul du jour.
- Deux nombres voisins sur `/cards` (dues aujourd'hui / dues à l'ouverture) : libellés à distinguer.
- `DailyProgress` change de forme : recoupe t12 et t17 (`cards/+page.server.ts`, `GoalCalendar.svelte`).
- `bothDirections` appliqué à tout l'historique.
- La série du bac à sable sera probablement plus courte.

**À relire en premier (à l'exécution) :**
- `review-day.ts` : « due » à l'ouverture et règle « sans objet » ;
- `daily-goal.service.ts` : niveaux full/partial et garde-fou ;
- `Celebration.svelte` : déclenchement et mémoire par navigateur.

## Questions
- 2026-10-30 — **Développeur : un seul calendrier, pas deux.** Options proposées :
  - A (recommandée) : un objectif du jour combiné (ajout + révision). Case pleine = les deux atteints, claire = un seul, vide = aucun. Une série, un record, une célébration ; la série ne compte que les jours pleins.
  - B : deux objectifs gardés, chaque case montre les deux (moitié ajout, moitié révision), deux séries et deux records au-dessus du calendrier.
  - Réponse : **A** (story amendée).

## Review
Rapport DONE du 2026-10-30. Worktree `.claude/worktrees/t6-calendrier-revisions`, 1 commit 996b3a9 sur dev b51c99c, 258 tests verts, contrat inchangé, pas de migration. Pas de vérification visuelle dans un navigateur. Relecture requise (passé par un plan).

**Décisions de l'ouvrier :**
- Célébration montée une seule fois dans `(app)/+layout.svelte`, avec `dailyGoal.today` chargé par `(app)/+layout.server.ts` (au lieu de GoalCalendar et /review, suggéré par /simplify) : elle se déclenche sur n'importe quelle page dès que la journée devient pleine.
- Libellés : « Journée complète » / « Aujourd'hui », « 1/2 cartes ajoutées », « 7/12 cartes à jour », « N révisions faites » (plafond), « aucune carte due », « Record : N ». Légende : « Ajout et révision » / « L'un des deux ».
- Champ `ReviewDay.done` (atteint, ou rien de dû) : la règle « sans objet » vit dans le domaine seulement.
- Recherche dichotomique sur les minuits dans `summarizeReviewDays`.

**Revue auto (/simplify) :** ~12 corrections appliquées.
- [x] remaining — `apps/web/src/lib/server/domain/reviews/review-day.ts:139` : charge tout le JSON `stateBefore` de chaque log sur /cards pour lire `due` (SQL brut ou colonne seraient moins coûteux ; demanderait SQL brut ou migration).
- [x] remaining — `apps/web/src/lib/server/domain/reviews/review-day.ts:104` : boucle sur chaque jour en retard de chaque carte, et `buried` reparcourt les logs du sens opposé. OK à cette échelle.
- [x] remaining — helpers de création/réponse dupliqués entre `daily-goal.service.spec.ts` et `review-day.spec.ts` (pas déplacés dans `testing/factories`).
- [x] remaining — pas de filtre `reviewedDirections` dans la requête : les réponses à un sens qui n'est plus révisé doivent compter dans l'historique.

**À relire en premier :**
- [x] `apps/web/src/lib/server/domain/reviews/review-day.ts:44` : « due à l'ouverture du jour », règle du sens mis de côté ; carte réinitialisée non due avant la réinitialisation.
- [x] `apps/web/src/lib/server/domain/cards/daily-goal.service.ts:34` : règle pleine/claire ; jour sans carte due = ajout seul ; « sans objet » seul ne rend jamais une case claire.
- [x] `apps/web/src/routes/(app)/+layout.server.ts:17` : `today()` tourne à chaque chargement du layout (chaque navigation ou envoi de formulaire) ; lit toutes les révisions du propriétaire et les logs des 48 dernières heures.

## Log
- 2026-10-29 — créé depuis la suite de la story ajout-quotidien. Part après t1 et t3.
- 2026-10-30 — ouvrier lancé en PLAN MODE (opus, high), en parallèle du plan de t12
- 2026-10-30 — plan interrompu par la limite d'usage (levée à 14:10), repris par SendMessage à 14:28
- 2026-10-30 — PLAN READY, attend la validation du développeur. Exécution après t12 (zones communes).
- 2026-10-30 — plan refusé en l'état : le développeur veut un seul calendrier. Question ouverte (A/B).
- 2026-10-30 — réponse A. Ouvrier relancé en PLAN MODE pour réviser le plan.
- 2026-10-30 — PLAN READY (révisé, un seul calendrier). Attend la validation. Exécution après t12.
- 2026-10-30 — plan révisé validé tel quel. Exécution (même ouvrier, EXECUTION MODE) après l'intégration de t12.
- 2026-10-30 — t12 intégré ; même ouvrier relancé en EXECUTION MODE (opus, high), AUTO REVIEW /simplify.
- 2026-10-30 — DONE : journée Poj combinée, calendrier unique, célébration dans le layout, 258 tests verts. Statut in-review. [delivered] prêt à relire.
- 2026-10-30 — relecture guidée commencée ; 6 points cochés par le chef (perf acceptable à cette échelle, doublon de tests mineur, filtre volontaire, règles conformes au plan validé).
- 2026-10-30 — relecture terminée : célébration dans le layout acceptée (coût négligeable à cette échelle).
- 2026-10-30 — intégré dans dev par avance rapide (996b3a9), sans conflit, 258 tests verts. Worktree et branche supprimés.
