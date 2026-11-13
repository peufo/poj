---
id: t44
title: Une notification part quand les cartes prêtes franchissent le seuil
status: done
priority: normal
story: doc/story/notifications-revision.md
depends_on: [t43]
plan_required: true
lane:
review:
model: opus
effort: défaut
zones: [apps/web/src/lib/server/domain/notifications, apps/web/src/hooks.server.ts, apps/web/prisma, doc/deploiement.md]
branch: ticket/t44-envoi-notifications
agent: a676afbb70cb2a190
paused:
created: 2026-11-13
updated: 2026-11-13
---

## Context
Troisième brique de la story `doc/story/notifications-revision.md`. Décisions : une seule notification par franchissement du seuil, plus rien tant que les cartes prêtes restent au-dessus ; la suivante attend qu'elles repassent sous le seuil puis le refranchissent. Pas de plage de silence (mode Concentration du téléphone).

Rien ne tourne aujourd'hui sans requête : `npm start` lance un seul process adapter-node, `compose.yaml` n'a pas de service cron. Le plan tranche entre une tâche dans le process (démarrée au boot, garde anti-doublon, nombre de réplicas Dokploy à vérifier) et un cron externe Dokploy qui appelle une route protégée. Le compte des prêtes vient de `countDue(ownerId, now, scope)` (`apps/web/src/lib/server/domain/reviews/reviews.service.ts`), rapide depuis t39, à appeler pour chaque abonné.

Plan requis. Si le plan touche le Dockerfile, `compose.yaml`, la CI ou une migration, poser `review: required`.

## Done criteria
- [ ] Pour chaque compte abonné, une notification « une révision t'attend » (avec le nombre de cartes prêtes) part quand les prêtes passent de sous le seuil à au moins le seuil, et une seule fois tant qu'elles restent au-dessus.
- [ ] Après être repassées sous le seuil (révision), un nouveau franchissement déclenche une nouvelle notification.
- [ ] Un abonnement que le service push déclare expiré (404 ou 410) est supprimé.
- [ ] Tests du domaine avec une horloge injectée : franchissement, maintien au-dessus, retour sous le seuil puis refranchissement, abonnement expiré.
- [ ] `doc/deploiement.md` dit comment l'envoi tourne en production (clés VAPID comprises).
- [ ] Les tests passent.

## Plan
(rédigé par l'ouvrier ; reporté par le chef, l'écriture du ticket lui ayant été refusée depuis son worktree)

