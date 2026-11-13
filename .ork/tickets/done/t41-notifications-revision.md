---
id: t41
title: Notifications paramétrables pour prévenir qu'une révision attend
status: done
priority: normal
story: doc/story/notifications-revision.md
depends_on: []
plan_required: true
lane:
review:
model:
effort:
zones: []
branch:
agent:
paused:
created: 2026-11-13
updated: 2026-11-13
---

## Context
Demande du développeur (2026-11-13, en tranchant `t40-chute-cartes-pretes`) : un système de notification paramétrable qui prévient qu'une révision attend. Exemple donné : silencieuse jusqu'à 5 cartes prêtes, puis une notification sonore pour dire qu'une révision attend.

Cela rouvre deux décisions consignées :
- `doc/story/ajout-quotidien.md` (2026-10-29) : « pas de notification », car la série fonctionnait sans rappel et l'app iOS ne devait pas être rouverte pour ça. La série a depuis été retirée au profit du tapis roulant (`doc/story/tapis-roulant.md`).
- `doc/decisions.md`, « App iOS gelée » (2026-10-24) : décision à rouvrir si un besoin comme les notifications de rappel apparaît.

Le canal reste à choisir : notifications web (PWA, Web Push), app iOS dégelée, ou un autre canal (e-mail, Claude).

Enquête de coût (2026-11-13) : rien n'existe pour le Web Push.
- PWA : aucun manifest ni service worker ; `apps/web/static/` n'a que `apple-touch-icon.png` et `robots.txt` (pas d'icônes 192/512).
- Planification : aucune tâche de fond ; `npm start` lance un seul process adapter-node ; `compose.yaml` n'a pas de service cron.
- Stockage : aucun abonnement push ni page de réglages ; le seul réglage par utilisateur est le modèle `NewCardsLimit` (`apps/web/prisma/schema.prisma`), à imiter.
- `web-push` et clés VAPID absents ; à déclarer dans `apps/web/src/env.ts` (optionnelles, comme DeepL).
- `countDue(ownerId, now, scope)` (`apps/web/src/lib/server/domain/reviews/reviews.service.ts:216`) : à appeler pour chaque abonné.
- Découpage suggéré : (1) PWA installable + service worker `push`/`notificationclick` ; (2) abonnement + réglages (migration, `web-push`, VAPID, page de réglages) ; (3) envoi planifié au franchissement du seuil, purge des abonnements 404/410.
- Plan requis : planificateur dans le process ou cron externe Dokploy appelant une route protégée ; anti-répétition, fuseau, heures calmes ; migration. Non vérifié : nombre de réplicas Dokploy, CSP. HTTPS requis ; iOS exige la PWA installée.

## Done criteria
(à préciser à l'idéation : canal, réglages, seuils)

## Plan

## Questions
- 2026-11-13 — Canal ? → **Web Push via la PWA**, app iOS toujours gelée (développeur). Consigné dans `doc/decisions.md`.
- 2026-11-13 — Combien de notifications ? → **une seule par franchissement du seuil**, plus rien avant que les prêtes repassent sous le seuil (développeur).
- 2026-11-13 — Plage de silence ? → **non** pour la première version, le mode Concentration du téléphone suffit (développeur).

## Review

## Log
- 2026-11-13 — créé depuis une remarque du développeur ; rouvre « pas de notification » et touche « App iOS gelée ».
- 2026-11-13 — idéation ouverte : story `doc/story/notifications-revision.md` ; enquête de coût lancée (PWA, planification serveur, stockage des abonnements).
- 2026-11-13 — story stable ; découpé avec accord du développeur en `t42-pwa-installable`, `t43-abonnement-seuil` (dépend de t42) et `t44-envoi-notifications` (dépend de t43). Clos.
