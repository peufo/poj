---
commande_tests: bun run check && bun run lint && bun run test && bun run api:check
branche_integration: dev
max_parallele: 1
---

## Plan requis quand
- le ticket touche `schema.prisma` ou une migration ;
- le ticket modifie le contrat OpenAPI (route ou schéma Zod exposé) ;
- le ticket touche l'auth, OAuth ou le serveur MCP ;
- le ticket touchera probablement plus de 5 fichiers.

## Notes
- **Parallélisme :** `max_parallele` est à 1 car la base `poj_test` est partagée par tous les worktrees et chaque test vide les tables. On pourra monter à 2 quand chaque worktree aura sa propre base de test.
- **Conventions de git, des worktrees et de l'intégration :** voir `CLAUDE.md`.
