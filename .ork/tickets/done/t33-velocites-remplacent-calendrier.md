---
id: t33
title: Les vélocités remplacent le calendrier, l'objectif quotidien et la série
status: done
priority: normal
story: doc/story/tapis-roulant.md
depends_on: []
plan_required: true
review: required
model: opus
effort: high
zones: [apps/web/src/routes/(app)/cards, apps/web/src/lib/components, apps/web/src/lib/server/domain/cards, apps/web/src/lib/server/domain/reviews, apps/web/prisma, apps/web/src/lib/server/web/schemas]
branch: ticket/t33-velocites
agent: a21df24725d71bd56
created: 2026-11-05
updated: 2026-11-06
---

## Context
Story `doc/story/tapis-roulant.md` (décisions du 2026-11-01). Le passé se résume en deux vélocités, qui deviennent l'objectif : le nombre de répétitions (moyenne glissante sur 7 jours) et le nombre de cartes mûres (stabilité FSRS au-delà d'un seuil, ~21 jours). La série, l'objectif quotidien et le calendrier d'accomplissement sont supprimés (révise `ajout-quotidien.md`, décisions des 29 et 30/10).

Existant (enquête du 2026-11-01) : `GoalCalendar.svelte` sur `/cards` (8 × 7 cases, objectif, série, record) ; `daily-goal.service.ts` (`progress`, `streaksOf`) ; `review-day.ts` ; `Celebration.svelte` (déclenchée par un jour plein) ; table de l'objectif quotidien (`DailyGoal`).

Zones recoupées avec t29 (`review-day.ts`, protégé par t29) : part après l'intégration de t29.

## Done criteria
- [ ] `/cards` affiche les deux vélocités (répétitions sur 7 jours glissants, cartes mûres) à la place du calendrier.
- [ ] Objectif quotidien (réglage compris), série, record, calendrier et journée de révision sont supprimés, code et docs (`ajout-quotidien.md`, specs) à jour.
- [ ] La célébration (`Celebration.svelte`) est supprimée.
- [ ] La table de l'objectif quotidien est supprimée par une migration.
- [ ] Les tests passent.

## Plan
1. Domaine : `reviews.velocities(ownerId, now)` dans `reviews.service.ts`, constantes `MATURE_STABILITY_DAYS = 21` et `VELOCITY_WINDOW_DAYS = 7`, type `Velocities` dans `reviews/types.ts`. Deux `count` Prisma, pas de service à part.
2. Suppressions serveur : `daily-goal.service.ts` et `review-day.ts` avec leurs specs, `goal.remote.ts`, `dailyGoalSchema` et son test, `dailyGoal` de `services.ts`, export de `index.ts`, types `AddDay`, `DayLevel`, `GoalDay`, `DailyProgress`, `ReviewDay`.
3. Code orphelin : `byCreation` et `NewCard` (`new-cards.ts`), `weekdayIndex` et son test (`time.ts`). `limitOn`, `limitHistory` et `splitNewCards` restent.
4. Migration écrite à la main `20261106090000_drop_daily_goals` : `DROP CONSTRAINT daily_goals_user_id_fkey`, `DROP TABLE daily_goals`. Retrait du modèle `DailyGoal` et de `User.dailyGoals`. Pas de `db:migrate` depuis le worktree ; contrôle par `prisma migrate diff` sur la base de test du worktree.
5. Web : supprimer `GoalCalendar.svelte`, `Celebration.svelte` et sa spec, `data.day` et `dailyGoal.today` du layout `(app)`. Créer `Velocities.svelte` et sa spec client, affiché sur `/cards` dans la branche « a des cartes », au-dessus de l'échéancier.
6. MCP : retirer la phrase sur l'objectif quotidien de `OFFER_RULE` (`guidance.ts:26`), adapter `server.spec.ts:1128`, retirer `doc/specs/mcp.md:187`.
7. Tests : `velocities` dans `reviews.service.spec.ts`, assertion dans `seed.spec.ts`, `?/goal` remplacé dans `redirect-to.spec.ts:37` et `guards.spec.ts:36`.
8. e2e : retirer `sets the daily goal` de `cards.e2e.ts`, ajouter un test des deux vélocités, lancer ce seul spec.
9. Docs : `ajout-quotidien.md`, `doc/decisions.md`, `tapis-roulant.md`, `ajout-en-masse.md`, `decks.md`, `repetition.md:48,50`, `apps/web/DESIGN.md`, `CLAUDE.md:88` (`MAX_DAILY_GOAL` → `MAX_NEW_CARDS_PER_DAY`), commentaires de `schema.prisma` et `decks.service.ts:191`.
10. Fin : `/simplify`, tests complets, commit, rebase sur `dev`, nouvelle passe de tests.

