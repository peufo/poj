---
id: t9
title: Page « Connecter Claude » — URL du connecteur et marche à suivre
status: done
priority: high
story: doc/story/connexion-assistants.md
plan_required: false
review:
model: sonnet
effort: medium
zones: [apps/web/src/routes/(app)/connect, apps/web/src/routes/(app)/+layout.svelte]
branch: ticket/T-0009-page-connecter-claude
agent: aab8759007c6d434e
created: 2026-10-29
updated: 2026-10-29
---

## Context
Les testeurs (proches du développeur) doivent pouvoir connecter Claude à Poj sans aide. Seul Claude est visé pour l'instant. Voir `doc/story/connexion-assistants.md`.

Faits utiles :
- **Ajout :** un connecteur personnalisé se crée sur claude.ai (web ou desktop), dans Customize → Connectors → ajouter un connecteur personnalisé, en collant l'URL du serveur. On ne peut pas l'ajouter depuis l'app mobile.
- **Plan Free :** il est limité à un seul connecteur personnalisé.
- **OAuth :** l'ajout déclenche la connexion à Poj, puis la page de consentement `/oauth/consent`.
- **Mobile et vocal :** une fois ajouté, le connecteur est disponible dans l'app mobile, y compris en mode vocal.
- **URL du connecteur :** `${ORIGIN}/mcp`.

## Done criteria
- [ ] Une page `/connect`, réservée aux utilisateurs connectés, affiche l'URL du connecteur avec un bouton « Copier ».
- [ ] Elle donne la marche à suivre en trois étapes courtes :
  - [ ] ajouter le connecteur sur claude.ai (web ou desktop) ;
  - [ ] se connecter avec son compte Poj et accepter le consentement ;
  - [ ] l'utiliser ensuite sur mobile et en vocal.
- [ ] Elle mentionne la limite d'un connecteur personnalisé sur le plan Free.
- [ ] La page est accessible depuis la navigation.
- [ ] Les tests passent.

## Plan

## Questions

## Review
- **Revue auto :** `/simplify` faite en ligne sur un petit diff, sans lancer les 4 agents. Rien à signaler, `remaining: none`.
- **À relire en premier** (worktree `.claude/worktrees/agent-aab8759007c6d434e`) :
  - `apps/web/src/lib/components/AppShell.svelte:55` : l'onglet « connect » est aussi rendu dans `/lab` (`base="/lab"`), donc son lien pointe vers `/lab/connect`, qui n'existe pas. Faut-il le masquer dans les maquettes ?

## Log
- 2026-10-29 — créé depuis la story connexion-assistants. Attend l'intégration de t3 (zones de routes et de navigation communes).
- 2026-10-29 — ouvrier lancé en EXECUTION MODE (sonnet, medium), AUTO REVIEW /simplify
- 2026-10-29 — **DONE.** Commit b6985e5, rebasé sur dev, 150 tests au vert, contrat à jour.
  - La page `/connect` affiche l'URL du connecteur avec un bouton Copier, les trois étapes et une note sur le plan Free.
  - Un onglet « Claude » s'ajoute à `AppShell`, et la barre d'onglets mobile passe à 4 colonnes. Un test navigateur couvre la page.
  - **Pas d'intégration directe :** l'ouvrier a signalé un point à relire en premier.
- 2026-10-29 — **Intégré dans dev** par avance rapide (b6985e5, 1 commit).
  - Le lien cassé dans `/lab` n'est pas corrigé : `/lab` ne sert qu'en dev, et sa suppression est en discussion.
  - Le worktree est verrouillé par le pid de la session Claude Code : sa suppression est laissée au développeur.
