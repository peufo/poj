---
id: t43
title: Chaque compte active les notifications et règle son seuil de cartes prêtes
status: done
priority: normal
story: doc/story/notifications-revision.md
depends_on: [t42]
plan_required: true
lane:
review: required
model: opus
effort: high
zones: [apps/web/prisma, apps/web/src/env.ts, apps/web/src/lib/server/domain/notifications, apps/web/src/lib/server/web/schemas, apps/web/src/routes/(app)/settings, apps/web/package.json]
branch: ticket/t43-abonnement-seuil
agent: aaf8d106a18b074d0
paused:
created: 2026-11-13
updated: 2026-11-13
---

## Context
Deuxième brique de la story `doc/story/notifications-revision.md`. Le seuil et l'abonnement sont propres à chaque compte (Poj a des testeurs invités). Le seul réglage par utilisateur existant est le modèle `NewCardsLimit` de `apps/web/prisma/schema.prisma`, à imiter. Il n'y a encore aucune page de réglages. `web-push` et les clés VAPID sont absents ; les clés se déclarent dans `apps/web/src/env.ts`, optionnelles comme celle de DeepL (sans clés, la fonctionnalité est simplement indisponible).

Plan requis (migration). Relecture requise (migration).

## Done criteria
- [x] Une page de réglages permet d'activer les notifications sur l'appareil (permission du navigateur, puis abonnement push), de régler le seuil de cartes prêtes, et de les désactiver.
- [x] L'abonnement (endpoint unique, clés) est enregistré pour le compte connecté à l'activation et supprimé à la désactivation ; plusieurs appareils par compte sont possibles. Les conventions de schéma de `CLAUDE.md` sont suivies (uuid(7), snake_case, `deletedAt`, idempotence).
- [x] Le seuil a une valeur par défaut et des bornes, constantes du domaine importées par le schéma Zod.
- [x] Sans clés VAPID configurées, la page dit que les notifications sont indisponibles, sans erreur.
- [x] Tests du domaine : abonnement, désabonnement, réabonnement du même endpoint, réglage du seuil.
- [x] Les tests passent.

## Plan
(rédigé par l'ouvrier ; reporté par le chef, l'écriture du ticket lui ayant été refusée depuis son worktree)

1. **Schéma et migration** (`apps/web/prisma/schema.prisma`, `migrations/2026111309xxxx_push_notifications`, SQL par `prisma migrate diff`, sans toucher la base de dev partagée) :
   - `PushSubscription` (`push_subscriptions`) : id uuid(7), `userId`, `endpoint` **unique sur toute la table**, `p256dh`, `auth`, `createdAt/updatedAt/deletedAt`, index sur `userId` ;
   - `NotificationSettings` (`notification_settings`) : id uuid(7), `userId` unique, `readyThreshold`, **`thresholdReachedAt DateTime?`** pour t44, `createdAt/updatedAt`. Pas de `deletedAt` : une ligne par compte, modifiée sur place, supprimée en cascade avec le compte, comme `NewCardsLimit`.
2. **Domaine** `domain/notifications/notifications.service.ts`, exporté par `domain/index.ts` :
   - constantes `DEFAULT_READY_THRESHOLD = 5`, `MIN_READY_THRESHOLD = 1`, `MAX_READY_THRESHOLD = 100` ;
   - `createNotificationsService(db)` : `subscribe` (upsert par endpoint, remet `deletedAt` à null, met à jour clés et compte) ; `unsubscribe(ownerId, endpoint, now)` (`updateMany` limité au compte, idempotent) ; `endpoints(ownerId)` ; `threshold(ownerId)` (défaut sans ligne) ; `setThreshold` (upsert par `userId`).