**Définitions**
- Répétitions par jour : `ReviewLog` du propriétaire avec `reviewedAt` dans `]now − 7 × 24 h, now]`, divisé par 7. Toutes notes, web et Claude, tous decks, cartes supprimées ou réinitialisées comprises. Affichage à une décimale au plus, format français.
- Cartes mûres : cartes non supprimées dont chaque sens révisé a `state = review` et `stability ≥ 21`. Le nombre peut baisser (oubli, carte modifiée, deck passé à deux sens).
- Sur la seed du bac à sable (SQL équivalent) : 2,6 par jour ; 4 cartes mûres sur 25 (9 si un seul sens suffisait).

**Sans changement** : API REST, `openapi.json`, iOS, code de la seed (grep vide sur `goal` et `streak`). La clé `poj.celebrated` reste dans le `localStorage`, sans effet.

**t29** : la story le dit, t29 n'a plus à protéger la journée de révision ni la série. Ce qui reste vrai est couvert par `reviews.service.spec.ts:575-709`.

**Décisions de l'ouvrier** : méthode sur le service `reviews` ; sections masquées si la portée n'a aucune carte ; phrase MCP retirée sans remplaçant ; pas d'index ajouté ; `.impeccable/design.json` non touché.

**Risques**
- `DROP TABLE daily_goals` efface l'historique des objectifs sans retour. La migration part au démarrage de l'image.
- Retour arrière cassé : `doc/deploiement.md:54` exige qu'une version antérieure reste compatible avec le schéma. Une ancienne image interrogerait `daily_goals` dans le layout, donc 500 sur toutes les pages de `(app)`. L'ouvrier ne prévoit pas de déploiement en deux temps.
- La migration n'est pas essayée sur la base de dev (à jouer après l'intégration).
- Si `dev` reçoit une autre migration, vérifier l'ordre des horodatages au rebase.

**Après l'intégration, pour le développeur** : `bun run db:migrate` dans le checkout principal ; avant le déploiement sur `main`, `pg_dump -t daily_goals` pour garder l'historique.

