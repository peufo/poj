---
id: t14
title: Passer de SvelteKit 3.0.0-next.32 à la 3.1.0 stable
status: done
priority: normal
story:
plan_required: false
review:
model: opus
effort:
zones: [apps/web/package.json, bun.lock, apps/web/svelte.config.js, apps/web/src]
branch: ticket/t14-sveltekit-stable
agent: abb5782f94cc9aff0
created: 2026-10-29
updated: 2026-10-29
---

## Context
Relevé par le comparatif de t12 : `@sveltejs/kit` est déclaré `next` et résolu en 3.0.0-next.32, alors que la 3.1.0 stable est publiée. Le développeur veut passer à la version stable.

## Done criteria
- [ ] `@sveltejs/kit` est épinglé à la 3.1.x stable, ainsi que les paquets liés (adapter-node, vite-plugin-svelte, svelte si nécessaire)
- [ ] Les breaking changes entre next.32 et 3.1.0 sont relevés et traités
- [ ] Les « Pièges SvelteKit 3 » de `CLAUDE.md` sont revus : ce qui ne s'applique plus est retiré, ce qui a changé est mis à jour
- [ ] `bun run api:export` ne change pas le contrat, ou le changement est justifié
- [ ] Les tests passent, ainsi que `bun run stack:up` (build de prod)

## Plan

## Questions

## Review
- **Rapport DONE (a28dd8e) :**
  - Versions : kit 3.1.0 et adapter-node 6.0.0, épinglés en version exacte ; le plancher de svelte passe à ^5.57.1.
  - Aucun breaking change (comparaison des paquets fichier par fichier) et aucun fichier applicatif touché.
  - Les pièges de `CLAUDE.md` ont été revérifiés : ils restent tous vrais. Une puce « Versions » est ajoutée, et `PRODUCT.md` est corrigé.
  - Tests : 201 au vert, contrat inchangé. `stack:up` passe, avec un test de fumée sur `/api/docs`, la découverte OAuth et `/mcp` (401).
- **Revue auto `/simplify` :** 3 corrections, `remaining: none`.
- **À relire en premier :** `CLAUDE.md:91`, la formulation de la puce « Versions ».
- **Découverte :** `compose.yaml` ne fixe pas `name:`. Lancé depuis un worktree, `stack:up` créerait un second conteneur `db` sur le port 5433. Ajouté à t15.

## Log
- 2026-10-29 — créé à la demande du développeur. Ses zones couvrent toute l'app web : il passe après t4.
- 2026-10-29 — ouvrier lancé en EXECUTION MODE (opus, effort par défaut), avec AUTO REVIEW /simplify. Garde-fou : BLOCKED si les breaking changes touchent plus d'une dizaine de fichiers ou un comportement visible.
- 2026-10-29 — **DONE**, 1 commit, 201 tests au vert. Reste en relecture : un seul point, la formulation de la puce dans CLAUDE.md.
- 2026-10-30 — relu par le développeur, qui valide la puce. **Intégré** par avance rapide 16fcc3c..a28dd8e (1 commit), sans conflit. Il reste à lancer `bun install` dans le checkout principal.
