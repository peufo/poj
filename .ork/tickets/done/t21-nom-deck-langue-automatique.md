---
id: t21
title: Formulaire de deck : le type d'abord, et un deck de langue nommé d'après la langue apprise
status: done
priority: normal
story: doc/story/decks.md
plan_required: false
review:
model: opus
effort:
zones: [apps/web/src/lib/components/DeckForm.svelte, apps/web/src/routes/(app)/decks, apps/web/src/lib/server/domain/decks, apps/web/src/lib/server/web/schemas/decks.ts, apps/web/src/lib/server/web/deck-form.ts]
branch: ticket/t21-deck-langue-nom
agent: af65c556e0fead667
depends_on: [t17]
created: 2026-10-30
updated: 2026-10-31
---

## Context
Remarque du développeur (capture `.ork/tickets/captures/t21-formulaire-deck.png`, formulaire de création de deck) :
- le champ « Nom » doit venir **après** le choix du type ;
- pour un deck de type **Langue**, l'utilisateur n'a pas à saisir de nom : le nom est automatiquement **la langue apprise** (ex. « Finnois »), et non « Français → Finnois » comme le suggère le placeholder actuel.

Le nom sert aussi au MCP pour désigner un deck (`resolveDeck`, t18) : « Finnois » est plus naturel à l'oral.

