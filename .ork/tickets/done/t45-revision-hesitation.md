---
id: t45
title: En révision, Claude laisse l'utilisateur finir sa réponse quand il hésite
status: done
priority: normal
story: doc/story/connecteur-claude.md
depends_on: []
plan_required: false
lane:
review:
model: sonnet
effort: medium
zones: [apps/web/src/lib/server/mcp]
branch: ticket/t45-revision-hesitation
agent: aec4606e840e6dfd1
paused:
created: 2026-11-13
updated: 2026-11-13
---

## Context
Remarque du développeur (2026-11-13) : pendant une révision avec Claude, l'utilisateur bute souvent sur un mot et met du temps à compléter sa réponse. Claude ne doit pas le couper.

Enquête : aucune consigne ne parle d'hésitation, de pause ou de temps de réponse. `REVIEW_RULE` (`apps/web/src/lib/server/mcp/guidance.ts`) dit « Juge sa réponse » puis, après good ou easy, de poser aussitôt la carte suivante en appelant `review` dans le même tour ; `RATING_RULE` demande l'indulgence, `VOICE_RULE` des réponses brèves. Les règles sont reprises dans `instructions` (`apps/web/src/lib/server/mcp/server.ts`, ~l.409, single et multi-deck), dans la description de l'outil `review` (~l.827, la plus lue par Claude) et dans `apps/web/src/lib/server/mcp/prompts.ts`. `apps/web/src/lib/server/mcp/server.spec.ts` (~l.1107-1129) vérifie des fragments de ces textes.

Limite connue : le serveur ne maîtrise pas le moment où l'app vocale décide que l'utilisateur a fini de parler. La règle ne corrige que ce que Claude fait d'une réponse hésitante ou inachevée qu'il reçoit.

## Done criteria
- [x] Une règle dit à Claude qu'une réponse hésitante, un mot sur lequel l'utilisateur bute ou une phrase inachevée n'est pas une réponse finale : il attend la suite sans juger ni appeler `review`, et au besoin l'invite en quelques mots à continuer, sans lui souffler la réponse.
- [x] Cette règle figure partout où les règles de révision sont reprises : `instructions` (single et multi-deck), description de l'outil `review`, prompts de révision.
- [x] `apps/web/src/lib/server/mcp/server.spec.ts` vérifie sa présence.
- [x] Les tests passent.

## Plan

## Questions

## Review
/simplify : nothing (diff de 11 lignes relu en direct, sans les 4 agents)
- [x] apps/web/src/lib/server/mcp/guidance.ts:16 · 7/10 · formulation de HESITATION_RULE (« Je t'écoute ») à valider ; le serveur ne maîtrise pas le moment où l'app vocale coupe la parole.

## Log
- 2026-11-13 — créé depuis une remarque du développeur, après enquête sur le guidage MCP.
- 2026-11-13 — lancé en EXECUTION MODE (sonnet, medium : texte de guidage localisé, critères nets).
- 2026-11-13 — HESITATION_RULE ajoutée à guidance.ts, reprise dans SHARED_RULES (instructions single/multi), description de review et prompt review ; assertions dans server.spec.ts. Tests (check, lint, test, api:check) OK après rebase sur dev. Rien à faire côté base.
- 2026-11-13 — pas d'intégration directe : /simplify relu à la main par l'ouvrier (sans ses agents) et 1 point sous seuil. Reste `in-review`.
- 2026-11-13 — relecture du développeur : texte de la règle validé. Intégré sur `dev` par avance rapide (1 commit), sans conflit. Worktree et branche supprimés.
