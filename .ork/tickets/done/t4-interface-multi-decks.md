---
id: t4
title: Interface web multi-decks (navigation, création de deck, révision par deck)
status: done
priority: normal
story: doc/story/decks.md
plan_required: true
review:
model: opus
effort: high
zones:
  - apps/web/src/routes/(app)
  - apps/web/src/lib/components
  - apps/web/src/lib/server/domain/decks
  - apps/web/src/lib/server/domain/reviews
branch: ticket/T-0004-web-multi-decks
agent: ae7cfd458fd18087c
created: 2026-10-29
updated: 2026-10-29
---

## Context
Ce ticket fait suite à t3, qui ouvre le modèle : il crée l'entité Deck avec son type (langue ou sujet), sa paire de langues, le nom de ses faces et l'option « réviser dans les deux sens ». t4 ajoute l'**interface web** multi-decks. Voir la story `doc/story/decks.md`.

Capture du développeur : `.ork/tickets/captures/2026-10-29-nav-cartes.png`. La navigation affiche aujourd'hui « Cartes 1 » puis « + Nouvelle carte ». L'entrée générique « Cartes » doit être remplacée par le nom du deck.

Le plan doit partir de l'état du code **après** l'intégration de t3 (et de t1, avec le calendrier en tête de `/cards`).

## Done criteria
- [ ] La navigation liste chaque deck sous son nom, avec son nombre de cartes, à la place de « Cartes ».
- [ ] On peut créer un deck depuis le web :
  - [ ] un nom ;
  - [ ] un type, langue ou sujet ;
  - [ ] pour une langue : la langue connue et la langue apprise ;
  - [ ] pour un sujet : le nom des deux faces, « Question » / « Réponse » par défaut ;
  - [ ] l'option « réviser dans les deux sens », vraie par défaut pour une langue.
- [ ] Une nouvelle carte se crée dans un deck choisi : celui en cours, ou un choix explicite. Le formulaire affiche les noms des faces du deck. La suggestion DeepL n'apparaît que pour un deck de langue.
- [ ] La révision se lance de deux façons :
  - [ ] l'entrée « Réviser » globale, qui mélange tous les decks ;
  - [ ] un bouton « Réviser » sur chaque deck, qui ne propose que ses cartes.
- [ ] Le suivi (objectif quotidien, série, calendrier de t1) reste global.
- [ ] Le comportement est inchangé pour un utilisateur qui n'a que le deck par défaut.
- [ ] Les tests passent.

