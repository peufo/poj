---
id: t42
title: L'app web s'installe en PWA et affiche les notifications push
status: done
priority: normal
story: doc/story/notifications-revision.md
depends_on: []
plan_required: false
lane:
review:
model: opus
effort: défaut
zones: [apps/web/static, apps/web/src/app.html, apps/web/src/service-worker.ts]
branch: ticket/t42-pwa-installable
agent: a093ecd8f91acc2ca
paused:
created: 2026-11-13
updated: 2026-11-13
---

## Context
Première brique de la story `doc/story/notifications-revision.md` (Web Push via la PWA, décision du 2026-11-13). Aujourd'hui, rien n'existe : pas de manifest, pas de service worker. `apps/web/static/` ne contient que `apple-touch-icon.png` et `robots.txt`, et `apps/web/src/app.html` n'a que `theme-color` et `apple-touch-icon`. Sur iPhone, Web Push exige que la PWA soit installée depuis l'écran d'accueil.

Ce ticket ne fait ni abonnement ni envoi (voir `t43-abonnement-seuil`, `t44-envoi-notifications`). Il prépare seulement le terrain : l'app s'installe, et le service worker sait afficher une notification reçue et ouvrir la révision au clic.

## Done criteria
- [x] Un manifest web (nom, icônes 192 et 512 dont une maskable, `display: standalone`, couleurs cohérentes avec `theme-color`) est servi et lié depuis `apps/web/src/app.html` ; l'app est installable (critère « installable » de Lighthouse ou du panneau Application de DevTools).
- [x] Un service worker (`apps/web/src/service-worker.ts`) est enregistré ; sur un événement `push`, il affiche une notification avec le titre et le texte reçus, et sur `notificationclick` il ouvre (ou met au premier plan) la page de révision.
- [x] Un push de test envoyé depuis DevTools affiche la notification, et un clic ouvre la révision.
- [x] Le service worker ne met en cache ni les pages connectées ni l'API : le fonctionnement hors ligne n'est pas un objectif.
- [x] Les tests passent.

## Plan

## Questions

## Review
/simplify : 3 corrections appliquées (lecture du push réduite à une seule branche de repli ; au clic, l'URL n'est plus vérifiée deux fois et le chemin `/review` reste dans le service worker ; le commentaire de `tokens.css` cite le manifest comme copie de canvas).
- [x] apps/web/src/service-worker/index.ts:32 · 6/10 · Clic sur la notification non testé de bout en bout (Chrome exige un vrai clic pour `focus`/`openWindow`). Une fenêtre déjà sur /review passe au premier plan ; une autre page de l'app ouverte est amenée sur /review (saisie en cours perdue) ; sinon nouvelle fenêtre. À essayer à la main (DevTools > Application > Push, puis clic), idéalement sur iPhone avec la PWA installée.
- [x] apps/web/static/manifest.webmanifest:7 · 7/10 · Identité à valider : `start_url: "/"` (redirige vers /cards ou /login) ; couleurs du canvas clair (#fbfaf7) pour l'écran de lancement et la barre ; icône maskable = logo de t38 (avec le point) à 85 % sur fond teal plein.
- [x] apps/web/src/service-worker/index.ts:22 · 7/10 · `tag: 'review'` : une nouvelle notification remplace la précédente au lieu de s'empiler (suit « une notification par franchissement »). Contrat du payload pour t44 : JSON `{ title, body }` (`PushMessage`, `apps/web/src/lib/push.ts`).
- [x] apps/web/package.json:13 · 8/10 · /simplify non corrigé : `check:watch` ne couvre pas le service worker, seul `check` lance `tsc -p src/service-worker` ; un watch demanderait deux processus.

## Log
- 2026-11-13 — créé au découpage de la story notifications-revision.
- 2026-11-13 — lancé en EXECUTION MODE (opus, effort par défaut ; icônes et manifest à concevoir, donc pas sonnet).
- 2026-11-13 — (reporté par le chef : écriture du ticket refusée à l'ouvrier depuis son worktree.) Fait : `apps/web/static/manifest.webmanifest`, icônes 192, 512 et maskable 512 rendues par Chromium depuis `poj-app-icon.svg` (t38), logo de la maskable recadré dans la zone sûre ; manifest lié depuis `app.html`. Service worker `apps/web/src/service-worker/index.ts` : push → notification, clic → /review, ni `fetch` ni cache. Lecture du payload dans `apps/web/src/lib/push.ts`, avec sa spec. Commit `8ae69d4`.
  - Choix : dossier `src/service-worker/` (prescrit par SvelteKit 3) au lieu de `service-worker.ts`, avec son propre `tsconfig.json` (étend `$app/tsconfig/service-worker`, lib WebWorker), exclu du tsconfig racine ; `check` lance en plus `tsc -p src/service-worker`, et CLAUDE.md le dit. Un push non JSON (test de DevTools) devient le corps de la notification, sous le titre « Poj ».
  - Vérifié sur le build de prod (preview 4183, Chromium + CDP) : manifest en `application/manifest+json`, aucune erreur d'installabilité, SW actif ; `ServiceWorker.deliverPushMessage` affiche la notification (JSON et texte). Clic non simulable.
  - Commande de tests verte (359 tests). Déjà à jour sur dev, sans conflit. Rien à faire après intégration.
- 2026-11-13 — pas d'intégration directe : `confidence_threshold` absent, 4 points à relire. Reste `in-review`.
- 2026-11-13 — `dev` a avancé (t40 intégré) : ouvrier relancé en INTEGRATION MODE pour rebaser avant la relecture.
- 2026-11-13 — rebasé sur dev (t40 intégré : 2a331fa, 5e74ccc), sans conflit ; commande de tests verte (365 tests). Commit `9f50108`, à poser par avance rapide. Rien à faire après l'intégration.
- 2026-11-13 — relecture du développeur : « tout bon », 4 points validés d'un bloc. Critères de fin cochés (clic sur notification : laissé à l'essai manuel du développeur).
- 2026-11-13 — intégré sur `dev` par avance rapide (1 commit, `9f50108`), sans conflit. Worktree et branche supprimés.
