---
id: t23
title: Le connecteur Claude n'arrive plus à s'autoriser sur poj.ch
status: done
priority: high
story: doc/story/connexion-assistants.md
plan_required: false
review: required
model:
effort:
zones: [apps/web/src/lib/server/auth-config.ts, apps/web/src/lib/server/oauth-flow.ts, apps/web/src/lib/server/mcp, apps/web/src/routes/.well-known, apps/web/src/routes/(auth), apps/web/src/routes/oauth]
branch: ticket/t23-csrf-oauth
agent: chef (à la demande du développeur)
created: 2026-10-30
updated: 2026-10-30
---

## Context
Capture du développeur (`doc/tickets/captures/t23-connecteur-claude-echec.png`) : sur claude.ai, le connecteur `https://poj.ch/mcp` affiche « Problème de connexion — Votre connexion à Poj ne fonctionne plus. Reconnectez-vous pour continuer. », et la reconnexion échoue : « L'autorisation avec Poj a échoué. Vous pouvez vérifier vos identifiants et permissions. Référence : ofid_51fea5f1a1a1cf79 ».

L'app est donc en ligne sur poj.ch. C'est la **première** connexion de Claude qui échoue (ni base ni secret changés).

**Cause (confirmée le 2026-10-30) :** la protection CSRF de SvelteKit bloque l'échange du code.
- Logs Dokploy (`doc/tickets/captures/t23-logs-dokploy.png`) : register 201 → authorize 302 → GET/POST /oauth/consent 200 → **POST /api/auth/oauth2/token 403 (1,5 ms)** depuis une IP d'Anthropic → POST /mcp 401.
- Reproduit en prod : `curl -X POST https://poj.ch/api/auth/oauth2/token -H 'content-type: application/x-www-form-urlencoded' -d '…'` répond **403 « Cross-site POST form submissions are forbidden »**, avec ou sans en-tête Origin. Le endpoint n'accepte que `application/x-www-form-urlencoded` (JSON → 415), donc tout client OAuth est refusé par SvelteKit avant d'atteindre Better Auth.
- Les tests ne l'ont pas vu : ils appellent `auth.handler` directement, sans passer par le CSRF de SvelteKit ; et Claude ne peut pas joindre localhost.

**Correctif attendu :** exempter les endpoints OAuth appelés de serveur à serveur (au moins `/api/auth/oauth2/token`, vérifier aussi `revoke`/`introspect` et tout endpoint form-urlencoded du plugin) de la vérification d'origine de SvelteKit, sans l'ouvrir pour les formulaires de l'app. À l'ouvrier de choisir le mécanisme du kit 3.1.0 (`csrf.trustedOrigins`, désactivation globale + contrôle maison dans `hooks.server.ts`, etc.) et de le justifier.

## Done criteria
- [ ] `POST /api/auth/oauth2/token` en form-urlencoded, sans Origin ou avec une Origin étrangère, atteint Better Auth (400 `invalid_grant` pour un code bidon, plus 403 CSRF).
- [ ] Les formulaires de l'app gardent leur protection CSRF (POST cross-site sur une page → toujours 403).
- [ ] Un test passe par la pile SvelteKit (et non `auth.handler` seul) et couvre les deux points ci-dessus.
- [ ] Après déploiement, le connecteur Claude se connecte et liste ses outils sur poj.ch (vérifié par le développeur).
- [ ] Les tests passent.

## Plan

## Questions
- 2026-10-30 — Réponses du développeur : (1) redirigé sur claude.ai, sans `code=` visible ; (2) logs, voir capture ; (3) ni secret ni base changés, c'est la première connexion.
- 2026-10-30 — Au développeur : (1) après « Autoriser », l'URL atterrit-elle sur claude.ai avec `?code=` (échec à l'échange du code), ou reste-t-on sur Poj avec un message rouge (échec du consentement) ? (2) Logs Dokploy à l'heure de l'échec : POST /oauth/consent, POST /api/auth/oauth2/token (statut, erreur), POST /mcp. (3) BETTER_AUTH_SECRET ou la base ont-ils changé entre deux déploiements ?

