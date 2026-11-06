---
id: t10
title: Supprimer la route /lab (bac à sable de design) et ses fixtures
status: done
priority: low
story:
plan_required: false
review:
model: sonnet
effort: medium
zones: [apps/web/src/routes/lab, apps/web/src/lib/lab, apps/web/src/lib/components/AppShell.svelte]
branch: ticket/t10-supprimer-lab
agent: a29707958d9a8fe8d
created: 2026-10-29
updated: 2026-10-30
---

## Context
`/lab` servait surtout de bac à sable pour le design. Cette route n'existe qu'en dev et repose sur des fixtures (`lab/fixtures.ts`), qu'il faut adapter à chaque évolution du modèle : t3 a déjà dû le faire. Le design s'itère désormais sur les vraies pages du bac à sable (`bun run sandbox`). Le développeur a décidé de la supprimer.

Elle sert aussi à corriger, en la supprimant, un défaut signalé par t9 : `AppShell` rendu avec `base="/lab"` affiche un onglet « Claude » qui pointe vers `/lab/connect`, une route qui n'existe pas.

## Done criteria
- [ ] La route `/lab` et toutes ses pages sont supprimées, ainsi que ses fixtures et le code qui ne sert qu'à elle.
- [ ] `AppShell` (et tout autre composant) ne garde aucun paramètre ni aucune branche qui n'existait que pour `/lab`, par exemple `base`.
- [ ] Toutes les références à `/lab` ont disparu : code, configuration, `CLAUDE.md`, `apps/web/DESIGN.md` et doc. Vérifier avec `git grep -n "/lab\|lab/"`.
- [ ] Les tests passent.

## Plan

## Questions

## Review
- **Rapport DONE du 2026-10-30 (e2b4c8a) :** 19 fichiers, -1942 lignes, 201 tests au vert.
  - Supprimés : `routes/lab`, `lib/lab` et `lib/ui/SegmentedControl.svelte`, devenu orphelin.
  - `AppShell` : le paramètre `base` est retiré, ce qui supprime aussi l'onglet « Claude » qui pointait vers `/lab/connect`.
  - Références nettoyées dans `DESIGN.md`, `base.css` et `apps/web/.impeccable/` (fichiers déjà suivis par git ; CLAUDE.md interdit pourtant de commiter l'état d'`.impeccable/`).
- **À relire en premier :**
  - [x] `apps/web/src/lib/components/AppShell.svelte:58`, pour vérifier que seuls des chemins fixes restent.
  - [x] Fichiers `apps/web/.impeccable/` modifiés alors qu'ils sont suivis par git : les garder dans le commit, ou les sortir du suivi ?
    - 2026-10-30, Jonas : A, on garde les modifications (fichiers déjà suivis).
- **Revue auto `/simplify` :** 1 correction appliquée, `remaining: none`.

## Log
- 2026-10-29 — créé à la demande du développeur. Passe après t7, qui touche aussi `AppShell`.
- 2026-10-30 — ouvrier lancé en EXECUTION MODE (sonnet, medium), avec AUTO REVIEW /simplify, pendant la relecture de t13 (aucune zone commune).
- 2026-10-30 — **DONE**, 1 commit. Reste en relecture : un point signalé dans `AppShell`.
- 2026-10-30 — relecture terminée (.impeccable : on garde). dev a avancé (t13) : INTEGRATION MODE demandé à l'ouvrier
- 2026-10-30 — intégré sur dev par avance rapide (1 commit, aucun conflit) après relecture [delivered]