## Plan
(rendu par l'ouvrier le 2026-10-29)

1. **Domaine `decks` :** `list` (avec le nombre de cartes, et `ensureDefault` s'il n'y a aucun deck), `get`, `create` et `update` (nom, libellés, bothDirections). Un nom déjà pris donne une ConflictError. Passer bothDirections de faux à vrai crée les b_to_a manquantes en transaction ; l'inverse ne supprime rien.
2. **Filtre commun `reviewedDirections` :** a_to_b, ou bien un deck qui révise les deux sens. Il s'applique à `reviews` (next, countDue, lastAnswer, countPresentable) et aux `cards` (reviewSlots, include.reviews). Le MCP en profite sans changement.
3. **Portée par deck :** un `{ deckId? }` optionnel s'ajoute à `cards.list`, `stats` et `horizon`, et à `reviews.next`, `countDue` et `lastAnswer`.
4. **Navigation :**
   - `AppShell` reçoit la liste des decks à la place de `cardCount` : une entrée par deck (nom et compte), puis « Nouvelle carte » et « Nouveau deck ».
   - Le deck actif vient de `?deck`.
   - Sur mobile, l'onglet « Cartes » reste.
5. **`/cards?deck=<id>` :**
   - Tout porte sur le deck : liste, recherche, échéancier, maîtrise et Réviser. Le titre est son nom, avec l'action « Modifier le deck ».
   - `GoalCalendar` reste global.
   - Sans paramètre, la page montre tous les decks. Sur mobile, une rangée de puces liste les decks.
6. **`/review?deck=<id>` :** la session est limitée au deck. Les liens et les actions sans JS gardent `?deck`.
7. **`/cards/new` :**
   - Le deck vient de `?deck`, sinon c'est le deck par défaut.
   - Le `<select>` des decks n'apparaît qu'à partir de deux decks.
   - Les libellés et le bouton DeepL suivent le deck choisi, et un `deckId` étranger donne une 404.
8. **`/decks/new` et `/decks/[id]/edit` :**
   - Un composant `DeckForm` et `deck-form.ts`.
   - Pour une langue, une liste fermée de langues DeepL ; pour un sujet, les libellés Question / Réponse.
   - Le type et les langues ne se modifient plus après la création.
9. **Tests :**
   - Serveur : decks.service, portée deckId, b_to_a filtrées, deck-form, languages.
   - Navigateur : AppShell, DeckForm.
10. **Finalisation :** rebase sur dev, qui contiendra t7, avec des conflits attendus mais composables. Ni migration ni changement de contrat.

**Décisions proposées :**
- **Modifier un deck :** dans ce ticket (nom, libellés, option des deux sens). Le type et les langues restent figés.
- **Supprimer un deck :** hors ticket, dans un ticket à créer. On supprimerait logiquement le deck et ses cartes, et on refuserait de supprimer le dernier deck.
- **Routage :** un paramètre `?deck=` sur `/cards` et `/review`, plutôt que `/decks/[id]`.
- **Langues :** une liste fermée de langues DeepL, en BCP 47 avec la variante requise (en-GB/en-US, pt-PT/pt-BR).
- **Mobile :** l'onglet « Cartes » reste, et les decks s'affichent en puces en haut de `/cards`.
- **Option des deux sens :** cochée par défaut pour une langue, décochée par défaut pour un sujet.

**Risques :**
- Lors de la bascule de faux à vrai, les b_to_a existantes reprennent leur ancienne échéance et peuvent arriver en retard d'un coup.
- Les puces mobiles s'affichent même avec un seul deck, puisqu'elles portent « Nouveau deck ».
- Des conflits avec t7 dans AppShell, AccountMenu et les layouts.
- Une vingtaine de fichiers.
- La seed reste à un seul deck.

**Validation du développeur (2026-10-29) :** plan validé, avec une correction.
- **Pas de deck par défaut :** on retire `ensureDefault` et toute création implicite de deck.
- **Onboarding :** un utilisateur sans deck (nouveau compte, testeur invité) est redirigé vers `/decks/new` depuis les pages de l'app qui en ont besoin (`/cards`, `/review`, `/cards/new`). Pas d'écran spécial : le formulaire de création suffit, avec un texte d'accueil si c'est le premier deck.
- **`/cards/new` sans `?deck` :** s'il n'y a qu'un deck, on le prend ; sinon, le `<select>` s'affiche sans présélection arbitraire.
- **MCP :** ajouter une carte sans aucun deck renvoie une erreur claire, qui invite à créer un deck sur `/decks/new`.
- **Seed :** la seed garde son deck, créé explicitement.
- **Garde-fou :** si retirer le deck par défaut demande de toucher au schéma (par exemple un drapeau `isDefault` introduit par t3), rends BLOCKED avant de le faire.
- La suppression d'un deck est sortie dans t13.

## Questions

## Review
- **Rapport DONE du 2026-10-29.** Tests : 201 au vert, contrat inchangé, pas de migration. Vérifié à la main dans le bac à sable.
- **Décisions de l'ouvrier :**
  - le MCP capture dans le plus ancien deck (`decks.first`) en attendant t5 ;
  - avec un seul deck et sans `?deck`, `/cards` affiche ce deck ;
  - après la création d'une carte, retour au deck d'origine ;
  - le formulaire de deck propose « langue » par défaut, avec le français comme langue connue ; les champs de l'autre type sont masqués en CSS (`:has`) ;
  - une `b_to_a` masquée donne une 404 (filtre dans `owned()`) ;
  - 32 langues DeepL ; deux langues de même base sont refusées ;
  - Zod 4 pour `deck-form.ts`.
- **Revue auto `/simplify` :** 9 corrections appliquées. **remaining :**
  - `apps/web/src/lib/components/DeckForm.svelte` : la barre d'action collante est copiée de CardForm ; un `FormActions` commun sortirait du ticket.
  - `apps/web/src/lib/components/AppShell.svelte:53` : la règle « seul deck = deck affiché » est répétée côté client.
  - `apps/web/src/routes/(app)/decks/new/+page.server.ts:22` : le try/catch `NAME_TAKEN` et `saving` sont dupliqués entre création et modification.
  - `apps/web/src/routes/(app)/cards/new/+page.server.ts:25` et `apps/web/src/routes/(app)/decks/[id]/edit/+page.server.ts:19` : le deck est lu deux fois par envoi.
  - `apps/web/src/lib/server/domain/cards/cards.service.ts` : `cards.list` filtre les sens par jointure plutôt qu'en mémoire.
- **À relire en premier :**
  - `apps/web/src/lib/server/domain/decks/decks.service.ts:118` : réactiver les deux sens crée des `b_to_a` dues tout de suite, et les anciennes gardent leur échéance (retard possible d'un coup).
  - `apps/web/src/lib/server/mcp/server.ts:206` : capture refusée sans deck, et choix provisoire du plus ancien deck avant t5.
  - `apps/web/src/lib/server/web/guards.ts:42` : `deckInScope` gère la redirection vers `/decks/new`, la 404 sur un deck étranger et le deck unique par défaut.

## Log
- 2026-10-29 — créé depuis la story decks. Part après t3.
- 2026-10-29 — ouvrier lancé en PLAN MODE (opus, high), en tenant compte de la branche t7 non intégrée
- 2026-10-29 — **Consigne du développeur :** une fois t4 terminé, ne lancer aucun ticket suivant sans son accord.
- 2026-10-29 — plan prêt, en attente de validation
- 2026-10-29 — plan validé avec la correction « pas de deck par défaut, onboarding vers /decks/new ». L'ancien ouvrier n'est plus joignable : un nouvel ouvrier partira en EXECUTION MODE après l'intégration de t7, sur la branche existante.
- 2026-10-29 — t7 intégré. Nouvel ouvrier lancé en EXECUTION MODE (opus, high) sur la branche existante, avec AUTO REVIEW /simplify. Consigne : Zod 4 pour les nouvelles form actions.
- 2026-10-29 — **La consigne est levée par le développeur :** après t4, le chef enchaîne les tickets `ready` bien définis sans redemander.
- 2026-10-29 — l'ouvrier s'est arrêté en cours de route : la limite de session de l'API est atteinte jusqu'à 19:20. Son travail est conservé dans `.claude/worktrees/agent-ae7cfd458fd18087c`. Il en était à la session de révision par deck. À relancer par SendMessage après 19:20.
- 2026-10-29 — ouvrier relancé par SendMessage à 23:29, il reprend à la session de révision par deck.
- 2026-10-29 — **DONE**, 201 tests au vert, branche sur dev 1a7ee4b. Relecture nécessaire (passé par un plan).
- 2026-10-29 — le développeur demande l'intégration sans relecture. Il a commité doc/kanban.base (b0b5eaf) avant, donc dev a avancé : l'ouvrier est relancé en INTEGRATION MODE pour rebaser.
- 2026-10-29 — **intégré sans relecture, à la demande du développeur.** Avance rapide 1a7ee4b..16fcc3c (1 commit, plus b0b5eaf du développeur), sans conflit, 201 tests au vert.