## Questions
- 2026-11-01 — Ouvertes : (1) célébration : la rattacher à un palier de cartes mûres (10, 50, 100…) ou la supprimer ? (2) table de l'objectif quotidien : la supprimer par une migration, ou la garder inutilisée ?
- 2026-11-05 — Réponse (2) : supprimer l'objectif quotidien, table comprise (migration). (1) célébration : toujours ouverte.
- 2026-11-05 — Réponse (1) : supprimer la célébration (`Celebration.svelte`).
- 2026-11-06 — Soulevées au plan, en attente de validation (recommandations de l'ouvrier) : (a) sur `/cards?deck=x`, vélocités globales, avec mention « tous les decks » (7/10), plutôt que par deck ; (b) cartes mûres en stock (7/10) plutôt qu'en flux sur 7 jours ; (c) mûre quand tous les sens révisés le sont (7/10), plutôt qu'un seul ; (d) seuil de 21 gardé (7/10), alors que la barre de maîtrise dit « Solide » à 30 et compte des sens ; (e) `new_cards_limits` inchangé (8/10), ticket à part si voulu.

## Review
**REVIEW FIRST**
- [ ] `apps/web/src/lib/components/Velocities.svelte:32` · 6/10 · comportement visible : libellés (« répétitions par jour », « retenues pour 21 jours ou plus ») et place du panneau en tête de `/cards`. Le ton relève du goût du développeur.
- [ ] `apps/web/src/routes/(app)/cards/+page.svelte:84` · 7/10 · écart à la réponse du développeur : « Tous les decks » n'apparaît qu'avec plusieurs decks, car avec un seul deck `deckInScope` rend ce deck même sans `?deck=`, et la mention tombait à faux.
- [ ] `apps/web/prisma/migrations/20261106090000_drop_daily_goals/migration.sql:5` · 9/10 · donnée supprimée sans retour ; une image antérieure répondrait 500 sur les pages connectées (accepté par le développeur). Jouée seulement sur la base de test du worktree et la base e2e ; `migrate diff` ne détecte aucune différence.

**AUTO REVIEW**
- `/simplify` : 4 corrections appliquées (`DAY` exporté de `time.ts` ; `velocities()` rend aussi `windowDays` et `matureDays` ; `newCardsOrder` inliné ; `splitNewCards` et `NewCardsLimitChange` non exportés). Écartés : `NOT IN` supposé balayer tous les utilisateurs (faux positif, `NOT EXISTS` corrélé d'après l'ouvrier), `query()` distante, `Intl.NumberFormat` au niveau module.
- remaining :
  - `apps/web/src/lib/server/domain/reviews/new-cards.ts:14` · 8/10 · historique de `new_cards_limits` sans lecteur du passé, laissé tel quel sur décision du développeur.
  - `apps/web/src/lib/server/domain/reviews/new-cards.ts:48` · 8/10 · `splitNewCards` n'a plus qu'un appelant et garde son `quota` en callback.

## Log
- 2026-11-05 — créé au découpage de la story tapis-roulant (en pause). En `idea` tant que les deux questions ne sont pas tranchées. [pause]
- 2026-11-05 — le développeur tranche : l'objectif quotidien est supprimé, table comprise.
- 2026-11-05 — questions tranchées (célébration et table supprimées). Critères clairs ; reste en `idea` tant que le tapis roulant est en pause. [pause]
- 2026-11-06 — le développeur lève la pause pour ce ticket (t34 et t35 restent en pause). Lancé en PLAN MODE (opus, high).
- 2026-11-06 — plan rendu (`ticket/t33-velocites`, au niveau de `dev` 4719afb, aucun fichier du projet modifié). En attente de validation.
- 2026-11-06 — plan validé tel quel par le développeur : recommandations (a) à (e) retenues, retour arrière incompatible accepté (pas de déploiement en deux temps). Ouvrier relancé en EXECUTION MODE.
- 2026-11-06 — DONE (`ticket/t33-velocites`, commit fdf3795, au-dessus de `dev` 4719afb ; worktree `.claude/worktrees/t33-velocites`). `/cards` affiche les deux vélocités (2,6 répétitions par jour et 4 cartes mûres sur le bac à sable) ; objectif, série, record, calendrier, journée de révision, célébration, table `daily_goals` et phrase MCP supprimés ; docs à jour, exception au retour arrière notée dans `doc/decisions.md` et `doc/deploiement.md:54`. Tests : commande complète verte avant le commit (322 tests), rebase sans effet. e2e : `cards.e2e.ts` 5/5 avant le dernier ajustement de la mention, seul le test des vélocités relancé ensuite ; capture non refaite après cet ajustement. Autres e2e et iOS non lancés. Premier worktree supprimé à la remise du plan, recréé par l'ouvrier.
- 2026-11-06 — à la demande du développeur, pour la relecture : checkout principal basculé de `dev` sur `review/t33` (au niveau de fdf3795), worktree gardé, sans push ni migration. Revenir sur `dev` avant d'intégrer ; la branche `review/t33` sera à supprimer.
- 2026-11-06 — fdf3795 arrivé sur `dev` sans passer par l'intégration ork : le commit 6215854 (`remove outputStyle ork by default`), posé à 21 h 41 sur `review/t33`, a été rebasé à 21 h 43 sur `dev` depuis `review/t33`, ce qui a amené fdf3795 (d'après le reflog). Les points de relecture ne sont pas cochés, aucune fin de relecture notée, ticket laissé en `in-review`.
- 2026-11-06 — le développeur renonce à la relecture guidée et demande l'intégration : points de `## Review` laissés non cochés. Rien à poser, fdf3795 étant déjà sur `dev`, sans conflit ; tests non relancés après 6215854, qui ne touche que `.claude/settings.json`. Worktree, `ticket/t33-velocites` et `review/t33` supprimés, `worktree:prune` lancé. Clos.
- À faire par le développeur : `bun run db:migrate` dans le checkout principal ; `pg_dump -t daily_goals` avant le déploiement sur `main` si l'historique doit être gardé.
