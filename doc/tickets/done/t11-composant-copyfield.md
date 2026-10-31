---
id: t11
title: Factoriser le bloc « copier » de /admin et /connect dans un composant CopyField
status: done
priority: low
story:
plan_required: false
review:
model: sonnet
effort: medium
zones: [apps/web/src/lib/components/CopyField.svelte, apps/web/src/routes/(app)/admin, apps/web/src/routes/(app)/connect]
branch: ticket/t11-copy-field
agent: a0e614bdb138385c9
created: 2026-10-29
updated: 2026-10-29
---

## Context
Point `remaining` de la revue auto de t7 : le bloc « copier » de `apps/web/src/routes/(app)/admin/+page.svelte` (vers la ligne 72) duplique celui de la page `/connect` (t9). Le développeur veut un composant commun.

## Done criteria
- [ ] Un composant `CopyField` dans `apps/web/src/lib/components`, utilisé par `/admin` et `/connect`
- [ ] Le comportement et l'apparence des deux pages restent les mêmes
- [ ] Un test navigateur du composant
- [ ] Les tests passent

## Plan

## Questions

## Review
Rapport DONE du 2026-10-31 : `CopyField` (label + champ readonly + bouton Copier/Copié) dans `lib/components`, utilisé par /admin et /connect, markup et classes repris à l'identique ; id via `$props.id()`. Test navigateur (readonly, copie → « Copié », presse-papiers indisponible). 274 tests verts. /simplify : rien ; remaining : none.
- [x] REVIEW FIRST — `admin/+page.svelte:~40` : `copied = false` à la soumission supprimé, le composant se démonte avec `invite.result` (cosmétique, sans risque ; coché par le chef).
- Intégré sans relecture du développeur (seul point signalé évident).

## Log
- 2026-10-29 — créé depuis la relecture de t7 (point 1). Part après l'intégration de t7.
- 2026-10-31 — lancé en EXECUTION MODE (sonnet, medium), AUTO REVIEW /simplify, en parallèle de t21.
- 2026-10-31 — DONE puis intégré sans relecture (point signalé cosmétique), avance rapide. [deferred] intégré sans relecture.