3. **Variables d'environnement** (`src/env.ts`) : `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, facultatives comme DeepL. `lib/server/push/index.ts` expose `vapid | null`. Documentées dans `apps/web/.env.example`, le `.env.example` racine et l'`env` de la CI (`''`), avec `bunx web-push generate-vapid-keys`.
4. **Schémas Zod** `web/schemas/notifications.ts` (+ spec) : `readyThresholdSchema` (`n:threshold`, bornes du domaine, message en français) ; `pushSubscriptionSchema` (endpoint URL `https:` ≤ 2048, clés base64url bornées).
5. **Page `/settings`** (`routes/(app)/settings/` : `+page.server.ts`, `+page.svelte`, `settings.remote.ts`) : load `{ vapidPublicKey | null, threshold, min, max, endpoints }` ; remote form `saveThreshold` (`TextField`, `FormSuccess`, saisie gardée) ; `command` `subscribe` / `unsubscribe` appelés après les API du navigateur (`requestPermission` → `serviceWorker.ready` → `pushManager.subscribe` → `subscribe(sub.toJSON())`). États : activées sur cet appareil, serveur sans clés (« indisponibles »), navigateur sans Push (iPhone : « ajoute Poj à l'écran d'accueil »), permission refusée. Conversion base64url → `Uint8Array` dans `lib/push.ts`, testée.
6. **Navigation** : lien « Réglages » dans le pied de la barre latérale (`AppShell`) et dans `AccountMenu` ; aucun onglet actif sur `/settings` ; icône `bell` dans `Icon.svelte` si besoin.
7. **Tests** : domaine (abonnement, deux appareils, désabonnement idempotent et limité au compte, réabonnement avec nouvelles clés, endpoint repris par un autre compte, seuil par défaut / réglé / re-réglé) ; schémas ; page en navigateur (sans clé : « indisponibles » sans bouton ni erreur ; avec clé : seuil affiché). Contrat inchangé.

**Pour t44 :** l'état « au-dessus du seuil » vit dans `notification_settings.threshold_reached_at`, créé dès cette migration : null = sous le seuil ; t44 envoie et pose la date quand `countDue ≥ seuil` et la colonne est null, la remet à null sous le seuil, et crée la ligne (seuil par défaut) pour un abonné qui n'a jamais réglé. Aucune seconde migration prévue.

**Risques :**
- **SSRF** : t44 enverra des POST vers des endpoints fournis par le client. t43 n'accepte que `https:`. Liste blanche d'hôtes possible dès t43 (`fcm.googleapis.com`, `updates.push.services.mozilla.com`, `*.push.apple.com`, `*.notify.windows.com`), au risque de refuser un navigateur peu courant : à trancher.
- **Endpoint unique sur toute la table** : sur un même navigateur, le dernier compte qui active reprend l'abonnement (un abonnement par origine).
- **`deletedAt`** : endpoint et clés restent en base après désactivation (convention du dépôt).
- **Changement des clés VAPID** : l'activation désabonne l'ancien abonnement local et réessaie une fois.
- **Pas de `web-push` en t43** : t44 l'ajoutera ; `package.json` inchangé.
- **Hors `zones`** : `lib/server/push/`, `lib/push.ts`, `AppShell`, `AccountMenu`, `+layout.svelte`, `Icon.svelte`, `.env.example` (web et racine), CI.
- **Après intégration** : Jonas lance `bun run db:migrate` pour la base de dev.

## Questions
- 2026-11-13 — Liste blanche des hôtes d'endpoint (SSRF côté t44) ? → **oui, dès t43** : FCM, Mozilla, Apple, Windows, en plus de `https:` ; liste exposée pour que t44 la revérifie avant envoi (développeur).

