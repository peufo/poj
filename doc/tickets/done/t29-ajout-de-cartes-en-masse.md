---
id: t29
title: Limite de nouvelles cartes par jour et par deck
status: done
priority: normal
story: doc/story/ajout-en-masse.md
depends_on: []
plan_required: true
review: required
model: opus
effort: high
zones: [apps/web/prisma, apps/web/src/lib/server/domain/reviews, apps/web/src/lib/server/domain/decks, apps/web/src/lib/server/domain/cards, apps/web/src/routes/(app)/decks, apps/web/src/routes/(app)/review, apps/web/src/lib/server/web/schemas]
branch: ticket/t29-limite-nouvelles-cartes
agent: a971b789f5a51d6b6
created: 2026-10-31
updated: 2026-11-05
---

## Context
Story `doc/story/ajout-en-masse.md` (validée le 2026-11-01, voir ses décisions et l'enquête de coût). L'ajout en masse est admis ; pour qu'un afflux de cartes motive au lieu d'écraser, les nouvelles cartes sont lissées **au moment de la révision** par une limite quotidienne, par deck.

Faits (enquêtes du 2026-11-01) :
- une carte neuve est due dès sa création (`cards.service.ts:42-45`), une révision par sens ;
- `next` prend la plus ancienne échéance sans distinguer neuves et dues (`reviews.service.ts:129-143`) ; `isNew` n'est qu'un drapeau d'affichage (`:165`) ; le second sens est mis de côté 24 h (`availability.ts:7`, `reviews.service.ts:64-79`) ;
- la journée de révision compte comme due toute carte échue à minuit, neuves comprises (`review-day.ts:33-36`, `95-104`, invariant « ce que countDue aurait compté à l'ouverture du jour ») ; stats / horizon et `nextDue` comptent aussi les neuves (`cards.service.ts:257-295`, `reviews.service.ts:144-150`, `routes/(app)/review/+page.server.ts:23`).

Décisions :
- limite **par deck**, 10 par jour par défaut, réglable dans les réglages du deck ;
- la limite compte des **cartes** (première réponse, quel que soit le sens), par **jour civil Europe/Zurich** ; le second sens est hors quota ;
- une carte neuve au-delà du quota est un **stock, pas une dette** : une seule règle de présentation partagée par `countDue`, `next` (et `ahead`), `nextDue`, stats / horizon et la journée de révision. Web et MCP passent par le même service.

## Done criteria
- [ ] Chaque deck a un réglage « nouvelles cartes par jour » (10 par défaut, borne métier dans le domaine), modifiable dans ses réglages ; migration selon les conventions du schéma.
- [ ] Un deck qui reçoit 200 cartes n'en présente que 10 nouvelles par jour (web et MCP) ; les cartes déjà vues ne changent pas ; les autres decks ne sont pas affectés.
- [ ] Deck à deux sens : 10 cartes neuves par jour, le second sens d'une carte déjà commencée ne consomme pas le quota.
- [ ] Les cartes neuves hors quota ne sont pas « dues » : `countDue`, `remaining`, `nextDue`, stats / horizon et la journée de révision les ignorent ; un lot de 200 cartes ne fait échouer ni la journée ni la série.
- [ ] Le comportement en révision en avance (`ahead`) est défini et testé.
- [ ] Tests serveur couvrant ces cas ; les tests passent.

## Plan
Rendu le 2026-11-01 (opus, high). Branche `ticket/t29-limite-nouvelles-cartes`. ~20 fichiers (plus que les 8-12 estimés).
1. **Schéma** : modèle `NewCardsLimit` (`new_cards_limits` : deckId, perDay, effectiveFrom, unique (deckId, effectiveFrom), sans deletedAt), calqué sur `DailyGoal` ; 10 par défaut sans ligne ; migration.
2. **`domain/reviews/new-cards.ts`** : bornes `DEFAULT/MIN/MAX_NEW_CARDS_PER_DAY` (10, 1, 100), `limitOn(history, dayStart)`. Règle unique : une carte est **neuve** tant qu'aucun de ses sens n'a été répondu ; quota = limite du jour − cartes dont la première réponse (tous sens) tombe aujourd'hui (Zurich) ; libération des premières neuves par (createdAt, id), le reste en stock. Sortie `{ released, held }` + filtre `OR [déjà répondue, id in released]`.
3. **`reviews.service`** : filtre appliqué à `countPresentable` (countDue, remaining) et `availableFilter` (next, ahead, nextDue), calculé une fois par appel ; s'il ne reste que du stock, `nextDue` = minuit le lendemain ; `NextResult` vide gagne `waiting` ; `heldNewCards()`.
4. **`cards.service`** : `reviewSlots` filtré → `stats.dueToday` et `horizon` ignorent le stock.
5. **`review-day.ts`** : tracks avec deckId, `card.createdAt`, `firstAnswer` (min des logs, `groupBy`) ; une carte neuve à minuit J ne compte comme due que dans les `limitOn(deck, J)` premières ; `daily-goal.service` passe l'historique des limites.
6. **Decks** : `DeckUpdate.newCardsPerDay?`, upsert de la ligne du jour si changement, `decks.newCardsPerDay()` ; `deckUpdateSchema` `n:newCardsPerDay` (bornes du domaine, message FR) ; champ dans `DeckForm.svelte` en mode edit seulement.
7. **Pages** : `/review` : si seul le stock reste, « N nouvelles cartes attendent les jours suivants » ; `/cards` : carte en stock avec `day: null`.
8. **Tests** : 200 cartes → 10 neuves/jour puis 10 le lendemain ; deux sens (second sens hors quota) ; autre deck intact ; cartes vues inchangées ; `ahead` ne tire jamais le stock ; compteurs ; journée et série intactes avec un lot de 200 ; changement de limite non rétroactif ; un test MCP `next_review`/`remaining` ; `REVIEWS_CAP` via une limite haute.
9. **Docs** : `specs/repetition.md`, `specs/mcp.md` (`next_due`), `story/web.md:21,70`, commentaires.

**Décisions de l'ouvrier :**
- **Limite historisée (table) plutôt qu'une colonne `decks.new_cards_per_day`** : avec une colonne, relever la limite rendrait rétroactivement « non atteints » des jours passés et casserait la série. Colonne moins chère : **à trancher par le développeur**.
- « Neuve » = jamais répondue (logs) ; une carte réinitialisée par édition n'est pas soumise au quota (`story/web.md:45`).
- `ahead` ne présente jamais le stock.
- Le quota compte les cartes commencées aujourd'hui puis supprimées ; une limite modifiée s'applique dès aujourd'hui.
- L'horizon ignore le stock (pas de projection de 10/jour).

**Risques :** contact avec t31 dans `reviews.service.ts` (conflit textuel probable, facile) et `cards.service.ts` ; `createBatch` doit donner des `createdAt` croissants pour garder l'ordre du lot ; 3 requêtes de plus par `next`/`countDue`/layout ; débordement de zones (`routes/(app)/cards/+page.server.ts`, `daily-goal.service.ts`, `lib/format/decks.ts`, `DeckForm.svelte`, `deck-form.ts`, docs) ; le texte MCP « Prochaine révision dans N heures » ne dit pas que des cartes attendent (`server.ts` laissé à t31).

**À relire en premier (à l'exécution) :**
- `apps/web/prisma/schema.prisma` · 7/10 · table d'historique ou simple colonne.
- `apps/web/src/lib/server/domain/reviews/new-cards.ts` · 7/10 · bornes 1–100 (0 = pause exclu) ; définition de « neuve » par les logs.
- `apps/web/src/routes/(app)/review/+page.svelte` · 6/10 · texte quand seul le stock reste ; `/cards` sans jour pour le stock.

**Pour le développeur :** après intégration, `bun run db:migrate`.

## Questions

## Review
Rapport DONE du 2026-11-05. Worktree `.claude/worktrees/t29-limite-nouvelles-cartes`. 310 tests verts, contrat inchangé, dev n'avait pas bougé.
- Limite par deck (10 par défaut, 1 à 100) dans « Modifier le deck », table d'historique `new_cards_limits` + migration.
- Règle unique dans `new-cards.ts` (`findNewCards` / `splitNewCards`) pour `countDue`, `remaining`, `next`/`ahead`, `nextDue`, stats, horizon et journée de révision (série). Web et MCP par le même service.
- Pages : `/review` dit combien de cartes attendent ; `/cards` met les cartes en attente hors échéancier. Specs `repetition.md`, `mcp.md`, story `web.md` à jour.
- Décisions : « neuve » = aucun sens répondu (une carte réinitialisée par édition échappe à la limite) ; le quota du jour compte les cartes commencées aujourd'hui même supprimées ; ordre (createdAt, id) ; `ahead` n'avance jamais le stock ; `nextDue` = minuit le lendemain s'il ne reste que du stock ; limite inchangée = pas de ligne, second changement du jour = remplace ; la journée de révision applique la limite en vigueur chaque jour passé.
- Revue auto /simplify : 3 corrections appliquées.
- [ ] REVIEW FIRST — `apps/web/src/lib/server/domain/reviews/new-cards.ts:98` · 8/10 · `findNewCards` porte la règle (première réponse tous sens, quota du jour à Zurich) ; définition de « neuve » à confirmer.
- [ ] REVIEW FIRST — `apps/web/src/lib/server/domain/reviews/review-day.ts:123` · 8/10 · une carte neuve à minuit ne compte comme due que dans la limite du jour de son deck : touche la série existante (testé : lot de 200, limite relevée).
- [ ] REVIEW FIRST — `apps/web/src/routes/(app)/review/+page.svelte:250` · 6/10 · texte « Les nouvelles cartes du jour sont faites : N autres attendent les jours suivants. » ; aide du champ `DeckForm.svelte:223`.
- [ ] remaining — `apps/web/src/routes/(app)/cards/+page.server.ts:41` · 7/10 · `findNewCards` tourne 4 fois par chargement de `/cards` (12 petites requêtes).
- [ ] remaining — `apps/web/src/lib/components/DeckForm.svelte:200` · 7/10 · champ numérique dupliqué de `GoalCalendar.svelte`.
- [ ] remaining — `apps/web/src/lib/server/domain/reviews/new-cards.ts:20` · 7/10 · `limitOn` copie `goalOn`, schéma Zod copie `dailyGoalSchema`.
- [ ] remaining — `apps/web/src/lib/server/domain/cards/cards.service.ts:63` · 6/10 · l'horizon ignore le stock (sous-estime les jours à venir).
- [ ] remaining — `apps/web/src/lib/server/domain/reviews/review-day.ts:150` · 7/10 · `groupBy` des premières réponses sur tout l'historique à chaque layout.
- Pour le développeur : `bun run db:migrate` après intégration.

## Log
- 2026-10-31 — créé depuis une remarque. En `idea` : contredit la décision « pas d'import de gros deck » (decks.md), à revoir en idéation.
- 2026-10-31 — deuxième décision contredite relevée : rejet de l'ajout groupé MCP (connexion-assistants.md).
- 2026-11-01 — idéation : ajout en masse admis (décisions du 29/10 révisées), lissage par limite de nouvelles cartes/jour à la révision, première version = lot MCP + limite ; import web reporté (t30) ; objectif quotidien inchangé.
- 2026-11-01 — idéation : limite par deck (10/jour par défaut) ; outil MCP create_cards plafonné, une confirmation par lot.
- 2026-11-01 — contre-lecture ork:critic intégrée (stock pas dette, unité = cartes, jour civil, second sens hors quota). Découpage validé : t29 = limite, t31 = create_cards, t30 = import web. Ready, plan et relecture requis (migration).
- 2026-11-01 — zones recoupées avec t22 (in-review, web/schemas) : part après l'intégration de t22.
- 2026-11-01 — t22 intégré : lancé en PLAN MODE (opus, high). Zones recoupées avec t31 (domain/cards, reviews) : l'exécution attendra l'intégration de t31.
- 2026-11-01 — PLAN READY, attend la validation (table ou colonne pour la limite).
- 2026-11-05 — réactivé : seuls t30, t32 et le tapis roulant sont en pause. Le tapis étant en pause, la série reste : le plan tel quel (table historisée, étape 5) redevient pertinent.
- 2026-11-05 — plan validé tel quel par le développeur (table historisée, étape 5). Même ouvrier relancé en EXECUTION MODE (opus, high), AUTO REVIEW /simplify. t31 exécuté après l'intégration de t29.
- 2026-11-05 — DONE, 310 tests verts. In-review (relecture requise : migration). [delivered] prêt à relire.
- 2026-11-05 — intégré dans dev par avance rapide, sans relecture des points à la demande du développeur. Reste à Jonas : `bun run db:migrate` (table new_cards_limits).
