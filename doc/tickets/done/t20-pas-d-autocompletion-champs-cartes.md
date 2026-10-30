---
id: t20
title: Pas d'autocomplétion du navigateur sur les champs de deck et de carte
status: done
priority: normal
story:
plan_required: false
review:
model: opus
effort:
zones: [apps/web/src/lib/components, apps/web/src/routes/(app)/decks, apps/web/src/routes/(app)/cards]
branch: ticket/t20-autocomplete-champs
agent: a623c02f63a5cb0f1
depends_on: [t6]
created: 2026-10-30
updated: 2026-10-30
---

## Context
Remarque du développeur (capture `doc/tickets/captures/t20-autocomplete-nom-deck.png`) : sur le formulaire de deck, le champ « Nom » (placeholder « Français → Anglais ») déclenche le remplissage automatique du navigateur, qui propose son identité (« Jonas / Jonas Voisard »). Ce champ n'a rien à voir avec une donnée personnelle : aucune autocomplétion ne devrait être proposée.

Probablement dû au `name="name"` du champ et à l'absence d'`autocomplete="off"`. Certains gestionnaires (navigateur ou extension) ignorent `autocomplete="off"` : vérifier ce qui est nécessaire pour qu'aucune suggestion n'apparaisse.

## Done criteria
- [ ] Aucun champ de contenu (nom de deck, noms des faces, faces et note d'une carte, recherche) ne propose l'autocomplétion du navigateur.
- [ ] Les champs d'auth (login, inscription, invitation) gardent leur autocomplétion (`email`, `current-password`, `new-password`…).
- [ ] La règle est portée par le composant de champ partagé si possible, pas répétée formulaire par formulaire.
- [ ] Les tests passent.

## Plan

## Questions

## Review
Rapport DONE du 2026-10-30. Worktree `.claude/worktrees/agent-a623c02f63a5cb0f1`, 262 tests verts. `TextField` sans prop `autocomplete` coupe toute autocomplétion (`autocomplete="off"` + attributs d'exclusion Proton Pass, 1Password, LastPass, Bitwarden, Dashlane, constante `NO_AUTOFILL` dans `lib/ui/autofill.ts`). Champs d'auth inchangés. Recherche des cartes reprend `NO_AUTOFILL`. Test `TextField.svelte.spec.ts`.
- Décisions : règle par défaut dans `TextField` (survit à t17) ; `autocomplete="off"` redondant retiré de l'email d'invitation ; pas d'exclusion sur le champ numérique d'objectif.
- AUTO REVIEW /simplify : 3 corrections.
- [x] remaining — `TextField.svelte:81` étalement `{...autofill}`, coût négligeable.
- [x] remaining — `cards/+page.svelte:131` recherche en `<input>` à la main ; un `SearchField` plus tard si besoin.
- [x] REVIEW FIRST — `apps/web/src/lib/ui/TextField.svelte:50` : tout champ sans `autocomplete` explicite perd l'autocomplétion ; un futur champ d'auth qui oublie la prop la perdrait sans signal.
- [x] REVIEW FIRST — `apps/web/src/lib/ui/autofill.ts:8` : non testé avec Proton Pass ; le développeur vérifiera à l'usage (nouveau ticket si la suggestion revient).

## Log
- 2026-10-30 — créé depuis une capture d'écran. Attend l'intégration de t6 (composants communs).
- 2026-10-30 — t6 intégré ; lancé en EXECUTION MODE (opus, effort par défaut), AUTO REVIEW /simplify, en parallèle de t18.
- 2026-10-30 — DONE, statut in-review (points signalés : défaut de TextField, Proton Pass non testé). [delivered] prêt à relire.
- 2026-10-30 — le développeur délègue la relecture au chef (sujet clair) : points cochés. Intégration : dev a avancé (t19), ouvrier relancé en INTEGRATION MODE.
- 2026-10-30 — intégré dans dev par avance rapide (fab5d5d), sans conflit, 263 tests verts. Worktree et branche supprimés.
