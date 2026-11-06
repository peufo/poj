---
id: t26
title: Durcir la configuration de typage (noUncheckedIndexedAccess, pas d'assertion non-null)
status: done
priority: low
story:
plan_required: true
review:
model: opus
effort: high
zones: [apps/web/tsconfig.json, apps/web/eslint.config.js, apps/web/src/lib/server/domain, apps/web/src/routes, apps/web/src/lib, apps/web/scripts]
branch: ticket/t26-durcir-typage
agent: a9154eba716bd8051
depends_on: [t17, t25]
created: 2026-10-31
updated: 2026-11-06
---

## Context
Suite de l'analyse du typage (ork:scout, 2026-10-31). Le `tsconfig` n'a que `strict: true`.
- **`noUncheckedIndexedAccess`** : mesuré avec `tsc --noEmit --noUncheckedIndexedAccess`, 86 erreurs, dont ~48 hors specs et testing. Concentration : `domain/reviews/review-day.ts` (13), `availability.ts` (4), `daily-goal.service.ts` (4), `routes/` (14).
- **ESLint `@typescript-eslint/no-non-null-assertion`** : ~4 erreurs en prod, ~3 en specs.
- `no-explicit-any` est déjà actif (via `ts.configs.recommended`), coût nul.
- Hors périmètre, à mesurer plus tard : `strictTypeChecked` (règles `no-unsafe-*`).

Les corrections doivent être de vraies gardes (ou une erreur explicite), pas des `!` ou des casts qui déplacent le problème. Le plan dira comment traiter les specs (même règle, ou exception documentée).

## Done criteria
- [ ] `noUncheckedIndexedAccess: true` dans le `tsconfig` de `apps/web`.
- [ ] `@typescript-eslint/no-non-null-assertion` en erreur.
- [ ] `bun run check` et `bun run lint` passent, sans `!` ni cast ajouté pour contourner.
- [ ] CLAUDE.md mentionne ces réglages.
- [ ] Les tests passent.

## Plan
Rendu le 2026-11-06 (opus, high). Branche `ticket/t26-durcir-typage`.
Mesures (svelte-check, .svelte compris) : `noUncheckedIndexedAccess` = 138 erreurs (55 prod, 6 testing/scripts, 77 specs) ; `no-non-null-assertion` = 41 (1 prod `cards.service.ts:249`, 6 testing/e2e, 34 specs). `review-day.ts` + `daily-goal.service.ts` (voués à disparaître, t33) : 44 des 138 (21 prod, 23 specs), aucun `!`.
1. Helper `at(items, i)` dans `domain/arrays.ts` (+ spec) : élément ou `RangeError`, seulement pour les tableaux alignés par construction (review-day, daily-goal, DeepL) ; ailleurs, restructurer.
2. Domaine : availability (`[first, second]` + garde), resolveDeck / deck MCP (déstructuration gardée), cards.service (`byTime.get()!` → erreur explicite, `counts[day]` gardés), translation (`suggestAll` complète un résultat DeepL court par `unavailable`, `cards.entries()`), labels.dayNumber (`Date.parse`), review-day (un objet par jour), daily-goal (`all.at(-1)` + erreur si vide).
3. `mcp/server.ts` (check_cards, create_cards) : items `{ i, card, entry }` construits une fois.
4. Web : csrf, schemas/decks (déstructuration), review/+page.svelte (table touche → note), AppShell, Horizon, cards/+page.svelte (`{#if}` / `?.`).
5. testing/ et scripts/ : gardes, erreurs explicites, `required()` local dans e2e/helpers.ts.
6. Specs : même règle, sans exception ESLint ; `assert` / `assert.exists` de vitest, déstructuration, `toMatchObject`.
7. Config : `noUncheckedIndexedAccess: true`, `no-non-null-assertion: 'error'`.
8. CLAUDE.md : sous-section « Typage ».
9. check, lint, diff sans `!` ni ` as ` ajoutés, test_command avant et après rebase. Commits : prod, puis specs + config + CLAUDE.md.

**Risques :** volume ≈ double de l'estimation (~180 sites, surtout specs) ; option moins chère pour les specs (exception ESLint) n'épargnerait que 34 `!` ; quatre petits changements d'exécution (DeepL court → `unavailable`, scripts/worktree.ts échoue si URL manquante, `Date.parse`, remaniement des handlers batch) ; review-day / daily-goal corrigés malgré leur suppression annoncée.

**À relire en premier (à l'exécution) :** `mcp/server.ts:650` · 6/10 · restructuration des handlers batch ; `translation.service.ts:60` · 7/10 · DeepL court → `unavailable`.

## Questions

## Review
DONE le 2026-11-06. 35 fichiers · +379 −183 · 2 commits (jusqu'à 976b9cb). Worktree `.claude/worktrees/agent-a9154eba716bd8051`. 350 tests verts, 0 erreur de types, lint OK, contrat à jour. Aucun `!` ni `as` ajouté.
- Décisions : `suggestAll` lit par `at(texts, i)` (écart au plan, voir point) ; `at` exporté par `domain/index.ts` ; `answer()` de review-day.spec asserte lui-même ; `required()` locaux dans oauth.spec et e2e/helpers.ts (Playwright sans `assert` vitest) ; Horizon dérive `{ day, index }`.
- AUTO REVIEW /simplify : 9 corrections.

- [x] REVIEW FIRST — `apps/web/src/lib/server/domain/translation/translation.service.ts:68` · 7/10 · écart au plan : réponse trop courte → toute la demande `unavailable` (log), au lieu d'un complément texte par texte ; inchangé avec le vrai DeepL (`deepl.ts:139` lève déjà).
- [x] REVIEW FIRST — `apps/web/src/lib/server/mcp/server.ts:668` · 8/10 · check_cards parcourt `checks`, relit `fresh` par `at`. (évident, couvert par server.spec)
- [x] REVIEW FIRST — `apps/web/src/lib/server/domain/cards/cards.service.ts:404` · 9/10 · horizon : borne testée d'abord, jour hors limites → erreur. (évident)
- [x] remaining — `apps/web/src/lib/server/testing/worktree.ts:111` · 7/10 · `rev-parse` incomplet → `null` (cas jugé impossible). (évident)
- [x] remaining — `apps/web/src/routes/(app)/cards/+page.svelte:36` · 7/10 · `dayLabel` garde un repli `''` (client sans `at`). (évident)
- [x] remaining — `apps/web/src/lib/server/domain/reviews/review-day.spec.ts:56` · 8/10 · assert dans le helper. (évident)
- [x] remaining — `apps/web/src/lib/server/domain/cards/daily-goal.service.ts:95` · 8/10 · `at(dates, ago)` disparaîtrait si `ReviewDay` portait sa date (hors périmètre). (évident)
- [x] remaining — `apps/web/e2e/helpers.ts:30` · 8/10 · deux `required()` locaux homonymes. (évident)

## Log
- 2026-10-31 — créé depuis l'analyse du typage. Plan requis (~50 sites). Part après t17 et t25.
- 2026-11-05 — le développeur : attendre, plan compris, jusqu'à l'intégration de t36 (zones recoupées avec t31 et t36). Ne pas lancer avant.
- 2026-11-06 — t36 intégré. Zones recoupant t38 (apps/web/src/lib) : attend l'intégration de t38.
- 2026-11-06 — t38 intégré : lancé en PLAN MODE (opus, high).
- 2026-11-06 — PLAN READY (~180 sites au lieu de ~93), attend la validation.
- 2026-11-06 — plan validé tel quel par le développeur. Même ouvrier en EXECUTION MODE (opus, high), AUTO REVIEW /simplify.
- 2026-11-06 — ouvrier BLOCKED : son worktree a été supprimé entre le plan et l'exécution (branche vide intacte). Nouvel ouvrier lancé sur la branche existante (opus, high), avec le plan validé.
- 2026-11-06 — ouvrier coupé par la limite d'usage (reset 5:30), repris le 2026-11-06 à 11:28 (même ouvrier, 24 fichiers en cours dans son worktree).
- 2026-11-06 — DONE. Passé par un plan : in-review, 1 point (écart au plan).
- 2026-11-06 — écart au plan accepté par le développeur (« intègre »). Intégré dans dev par avance rapide (976b9cb, 2 commits, sans conflit). Worktree et branche supprimés, worktree:prune lancé.
