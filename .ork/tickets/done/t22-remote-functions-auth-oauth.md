---
id: t22
title: Remote functions pour l'auth, OAuth et la déconnexion (livraison b de t17)
status: done
priority: normal
story:
plan_required: false
review: required
model: opus
effort: high
zones: [apps/web/src/routes/(auth), apps/web/src/routes/oauth, apps/web/src/lib/server/oauth-flow.ts, apps/web/src/lib/server/web/schemas, apps/web/src/lib/remote, apps/web/src/lib/components]
branch: ticket/t22-remote-functions-auth
agent: a4e0af4cfbe795284
depends_on: [t17]
created: 2026-10-30
updated: 2026-11-01
---

## Context
Seconde livraison du plan validé de t17 (`.ork/tickets/t17-remote-functions-et-feedback-formulaires.md`, ou `done/` une fois intégré). Le plan y est détaillé ; reprise ici des étapes concernées.

1. **Socle OAuth (à réévaluer : ne servait qu'au sans-JS, abandonné le 2026-10-31 ; garder seulement si utile avec JS) :** dans `oauth-flow.ts`, `oauthQuery` écarte les paramètres `/…` (`/remote=…`), comme `loginUrl`, avec un test. Sans JS, l'URL porte `&/remote=…`, ce qui altère la requête signée renvoyée au plugin. Schémas `accounts.ts` : `password` → `_password` (jamais renvoyé sans JS), `oauth.spec.ts` et `schemas/*.spec.ts` adaptés.
2. **Auth et OAuth en remote forms :** login (requête OAuth lue dans `getRequestEvent().url`, `redirect(302, next, { external: true })`), register, invite, consent, logout (`lib/remote/logout.remote.ts`, partagé par AccountMenu et AppShell). Prototype de t17 : la redirection externe fonctionne avec et sans JS (code, state, iss livrés).
3. **Nettoyage :** suppression de `form-data.ts`, `delete-confirm.ts` et des helpers `fail` de `card-form.ts` ; CLAUDE.md mis à jour (section remote forms).

## Done criteria
- [ ] Il ne reste aucune form action dans `apps/web`, auth et OAuth compris.
- [ ] Les flux OAuth (login avec `oauth_query`, consentement, redirection externe vers le client) fonctionnent comme avant (avec JavaScript ; le sans-JS n'est plus un critère depuis le 2026-10-31).
- [ ] Specs e2e (base jetable de t17) : connexion (erreur puis succès), OAuth complet (DCR → callback avec `code` et `state`), inscription, invitation, déconnexion.
- [ ] Les restes de l'ancien système sont supprimés et CLAUDE.md documente les remote forms.
- [ ] Les tests passent.

## Plan
Rendu le 2026-11-01 (opus, high). Branche `ticket/t22-remote-functions-auth` (au niveau de dev ece315e, aucun commit ; worktree supprimé pendant la coupure, à recréer).
1. **Étape 1 de t17 abandonnée** : avec JS, `getRequestEvent().url` ne porte jamais `/remote=` (en-têtes `x-sveltekit-pathname/search`) ; le serveur ne renvoie pas les valeurs d'un envoi amélioré, donc pas de `_password`. Schémas et specs inchangés.
2. **Login** (`(auth)/login/login.remote.ts`, `form(loginSchema)`) : `oauthQuery` depuis l'URL, `signInEmail` + `oauthApiContext(event.request)` ; `APIError` → `invalid(authErrorMessage…)`, autre → `invalid('Erreur inattendue. Réessaie.')` ; redirections hors du try : `redirect(303, next, { external: true })`, sinon `redirectTo`, sinon `/cards`. Page : `TextField`, `FormIssues`, `SubmitButton`.
3. **Register** (`register.remote.ts`) et **invite** (`invite.remote.ts`, `params.token` via `getRequestEvent()`). Messages `unavailable` déplacés dans `auth-errors.ts` (partagés load / remote). `InvitationUnavailableError` et `ConflictError` → `invalid(…)`.
4. **Consent** (`oauth/consent/consent.remote.ts`, `consentSchema` inchangé) : champ caché `oauth_query`, boutons `fields.accept.as('submit', 'true'|'false')`, `oauth2Consent` puis `redirect(303, next, { external: true })`. Erreur → `FormIssues`, boutons → `SubmitButton`.
5. **Logout** (`lib/remote/logout.remote.ts`) : signOut puis `redirect(303, '/login')` ; route `(app)/logout/` supprimée ; `logout.for('sidebar')` (AppShell) et `logout.for('account-menu')` (AccountMenu). Le `<form action="/logout">` autour du bouton « Compte » devient un simple bouton.
6. **Nettoyage** : suppression de `web/form-data.ts` (helper local dans `cards.spec.ts` / `decks.spec.ts`) ; retrait des `$app/forms`, `ActionData`, `actions` restants. (`delete-confirm.ts` et les `fail` de `card-form.ts` ont déjà disparu avec t17.)
7. **E2E (avec JS)** : `login.e2e.ts` (erreur puis succès, `?redirectTo=`) ; `oauth.e2e.ts` (DCR, authorize PKCE, login signé, consentement, callback intercepté : `code`, `state`, `iss`) ; `invite.e2e.ts` ; `logout.e2e.ts` (sidebar 1280, feuille « Compte » 390, puis `/cards` → `/login`).
8. **Inscription** : projet Playwright `first-launch` (`register.e2e.ts`, `dependencies: ['app']`, donc en dernier), qui vide la base jetable par `bun scripts/e2e.ts empty` (garde-fou `assertDisposableName`), puis vérifie `/login` → `/register` → « Ton premier deck ».
9. **Docs** : `CLAUDE.md` (l. 66, 70, 85, 103 ; logout dans `lib/remote/`, projet e2e `first-launch`), `apps/web/README.md:39/42`, `doc/plans/jalon-1.md:7`.
10. **Vérification** : test_command, puis `bunx playwright test --workers=1` (après `lsof` sur le port du preview).

**Décisions de l'ouvrier :**
- Consent garde le champ caché `oauth_query` (aucun changement de schéma) ; login lit l'URL.
- Erreurs inattendues de login/register affichées dans le formulaire (`invalid`), comme les anciens `fail(500)`.
- Redirections en 303 (convention des remote forms de t17).
- Inscription testée en dernier sur une base vidée plutôt qu'avec une seconde base et un second preview (vider la base efface la ressource MCP : l'e2e OAuth doit passer avant).

**Risques :** `AppShell.svelte.spec.ts` pourrait ne pas charger le stub client de `logout.remote.ts` (repli : formulaire passé en prop par le layout) ; rate limit Better Auth en preview (a priori non, `auth.api` côté serveur) ; redirection externe depuis un remote form par API expérimentale (`_goto`, vérifiée dans kit 3.1.0) ; `redirect_uri` http localhost peut-être refusée par la DCR (repli : `https://claude.ai/api/mcp/auth_callback` intercepté).

**À relire en premier (à l'exécution) :**
- `apps/web/src/routes/oauth/consent/+page.svelte` · 6/10 · boutons et erreur passent aux composants du design system (aujourd'hui Tailwind brut) : changement visible (cf. t24).
- `apps/web/playwright.config.ts` · 6/10 · deux projets (`app` puis `first-launch`) : lancer seulement `register.e2e.ts` exécute aussi `app`, sauf `--no-deps`.
- `apps/web/src/routes/(auth)/login/login.remote.ts` · 7/10 · `oauthApiContext` reçoit la requête de l'endpoint remote, pas celle de la page (prototype t17 OK, e2e OAuth le prouvera).

## Questions

## Review
Rapport DONE du 2026-11-01. Commit e1c94dc sur dev ece315e ; worktree `.claude/worktrees/t22-remote-functions-auth`. 287 tests unitaires et 19 e2e verts (dont 8 nouveaux), contrat à jour, pas de migration.
- Login, register, invite et consentement en `*.remote.ts` ; déconnexion par `lib/remote/logout.remote.ts` (`.for()` pour AppShell et AccountMenu). Plus aucune form action : route `/logout` et `web/form-data.ts` supprimés.
- E2E : `auth.e2e.ts` (connexion erreur/succès, `redirectTo`, déconnexion barre latérale et téléphone, invitation), `oauth.e2e.ts` (DCR, login signé, consentement, callback `code`/`state`/`iss`), `first-launch.e2e.ts` (inscription, projet Playwright en dernier sur base vidée).
- Docs : CLAUDE.md, README `apps/web`, `doc/plans/jalon-1.md`.
- Décisions : étape 1 abandonnée ; champ caché `username` de l'invitation sans `name` (kit 3.1.0 refuse un champ nommé hors `fields`, `form_field_unbound`, noté dans CLAUDE.md) ; messages d'invitation dans `auth-errors.ts` ; `parseValues` remplacé par `testing/schemas.ts` (`fieldErrors`) ; `scripts/e2e.ts empty` n'accepte que `poj_e2e_<pid>`, `first-launch` seul via `--project=first-launch --no-deps` ; bouton « Compte » d'AccountMenu sorti de son `<form>`.
- Revue auto /simplify : 2 corrections (helpers e2e `waitForApp`, `submitSignIn`).
- [ ] REVIEW FIRST — `apps/web/src/routes/oauth/consent/+page.svelte:27` · 7/10 · page au design system (`SubmitButton`, `FormIssues`), chargement sur le seul bouton cliqué ; mise en page inchangée (pour t24).
- [ ] REVIEW FIRST — `apps/web/src/routes/(auth)/login/login.remote.ts:16` · 8/10 · requête OAuth signée lue dans `getRequestEvent().url` (URL de la page), vérifié par l'e2e OAuth.
- [ ] REVIEW FIRST — `apps/web/scripts/e2e.ts:44` · 8/10 · garde-fou de la nouvelle commande destructive `empty`.
- [ ] remaining — `apps/web/src/routes/(auth)/login/login.remote.ts:25` · 8/10 · ternaire APIError / « Erreur inattendue » copié dans `register.remote.ts` ; factoriser toucherait `authErrorMessage` et sa spec.
- [ ] remaining — `apps/web/src/routes/(auth)/login/+page.svelte:22` · 8/10 · `value={x.fields.f.value() ?? ''}` répété ; le dériver dans `TextField` sortirait du ticket.
- [ ] remaining — `apps/web/src/routes/oauth/consent/consent.remote.ts:9` · 7/10 · lire `oauth_query` dans l'URL comme le login, au lieu du champ caché ; choix du plan validé, laissé.
- [ ] remaining — `apps/web/e2e/auth.e2e.ts:53` · 9/10 · parcours d'invitation copié depuis `admin.e2e.ts:10` ; helper `inviteTester` possible.

## Log
- 2026-10-30 — créé au découpage du plan validé de t17 (livraison b). Part après l'intégration de t17. Relecture requise (auth, OAuth).
- 2026-10-31 — critère sans-JS abandonné par le développeur (voir t17) ; étape 1 à réévaluer, e2e avec JavaScript seulement.
- 2026-10-31 — t28 intégré, zones libres : lancé en PLAN MODE (opus, high ; plan requis : auth/OAuth).
- 2026-10-31 — ouvrier coupé par la limite d'usage (reset 19h40) pendant le plan, sans rapport. Ticket laissé en planning. [delivered] reprendre le même ouvrier après le reset.
- 2026-11-01 — même ouvrier relancé après le reset de la limite (« reprends »), PLAN MODE.
- 2026-11-01 — PLAN READY, attend la validation du développeur.
- 2026-11-01 — pause demandée par le développeur après t8 : plan en attente de validation, rien à lancer sans son go.
- 2026-11-01 — pause levée par le développeur.
- 2026-11-01 — plan validé tel quel (page de consentement aux composants du design system acceptée, t24 allégé). Même ouvrier relancé en EXECUTION MODE (opus, high), AUTO REVIEW /simplify, en parallèle de t8.
- 2026-11-01 — DONE, 287 tests et 19 e2e verts. In-review (relecture requise : auth/OAuth). [delivered] prêt à relire.
- 2026-11-01 — intégration demandée par le développeur sans relecture des points. Même ouvrier relancé en INTEGRATION MODE (rebase sur dev, qui contient t8).
- 2026-11-01 — rebasé sur 0537d14 sans conflit, 297 tests verts. Intégré dans dev par avance rapide (caf0c09), sans relecture des points à la demande du développeur. (Seul fichier non suivi dans le dépôt principal : doc/story/tapis-roulant.md, story en cours écrite par l'orchestrateur, non touchée.)
