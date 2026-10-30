---
test_command: bun run check && bun run lint && bun run test && bun run api:check
integration_branch: dev
max_parallel: 2
auto_review: [/simplify]
review: per-ticket
---

## Plan required when

- le ticket touche `schema.prisma` ou une migration ;
- le ticket modifie le contrat OpenAPI (route ou schéma Zod exposé) ;
- le ticket touche l'auth, OAuth ou le serveur MCP ;
- le ticket touchera probablement plus de 5 fichiers.

## Review required when

- le ticket touche l'auth, OAuth ou une migration ;
- le diff supprime ou transforme des données existantes.

## Ask before

## No need to ask

- enchaîner les tickets `ready` bien définis dès que les zones et `max_parallel` le permettent.
- en relecture guidée, cocher sans les présenter les points évidents (comportement attendu, sans risque ni choix à faire). Ne présenter que ceux qui demandent un vrai avis.

## Notes

- **Parallélisme :** depuis t16, chaque worktree a ses propres bases (`poj_test_wt_<slug>`, `poj_sandbox_wt_<slug>`) et ses ports (5183, 5193…), écrits par `bun run worktree:setup`. Restent partagés : la base de dev (`db:migrate`), Postgres 5433 et la stack Docker (3000). Après chaque suppression de worktree, le chef lance `bun run worktree:prune` dans le checkout principal.
- **Conventions de git, des worktrees et de l'intégration :** voir `CLAUDE.md`.
