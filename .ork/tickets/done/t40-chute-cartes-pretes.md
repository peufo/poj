---
id: t40
title: Les cartes tombent dans la boîte des prêtes quand elles arrivent au bout du tapis
status: done
priority: low
story: doc/story/tapis-roulant.md
depends_on: [t34]
plan_required: false
lane:
review:
model: opus
effort: défaut
zones: [apps/web/src/lib/components, apps/web/src/routes/(app)/cards]
branch: ticket/t40-chute-cartes-pretes
agent: a4b824b0f70dff5dd
paused:
created: 2026-11-08
updated: 2026-11-13
---

## Context
Effet voulu par le développeur pour le tapis (story, décision du 2026-11-06) : les cartes semblent tomber dans la boîte des prêtes en arrivant au bout du tapis. Dans `t34-tapis-roulant`, cette chute était dessinée à l'image fixe par des marques inclinées au-dessus de la boîte ; le développeur les a fait retirer en relecture, car elles représentaient une seconde fois des cartes déjà dans la boîte (capture `.ork/tickets/captures/2026-11-08-t34-chute-doublon.png`). Une carte ne doit être représentée qu'une seule fois.

Reste à trouver une chute qui respecte cette règle, probablement animée. DESIGN.md réserve le mouvement aux changements d'état : le vrai déclencheur serait une carte qui devient prête (retour de révision, passage du temps), ce qui demande de comparer deux états.

## Done criteria
- [x] Au retour sur la page du tapis (après une révision ou une absence), les cartes devenues prêtes depuis le dernier état vu tombent du bout du tapis dans la boîte des prêtes, par une animation.
- [x] Page ouverte, une carte qui atteint le bout du tapis avec le passage du temps tombe dans la boîte au moment où elle devient prête, sans rechargement.
- [x] À tout instant, chaque carte n'est représentée qu'une seule fois : sur le tapis, en chute ou dans la boîte, jamais à deux endroits.
- [x] Sans changement d'état, rien ne bouge (DESIGN.md : le mouvement est réservé aux changements d'état), et `prefers-reduced-motion` coupe l'animation.
- [x] La marge de 18 px à gauche du tapis (voir journal) sert la chute ou disparaît.
- [x] Les tests passent.

## Plan

## Questions
- 2026-11-13 — Quel déclencheur pour la chute ? → **Les deux** : au retour (comparaison avec le dernier état vu) et en direct, page ouverte, quand une carte arrive au bout du tapis. Le développeur : le direct coûte peu, d'autant qu'un système de notification est envisagé (`t41-notifications-revision`).

## Review
/simplify : 6 corrections appliquées (MINUTE exporté de belt.ts, horloge corrigée du décalage serveur/navigateur, tapis partagé une seule fois par échéance triée pour ne plus écrire le stockage à chaque minute, sérialisation de l'état vu à côté de son parseur, une seule disposition de pile pour la boîte et les chutes, `props()` dans la spec).
- [x] apps/web/src/lib/components/Belt.svelte:69 · 7/10 · le « dernier état vu » vit en localStorage (`poj:belt-seen`, id → échéance), sans stockage serveur : par navigateur, perdu en navigation privée (seule la chute en direct reste) ; une carte devenue prête depuis le stock des neuves ne tombe pas, elle n'a jamais été sur le tapis.
- [x] apps/web/src/lib/components/Belt.svelte:148 · 7/10 · chute de 220 ms, glissement ease-out et chute ease-in (DESIGN.md dit ease-out), cascade plafonnée à 600 ms ; au chargement complet (SSR), la boîte affiche un instant le total avant l'hydratation, puis retire les cartes qui tombent : à voir dans l'app.
- [x] apps/web/src/lib/components/Belt.svelte:95 · 8/10 · l'horloge du tapis avance chaque minute et à chaque échéance : les marques changent de colonne sans animation, et le domaine renvoie maintenant `ready: string[]` (ids) au lieu du compte `due`.
- [x] apps/web/src/lib/components/Belt.svelte:66 · 6/10 · remarque /simplify non corrigée : l'arrivée est mesurée sur la boîte (`getBoundingClientRect`) avec `BOX_INSET` qui recopie `pl-1.5`/`pb-1.5` ; la correction proposée (toujours rendre la pile, même vide) élargirait la boîte vide.
- [x] apps/web/src/lib/components/Belt.svelte:361 · 8/10 · remarque /simplify non corrigée : chaque carte arrivée retire sa chute (`onintroend`), O(k²) pour k chutes simultanées ; négligeable en dessous de quelques centaines de cartes.

## Log
- 2026-11-08 — créé pendant la relecture de `t34-tapis-roulant`, pour plus tard.
- 2026-11-08 — la marge de 18 px à gauche du tapis, ajoutée pour la chute, reste dans t34 sans autre rôle que placer le bout du tapis au-dessus des prêtes : à revoir ici.
- 2026-11-13 — déclencheur tranché par le développeur (retour + direct), critères de fin écrits : passe en ready.
- 2026-11-13 — lancé en EXECUTION MODE (opus, effort par défaut). Consigne : BLOCKED avant tout stockage serveur ou changement de contrat (plan requis).
- 2026-11-13 — chute animée du rouleau à sa place dans la boîte, en direct (horloge du tapis) et au retour (dernier état vu en localStorage : ni schéma, ni migration, ni contrat). La boîte ne compte une carte qu'à son arrivée ; `prefers-reduced-motion` la pose directement. Le domaine `cards.belt` donne les ids (`ready`, `tokens[].cardId`). La marge de 18 px est l'espace de la chute. DESIGN.md (section Tapis) mis à jour.
  Tests : `bun run check && bun run lint && bun run test && bun run api:check` verts après rebase sur dev (361 tests). Aucun conflit. Rien à faire après intégration.
- 2026-11-13 — relecture du développeur terminée, 5 points validés. Critères de fin cochés par le chef d'après le rapport de l'ouvrier.
- 2026-11-13 — intégré sur `dev` par avance rapide (1 commit, `2a331fa`), sans conflit. Worktree et branche supprimés.
