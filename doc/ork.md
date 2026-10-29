---
test_command: bun run check && bun run lint && bun run test && bun run api:check
integration_branch: dev
max_parallel: 1
auto_review: [/simplify]
review: always
---

## Plan required when
- le ticket touche `schema.prisma` ou une migration ;
- le ticket modifie le contrat OpenAPI (route ou schéma Zod exposé) ;
- le ticket touche l'auth, OAuth ou le serveur MCP ;
- le ticket touchera probablement plus de 5 fichiers.

## Notes
- **Parallélisme :** `max_parallel` est à 1 car la base `poj_test` est partagée par tous les worktrees et chaque test vide les tables. Les autres ressources partagées sont la base `poj_sandbox`, qu'un reset efface, et les ports fixes : 5173 (dev, `ORIGIN`), 5174 (bac à sable), 4173 (preview Playwright), 3000 et 5433 (Docker). On pourra passer à 2 quand chaque worktree aura sa propre base de test et ses propres ports.
- **Revue :** `review: always` pendant la première semaine, le temps de juger la revue automatique. Ensuite, on pourra passer à `per-ticket`.
- **Conventions de git, des worktrees et de l'intégration :** voir `CLAUDE.md`.
