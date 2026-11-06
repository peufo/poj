---
id: t31
title: Outil MCP create_cards — ajouter un lot de cartes en un appel
status: done
priority: normal
story: doc/story/ajout-en-masse.md
depends_on: [t8]
plan_required: true
review:
model: opus
effort: high
zones: [apps/web/src/lib/server/mcp, apps/web/src/lib/server/domain/cards, apps/web/src/lib/server/domain/translation, apps/web/src/lib/server/domain/reviews, apps/web/src/lib/server/deepl, doc/specs/mcp.md]
branch: ticket/t31-create-cards
agent: a781f1250052062ce
created: 2026-11-01
updated: 2026-11-06
---

## Context
Story `doc/story/ajout-en-masse.md` (validée le 2026-11-01). L'assistant absorbe des sources variées (photo d'une page de cours, Wikipedia, fichier collé…) puis crée les cartes par des appels MCP propres.

Faits (enquête du 2026-11-01) : `create_card` crée une carte par appel (`createOnce`, rejeu dédupliqué 10 min sur le contenu, `cards.service.ts:22`, `118`, `mcp/server.ts:451-482`) ; `check_card` fait 2 appels DeepL par carte de langue ; la consigne impose `check_card` puis une confirmation explicite avant **chaque** `create_card` (`mcp/server.ts:119`, `133-144`) ; pas de limite de débit (t19 ne limite que la longueur, `limits.ts:5`). Sur t8 : `FACT_CHECK` (vérification des faits d'un deck de sujet par source récente, source dans le contexte) et `REAL_SITUATION` / `INSPIRATION_RULE` (« pas de carte générique »).

Décisions :
- un outil `create_cards`, plafonné (~50 cartes par appel), et **une seule confirmation** par lot ;
- la vérification se fait **en lot** : doublons (dans le lot et en base) et, pour une langue, divergences DeepL ; elle ne renvoie que les problèmes ;
- la confirmation porte sur un **résumé** (nombre, deck, doublons, divergences, quelques exemples), compatible avec la voix ;
- la règle « pas de carte générique » de t8 est révisée pour admettre un lot tiré d'une source (ex. 200 pays) ; elle reste valable quand l'utilisateur manque d'idées.

Point ouvert hérité de t8 (contre-lecture) : `get_hint` lit le contexte de la carte comme indice ; la source et sa date que la règle de vérification y ajoute pourraient révéler la réponse. À vérifier et, si c'est le cas, à corriger ici (les lots de sujet multiplient ces cartes).

Attention : la limite de nouvelles cartes (t29) protège la révision. t31 n'a pas besoin de son code, mais il vaut mieux intégrer t29 d'abord.

## Done criteria
- [ ] Un lot jusqu'au plafond se crée en un appel `create_cards` ; au-delà, l'outil refuse avec un message clair.
- [ ] Les doublons (dans le lot et en base) sont signalés et non créés ; pour un deck de langue, les divergences DeepL du lot sont renvoyées en une fois, sans appel d'outil par carte.
- [ ] Un lot rejoué (après une erreur ou une coupure) ne crée pas de doublon ; le comportement en cas d'erreur partielle est défini et testé.
- [ ] Consignes et descriptions : une seule confirmation sur un résumé ; la vérification des faits de t8 s'applique au lot ; la règle « pas de carte générique » admet un lot tiré d'une source.
- [ ] `get_hint` ne révèle pas la réponse à travers la source ajoutée au contexte (vérifié par un test).
- [ ] `doc/specs/mcp.md` à jour.
- [ ] Tests serveur ; les tests passent.

## Plan
Rendu le 2026-11-01 (opus, high). Branche `ticket/t31-create-cards`.
1. **Domaine cartes** (`limits.ts`, `cards.service.ts`) : `MAX_BATCH_CARDS = 50` ; classement commun (une lecture des cartes du deck, comparaison par `comparisonKey(duplicateSide)`) en `new` / `duplicate` (en base) / `duplicate_in_batch` / `existing` (trois champs identiques, créée dans `REPLAY_WINDOW_MS` = rejeu). `checkBatch(owner, deck, inputs)` et `createBatch(owner, deckId, inputs, origin, now)` en une transaction (`lockOwner`, `findOwnedDeck`, `createManyAndReturn` cartes, `createMany` révisions).
2. **Traduction** : `translation.checkMany(pair, inputs)` regroupe par (sens, contexte), paquets de 50 (DeepL accepte un tableau `text`). `Translator` passe à `{ texts[] } → string[]` (touche `deepl/deepl.ts` et 3 faux translators). `diverges(input, check)` pure. Échec DeepL = une seule `deepl_error` pour le lot.
3. **Indice** : `hintOf(context)` (domain/cards) retire les segments `Source(s) :` jusqu'à la fin de ligne, null s'il ne reste rien ; `reviews.service` l'utilise pour `hasHint` et `requestHint` (contexte filtré, pas de plafond de note si l'indice est vide). Hors zones mais nécessaire.
4. **MCP** (`server.ts`) : `check_cards` (lecture seule, `{deck?, cards[1..50]}` → bilan + problèmes seulement : `duplicates`, `divergences`, `deepl_error?`) et `create_cards` (idempotent, → `{deck, created, existing, skipped[{index, reason}], cards[{index, card_id, status}]}` ; > 50 refusé par Zod « 50 cartes au plus par appel : découpe le lot » ; erreur = « rien n'a été créé, rejoue le même appel »).
5. **Consignes** (`guidance.ts`) : `BATCH_RULE` (check_cards par 50, résumé vocal : nombre, deck, doublons, divergences, 2-3 exemples ; une seule confirmation pour tout le lot ; puis create_cards) ; deck de sujet : vérification des faits sur le lot, source et date sur une ligne « Source : … » du contexte ; `REAL_SITUATION` / `INSPIRATION_RULE` révisées (un lot tiré d'une source apportée ou choisie par l'utilisateur n'est pas générique ; l'interdiction reste quand il manque d'idées) ; reprises dans instructions et descriptions ; `FACT_CHECK` / `FACT_SOURCE` au format « Source : ».
6. **Tests** : `cards.service.spec` (classement, atomicité, rejeu) ; `translation.service.spec` (regroupement, divergences) ; `server.spec` (9 outils ; plafond 50 / refus 51 ; doublons ; divergences en un appel, requêtes DeepL comptées ; DeepL en échec ; rejeu ; erreur partielle via `\u0000` refusé par Postgres → rien créé, lot corrigé crée tout, rejeu ne crée rien ; deck de sujet ; consignes ; `get_hint` sur contexte « Source : … » seul et mixte).
7. **Docs** : `doc/specs/mcp.md` (check_cards, create_cards, get_hint, garanties serveur, consignes).
8. **Vérification** : test_command ; contrat OpenAPI non touché.

**Décisions de l'ouvrier :** outil de lecture `check_cards` séparé plutôt qu'un `dry_run` (la confirmation précède la création, annotation readOnly conservée) ; un lot = un deck ; atomicité tout ou rien, rejeu sûr à tout âge (`existing` < 10 min, `duplicate` au-delà) ; `index` 0-based ; outils gardés dans `server.ts` (~+150 lignes).

**Risques :** définition de la divergence (proposée : seulement si aucun des deux sens DeepL ne correspond, casse/espaces/ponctuation finale ignorées) ; une source hors format « Source : » fuit encore dans `get_hint`, cartes déjà créées non corrigées ; le web affiche toujours le contexte complet comme indice (`routes/(app)/review/+page.svelte:152`) → ticket de suivi ; `Translator` en tableaux sort des zones (repli : concurrence bornée à 5, ~100 requêtes pour 50 cartes) ; `create_card` à l'unité permet encore un doublon volontaire, `create_cards` jamais.

**À relire en premier (à l'exécution) :**
- `apps/web/src/lib/server/domain/translation/translation.service.ts` · 6/10 · définition d'une divergence.
- `apps/web/src/lib/server/domain/reviews/reviews.service.ts:209` · 6/10 · filtrage du segment « Source : » pour l'indice (alternatives : masquer les mots de la réponse ; colonne `source` avec migration).
- `apps/web/src/lib/server/domain/translation/translator.ts:18` · 7/10 · `Translator` en tableaux.

## Questions

## Review
Rapport DONE du 2026-11-05. Commit 2381691 sur dev 424638a, worktree `.claude/worktrees/t31-create-cards`. 333 tests verts, contrat inchangé, pas de migration.
- `check_cards` (lecture seule, ≤ 50) : ne renvoie que les problèmes (doublons deck/lot, cartes créées il y a < 10 min, divergences DeepL, une seule `deepl_error`). `create_cards` : tout ou rien en une transaction, doublons sautés, rejeu sans effet ; refus au-delà de 50.
- DeepL groupé : `Translator` prend un tableau `texts`, `deepl.ts` découpe par 50, `translation.checkAll` envoie une requête par sens et contexte.
- Consignes : une seule confirmation sur un résumé vocal ; vérification des faits sur chaque carte d'un lot de sujet ; « pas de carte générique » admet un lot tiré d'une source. `hintOf` retire « Source : … » de l'indice (`get_hint`, `has_hint`, pas de plafond si seule une source reste). `doc/specs/mcp.md` et `repetition.md` à jour.
- Décisions : `check_cards` outil séparé ; `position` 1-based (au lieu de l'index 0-based du plan) ; divergence = aucun sens DeepL ne correspond ; seules les cartes à créer partent chez DeepL ; tout ou rien (testé avec `\u0000`), rejeu sûr ; `createdAt` croissants (+1 ms) pour l'ordre de t29 ; `createBatch` en 2 requêtes ; `hintOf` appliqué dans `reviews.service` (hors zones, prévu au plan).
- Revue auto /simplify : ~10 corrections appliquées.
- [x] REVIEW FIRST — `apps/web/src/lib/server/domain/cards/hint.ts:6` · 6/10 · regex « Source : » jusqu'à la fin de ligne : une source écrite autrement fuit encore, un contexte « Ma source : Paul » est coupé. Colonne `source` plus propre (migration).
- [x] REVIEW FIRST — `apps/web/src/lib/server/domain/reviews/reviews.service.ts:248` · 6/10 · la révision web montre toujours le contexte brut (source comprise) comme indice → t32.
- [x] REVIEW FIRST — `apps/web/src/lib/server/domain/translation/translation.service.ts:44` · 7/10 · définition de la divergence (aucun sens ne correspond) : calme les idiomes, peut cacher une erreur vue dans un seul sens.
- [x] remaining — `apps/web/src/lib/server/domain/translation/translation.service.ts:84` · 7/10 · groupes DeepL en parallèle sans limite (jusqu'à 100 requêtes simultanées) ; un 429 = `deepl_error` pour tout le lot. Limiteur (~4) conseillé. → Développeur : à corriger (limite ~4). Corrigé (4c7e52f).
- [x] remaining — `apps/web/src/lib/server/mcp/server.ts:640` · 6/10 · sélection des cartes pour DeepL dans le handler MCP ; un service de capture du domaine servirait t30.
- [x] remaining — `apps/web/src/lib/server/domain/cards/cards.service.ts:217` · 6/10 · `classifyBatch` recode les règles de `createOnce` / `findDuplicates`.
- [x] remaining — `apps/web/src/lib/server/domain/cards/cards.service.ts:57` · 8/10 · les deux outils chargent toutes les cartes du deck (ok pour des decks personnels).

Correction du 2026-11-06 (commit 4c7e52f, 334 tests verts). Limite de 4 requêtes simultanées dans le client DeepL (`deepl.ts`), donc pour tout le processus (lots, carte seule, suggestions web, morceaux découpés) ; `checkAll` reste en `Promise.all`. Test : 20 requêtes, pic de 4. `doc/specs/mcp.md` à jour.
- [x] REVIEW FIRST — `apps/web/src/lib/server/deepl/deepl.ts:30` · 8/10 · file d'attente : une requête finie passe la main à la suivante, la place est libérée même en cas d'échec. (évident)
- [ ] remaining — `apps/web/src/lib/server/deepl/deepl.ts:93` · 7/10 · un 429 DeepL donne toujours `unavailable`, sans nouvelle tentative ; un essai après `Retry-After` absorberait les rafales entre instances.
- [x] remaining — `apps/web/src/lib/server/deepl/deepl.ts:27` · 7/10 · pire cas 50 cartes × 50 contextes = 100 requêtes, 4 à la fois : ~5 à 10 s pour `check_cards`. Prix assumé de la limite. (évident)

## Log
- 2026-11-01 — créé au découpage de la story ajout-en-masse (avec t29 et t30). Part après l'intégration de t8 ; idéalement après t29.
- 2026-11-01 — t8 intégré : lancé en PLAN MODE (opus, high). Point get_hint / source de t8 ajouté aux critères.
- 2026-11-01 — PLAN READY, attend la validation du développeur. Zones élargies (reviews, deepl).
- 2026-11-05 — gardé actif par le développeur (comportement de Claude) ; t29, t30, t32 et le tapis roulant en pause.
- 2026-11-05 — ordre décidé : t29 d'abord, t31 ensuite (zones recoupées). Plan toujours à valider.
- 2026-11-05 — plan validé tel quel par le développeur. Statut ready : à relancer (même ouvrier a781f1250052062ce, EXECUTION MODE, AUTO REVIEW /simplify) dès l'intégration de t29 (zones recoupées).
- 2026-11-05 — t29 intégré : même ouvrier relancé en EXECUTION MODE (opus, high), AUTO REVIEW /simplify.
- 2026-11-05 — DONE, 333 tests verts. In-review (passé par un plan, points sous relecture). [delivered] prêt à relire.
- 2026-11-05 — relecture : le développeur demande la limite de concurrence DeepL (~4). Ouvrier relancé pour corriger.
- 2026-11-06 — ouvrier coupé par la limite d'usage (5 h), repris après le reset (même ouvrier).
- 2026-11-06 — DONE de la correction (limite DeepL dans le client). in-review : 1 point à trancher (nouvelle tentative sur 429).
- 2026-11-06 — rebasé sur dev 9cb267a (de3921a + fd6bd0a), sans conflit, 334 tests verts. Prêt à poser, attend la réponse sur le 429.
- 2026-11-06 — le développeur choisit d'intégrer tel quel ; la nouvelle tentative sur 429 part dans t37. Intégré dans dev par avance rapide (de3921a, fd6bd0a ; sans conflit).
- 2026-11-06 — t31 intégré, worktree supprimé, worktree:prune lancé.
- 2026-11-06 — le développeur annonce le déploiement, mais origin/main est encore à 14a5541 (dev à ad8ef2c) : push non constaté.
- 2026-11-06 — déploiement constaté : origin/main = ad8ef2c. Test en conditions réelles sur Claude.ai à faire par le développeur.
