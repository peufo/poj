---
id: t13
title: Supprimer un deck
status: done
priority: normal
story: doc/story/decks.md
plan_required: false
review: required
model: opus
effort:
zones: [apps/web/src/lib/server/domain/decks, apps/web/src/routes/(app)/decks]
branch: ticket/t13-supprimer-deck
agent: a64360f5d7aaf7f22
created: 2026-10-29
updated: 2026-10-30
---

## Context
Sorti du plan de t4, qui ne couvre que la création et la modification d'un deck.

## Done criteria
- [ ] Depuis `/decks/[id]/edit`, une action supprime le deck après confirmation
- [ ] Suppression logique (`deletedAt`) du deck et de ses cartes ; l'opération est idempotente
- [ ] Après la suppression du dernier deck, l'utilisateur retombe sur l'onboarding de t4 (redirection vers `/decks/new`)
- [ ] Les tests passent

## Plan

## Questions
- 2026-10-29 — Peut-on supprimer le dernier deck ? Avec l'onboarding de t4, rien ne l'empêche : l'utilisateur est simplement redirigé vers la création. Recommandation : l'autoriser.
  - **Réponse du développeur :** on l'autorise.

## Review
- **Rapport DONE du 2026-10-30.** 203 tests au vert, contrat inchangé, ni migration ni contrat touché. Vérifié à la main dans le bac à sable (avec et sans JS, et en rejouant la suppression).
  - Domaine : `decks.softDelete`, en une transaction sous `lockOwner`, pose `deletedAt` sur le deck et sur ses cartes encore actives. L'opération est idempotente et répond 404 pour un deck d'un autre utilisateur. Le dernier deck peut être supprimé.
  - `/decks/[id]/edit` : l'action par défaut devient `save`, et une action `delete` demande confirmation (Sheet avec JS, Notice sans JS, sur le même modèle que la page carte).
  - Après la suppression, redirection vers `/cards`, puis l'onboarding de t4 envoie vers `/decks/new` s'il ne reste aucun deck.
- **Décisions de l'ouvrier :**
  - le message de confirmation indique le nombre de cartes, lu dans les données de navigation ;
  - les cartes déjà supprimées gardent leur `deletedAt` d'origine ;
  - les révisions et l'historique ne sont pas touchés.
- **À relire en premier :**
  - [x] `apps/web/src/routes/(app)/decks/[id]/edit/+page.server.ts:17` : l'action par défaut est renommée `save`. L'ouvrier n'a trouvé aucun formulaire qui posterait encore sur la page sans `?/save`.
  - [x] `apps/web/src/routes/(app)/decks/[id]/edit/+page.svelte:13` : le texte d'avertissement dépend du `cardCount` de la navigation. Si le deck en est absent, le message dit « aucune carte ».
- **Revue auto `/simplify` :** 1 correction appliquée. Points restants :
  - [x] `apps/web/src/routes/(app)/decks/[id]/edit/+page.svelte:57` : l'interface de confirmation est copiée de la page carte. Un composant `DeleteConfirm` partagé serait à faire dans un ticket séparé.
    - 2026-10-30, Jonas : faire directement le composant commun `DeleteConfirm`, utilisé par la page carte et la page deck. Renvoyé à l'ouvrier.
  - [x] `apps/web/src/lib/server/domain/decks/decks.service.ts:142` : une micro-optimisation, écartée.

- **Rapport DONE du 2026-10-30, composant commun.** 205 tests au vert, contrat à jour.
  - `lib/components/DeleteConfirm.svelte` (props `label`, `title`, `message`) : Sheet avec JS, Notice sans JS. Il est utilisé par la page carte et par la page deck.
  - La partie serveur est dans `lib/server/web/delete-confirm.ts` (`unconfirmedDelete`, avec un test), appelée par les deux actions `delete`.
  - Décision : le composant lit lui-même `page.form.confirmDelete` et `page.url.pathname`. La maquette `routes/lab/cards/[id]` garde son propre Sheet (t10 supprime lab).
  - Revue auto `/simplify` : 3 corrections, `remaining: none`.
  - À relire en premier :
    - [x] `apps/web/src/lib/components/DeleteConfirm.svelte:25` : la confirmation sans JS vient de `page.form`, commun à toute la page. Une autre action de la page qui renverrait `confirmDelete` l'afficherait aussi.
    - [x] `apps/web/src/lib/components/DeleteConfirm.svelte:49` : le bouton « Annuler » sans JS pointe vers la page courante (`/decks/[id]/edit` pour le deck).

## Log
- 2026-10-29 — créé depuis la validation du plan de t4. Part après t4.
- 2026-10-29 — le développeur autorise la suppression du dernier deck. Ticket prêt, il part après t4.
- 2026-10-30 — ouvrier lancé en EXECUTION MODE (opus, effort par défaut), avec AUTO REVIEW /simplify.
- 2026-10-30 — **DONE**, 203 tests au vert. Relecture obligatoire (le ticket supprime des données).
- 2026-10-30 — relecture : Jonas demande le composant commun DeleteConfirm tout de suite, ouvrier relancé
- 2026-10-30 — **DONE** (composant commun DeleteConfirm), 205 tests au vert, relecture reprise
- 2026-10-30 — intégré sur dev par avance rapide (2 commits, aucun conflit) après relecture
