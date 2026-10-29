---
commande_tests: bun run check && bun run lint && bun run test && bun run api:check
branche_integration: dev
max_parallele: 2
---

## Plan requis quand
- le ticket touche `schema.prisma` ou une migration ;
- le ticket modifie le contrat OpenAPI (route ou schéma Zod exposé) ;
- le ticket touche l'auth, OAuth ou le serveur MCP ;
- le ticket touchera probablement plus de 5 fichiers.

## Notes
- **Stories :** elles sont dans `doc/stories/`, pas dans `doc/story/`.
- **Conventions de git, des worktrees et de l'intégration :** voir `CLAUDE.md`.
