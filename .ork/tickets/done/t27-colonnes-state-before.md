---
id: t27
title: Remplacer le JSON `state_before` des review_logs par des colonnes typées
status: done
priority: normal
story:
plan_required: true
review: required
model: opus
effort: high
zones: [apps/web/prisma, apps/web/src/lib/server/domain/reviews, apps/web/src/lib/server/testing]
branch: ticket/t27-review-logs-colonnes-typees-rebased
agent: a5febe5046f321cc4
depends_on: [t25]
created: 2026-10-31
updated: 2026-10-31
---

## Context
Discussion du 2026-10-31 pendant la relecture de t25. Les révisions ont leur table (`review_logs`, une ligne par réponse), mais la photo de l'état FSRS avant la réponse est une colonne JSON (`state_before`, `prisma/schema.prisma` ~l. 254) : échéance, stabilité, difficulté, révisions, oublis, état, etc. Elle sert à corriger une note (`amend`, retour à l'état d'avant), à `lastAnswer` et au calendrier (`review-day.ts`, qui ne lit que l'échéance). t25 la valide par un schéma Zod (`serializedStateSchema`, `scheduler.ts`).

**Décision du développeur : des colonnes typées à la place du JSON.**
- *Pour :* forme garantie par la base (plus de ligne malformée possible, plus de schéma Zod pour ce champ, types Prisma) ; requêtable (le calendrier peut ne lire que l'échéance en SQL au lieu de charger et valider tout le JSON de chaque log — point `remaining` de t25) ; cohérent avec `reviews`, qui stocke déjà ces champs en colonnes ; lisible en SQL.
- *Contre accepté :* couplage à ts-fsrs (un champ ajouté ou renommé demande une migration) ; colonnes en double avec `reviews` ; correspondance champ par champ en lecture et écriture (déjà faite pour `reviews`).
- *Coût du changement ignoré :* pas de vraies données en prod. La migration peut recréer la colonne sans conversion des données existantes ; le plan dira s'il convertit quand même les lignes de dev/sandbox ou s'il s'appuie sur un reset.

## Done criteria
- [ ] `review_logs` stocke l'état d'avant dans des colonnes typées (conventions du schéma : `@map` snake_case), plus de colonne JSON `state_before`.
- [ ] `serializedStateSchema` et le parsing JSON de l'état disparaissent ; lecture et écriture passent par une correspondance typée, partagée avec `reviews` si possible.
- [ ] Le calendrier (`review-day.ts`) ne charge que les champs nécessaires des logs.
- [ ] `amend`, `lastAnswer` et le calendrier se comportent comme avant (tests existants verts, cas ajoutés si utile).
- [ ] La seed du bac à sable et les fabriques de test suivent.
- [ ] Le contrat OpenAPI est inchangé (ou régénéré si l'état apparaît dans l'API).
- [ ] Les tests passent.

## Plan
Rendu le 2026-10-31 (opus, high). Branche `ticket/t27-review-logs-colonnes-typees`, aucun commit.
1. **`schema.prisma`, `ReviewLog`** : `stateBefore Json` remplacé par 9 colonnes aux **mêmes noms que `Review`** : `due DateTime`, `stability Float`, `difficulty Float`, `scheduledDays Int @map("scheduled_days")`, `learningSteps Int @map("learning_steps")`, `reps Int`, `lapses Int`, `state ReviewState`, `lastReview DateTime? @map("last_review")`. Toutes NOT NULL sauf `last_review`. Commentaire `///` : état FSRS **avant** la réponse (comme le `ReviewLog` de ts-fsrs).
2. **Nullabilité** : pas de cas à part pour le premier log (état d'avant = `emptyState`, `due` = création) ; seul `last_review` est nul.
3. **Migration écrite à la main** (`…_review_log_state_columns`, après `init`), avec **conversion des données** (pas de reset, pour la base de dev et la prod) : ADD COLUMN nullables → `UPDATE … SET due = (state_before->>'due')::timestamptz AT TIME ZONE 'UTC'`, `state = (state_before->>'state')::review_state`, etc. → SET NOT NULL → DROP `state_before`.
4. **`scheduler.ts`** : suppression de `serializedStateSchema`, `SerializedState`, `serializeState`, `parseState` et de l'import zod. Correspondance partagée : `FsrsState` / `pickState` (une ligne `ReviewLog` s'y conforme comme une `Review`).
5. **`reviews.service.ts`** : écriture `reviewLog.create({ data: { …, ...pickState(review) } })` ; `amend` → `applyRating(last, …)`, `lastAnswer` → `previewDue(log, log.reviewedAt)`, sans parsing.
6. **`review-day.ts` (`loadReviewTracks`)** : `select: { reviewedAt: true, due: true }`, `dueBefore: log.due` (index `(review_id, reviewed_at)` existant).
7. **Tests** : `scheduler.spec` (aller-retour JSON et états malformés retirés, aller-retour ts-fsrs gardé) ; `reviews.service.spec` (`pickState(log)` = état d'avant ; test « malformed stored state » de t25 retiré ; nouveau cas `amend` après deux réponses) ; `cards.service.spec:40` (`...pickState(review)`).
8. **Seed et fabriques** : rien à changer (la seed rejoue par `reviews.answer`/`amend`), vérifié par `seed.spec`.
9. **Vérifications** : `sandbox:reset` sur l'ancien schéma puis `migrate deploy` de la nouvelle migration → lignes converties égales à l'ancien JSON ; `prisma migrate diff` base migrée ↔ schéma vide ; `api:check` inchangé ; test_command.

**Décisions de l'ouvrier :**
- **Colonnes sans préfixe** (`due`, `state`…) pour partager `FsrsState`/`pickState` avec `reviews` sans correspondance de plus (convention de ts-fsrs). Prix : `review_logs.due` est ambigu en SQL (échéance d'avant), levé par le commentaire. Variante : `dueBefore @map("due_before")`… avec deux fonctions de correspondance et un renommage temporaire de `state_before` dans la migration.
- Conversion SQL des lignes existantes ; échoue bruyamment si une ligne JSON est incomplète.
- SQL écrit à la main + `migrate diff`, pas `migrate dev --create-only` (qui travaillerait sur la base de dev partagée).

**Risques :** une ligne incomplète bloquerait `migrate deploy` au démarrage de prod (faible) ; t26 : diff limité à `loadReviewTracks`, conflit trivial ; t21 : vérifier l'ordre des migrations s'il en ajoute une (il n'en ajoute pas).

**À relire en premier (à l'exécution) :**
- `apps/web/prisma/schema.prisma:244` : noms sans préfixe ou `_before`.
- La migration SQL (casts `timestamptz AT TIME ZONE 'UTC'` → `TIMESTAMP(3)`, `::review_state`), appliquée à la base de dev et à la prod.
- `reviews.service.spec.ts:236` : test « malformed stored state » supprimé.

**Pour le développeur :** après intégration, `bun run db:migrate` dans le checkout principal.

## Questions

- 2026-10-31 — Plan validé tel quel par le développeur (colonnes sans suffixe, commentaire `///` dans le schéma).

## Review
Rapport DONE du 2026-10-31. 279 tests (37 fichiers), contrat inchangé, branche posée sur 14a5541 (dev n'a pas bougé).
- 9 colonnes typées dans `review_logs`, avec les mêmes noms que `reviews`. Migration `20261031120000_review_log_state_columns` écrite à la main, qui convertit les lignes : sur 124 logs du bac à sable, le JSON reconstruit est identique à l'octet près. `migrate diff` ne montre aucun écart. `serializedStateSchema`, `serializeState` et `parseState` sont supprimés, les écritures passent par `...pickState(review)`, et le calendrier ne sélectionne que `{ reviewedAt, due }`. La seed et les fabriques sont inchangées.
- Revue auto /simplify : 1 correction appliquée (une assertion redondante).
- [x] remaining — `doc/story/decks.md:25` (et l'ancien `T-0003`, déjà supprimé sur dev) cite encore `ReviewLog.stateBefore` : c'est de la doc, hors du périmètre du ticket. → Développeur : à corriger dans la branche, pendant le rebase (INTEGRATION MODE).
- [x] REVIEW FIRST — `apps/web/prisma/schema.prisma:247` : colonnes sans préfixe. `log.due` est l'échéance d'avant la réponse (commentaire `///`).
- [x] REVIEW FIRST — `apps/web/prisma/migrations/20261031120000_review_log_state_columns/migration.sql:17` : casts `::timestamptz AT TIME ZONE 'UTC'` → `TIMESTAMP(3)` et `::"review_state"`. Ce SQL tournera sur la base de dev et en prod, et une ligne incomplète fait échouer `SET NOT NULL`.
- [x] REVIEW FIRST — `apps/web/src/lib/server/domain/reviews/reviews.service.spec.ts:238` : nouveau cas `amend` après deux réponses, au même endroit que le test « malformed stored state » supprimé.
- Pour le développeur : après l'intégration, `bun run db:migrate` dans le checkout principal.

Rapport DONE (INTEGRATION MODE) du 2026-10-31. Rebasé sur dev 3554819 sans conflit, 285 tests verts, contrat inchangé. Branche livrée : `ticket/t27-review-logs-colonnes-typees-rebased` (worktree agent-a5febe5046f321cc4 ; le harnais a refusé de travailler dans l'ancien worktree). Commit cb80c1a : story decks + plan jalon 1.
- [x] REVIEW FIRST — `doc/plans/jalon-1.md:81` · 7/10 · plan du jalon 1 (document ancien) mis à jour : bloc `model ReviewLog` et trois phrases. À annuler si on garde ce plan tel qu'écrit.
- [x] REVIEW FIRST — `doc/story/decks.md:25` · 8/10 · reformulation demandée, vérifier la tournure.

## Log
- 2026-10-31 — créé depuis la relecture de t25 (décision du développeur : colonnes). Plan et relecture requis (migration). Part après l'intégration de t25. Après intégration : `bun run db:migrate` dans le checkout principal, à faire par Jonas.
- 2026-10-31 — t25 intégré ; ouvrier lancé en PLAN MODE (opus, high).
- 2026-10-31 — le développeur demande une pause une fois les ouvriers en cours terminés : après ce plan, ne rien lancer d'autre sans son go.
- 2026-10-31 — PLAN READY, attend la validation (noms des colonnes). Pause en vigueur : rien d'autre ne tourne.
- 2026-10-31 — plan validé. Ne pas lancer avant le go du développeur (pause). À la reprise : même ouvrier (a5a2ae65e7aba15ae) en EXECUTION MODE, AUTO REVIEW /simplify.
- 2026-10-31 — pause levée par le développeur. Ancien ouvrier injoignable (nouvelle session), pas de worktree à supprimer : nouvel ouvrier en EXECUTION MODE (opus, high) sur la branche existante, AUTO REVIEW /simplify.
- 2026-10-31 — DONE, 279 tests verts, contrat inchangé. Statut in-review (relecture requise : migration). [delivered] prêt à relire.
- 2026-10-31 — relecture ouverte. Cochés sans présentation (No need to ask) : noms des colonnes (validés au plan), cas de test `amend`. dev a avancé de 4 commits : rebase à faire avant d'intégrer.
- 2026-10-31 — relecture : migration (casts, SET NOT NULL) validée par le développeur. Question sur le point doc (decks.md:25).
- 2026-10-31 — point doc : le développeur demande que l'ouvrier corrige la story dans la branche, au rebase. Règle ajoutée à l'agent ouvrier (ork/agents/worker.md) : mettre à jour la doc rendue fausse par le changement fait partie du ticket. Relecture terminée.
- 2026-10-31 — intégration demandée : ouvrier en INTEGRATION MODE (opus) dans le worktree existant, rebase sur dev + correction de doc/story/decks.md.
- 2026-10-31 — DONE en INTEGRATION MODE : rebase sans conflit, 285 tests verts, doc corrigée (decks.md, jalon-1.md). Branche livrée `-rebased` ; l'ancienne branche `ticket/t27-review-logs-colonnes-typees` (cf2d88e) et son worktree agent-af9c79703893b841f (propre au dernier contrôle) deviennent inutiles. Relecture des 2 points doc avant de poser.
- 2026-10-31 — relecture : mise à jour de jalon-1.md gardée par le développeur.
- 2026-10-31 — intégré dans dev par avance rapide (494b67c, cb80c1a), sans conflit. Reste à Jonas : `bun run db:migrate` dans le checkout principal.
