---
id: t7
title: Comptes testeurs — rôle admin, page /admin et lien d'invitation à usage unique
status: done
priority: high
story: doc/story/connexion-assistants.md
plan_required: true
review:
model: opus
effort: high
zones: [apps/web/prisma, apps/web/src/lib/server/auth-config.ts, apps/web/src/lib/server/auth.ts, apps/web/src/lib/server/domain/accounts, apps/web/src/routes/(auth), apps/web/src/routes/(app)/admin, apps/web/src/lib/server/testing]
branch: ticket/T-0007-comptes-testeurs
agent: af3a55f152bf47de7
created: 2026-10-29
updated: 2026-10-29
---

## Context
Poj s'ouvre à quelques proches du développeur, des testeurs. Il n'y a pas d'inscription libre : l'administrateur root génère depuis une page d'admin un **lien d'invitation à usage unique** et le transmet lui-même (WhatsApp, SMS). Le testeur choisit son mot de passe en ouvrant le lien. Aucun envoi d'e-mail n'est configuré, et il ne faut pas en ajouter. Voir `doc/story/connexion-assistants.md` et `doc/decisions.md` (2026-10-29, « Testeurs invités par l'admin »), qui remplace la décision « Compte unique » du 2026-10-24.

L'enquête préalable a établi les points suivants :
- **Isolation des données :** aucun trou. Le domaine filtre par propriétaire, y compris le SQL brut. Les actions web passent par `ownerOf(locals)`. Le MCP utilise le `sub` du JWT, et l'API REST v1 est vide.
- **Compte unique :** `databaseHooks.user.create.before` (`single-account.ts`, branché dans `auth-config.ts`) lève 403 `SIGN_UP_CLOSED` dès que `accounts.isSignUpOpen()` est faux (`db.user.count() > 0`).
  - `/register` (`routes/(auth)/register`) sert au premier lancement, et `/login` redirige vers `/register` si la base est vide.
  - Ce hook refuserait aussi `admin.createUser`.
- **Plugin `admin` de Better Auth :** il est disponible en 1.7.12 (`better-auth/plugins/admin` : createUser, setRole, ban, impersonation). Il ajoute `users.role`, `banned`, `ban_reason`, `ban_expires` et `sessions.impersonated_by`. Après `auth:schema`, il faut réappliquer les `@map` snake_case et `uuid(7)`.
- **OAuth / MCP :** un deuxième utilisateur peut ajouter le connecteur Claude avec son propre compte, sans réglage (consentement par userId).
- **Ressources partagées :** une seule clé DeepL et le fuseau Europe/Zurich écrit en dur. Les deux sont acceptés pour l'instant.

**Attention :** t3 (decks génériques) n'est pas encore intégré dans dev. Il ajoute la migration `20261029110243_decks` et renomme les champs de carte. Il passera avant ce ticket : le plan doit en tenir compte, et la migration de t7 sera générée après son intégration.

## Done criteria
- [ ] Le premier compte (existant ou créé au premier lancement) est administrateur.
- [ ] La page `/admin` n'est accessible qu'à un administrateur, avec une garde dans le `load` et dans chaque action. Elle liste les comptes et les invitations en attente.
- [ ] L'admin génère un lien d'invitation à usage unique, avec une expiration (7 jours, sauf meilleure proposition). Le lien s'affiche, prêt à copier. Une invitation peut être révoquée.
- [ ] Le lien mène à une page où le testeur saisit son nom et son mot de passe. Le compte est alors créé, puis il est connecté. Un lien utilisé, expiré ou révoqué est refusé avec un message clair.
- [ ] Toute autre création de compte reste refusée côté serveur, y compris par l'endpoint Better Auth direct.
- [ ] Aucun e-mail n'est envoyé.
- [ ] Les conventions de schéma sont respectées, et les tests couvrent les gardes admin, le cycle de vie de l'invitation et le refus d'inscription.
- [ ] Le contrat OpenAPI est régénéré si des endpoints d'auth documentés changent.
- [ ] Les tests passent.

## Plan
(rendu par l'ouvrier le 2026-10-29)

1. **Schéma :**
   - Une enum `UserRole { user admin }`, et `User.role` qui vaut `user` par défaut.
   - Un modèle `Invitation` (`invitations`) : email, `tokenHash @unique`, `invitedById`, `expiresAt`, `acceptedAt?`, et `deletedAt` qui sert à la révocation.
   - Une migration générée après celle des decks, avec un backfill qui rend admin le compte le plus ancien.
2. **Better Auth :**
   - `role` est déclaré en `additionalField`, avec `input: false` : il n'est modifiable ni par l'inscription ni par `/update-user`.
   - `single-account.ts` devient `sign-up-hooks.ts` : le premier compte devient admin, et toute autre inscription reçoit un 403 `SIGN_UP_CLOSED`.
3. **Domaine `invitations.service` :**
   - `create` : 409 si le compte existe, révocation des invitations précédentes, jeton aléatoire de 32 octets dont seul le SHA-256 est stocké.
   - `listPending` et `revoke`.
   - `inspect` : valid, used, expired, revoked ou invalid.
   - `accept` : en transaction, avec usage unique atomique ; création de l'utilisateur et de son mot de passe avec `hashPassword`.
   - L'expiration est fixée à 7 jours.
4. **Garde :** `requireAdmin(locals)` renvoie un 303 vers `/login` sans session, et un 403 si l'utilisateur n'est pas admin.
5. **Page `/admin` :**
   - La liste des comptes et des invitations en attente.
   - Les actions `invite` (email) et `revoke`.
   - Le lien `${ORIGIN}/invite/<token>` n'est affiché qu'une fois, avec un bouton Copier.
6. **Page `/invite/[token]` :**
   - Un message clair si le lien est invalide, sinon un formulaire nom et mot de passe.
   - Après validation, `signInEmail` puis redirection vers `/cards`, avec `Referrer-Policy: no-referrer`.
7. **Textes et navigation :** les textes de `/register` et de `SIGN_UP_CLOSED`, et un lien « Administration » pour les admins.
8. **Tests :**
   - `createUser` reçoit un rôle, et le compte du bac à sable devient admin.
   - Specs : invitations, sign-up-hooks (y compris le POST direct sur l'endpoint et `update-user` avec un rôle), garde admin.
   - Backfill vérifié à la main sur poj_sandbox.

**Décisions proposées :**
- **Pas de plugin `admin` :** l'impersonation et le ban ajoutent de la surface d'attaque inutile ; une colonne de rôle suffit.
- **Une table d'invitations dédiée,** pour pouvoir lister, révoquer et distinguer les états.
- **Le jeton est haché,** donc le lien n'est visible qu'une fois. S'il est perdu, on en régénère un, ce qui révoque l'ancien.
- **Les comptes sont créés par le domaine,** et le hook continue de refuser tous les autres chemins.
- **L'admin saisit l'e-mail du testeur ;** le testeur ne saisit que son nom et son mot de passe.
- **Fonctions d'admin minimales :** lister, inviter, révoquer. Pas de désactivation de compte.

**Risques :**
- Un conflit probable de rebase avec t3, dans `schema.prisma` et `seed.ts` (t3 a été intégré depuis).
- Un admin déjà connecté qui ouvre un lien d'invitation est redirigé vers `/cards`.
- Si l'ouverture de session échoue après la création du compte, on redirige vers `/login`.

## Questions

## Review
- **Revue auto `/simplify` :** 7 corrections appliquées.
  - Ce qui a été corrigé : `unavailableReason`, `assertNoAccount`, le type `UserRole`, `PASSWORD_MIN_LENGTH`, `footerItem`, le `failure` dérivé et le `load` de `/invite`.
  - **remaining :**
    - `apps/web/src/routes/(app)/admin/+page.svelte:72` : le bloc « copier » duplique celui de `/connect`. Un composant `CopyField` commun irait hors du ticket.
    - `apps/web/src/routes/(auth)/invite/[token]/+page.server.ts:46` : les messages répètent la table de `auth-errors.ts`, qui n'est pas exportée.
    - `apps/web/src/lib/server/web/admin.ts:9` : la garde répète la redirection de `ownerOf`, pour rester testable sous node.
    - `apps/web/src/routes/(auth)/register/+page.server.ts:11` : `/register` et `/login` pourraient utiliser l'instance `accounts` partagée. Ce code existait avant le ticket.
- **À relire en premier** (dans l'ancien worktree `.claude/worktrees/T-0007`) :
  - `apps/web/src/routes/(app)/admin/+page.svelte:94` : le lien n'est affiché qu'une fois. S'il est perdu, en générer un nouveau révoque l'ancien.
  - `apps/web/prisma/migrations/20261029133004_invitations/migration.sql:36` : le backfill rend admin le compte le plus ancien, y compris en prod. Testé à la main sur poj_sandbox.
  - `apps/web/src/lib/server/domain/accounts/invitations.service.ts:169` : le domaine crée les lignes `user` et `credential` hors de Better Auth. Les `databaseHooks` ne s'exécutent donc pas pour les testeurs, et c'est un second chemin de création de compte.
- **Relecture du développeur (2026-10-29), terminée :**
  - Point 1 (`CopyField`) : ok, sorti dans t11.
  - Point 2 (messages d'`/invite`) : **à corriger.** Exporter la table de `auth-errors.ts` et l'utiliser dans `invite/[token]/+page.server.ts`.
  - Point 3 (garde admin) : **à corriger.** Réunir `requireAdmin` et `ownerOf` dans un seul module de gardes, avec une seule logique de redirection et testable sous node.
  - Point 4 (`accounts` partagé) : **à corriger.** `/register` et `/login` utilisent l'instance `accounts` de `services.ts`.
  - Point 5 (lien affiché une fois) : ok.
  - Point 6 (backfill) : ok. Rien n'est encore en ligne, et le développeur remplacera toutes les migrations par une seule avant la mise en ligne.
  - Point 7 (second chemin de création) : ok. **À corriger :** ajouter dans `sign-up-hooks.ts` un commentaire qui renvoie à `invitations.service.accept`, pour qu'un futur hook n'oublie pas ce chemin.
  - La validation manuelle des formulaires est laissée telle quelle : t12 s'en chargera pour toute la codebase.

- **Corrections, rapport DONE du 2026-10-29 (commit 82b57e9) :**
  - Ce qui a été fait :
    - **Point 2 :** `authErrorMessages` exportée et utilisée par `/invite` et `/admin`.
    - **Point 3 :** un module `lib/server/web/guards.ts` regroupe `ownerOf` et `requireAdmin`, avec un `userOf` commun ; les 6 routes sont mises à jour et `guards.spec.ts` est ajouté.
    - **Point 4 :** `/login` et `/register` utilisent l'instance `accounts` partagée.
    - **Point 7 :** le commentaire est ajouté.
  - Décision de l'ouvrier : `PASSWORD_TOO_SHORT` affiche `PASSWORD_MIN_LENGTH`.
  - **À relire en premier :**
    - `apps/web/src/lib/server/web/guards.ts:7` : la redirection va vers `/login` sans page de retour, alors que le layout `(app)` utilise `loginUrl()`. Il reste donc deux règles.
    - `apps/web/src/lib/server/auth-errors.ts:17` : le message suit la constante du domaine, mais `auth-config.ts:38` ne transmet pas `minPasswordLength` à Better Auth.
  - **Revue auto `/simplify` :** 2 corrections appliquées. Points restants :
    - `apps/web/src/routes/mcp/+server.ts:13` : la route crée encore son propre `createAccountsService(db)`.
    - `apps/web/src/routes/(auth)/register/+page.svelte:49` : l'indice « 8 caractères » est écrit en dur.
    - `apps/web/src/lib/server/auth-config.ts:38` : `minPasswordLength` et `maxPasswordLength` devraient venir des constantes du domaine.
    - `apps/web/src/lib/server/web/guards.ts:7` : `loginUrl(url)` dans `userOf` changerait le comportement.
    - `apps/web/src/routes/(auth)/invite/[token]/+page.server.ts:39` : la longueur du mot de passe est vérifiée deux fois. Relève de t12.
    - `apps/web/src/lib/server/sign-up-hooks.ts:13` : un chemin de création de compte commun. Écarté par le développeur.
  - Tests : 170 au vert, contrat à jour, pas de rebase nécessaire.

- **Seconde relecture du développeur (2026-10-29) :**
  - Point 1 (limites de mot de passe) : **à corriger.** Une seule source, la constante du domaine (`PASSWORD_MIN_LENGTH` et sa limite haute), passée à Better Auth (`minPasswordLength` et `maxPasswordLength` dans `auth-config.ts`) et utilisée pour l'indice de `/register`.
  - Point 2 (redirection vers la connexion) : **à corriger.** `userOf` utilise `loginUrl(url)`, comme le layout `(app)`, pour n'avoir qu'une seule règle.
  - Point 3 (`accounts` dans la route MCP) : **à corriger.** `routes/mcp/+server.ts` utilise l'instance partagée de `services.ts`.
  - La double vérification de longueur dans `/invite` est renvoyée à t12, et le chemin de création commun est écarté.

- **Corrections de la seconde relecture, rapport DONE (ec00a9c, 2b168ce, c638bce) :**
  - Ce qui a été fait :
    - les limites de mot de passe du domaine sont transmises à Better Auth, et l'indice de `/register` vient du `load` ;
    - `userOf(locals, url)` redirige vers `loginUrl(...)`, et `ownerOf`, `requireAdmin` et le layout `(app)` passent tous par lui ;
    - `/mcp` utilise l'instance `accounts` partagée.
  - Décisions de l'ouvrier :
    - les gardes prennent `(locals, url)` ;
    - la redirection du layout passe de 302 à 303.
  - **À relire en premier :** `apps/web/src/lib/server/web/guards.ts:11`. Si la session expire pendant une form action, `redirectTo` garde la query de l'action (`/cards?/goal`). Après la connexion, on revient donc en GET sur cette URL : sans effet, mais visible.
  - **Revue auto, points restants :**
    - `apps/web/src/lib/server/web/guards.ts:20` : passer l'event plutôt que `(locals, url)`.
    - `apps/web/src/lib/server/domain/accounts/invitations.service.ts:8` : les limites de mot de passe sont rangées dans le module des invitations.
  - Tests : 171 au vert, contrat à jour.

- **Troisième relecture du développeur (2026-10-29) :**
  - Point 1 (signature des gardes) : **à corriger.** Les gardes reçoivent l'event (`Pick<RequestEvent, 'locals' | 'url'>`) au lieu de `(locals, url)` : on écrit `ownerOf(event)`. `getRequestEvent()` est écarté pour l'instant, faute de savoir s'il passe dans le projet de tests `server`.
  - Point 2 (emplacement des limites de mot de passe) : **à corriger.** Déplacer `PASSWORD_MIN_LENGTH` et `PASSWORD_MAX_LENGTH` dans le module `accounts`, et les importer depuis là dans `invitations.service` et `auth-config.ts`.
  - Point 3 (`redirectTo` après une action) : **à corriger.** `userOf` retire de `redirectTo` les paramètres qui commencent par `/` (les actions), avec un cas de test.

- **Corrections de la troisième relecture, rapport DONE (9fc872b, 1a7ee4b) :**
  - Ce qui a été fait :
    - les gardes prennent un `GuardEvent` (`Pick<RequestEvent, 'locals' | 'url'>`) ;
    - les limites de mot de passe sont dans `accounts.service.ts` ;
    - `loginUrl` (`redirect-to.ts`) retire les paramètres d'action.
  - **À relire en premier :** rien.
  - **Revue auto, points restants (cosmétiques) :**
    - `apps/web/src/routes/(app)/review/+page.server.ts:67` : déstructurer l'event dans les routes.
    - `apps/web/src/lib/server/domain/accounts/accounts.service.ts:9` : un fichier `password.ts` à part pour les deux constantes.
  - Tests : 173 au vert, contrat à jour, branche sur dev b6985e5.

## Log
- 2026-10-29 — créé depuis la story connexion-assistants.
- 2026-10-29 — ouvrier lancé en PLAN MODE (opus, high), sur la base de la branche t3 non intégrée
- 2026-10-29 — plan prêt, en attente de validation
- 2026-10-29 — **Plan validé.** Il attend l'intégration de t9 : max_parallel 1, et la navigation est commune aux deux tickets.
  - À transmettre au lancement : dev contient t3, donc rebaser d'abord.
  - Ne pas ajouter d'entrée dans `doc/decisions.md` : celle du 2026-10-29 « Testeurs invités par l'admin » existe déjà, il suffit d'y renvoyer.
- 2026-10-29 — t9 intégré. Ouvrier relancé en EXECUTION MODE (opus, high), avec AUTO REVIEW /simplify
- 2026-10-29 — **DONE**, branche `ticket/T-0007-comptes-testeurs` sur dev b6985e5, sans conflit.
  - Tests : 168 au vert, contrat inchangé.
  - Essai de bout en bout sur la sandbox : invitation, création du compte, 403 pour un non-admin, lien réutilisé refusé, sign-up direct en 403, `admin/create-user` en 404.
  - Pour le développeur : `bun run db:migrate`, qui rend admin le compte le plus ancien.
- 2026-10-29 — l'ouvrier a5e8ffba27dc06a64 n'est plus joignable. Les corrections de la relecture partiront ensemble à un nouvel ouvrier, sur la branche existante.
- 2026-10-29 — ancien worktree supprimé, il était propre. La branche est conservée.
- 2026-10-29 — nouvel ouvrier lancé en EXECUTION MODE (opus, high) sur la branche existante, pour les corrections 2, 3, 4 et 7. AUTO REVIEW /simplify.
- 2026-10-29 — **DONE** pour les corrections (82b57e9), 170 tests au vert. Il reste à relire les points nouveaux.
- 2026-10-29 — seconde relecture terminée : 3 corrections envoyées à l'ouvrier af3a55f152bf47de7.
- 2026-10-29 — **DONE** pour les corrections de la seconde relecture, 171 tests au vert. Il reste à relire 3 petits points.
- 2026-10-29 — troisième relecture terminée : 3 corrections envoyées à l'ouvrier af3a55f152bf47de7.
- 2026-10-29 — **DONE** pour les corrections de la troisième relecture, 173 tests au vert. Ne restent que 2 points cosmétiques ; t7 attend le feu vert pour l'intégration.
- 2026-10-29 — **intégré** dans dev par avance rapide (b6985e5..1a7ee4b, 8 commits), sans conflit. Il reste au développeur à lancer `bun run db:migrate` dans le checkout principal.