## Review
Implémenté par le chef lui-même, à la demande du développeur (« pas besoin de sous-agent »), sans plan (accord du développeur). Worktree `.claude/worktrees/t23-csrf-oauth`, 1 commit 7a9edfb sur dev.
- La vérification du kit refuse aussi les requêtes **sans** `Origin` (cas des appels serveur à serveur) et n'a pas d'exception par chemin : `trustedOrigins: ['claude.ai']` n'aurait pas suffi.
- Donc : kit réglé sur `csrf.trustedOrigins: ['*']` (`vite.config.ts`), règle identique refaite dans `hooks.server.ts` via `handleCsrf` (`web/csrf.ts`), placé avant Better Auth, avec exception pour `/api/auth/oauth2/{token,revoke,introspect}`. Les remote functions gardent leur propre contrôle (non désactivé par `'*'`).
- Différence avec le kit : notre contrôle s'applique aussi en dev (le kit ne vérifie qu'en production).
- Spec `web/csrf.spec.ts` (4 tests). Vérifié sur un build de production en preview : token sans Origin ou avec Origin claude.ai → 400 `invalid_client` de Better Auth (plus 403) ; `POST /login` et `/api/auth/sign-in/email` cross-site → 403.
- CLAUDE.md : piège ajouté dans « Pièges SvelteKit 3 ».
- check, lint, test (267), api:check : verts.
- [x] `apps/web/src/lib/server/web/csrf.ts` : la liste des chemins exemptés et la règle reprise du kit.
- [x] `apps/web/vite.config.ts` : `trustedOrigins: ['*']`.

## Log
- 2026-10-30 — créé depuis une capture d'écran ; enquête lancée.
- 2026-10-30 — le développeur atteint la page de consentement (capture `t24-page-consentement.png`) : l'échec survient après « Autoriser ». Transmis à l'enquête.
- 2026-10-30 — 1er rapport du scout (avant l'info « atteint le consentement ») : côté serveur tout répond correctement (metadata, JWKS, DCR 201, authorize → /login signé, /mcp 401 conforme, ORIGIN correcte). Une seule clé JWKS créée vers 14:37 UTC (base neuve au déploiement). Un client_id inconnu donne `invalid_client`. t12/t20 ne touchent pas le flux (login/consent équivalents). Hypothèse d'alors : client DCR périmé en cache chez Claude. Client DCR de test créé en prod : CUsAUNHhNlTOlRiqdghKDwevbXosVanZ. Second rapport attendu, centré sur l'après-« Autoriser ».
- 2026-10-30 — 2e rapport du scout : action de consentement inchangée par t12 (redirect externe correct) ; non testable sans compte. Pistes : 500 au token endpoint (clé JWKS indéchiffrable si BETTER_AUTH_SECRET a changé alors que des clés existent en base → supprimer les lignes `jwks` ou rétablir le secret), ou conteneur qui ne joint pas https://poj.ch/api/auth/jwks (401 sur /mcp). Questions posées au développeur.
- 2026-10-30 — cause confirmée (CSRF SvelteKit sur le token endpoint, 403 reproduit par curl). Ticket prêt. Touche OAuth : plan requis par les règles, relecture requise.
- 2026-10-30 — corrigé par le chef (1 commit), tests verts, vérifié en preview de production. Statut in-review.
- 2026-10-30 — à savoir : en preview, Better Auth avertit qu'il ne trouve pas l'IP du client pour le rate limiting et retombe sur un compteur partagé par chemin (`advanced.ipAddress.ipAddressHeaders` / `trustedProxies`). En prod derrière Traefik, tous les utilisateurs partageraient peut-être le même compteur. [delivered] à vérifier, petit ticket possible.
- 2026-10-31 — relecture validée (« go »), intégré dans dev par avance rapide (7a9edfb). Rien poussé : le développeur doit avancer main et pousser pour déployer, puis vérifier le connecteur Claude. Worktree et branche supprimés.
