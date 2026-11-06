---
id: t17
title: Remote functions plutôt que form actions, et feedback des formulaires standardisé
status: done
priority: normal
story:
plan_required: true
depends_on: [t12]
review: required
model: opus
effort: high
zones: [apps/web/src/routes, apps/web/src/lib/components]
branch: ticket/t17-remote-functions
agent: a8d7aa26f32f9e6b9
created: 2026-10-30
updated: 2026-10-30
---

## Context
Remarque de Jonas pendant la relecture de `t13-supprimer-deck` :
- il préfère légèrement les remote functions de SvelteKit aux form actions, pour leur typage de bout en bout ;
- il veut un retour visuel standardisé dans tous les formulaires (états d'envoi, erreurs, succès : aujourd'hui géré au cas par cas avec `enhance`).

Une analyse est en cours (ork:scout) : usage actuel des actions, état des remote functions dans SvelteKit 3.1.0, coût d'une migration, et proposition de standard.

## Analyse (ork:scout, 2026-10-30)
**Faits**
- **Inventaire :** 11 pages ont des form actions, 17 actions en tout, et `enhance` est utilisé dans 9 pages et 2 composants (`CardForm`, `DeckForm` reçoivent un `enhance` en prop).
- **Incohérences :**
  - `fail` renvoie trois formes différentes : `{message}`, `{values, errors}`, ou des drapeaux (`confirmDelete`, `amendOpen`, `resetWarning`) ;
  - l'état « envoi en cours » est géré à la main ou absent ;
  - l'erreur globale s'affiche en Notice ou en `<p>` brut (`oauth/consent`, qui n'est pas aligné sur le design system) ;
  - aucun message de succès : un succès redirige toujours ;
  - la validation est faite à la main partout.
- **Sans JS :** tous les formulaires fonctionnent sans JavaScript. Aucun envoi de fichier.
- **Remote functions dans SvelteKit 3.1.0 :**
  - elles restent **expérimentales** (« not subject to semantic versioning », `types/index.d.ts:1730`). `vite.config.ts` active déjà `remoteFunctions` et `async`, mais il n'existe aucun `.remote.ts` ;
  - `form(schema, fn)` accepte un Standard Schema, donc Zod 4, avec `fields.x.issues()`, `invalid()`, `pending` et `enhance` ;
  - elles fonctionnent sans JS (POST `?/remote=<id>`, état restauré au rendu serveur) ;
  - `getRequestEvent()` donne accès à `locals` et à `request` ;
  - `fail()` est interdit dans un remote form.
- **Contraintes :**
  - **domaine :** rien ne change ;
  - **tests :** un `.remote.ts` n'est pas testable unitairement hors Vite, seulement en e2e ;
  - **OAuth :** login et consent, avec `oauth_query`, `oauthApiContext(request)` et une redirection externe. La redirection externe depuis un remote form n'a pas été vérifiée.
- **Checkout principal :** `node_modules` est périmé (kit 3.0.0-next.32 au lieu de 3.1.0). `bun install` est à faire.

**Avis du scout**
- **Approche hybride :**
  - d'abord un standard de feedback indépendant du transport ;
  - ensuite, la migration des formulaires purement CRUD en remote `form`, avec decks/new comme pilote ;
  - login, register, invite et consent restent des actions.
- **Standard proposé :**
  - un composant d'erreur ou de succès basé sur Notice ;
  - `TextField` avec un prop `error` ;
  - un helper `enhanceForm` qui gère l'envoi en cours, la mise à jour et la remise à zéro ;
  - une seule forme pour `fail` : `{ values, errors, message? }`.
- **Coût :** le standard seul touche environ 12 fichiers, pour un risque faible. La migration complète touche environ 20 fichiers, pour un risque moyen à élevé.
- **Ordre :** avec ou après t12 (Zod), pour ne pas migrer deux fois.

## Done criteria
- [ ] **Livraison (a) :** les formulaires CRUD (decks, cartes, objectif), la révision et l'admin passent par des remote functions dans des `.remote.ts`. Auth, OAuth et logout restent en actions : ils passent dans t22.
- [ ] Les remote functions sont de fines couches : un schéma Zod (t12) en entrée, puis un appel au service du domaine. Aucune logique métier.
- [ ] Le retour des formulaires est standardisé dans des composants partagés : envoi en cours sur le bouton, erreurs de champ, erreur globale, et succès quand il n'y a pas de redirection.
- [ ] Des tests e2e Playwright couvrent le branchement des formulaires migrés, sur une **base jetable** (créée au lancement, migrations appliquées, supprimée à la fin ; `worktree:prune` nettoie celles laissées par un lancement interrompu). Les services restent couverts par les tests unitaires.
- [ ] Les tests passent.

## Plan
Rendu le 2026-10-30 (opus, high). Branche `ticket/t17-remote-functions`, aucun commit, worktree propre.
1. **Socle :** `oauth-flow.ts` `oauthQuery` écarte les paramètres `/…` (`/remote=…`), avec test. Schémas `accounts.ts` : `password` → `_password` (jamais renvoyé sans JS). `oauth.spec.ts` et `schemas/*.spec.ts` adaptés.
2. **Composants de retour** (`lib/components/form/`) : `SubmitButton` (chargement si `form.pending > 0`), `FormIssues` (erreur globale `invalid('…')` dans un `Notice`), `FormSuccess` (`role="status"`), `TextField` / `SelectField` reçoivent `fields.x.as(...)` et `issues()[0]`.
3. **Un `x.remote.ts` par route :** `form(schéma t12, fn)` → `ownerOf(getRequestEvent())` → service → `redirect` ou résultat typé. Erreurs métier via `invalid(issue.champ(msg))` / `invalid(msg)`. Les `+page.server.ts` gardent `load`, perdent `actions`.
4. **CRUD :** decks/new, decks/[id]/edit (save + delete), cards/new, cards/[id]/edit, cards/[id] (delete), objectif `/cards`, admin (invite, revoke via `.for(id)`). `CardForm`/`DeckForm` reçoivent l'instance de form. DeepL : un seul form de carte avec bouton `intent=translate` qui renvoie `{ suggestion }` (marche sans JS).
5. **Étapes en deux temps** en résultats typés (pas de `fail`) : doublon, réinitialisation, `DeleteConfirm` (`{ confirmDelete }`, rendu sans JS), `amendOpen`.
6. **Révision :** hint, answer, amend en remote forms ; compteur et raccourcis clavier via `form.submit()` / `requestSubmit`.
7. **Auth et OAuth :** login (requête OAuth lue dans `getRequestEvent().url`, `redirect(302, next, { external: true })`), register, invite, consent, logout (`lib/remote/logout.remote.ts`). Suppression de `form-data.ts`, `delete-confirm.ts`, helpers `fail` de `card-form.ts` ; CLAUDE.md mis à jour.
8. **Infra e2e :** le webServer de `playwright.config.ts` hérite aujourd'hui de `DATABASE_URL` (base de dev). Proposition : base sandbox du checkout, reset + seed en globalSetup. Sélecteurs par `getByLabel`.
9. **Specs e2e** avec et sans JS : connexion, OAuth complet (DCR → callback avec code et state), deck (création, nom pris, suppression confirmée sans JS), carte (création, doublon, réinitialisation), objectif, révision (réponse, correction), invitation admin.
10. test_command, puis `bunx playwright test --workers=1`, puis api:check (inchangé).

**Décisions de l'ouvrier :**
- **Redirection externe OAuth depuis un remote form : vérifiée** par prototype jetable, avec et sans JS (code, state et iss livrés). Seul piège : `&/remote=…` sans JS, retiré de `oauth_query` (étape 1).
- Remote functions à côté de leur route, logout dans `lib/remote/`. Les `load` ne passent pas en `query`.
- Avertissements (doublon, réinitialisation, confirmation) en 200 avec résultat au lieu de 400/409.
- t20 : API de `TextField` gardée, aucune règle `autocomplete` ajoutée.
- **Découpage recommandé :** (a) socle, composants, infra e2e, CRUD, révision, admin, objectif ; (b) auth, OAuth, logout, suppression des restes. Ou un seul ticket si la taille est acceptée (~11 pages, 17 actions, 9 specs e2e).

**Risques :** API expérimentale (kit épinglé 3.1.0) ; remise à zéro du form après succès à neutraliser là où les valeurs restent (objectif, DeepL) ; rate limit Better Auth en e2e (`storageState` partagé) ; e2e hors `test_command` ; CSP `form-action` à surveiller si ajoutée.

**À relire en premier :**
- `apps/web/playwright.config.ts:9` : base de l'e2e (sandbox remise à zéro à chaque run, ou base `poj_e2e` dédiée qui touche `worktree.ts`, `.env.example` et les garde-fous).
- `apps/web/src/lib/server/oauth-flow.ts:16` : `oauthQuery` ignore `/remote`.
- `apps/web/src/lib/components/GoalCalendar.svelte:131` : composition avec t6 (le form `?/goal` devient un remote form passé en prop).

## Questions
- 2026-10-30 — Quelle option : (A) standard de feedback seul, sur les actions ; (B) standard + pilote remote `form` sur decks/new, puis migration CRUD si concluant (auth/OAuth restent en actions) ; (C) migration complète. Reco : B, après t12.
  - 2026-10-30, Jonas : **C**. Les tests unitaires portent sur les services ; une remote function n'est qu'un appel à un service, que l'API peut aussi exposer. Le branchement est vérifié par les tests e2e. Le statut expérimental est accepté : on suivra l'évolution de SvelteKit.

- 2026-10-30 — Base e2e : le développeur propose une base jetable (créée au lancement, supprimée à la fin). Chef : d'accord, préférable à `poj_e2e` permanente et à la sandbox.

- 2026-10-30 — Plan validé par le développeur, avec : base e2e **jetable** (et non la sandbox ni `poj_e2e` permanente) ; **deux livraisons** : t17 = (a) étapes 2 à 6, 8, 9 partiel ; t22 = (b) étapes 1 et 7 (auth, OAuth, logout, suppression des restes).

- 2026-10-31 — Le développeur abandonne le critère « fonctionne sans JavaScript » : aucun effort spécifique, on garde ce que SvelteKit donne sans le tester ; e2e avec JavaScript seulement. Raison : app utilisée par le développeur et ses proches sur des téléphones récents ; le sans-JS coûtait des étapes en deux temps rendues côté serveur, DeepL par envoi de formulaire, `_password`, des e2e doublés et le piège `/remote` d'OAuth.

## Review
Rapport DONE du 2026-10-31, livraison (a). Worktree `.claude/worktrees/t17-remote-functions`, sur dev 2118326. check/lint/test (271)/api:check verts ; `bunx playwright test --workers=1` : 11 passés (~34 s + build), base jetable supprimée ensuite.

**Ce qui est fait :** formulaires deck, carte, objectif, révision, admin en `*.remote.ts` à côté des pages (login, register, invite, OAuth, logout restent en actions pour t22). Composants de retour dans `lib/components/form/` (`SubmitButton`, `FormIssues`, `FormSuccess`, prop `field` sur `TextField`/`SelectField`), `orInvalid` pour les `ConflictError`. Base e2e `poj_e2e_<pid>` créée par la commande du serveur de preview (migrations + seed), supprimée en `globalTeardown`, nettoyée par `worktree:prune` si le pid est mort. CLAUDE.md mis à jour.

**Décisions de l'ouvrier :**
- Sans-JS abandonné : `DeleteConfirm` devient une feuille sans étape serveur (`delete-confirm.ts` supprimé) ; la correction de note passe toujours par la feuille (`amendSchema` exige une note) ; `?reveal` revient au comportement de dev ; e2e avec JS seulement.
- `CardForm` porte la suggestion DeepL (sans rechargement, limitée au deck choisi), l'enhance et le contrôle de doublon.
- Champ `intent` dans le schéma de carte pour distinguer enregistrer / traduire (pas d'actions par bouton en kit 3.1.0).
- Changement visible : l'objectif du jour et la correction de note affichent un message de succès.
- `GoalCalendar` passe à `bind:open` (l'ancien `open={open || error}` fermait le panneau pendant la saisie).
- Composants partagés typés `AnyRemoteForm` (`fields: any`) ; pages et `.remote.ts` gardent les types exacts.
- `SANDBOX_ACCOUNT` déplacé dans `testing/sandbox-account.ts`.

**Revue auto (/simplify) :** ~15 corrections.
- [x] remaining — `apps/web/src/routes/(app)/cards/new/card.remote.ts:20` : un avertissement doublon/réinitialisation recharge layout et page (`refreshAll`).
- [x] remaining — `apps/web/scripts/e2e.ts:27` : séquence recréer + migrer + seed proche de `sandbox.ts reset`, non factorisée.
- [x] remaining — `apps/web/e2e/helpers.ts:25` : chaque test se connecte par l'interface (un `storageState` partagé économiserait ~10 connexions).
- [x] remaining — `apps/web/src/lib/server/web/form-data.ts:14` : `parseValues` n'est plus utilisé que par les specs ; laissé pour t22.
- [x] remaining — `apps/web/src/lib/components/form/remote-form.ts:20` : `AnyRemoteForm` désactive le typage de `fields`/`result` dans `CardForm`/`DeckForm` (des `generics` Svelte le garderaient, plus complexe).

**À relire en premier :**
- [x] `apps/web/playwright.config.ts:16` : nom de base fixé par le pid du runner, préparée par la commande du serveur (Playwright lance `webServer` avant `globalSetup`) ; base créée sur le serveur de `DATABASE_URL_TEST`.
- [x] `apps/web/src/lib/server/testing/database.ts:41` : les garde-fous destructifs acceptent `poj_e2e_<pid>` dans tout checkout (garde-fou de sécurité : vérifier le motif).
- [x] `apps/web/src/lib/components/CardForm.svelte:66` : traduction via `submit().updates()` sans rechargement ; doublon/réinitialisation rechargent les données de page (layout compris).

- Retour du développeur (2026-10-31) : garder les types dans `CardForm`/`DeckForm` avec des génériques Svelte, sans `any` sur `fields`/`result`. Envoyé à l'ouvrier.

- Correction rendue (2026-10-31, commit 126c80e) : `CardForm`/`DeckForm` génériques sur le mode (`generics="Mode extends 'create' | 'edit'"`, `form: Forms[Mode]`), `AnyRemoteForm` et `remote-form.ts` supprimés ; types exacts (`NewCardForm`, `CardEditForm`, `CardFormResult`, `NewDeckForm`, `DeckEditForm`) dérivés de `z.input` des schémas t12 ; les remote functions de carte déclarent `Promise<CardFormResult>`. `result` lu par rétrécissement (`'duplicate' in result`). Typage vérifié en plantant des erreurs. Seule faille : la valeur d'un bouton `fields.intent.as('submit', 'sav')` compile (kit : `Value | (string & {})`). 271 tests, 11 e2e verts.
- [x] REVIEW FIRST — `apps/web/src/lib/components/DeckForm.svelte:34` : un cast unique `mode === 'edit' ? (form as CardEditForm) : null` pour les champs propres à un mode, sûr car `Props` lie `mode` à `form`.

## Log
- 2026-10-30 — créé depuis une remarque, analyse lancée
- 2026-10-30 — analyse reçue, question ouverte sur l'option
- 2026-10-30 — option C retenue, ticket prêt, plan obligatoire, part après t12. Point à vérifier dans le plan : la redirection externe d'OAuth depuis un remote form.
- 2026-10-30 — t12 intégré ; ouvrier lancé en PLAN MODE (opus, high), en parallèle de l'exécution de t6. Exécution après t6.
- 2026-10-30 — PLAN READY. Attend la validation (base e2e, découpage). t6 intégré entre-temps : rebase à prévoir.
- 2026-10-30 — plan validé (base jetable, deux livraisons ; t22 créé pour la livraison b). Exécution après l'intégration de t20 (TextField). t21 passera après t17.
- 2026-10-30 — t20 intégré ; même ouvrier relancé en EXECUTION MODE (opus, high), livraison (a) seulement, base e2e jetable, AUTO REVIEW /simplify.
- 2026-10-30 — mis en pause par le développeur pendant l'exécution (ouvrier arrêté en écrivant les composants de formulaire partagés). Reprise : SendMessage au même ouvrier, ou nouvel ouvrier sur la branche existante.
- 2026-10-31 — reprise après la pause : même ouvrier relancé (EXECUTION MODE, livraison a), informé du hook CSRF de t23.
- 2026-10-31 — critère sans-JS supprimé, ouvrier prévenu.
- 2026-10-31 — DONE (livraison a), 271 tests unitaires et 11 e2e verts. Statut in-review (relecture requise). [delivered] prêt à relire.
- 2026-10-31 — relecture guidée commencée ; 7 points cochés par le chef (optimisations mineures, nettoyage prévu dans t22, cycle de vie e2e vérifié par les tests, motif `poj_e2e_<pid>` limité aux bases jetables, rechargement après avertissement acceptable).
- 2026-10-31 — relecture : correction demandée (génériques Svelte pour garder le typage). Ouvrier relancé.
- 2026-10-31 — correction des génériques rendue (126c80e), tests verts. Relecture reprise sur ce point.
- 2026-10-31 — relecture terminée, intégré dans dev par avance rapide (livraison a), sans conflit. Worktree et branche supprimés. Suite : t22 (livraison b).