## Review
/simplify : 5 corrections appliquées (enregistrement du seuil sans recharger la page avec `submit().updates()`, enveloppe commune activer/désactiver, transformation du schéma et constante en ligne, type `Vapid` inféré, test du support Push en ligne).
- [x] apps/web/src/lib/server/domain/notifications/push-services.ts:5 · 7/10 · Liste blanche des hôtes (FCM, Mozilla, `*.push.apple.com`, `*.notify.windows.com`, en `https:` sans port ni identifiants). À vérifier : qu'elle couvre bien les navigateurs des testeurs. Un endpoint hors liste reçoit « Ce navigateur utilise un service de notifications que Poj ne prend pas en charge. » ; t44 réutilise `isPushServiceUrl` avant chaque envoi.
- [x] apps/web/src/lib/server/domain/notifications/notifications.service.ts:26 · 7/10 · Endpoint unique sur toute la table : sur un même navigateur, le dernier compte qui active les notifications reprend l'abonnement, et l'autre compte n'y est plus notifié. Le réabonnement ravive la même ligne (tests à l'appui).
- [x] apps/web/src/lib/server/domain/notifications/notifications.service.ts:6 · 6/10 · Choix produit : seuil de 5 par défaut (l'exemple de la story), bornes 1 à 100.
- [x] apps/web/src/routes/(app)/settings/settings.remote.ts:21 · 6/10 · Remarque de /simplify non corrigée : `subscribe` est une `command('unchecked')` qui appelle `safeParse` dans la fonction pour renvoyer `{ refused }` en français. Le kit renvoie sinon un « Bad Request » sans détail. La solution générale serait un `handleValidationError` dans `hooks.server.ts`, mais il toucherait toutes les remote functions et sort du ticket.
- [x] apps/web/src/routes/(app)/settings/+page.svelte:180 · 8/10 · Remarque de /simplify non corrigée : le champ numérique du seuil recopie celui de `DeckForm.svelte` (nouvelles cartes par jour), et son schéma recopie `newCardsPerDay` de `schemas/decks.ts:93`. Un `NumberField` dans `lib/ui` et un helper `boundedInt` dans `schemas/fields.ts` les factoriseraient, au prix d'un refactoring de `DeckForm`, hors ticket.
- [x] apps/web/src/routes/(app)/+layout.svelte:15 · 8/10 · Remarque de /simplify non corrigée : `/settings` est ajouté à la liste des routes sans onglet actif. Changer le repli `'cards'` en `undefined` pour toute route qui n'est pas un onglet éviterait ces cas particuliers, mais modifierait un comportement existant.

## Log
- 2026-11-13 — créé au découpage de la story notifications-revision.
- 2026-11-13 — `t42-pwa-installable` intégré : lancé en PLAN MODE (opus, high). Le plan doit aussi dire où vivra l'état « au-dessus du seuil » de t44.
- 2026-11-13 — plan rédigé par l'ouvrier (reporté par le chef). Points à trancher : liste blanche d'hôtes des endpoints (SSRF côté t44), endpoint unique sur toute la table, `threshold_reached_at` dès t43.
- 2026-11-13 — plan validé par le développeur avec la liste blanche ; ouvrier relancé en EXECUTION MODE.
- 2026-11-13 — implémenté sur `ticket/t43-abonnement-seuil` (commit 03b8294, sur dev 48454e9). Migration `20261113090000_push_notifications` (`push_subscriptions`, `notification_settings` avec `threshold_reached_at` pour t44), service `notifications`, schémas avec liste blanche, page `/settings` (commands `subscribe` / `unsubscribe`, remote form du seuil), liens « Réglages » dans `AppShell` et `AccountMenu`. Choix notables :
  - la liste blanche est exposée par le domaine (`PUSH_SERVICE_HOSTS`, `isPushServiceUrl`) ;
  - `web-push` n'est pas ajouté (t44) ;
  - le worktree d'origine a été nettoyé automatiquement avant l'exécution : il a été recréé dans `.claude/worktrees/t43-abonnement-seuil` sur la même branche.
  - Tests : `bun run check && bun run lint && bun run test && bun run api:check` → OK (45 fichiers, 380 tests, contrat à jour), après rebase (aucun conflit, dev n'avait pas bougé).
  - Après l'intégration : Jonas lance `bun run db:migrate` pour la base de dev. Pour activer la fonction, il faut ajouter `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` et `VAPID_SUBJECT` (`bunx web-push generate-vapid-keys`) dans `apps/web/.env` et dans Dokploy.
- 2026-11-13 — relecture du développeur : « lgtm », 6 points validés. Intégré sur `dev` par avance rapide (1 commit, `03b8294`), sans conflit. Worktree et branche supprimés. À faire par le développeur : `bun run db:migrate`, clés VAPID.
