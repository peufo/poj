---
docs_dir: doc/
test_command: bun run check && bun run lint && bun run test && bun run api:check
integration_branch: dev
max_parallel: 2
auto_review: [/simplify]
review: per-ticket
---

## Plan required when

- le ticket touche `schema.prisma` ou une migration ;
- le ticket modifie le contrat OpenAPI (route ou schéma Zod exposé) ;
- le ticket touche l'auth ou OAuth ;
- le ticket touche la CI, le Dockerfile ou `compose.yaml` ;
- le ticket touchera probablement plus de 5 fichiers.

## Review required when

- le ticket touche l'auth, OAuth ou une migration ;
- le ticket touche la CI, le Dockerfile ou `compose.yaml` ;
- le diff supprime ou transforme des données existantes.

## Ask before

## No need to ask

- enchaîner les tickets `ready` bien définis dès que les zones et `max_parallel` le permettent.
- en relecture guidée, cocher sans les présenter les points évidents (comportement attendu, sans risque ni choix à faire). Ne présenter que ceux qui demandent un vrai avis.
- intégrer un ticket dès sa relecture terminée, sans demander. Ne déranger le développeur que pour un conflit de logique métier (deux intentions qui se contredisent), pas pour un conflit textuel.
- reprendre le même ouvrier, sans demander, dès qu'une limite d'usage qui l'avait coupé est réinitialisée.

## Notes

- **Parallélisme :** depuis t16, chaque worktree a ses propres bases (`poj_test_wt_<slug>`, `poj_sandbox_wt_<slug>`) et ses ports (5183, 5193…), écrits par `bun run worktree:setup`. Restent partagés : la base de dev (`db:migrate`), Postgres 5433 et la stack Docker (3000). Après chaque suppression de worktree, le chef lance `bun run worktree:prune` dans le checkout principal.
- **Conventions de git, des worktrees et de l'intégration :** voir `CLAUDE.md`.
- **Tickets clos :** un ticket `done` est toujours commité : le nettoyage (worktree, prune) se fait avant le commit de clôture, et toute ligne ajoutée plus tard à son journal est commitée aussitôt.