**Planificateur : tâche dans le process (recommandé, 7/10).** Boucle lancée par le hook `init` de `hooks.server.ts` (adapter-node l'appelle au démarrage, avant la première requête ; vérifié pour kit 3.1.0). Rien à configurer hors du dépôt, ni secret ni route ; même comportement en dev, stack locale et prod. Doublons empêchés par la base : seul le process qui pose `threshold_reached_at` (`updateMany … where thresholdReachedAt: null`) envoie, même avec plusieurs réplicas, un redéploiement qui se chevauche ou plusieurs serveurs de dev. Option cron Dokploy écartée : route protégée et secret de plus (`.env.example`, CI, Dokploy), configuration non versionnée, rien en dev. À vérifier par le développeur : 1 réplica dans Dokploy (simple économie, la garde suffit).

1. **Dépendance :** `web-push` en `dependencies`, `@types/web-push` en devDependencies, `bun.lock` régénéré.
2. **Port du domaine :** `domain/notifications/push-sender.ts`, `interface PushSender { send(subscription, message): Promise<'sent' | 'expired' | 'failed'> }` (modèle `Translator`), exporté par `domain/index.ts`.
3. **Service :** `domain/notifications/reminders.service.ts`, `createReviewRemindersService(db, sender)`, `run(now)` → `{ notified, reset, expired }`. Comptes ayant au moins un abonnement actif ; `countDue(ownerId, now)` sans scope comparé au seuil (ou `DEFAULT_READY_THRESHOLD` sans ligne). Sous le seuil : `threshold_reached_at` à null. Seuil atteint et colonne nulle : réclamation par `updateMany` conditionnel ou création de la ligne (P2002 = déjà réclamé ailleurs), puis envoi à chaque appareil actif dont l'endpoint passe `isPushServiceUrl`. `expired` → abonnement supprimé (`deletedAt`). Aucun envoi réussi et au moins un `failed` → réclamation annulée, nouvel essai au tour suivant. Erreur d'un compte journalisée (`console.error`) sans bloquer les autres.
4. **Message :** `{ title: 'Une révision t'attend', body: '7 cartes prêtes' }` (singulier pour une carte) ; tag `review` déjà posé par le service worker.
5. **Adaptateur :** `lib/server/push/web-push.ts`, `createWebPushSender(vapid, fetchFn = fetch)` : `webpush.generateRequestDetails` (aes128gcm, VAPID, `TTL` 12 h, `Urgency: normal`, `Topic: review`), envoi par `fetchFn` avec `redirect: 'error'` (SSRF) et timeout 10 s ; 2xx → `sent`, 404/410 → `expired`, le reste → `failed`. `lib/server/push/index.ts` expose `pushSender: PushSender | null`.
6. **Planificateur :** `lib/server/push/scheduler.ts`, `startReviewReminders()` : rien sans `vapid` ; un tour tout de suite puis toutes les 5 min, chaque `setTimeout` part à la fin du tour précédent (pas de chevauchement), `unref()`, erreurs journalisées ; singleton sur `globalThis` contre les rechargements de dev. `hooks.server.ts` : `export const init: ServerInit = () => { if (!building) startReviewReminders(); }`.
7. **Tests :** `reminders.service.spec.ts` (horloge injectée, faux `PushSender`) : franchissement (un envoi par appareil, nombre dans le corps) ; maintien au-dessus (aucun second envoi) ; retour sous le seuil par `reviews.answer` puis refranchissement ; abonnement expiré supprimé, l'autre appareil reçoit ; échec total → nouvel essai ; compte sans réglage (défaut, ligne créée) ; compte sans abonnement ignoré ; endpoint hors liste jamais appelé ; deux `run` simultanés → un seul envoi. `web-push.spec.ts` : requête et statuts, clés de test par `crypto.createECDH`.
8. **Doc** (`doc/deploiement.md`) : variables VAPID à l'étape 3 de Dokploy (clés à ne plus changer) ; section « Notifications de révision » (boucle 5 min, garde, 1 réplica conseillé, journaux) ; vérification après déploiement (s'abonner sur `/settings`, seuil à 1, attendre ≤ 5 min).
9. **Vérification :** commande de tests complète ; contrat inchangé, aucune route, aucune migration.

**Risques :**
- État lu toutes les 5 min : passer sous le seuil puis le repasser entre deux tours ne renotifie pas ; notification au plus 5 min après le franchissement.
- Dev : avec des clés VAPID dans `apps/web/.env`, `bun run dev` envoie de vraies notifications aux appareils abonnés sur la base de dev (pas de doublons entre worktrees).
- Compte sans appareil actif : non évalué, `threshold_reached_at` figé jusqu'au prochain abonnement.
- Texte de la notification : choix visible, à valider.
- Hors `zones` : `lib/server/push/`, `package.json`, `bun.lock`. Ni Dockerfile, ni `compose.yaml`, ni CI, ni migration : pas de `review: required`.

## Questions
- 2026-11-13 — Planificateur dans le process ou cron Dokploy ? → **dans le process** (hook `init`, garde sur `threshold_reached_at`) ; plan validé tel quel (développeur).

