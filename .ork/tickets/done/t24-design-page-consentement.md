---
id: t24
title: Retravailler le design de la page de consentement OAuth
status: done
priority: normal
story: doc/story/connexion-assistants.md
plan_required: false
review: required
model: opus
effort: high
zones: [apps/web/src/routes/oauth, apps/web/src/routes/(auth), apps/web/src/lib/components]
branch: ticket/t24-design-consentement-oauth
agent: a9c5e01a08d8eead6
depends_on: [t22]
created: 2026-10-30
updated: 2026-11-06
---

## Context
Remarque du développeur sur la page `/oauth/consent` (capture `.ork/tickets/captures/t24-page-consentement.png`) : « il y a aussi un petit travail de design sur la page ».

Constaté sur la capture : le bouton « Autoriser » s'affiche comme du texte nu, sans le style de bouton principal, alors que « Refuser » a une bordure. L'ensemble (titre, liste des permissions, mention de la redirection) n'est pas aligné sur le design system (`apps/web/DESIGN.md`) ; l'analyse de t17 notait déjà une erreur affichée en `<p>` brut sur cette page.

État au 2026-11-05 (scout) : depuis t22, les boutons (`SubmitButton`) et l'erreur (`FormIssues`) sont au niveau de `/login` ; la capture est antérieure. Restent : page hors du layout `(auth)` (`+page.svelte:13`, `<main class="mx-auto mt-16 max-w-sm px-4">` : ni Wordmark, ni centrage, ni `gap-8`) ; h1 `mb-6 text-2xl font-semibold` au lieu du bloc titre de `/login:11` ; `<p>` et `<ul class="list-disc pl-6">` bruts (`:15-20`) ; `text-gray-600` (`:21`) inexistant (palette Tailwind désactivée) ; `gap-4` au lieu de `gap-5` (`:24`) ; pas de `<title>` ; aucun composant `lib/ui`. La page est hors du groupe `(auth)` parce qu'elle exige une session (`+page.server.ts:9-10`) : réutiliser le layout demande une coquille partagée ou un déplacement en vérifiant `(auth)/+layout.server.ts`.

Ancienne cause du bouton nu (scout, 2026-10-30) : `routes/oauth/consent/+page.svelte` utilise `bg-blue-600 text-white hover:bg-blue-700`, classes absentes du design system ; utiliser le composant `lib/ui/Button.svelte` (`bg-accent text-on-accent`). Antérieur à t12 (46ebde7).

## Done criteria
- [ ] « Autoriser » reste le bouton principal, « Refuser » le secondaire (déjà fait par t22, à ne pas régresser).
- [ ] La page a la même coquille que `/login` : Wordmark, colonne `max-w-sm` centrée verticalement, rythme `gap-8` (layout `(auth)` réutilisé ou coquille partagée extraite), et le même bloc titre (`text-2xl font-bold tracking-tight`) avec un `<title>` (« … · Poj »).
- [ ] Aucune classe hors tokens du design system sur la page (`gray-*`, `blue-*`…) ; textes secondaires en `text-ink-2` / `text-ink-3` ; permissions et mention de redirection lisibles (hôte mis en évidence), avec `Notice` si pertinent.
- [ ] Le flux OAuth fonctionne comme avant (avec JavaScript) : l'e2e `oauth.e2e.ts` passe ; une page connectée seulement reste inaccessible sans session.
- [ ] Les tests passent.

