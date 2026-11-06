---
id: t32
title: Révision web : l'indice n'affiche pas la source du contexte
status: done
priority: normal
story: doc/story/ajout-en-masse.md
depends_on: [t31]
plan_required: false
review:
model: sonnet
effort: medium
zones: [apps/web/src/routes/(app)/review]
branch: ticket/t32-indice-source
agent: a64adc9db6657e22b
created: 2026-11-01
updated: 2026-11-06
---

## Context
Relevé au plan de t31 (2026-11-01). Depuis t8, la règle de vérification des faits fait écrire la source et sa date dans le contexte d'une carte de sujet. t31 ajoute `hintOf(context)` (domain/cards), qui retire les lignes « Source : … » de l'indice côté MCP (`get_hint`). Mais la révision web affiche toujours le contexte complet comme indice (`apps/web/src/routes/(app)/review/+page.svelte:152`) : la source peut y révéler la réponse.

## Done criteria
- [ ] La révision web affiche l'indice filtré par `hintOf` : sans ligne « Source : … », et pas de bouton d'indice si rien ne reste.
- [ ] La note n'est pas plafonnée quand l'indice filtré est vide (même règle que `get_hint`).
- [ ] Un test couvre un contexte « Source : … » seul et un contexte mixte.
- [ ] Les tests passent.

## Plan

## Questions

## Review
Revue auto : `/simplify` : rien à changer. remaining : none.

- [x] `apps/web/src/routes/(app)/review/+page.svelte:37` · 8/10 · `shownContext` : indice filtré avant révélation, contexte complet après ; vérifier que ce comportement convient. (coché selon `## No need to ask` : après révélation, comportement inchangé, sans choix à faire)

## Log
- 2026-11-01 — créé depuis un risque relevé au plan de t31. Part après l'intégration de t31 (réutilise `hintOf`).
- 2026-11-05 — mis de côté par le développeur (priorité au comportement de Claude). [pause]
- 2026-11-06 — sorti de pause par le développeur, lancé en exécution directe.
- 2026-11-06 — DONE par l'ouvrier : `NextReview.hasHint` devient `hint: string | null` (`hintOf(context)`), usages MCP de `server.ts` passés à `hint !== null` ; bouton d'indice (clic et touche H) seulement si non nul ; contexte complet conservé après révélation. Tests : suite complète verte (352), mais pas de test de composant ni de vérification dans le navigateur.
- 2026-11-06 — relecture sans point à trancher, branche déjà à jour sur `dev`. Intégration arrêtée à l'étape 1 : dépôt principal sale (`.claude/launch.json`, non suivi, pas à ork).
- 2026-11-06 — fichier supprimé à la demande du développeur. Intégré sur `dev` par avance rapide (1 commit, f0b0ad9, sans conflit), worktree et branche supprimés, `worktree:prune` lancé. [delivered]
