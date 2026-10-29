---
id: T-0001
titre: Objectif quotidien d'ajout de cartes, série et calendrier sur le web
statut: en-cours
priorite: normale
story: doc/story/ajout-quotidien.md
plan_requis: true
modele: opus
effort: high
zones: [apps/web/prisma, apps/web/src/lib/server/domain/cards, apps/web/src/lib/server/auth-config.ts, apps/web/src/routes/(app), apps/web/src/lib/components]
branche: ticket/T-0001-objectif-quotidien
agent: af811b014503f65e9
cree: 2026-10-29
maj: 2026-10-29
---

## Contexte
Le but est de gamifier l'ajout de cartes avec un objectif quotidien et un calendrier d'accomplissement sur le web. C'est une gratification purement visuelle : Claude n'annonce rien. Voir la story `doc/story/ajout-quotidien.md`.

L'enquête préalable a établi les points suivants :
- `Card` porte `createdAt` et `deletedAt`, avec l'index `[ownerId, createdAt]` ;
- le fuseau est fixe : `TIME_ZONE = 'Europe/Zurich'` dans `domain/time.ts`, qui contient déjà `startOfDay` et `calendarDaysBetween`. `cards.horizon()` peut servir de modèle pour un calcul par jour ;
- aucun réglage utilisateur n'existe : `User` n'a que id, nom, email et image ;
- `/` redirige vers `/cards`, et il n'y a pas de tableau de bord. Le layout `(app)` fournit déjà `nav.dueCount` et `cardCount`.

## Règles
- **Objectif :** un nombre de cartes à ajouter par jour, 2 par défaut, modifiable sur le web.
- **Jour réussi :** un jour civil (Europe/Zurich) où le nombre de cartes créées atteint l'objectif.
- **Les cartes supprimées comptent toujours** pour leur jour de création. Ce qui compte, c'est l'acte d'ajouter.
- **Série :** elle compte les jours réussis consécutifs. Un jour manqué est toléré et la série continue. Deux jours manqués d'affilée l'arrêtent.
- **Aujourd'hui :** tant que la journée n'est pas finie, elle ne compte pas comme manquée.

## Critères de fin
- [ ] L'objectif quotidien est stocké par utilisateur (2 par défaut), via une migration qui suit les conventions du schéma.
- [ ] L'objectif est modifiable depuis le web.
- [ ] Un service du domaine calcule, sur une période donnée, le compte par jour, l'atteinte de l'objectif et la série en cours. Il est couvert par des tests Vitest : jour toléré, deux jours manqués, cartes supprimées, limite de jour en Europe/Zurich, aujourd'hui en cours.
- [ ] Un calendrier d'accomplissement est visible sur le web, en tête de `/cards`, sauf meilleure proposition dans le plan. Il montre les jours réussis, la progression du jour (ex. 1/2) et la série.
- [ ] Le contrat OpenAPI est inchangé, ou régénéré si une route est touchée.
- [ ] Les tests passent.

## Plan
(rendu par l'ouvrier le 2026-10-29)

1. **Schéma :** un modèle `DailyGoal` (`daily_goals`).
   - Champs : id uuid(7), userId (relation User, Cascade), goal Int, effectiveFrom (minuit Europe/Zurich du jour du changement), createdAt et updatedAt.
   - Contrainte `@@unique([userId, effectiveFrom])`.
   - Pas de deletedAt : la table est en ajout seul, comme ReviewLog.
   - Sans aucune ligne, l'objectif vaut 2.
   - La migration est créée avec `--create-only` sur poj_test.
2. **Domaine :** `domain/cards/daily-goal.service.ts`, avec `createDailyGoalService(db)`.
   - `goal(ownerId, now)` donne l'objectif courant.
   - `setGoal(ownerId, goal, now)` fait un upsert sur startOfDay(now) et n'accepte qu'un entier de 1 à 20.
   - `progress(ownerId, now, days)` renvoie `{ goal, today, streak, days[] }`.
3. **Calcul :** les createdAt de toutes les cartes, supprimées comprises, sont rangés par jour en TS.
   - Chaque jour est jugé avec l'objectif de l'époque.
   - La série porte sur tout l'historique.
   - Le calcul est une fonction pure, exportée et testée seule.
4. **Série :** on remonte depuis hier.
   - Un jour réussi compte +1.
   - Un jour manqué est toléré, sans compter.
   - Deux jours manqués d'affilée arrêtent la série.
   - Aujourd'hui compte +1 s'il est réussi, sinon il est ignoré.
5. **Tests :** `daily-goal.service.spec.ts`, avec des cartes datées via `createOnce`.
   - Cas : jour toléré, deux jours manqués, cartes supprimées, limite à minuit à Zurich (y compris un jour de changement d'heure), aujourd'hui en cours.
   - Cas encore : changement d'objectif non rétroactif, cartes d'un autre utilisateur, validation.
6. **Web :** `/cards` charge `progress` sur 8 semaines alignées au lundi, avec l'action `?/goal`.
7. **Composant :** `GoalCalendar.svelte`, en tête de `/cards`, affiché même quand le paquet est vide.
   - Contenu : « Aujourd'hui 1/2 », « Série : 5 jours », et une grille de 8 semaines sur 7 jours.
   - Couleurs : encre neutre, accent seulement pour aujourd'hui, aria-label sur chaque case.
8. **Réglage :** un `<details>` dans la même section, avec `use:enhance`. Il fonctionne sans JavaScript.
9. **Ce qui n'est pas touché :** aucune route API, ni `auth-config.ts`.
10. **Finalisation :** tests, commits, rebase sur dev, puis tests à nouveau.

**Décisions proposées :**
- **Contradiction avec `apps/web/DESIGN.md` :** ses lignes 212 et 394 rejettent « séries, trophées, confettis ». L'ouvrier recommande d'amender DESIGN.md pour autoriser une série sobre, sans trophées ni confettis. Il s'arrête sans accord.
- **Historique de l'objectif :** une table d'historique plutôt qu'une colonne sur users. Le changement n'est pas rétroactif et évite `additionalFields` de Better Auth.
- **Jour toléré :** il ne compte pas dans la longueur de la série.
- **Calendrier :** 8 semaines.
- **Réglage :** dans la même section que le calendrier, sans page Réglages.

**Risques :**
- La migration s'applique à poj_test, partagée par tous les checkouts.
- Le rangement par jour se fait en TS : négligeable avec quelques milliers de cartes.
- `cards.create` n'utilise pas `now` pour createdAt : les tests passent par `createOnce`.

## Questions

## Journal
- 2026-10-29 — créé depuis la story ajout-quotidien
- 2026-10-29 — ouvrier lancé en MODE PLAN (opus, high)
- 2026-10-29 — plan prêt, en attente de validation (contradiction DESIGN.md à trancher)
- 2026-10-29 — plan validé (toutes les recommandations, amendement DESIGN.md accepté : série sobre, ni trophées ni confettis) ; MODE EXÉCUTION