## Plan
Rendu le 2026-11-05 (opus, high). Branche `ticket/t24-design-consentement-oauth` (renommée à l'exécution).
1. Préparation du worktree (reset sur dev, renommage, `bun install`, `worktree:setup`, `db:generate`).
2. Coquille partagée `lib/components/AuthShell.svelte` (`<main class="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-4 py-12">`, `Wordmark size=28`, enfants) ; `(auth)/+layout.svelte` l'utilise, rendu inchangé.
3. `routes/oauth/+layout.svelte` enveloppe dans `AuthShell` ; la page reste hors de `(auth)` (load serveur et redirection vers `/login` sans session inchangés).
4. `oauth/consent/+page.svelte` sans `<main>` : `<title>Autorisation · Poj</title>`, bloc titre de `/login` (`flex flex-col gap-1.5`, h1 `text-2xl font-bold tracking-tight`, même libellé pour la regex e2e), paragraphe `text-ink-2`.
5. Permissions : `<ul>` sans puces sur un panneau `bg-surface rounded-xl`, chaque ligne avec `Icon check` (`text-accent-text`) et texte `text-ink`.
6. Redirection : `<Notice icon="info">` « Vous serez ensuite redirigé vers <hôte en `font-medium text-ink`>. » ; plus de `text-gray-600` ni de `mb-*` ; formulaire en `gap-5` ; boutons inchangés.
7. E2E `oauth.e2e.ts` : avant `submitSignIn`, ouvrir `/oauth/consent?<requête signée>` et vérifier la redirection vers `/login`.
8. Vérification : grep `gray-|blue-|slate-` dans `oauth/`, test_command, e2e `oauth.e2e.ts` (après `lsof`), capture claire/sombre dans le bac à sable du worktree.

**Décisions de l'ouvrier :** coquille partagée plutôt qu'un déplacement dans `(auth)` (son `+layout.server.ts` redirige les connectés sans `sig` vers /cards au lieu du 400 actuel) ; « vous » gardé sur cette page (et dans `SCOPE_LABELS` de `oauth-flow.ts`) alors que `/login` tutoie : hors ticket.

**Risques :** `Notice` info a `role="status"` (région live), inoffensif sur du statique (alternative : paragraphe stylé) ; `client.uri` chargé mais non affiché (laissé) ; l'e2e demande un build preview (plusieurs minutes).

**À relire en premier (à l'exécution) :**
- `apps/web/src/routes/oauth/consent/+page.svelte` · 7/10 · panneau des permissions avec coches, hôte dans un `Notice` info : choix de design.
- `apps/web/src/routes/oauth/consent/+page.svelte` · 6/10 · « vous » ici, « tu » sur /login : passer au « tu » (toucherait `SCOPE_LABELS` dans `lib/server/oauth-flow.ts`) ?

## Questions

## Review
DONE le 2026-11-06. 7 fichiers · +58 −27 · 1 commit. Worktree `.claude/worktrees/t24-consentement` (recréé par l'ouvrier, l'ancien avait disparu pendant la pause).
- Décision : `AuthShell` partagé par `(auth)/+layout.svelte`, la page de consentement et `+error.svelte` ; pas de `oauth/+layout.svelte` (doublon).
- Décision : l'e2e garde `open()` (attente de l'hydratation), suggestion `page.goto` de /simplify écartée.
- AUTO REVIEW /simplify : 3 corrections (`+error.svelte` sur `AuthShell`, layout oauth supprimé, « vos cartes » dans `doc/specs/mcp.md:21`) ; écartés : groupe `(shell)`, `page.goto`. remaining : none.
- Tests : test_command OK (310), e2e `oauth.e2e.ts` OK (preview 4193).

- [x] `apps/web/src/routes/oauth/consent/+page.svelte:26` · 7/10 · design des permissions (panneau avec coches) et hôte dans un `Notice` info (l. 35) : choix de design non tranché par le ticket.
- [x] `apps/web/src/lib/server/oauth-flow.ts:37` · 8/10 · `SCOPE_LABELS` au « tu » (« sans te redemander ton accord »), affichés seulement sur la page de consentement. (évident : demandé par le développeur)

## Log
- 2026-10-30 — créé depuis une capture d'écran. Passe après t22 (qui migre cette page en remote form).
- 2026-11-01 — t22 passe la page de consentement aux composants du design system : il restera moins à faire ici.
- 2026-11-05 — scout : reste la coquille de page et la typographie. Ready ; plan requis (route OAuth, coquille / layout `(auth)` liés à la session) et relecture requise (OAuth). Lancé en PLAN MODE (opus, high).
- 2026-11-05 — PLAN READY, attend la validation (tutoiement ?).
- 2026-11-05 — plan validé avec correction : tutoiement sur la page et dans SCOPE_LABELS (oauth-flow.ts). Même ouvrier en EXECUTION MODE (opus, high), AUTO REVIEW /simplify.
- 2026-11-06 — ouvrier coupé par la limite d'usage (5 h), repris après le reset (même ouvrier).
- 2026-11-06 — DONE (opus, high). Relecture requise (OAuth) : in-review, 1 point à relire.
- 2026-11-06 — relecture validée par le développeur. Intégré dans dev par avance rapide (147016c, 1 commit, sans conflit, dev n'avait pas bougé).
- 2026-11-06 — worktree et branche supprimés, worktree:prune lancé.