## Done criteria
- [ ] Dans le formulaire de deck (création et modification), le type vient avant le nom.
- [ ] Pour un deck de langue, aucun champ nom n'est affiché : le nom est la langue apprise, et suit la langue apprise si elle change.
- [ ] Un deck de sujet garde son nom saisi.
- [ ] Deux decks de même langue apprise sont interdits : « un deck <Langue> existe déjà » (l'unicité des noms existante devrait suffire).
- [ ] Les tests passent.

## Plan

## Questions
- 2026-10-30 — Ouvertes :
  1. Deux decks avec la même langue apprise (Français → Finnois et Anglais → Finnois) : interdit (« un deck Finnois existe déjà »), ou nom désambiguïsé (« Finnois (depuis l'anglais) ») ? Reco : interdit, cas improbable pour l'instant.
  2. Decks de langue existants (nommés « X → Y ») : renommés d'office en langue apprise ? Reco : oui, par une migration de données.
  - 2026-10-30, développeur : 1. **interdit**. 2. **rien à faire** : la base de prod est vide, aucune migration de données.

## Review
Rapport DONE du 2026-10-31. 279 tests, 12/12 e2e verts, contrat inchangé, pas de migration.
- `deckName` (domaine) : langue apprise sans variante pour une langue (`fi` → « Finnois »), nom saisi pour un sujet ; création et modification. Unicité existante → « Un deck Finnois existe déjà. » sur « Langue apprise ». DeckForm : type d'abord, nom pour un sujet seulement, aide « Le deck s'appellera « Finnois » ». Schémas : nom requis seulement pour un sujet.
- Décisions : règle dans le domaine ; le MCP ne crée pas de decks ; `DeckInput` union sur `kind` ; `DeckUpdate.name` optionnel ; le domaine importe `languageDeckName` de `lib/format/decks.ts` (première dépendance domaine → format) ; `update` saute l'unicité si le nom ne change pas ; seed et `FR_EN_DECK` gardent « Français → Anglais ».
- [x] remaining — `lib/format/decks.ts:70` : `languageDeckName` reprend `capitalize(languageName(…))` de `face()`.
- [x] remaining — `web/schemas/decks.ts:49` : union discriminée possible mais risque sur le typage des remote forms.
- [x] remaining — `decks/new/deck.remote.ts:17` : `deckName` calculé même en cas de succès (négligeable).
- [x] remaining — `domain/decks/decks.service.ts:3` : le domaine dépend d'un formateur d'affichage (`Intl.DisplayNames` 'fr') pour l'unicité ; option : module neutre.
- [x] REVIEW FIRST — `domain/decks/decks.service.ts:171` : modifier un ancien deck de langue le renomme d'après la langue apprise (« Français → Anglais » de la seed → « Anglais »).
- [x] REVIEW FIRST — `decks/[id]/edit/deck.remote.ts:21` : conflit de nom pour un ancien deck de langue signalé au niveau du formulaire.
- [x] REVIEW FIRST — `components/DeckForm.svelte:72` : nouveaux textes d'interface à valider.
- [x] Remarque du développeur (2026-10-31) : mettre à jour la seed, ses decks de langue suivent la nouvelle règle de nommage (fini « Français → Anglais »).
Rapport DONE de la correction (2026-10-31), commit 2df60f4 posé sur 903b0b2, sans rebase. 280 tests verts, 12/12 e2e. La seed nomme son deck d'après `deckName(FR_EN_DECK)`, qui donne « Anglais ». `FR_EN_DECK` s'appelle désormais « Anglais ». Suivent le spec MCP, le helper e2e `languageDeckId` et un nouveau test dans seed.spec. `AppShell.svelte.spec.ts` garde son fixture autonome.
- [x] REVIEW FIRST — `testing/factories.ts:24` : conflit possible avec t27 (`server/testing`). t27 n'a pas touché aux fabriques : rien à craindre.
- [x] REVIEW FIRST — `decks.service.spec.ts:148` : le cas « deck nommé avant la règle » passe maintenant l'ancien nom explicitement.
- [x] remaining — `testing/factories.ts:49` : `createDeck(…, { languageB: 'fi' })` garde le nom « Anglais ». Le défaut existait déjà avant, il est hors du périmètre.
- [x] remaining — `e2e/helpers.ts:37` : construire la regex à partir de `FR_EN_DECK.name` n'est pas retenu, le littéral est voulu.

## Log
- 2026-10-30 — créé depuis une capture d'écran. Attend t20 (même composant de champ) et passera avant l'exécution de t17 (même formulaire).
- 2026-10-30 — réordonné : passe après t17 (livraison a), qui réécrit le formulaire de deck en remote form.
- 2026-10-30 — questions tranchées, ticket prêt, sans migration ni relecture requise. Part après t17.
- 2026-10-31 — critère sans-JS retiré (décision du 2026-10-31). t17 intégré ; lancé en EXECUTION MODE (opus), AUTO REVIEW /simplify, en parallèle de t25.
- 2026-10-31 — interrompu par la limite de session (pas un FAILED) pendant les tests ; repris par SendMessage après la levée.
- 2026-10-31 — DONE après reprise, 279 tests et 12 e2e verts. Statut in-review. [delivered] prêt à relire.
- 2026-10-31 — relecture : le développeur demande de mettre la seed à jour. L'ancien ouvrier n'est plus joignable et son worktree était propre : worktree supprimé (branche gardée), puis worktree:prune. Nouvel ouvrier (opus) lancé sur la branche existante.
- 2026-10-31 — DONE pour la correction de la seed : 280 tests et 12 e2e verts. Statut in-review, la relecture reprend aux 3 points ouverts.
- 2026-10-31 — relecture terminée, le développeur demande l'intégration. INTEGRATION MODE confié au même ouvrier (SendMessage). Le dépôt principal a des modifications hors ork (doc/kanban.base, doc/story/*) : l'avance rapide attend qu'il soit propre.
- 2026-10-31 — INTEGRATION MODE terminé : rebase sur dev (14a5541) sans conflit, 290 tests et 12/12 e2e verts. Avance rapide possible, mais en attente que le dépôt principal soit propre.
- 2026-10-31 — doc commitée sur dev (f9cbe44, demande du développeur). Avance rapide refusée car dev a avancé : nouveau rebase confié au même ouvrier, tests sans e2e (dev n'a changé que de la doc).
- 2026-10-31 — intégré sur dev par avance rapide (f9cbe44..6556eac, 2 commits), sans conflit, 290 tests verts. [delivered] intégré.