## Review
/simplify : 4 corrections appliquées (texte du rappel par `plural` de format/labels ; abonnement expiré retiré par `notifications.unsubscribe` au lieu d'un `updateMany` en ligne ; helper `send` partagé dans web-push.spec ; résultat `quiet` partagé dans reminders.spec).
- [ ] apps/web/src/lib/server/domain/notifications/reminders.service.ts:22 · 7/10 · Texte visible à valider : titre « Une révision t'attend », corps « N cartes prêtes » (« 1 carte prête »).
- [ ] apps/web/src/lib/server/domain/notifications/reminders.service.ts:113 · 7/10 · Écart léger au plan : un franchissement est relâché pour le tour suivant dès qu'aucun appareil n'a été atteint, pas seulement après un `failed`. Un compte dont tous les appareils ont expiré est notifié dès qu'il se réabonne, au lieu de rester bloqué jusqu'à repasser sous le seuil.
- [ ] apps/web/src/lib/server/domain/notifications/reminders.service.ts:38 · 8/10 · Compte sans ligne de réglage : `claim` crée la ligne avec `readyThreshold = DEFAULT_READY_THRESHOLD` (5) au premier franchissement ; ce compte garde 5 même si le défaut change plus tard.
- [ ] apps/web/src/lib/server/domain/notifications/reminders.service.ts:59 · 7/10 · /simplify non corrigé : la liste blanche est vérifiée par le domaine, pas par l'envoyeur ; un abonnement hors liste n'est jamais supprimé, et un compte qui n'a que de tels appareils réclame et relâche à chaque tour (2 écritures toutes les 5 min, aucun envoi). Impossible à créer par le schéma du formulaire.
- [ ] apps/web/src/lib/server/domain/notifications/reminders.service.ts:38 · 8/10 · /simplify non corrigé : le seuil par défaut est résolu à deux endroits (`notifications.threshold()` et le service de rappels) ; unifier toucherait le service de notifications, hors ticket.
- [ ] apps/web/src/lib/server/push/scheduler.ts:9 · 8/10 · /simplify non corrigé : en dev, la garde sur `globalThis` garde la première boucle (ancien code) après un rechargement des hooks ; relancer `bun run dev` pour qu'un changement de reminders.service prenne effet.
- [ ] apps/web/src/lib/server/push/web-push.spec.ts:19 · 9/10 · /simplify non corrigé : `fakeFetch` recopié de deepl.spec.ts ; fixtures `phone`/`laptop` partagées avec notifications.service.spec ; factoriser toucherait des fichiers hors diff.

## Log
- 2026-11-13 — créé au découpage de la story notifications-revision.
- 2026-11-13 — `t43-abonnement-seuil` intégré : lancé en PLAN MODE (opus, high).
- 2026-11-13 — plan rédigé par l'ouvrier (reporté par le chef) : tâche dans le process recommandée (7/10) plutôt qu'un cron Dokploy ; aucune migration.
- 2026-11-13 — plan validé. Worktree du plan disparu (rien de codé) : nouvel ouvrier lancé en EXECUTION MODE sur un worktree neuf (opus, effort par défaut).
- 2026-11-13 — (reporté par le chef : écriture du ticket refusée à l'ouvrier depuis son worktree.) Plan implémenté tel que validé : port `PushSender` ; `createReviewRemindersService(db, sender).run(now)` avec réclamation atomique (`updateMany … thresholdReachedAt: null`, ou `createMany skipDuplicates` sans ligne de réglage) ; adaptateur `createWebPushSender` (aes128gcm, VAPID, TTL 12 h, Topic review, `redirect: 'error'`, timeout 10 s) ; planificateur lancé par le hook `init` (un tour tout de suite, puis toutes les 5 min après la fin du précédent, `unref`, singleton) ; `doc/deploiement.md` (section « Notifications de révision », variables VAPID à l'étape 3, vérification après déploiement). Commit `131e540`.
  - Choix : `web-push` tenu à `^3.6.7` (`@types/web-push ^3.6.4`) : la 4.0.0 (ESM) a une semaine et ses types ne la couvrent pas. Franchissement relâché dès qu'aucun appareil n'est atteint.
  - Commande de tests verte (47 fichiers, 398 tests, contrat à jour) ; dev n'avait pas bougé. Ni migration, ni route, contrat inchangé. Après intégration : `bun install` (nouvelle dépendance `web-push`).
- 2026-11-13 — non intégré : arrêt de session demandé, et relecture requise (points sous seuil). Reste `in-review`.
- 2026-11-13 — rebasé sur dev (6cbc7a6, t46 intégré), sans conflit ni fichier commun ; commande de tests verte (47 fichiers, 408 tests, contrat à jour). Commit `44d9b39`.
- 2026-11-13 — intégré sans relecture à la demande explicite du développeur. Avance rapide sur `dev`. Worktree et branche supprimés. Après intégration : `bun install` (dépendance `web-push`).
