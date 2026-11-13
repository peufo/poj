---
id: t46
title: Claude peut rechercher une carte et la modifier depuis le connecteur
status: done
priority: normal
story: doc/story/connecteur-claude.md
depends_on: []
plan_required: true
lane:
review: required
model: opus
effort: high
zones: [apps/web/src/lib/server/mcp, apps/web/src/lib/server/domain/cards]
branch: ticket/t46-outils-recherche-modification
agent: a06504f166b70ae3a
paused:
created: 2026-11-13
updated: 2026-11-13
---

## Context
Remarque du développeur (2026-11-13) : Claude doit avoir les outils pour rechercher une carte et pour modifier une carte.

Enquête : le serveur MCP (`apps/web/src/lib/server/mcp/server.ts`) expose 8 outils (`list_decks`, `check_card`, `create_card`, `check_cards`, `create_cards`, `get_hint`, `review`, `amend_review`), aucun de recherche ni de modification. Le domaine sait déjà faire les deux (`apps/web/src/lib/server/domain/cards/cards.service.ts`) :
- `list(ownerId, { query, deckId })` cherche sans tenir compte de la casse ni des accents (unaccent ILIKE sur side_a, side_b et context) ;
- `update(ownerId, id, input)` réinitialise la progression si une face change, pas si seul le contexte change : Claude doit le savoir et le dire.
La page web d'édition (`apps/web/src/routes/(app)/cards/[id]/edit/card.remote.ts`) montre l'usage de `cards.update`. L'API REST n'expose rien (non concernée). Le test « exposes the eight tools » (`server.spec.ts` ~l.126) est à mettre à jour.

Plan requis pour trancher : format et limite des résultats de recherche ; `update_card` passe-t-il par les mêmes vérifications que `check_card` (doublons, traduction DeepL, deck de sujet / FACT_CHECK) ; confirmation avec l'utilisateur avant modification ; la suppression entre-t-elle dans le périmètre (proposition : non).

## Done criteria
- [ ] Un outil `search_cards` (texte, deck facultatif) renvoie les cartes trouvées (id, deck, faces, contexte), avec une limite de résultats.
- [ ] Un outil `update_card` modifie les faces ou le contexte d'une carte par `cards.update` ; sa description dit à Claude de confirmer avec l'utilisateur avant d'agir, et de le prévenir quand la modification d'une face réinitialise la progression.
- [ ] Les vérifications de création qui s'appliquent à une modification (doublons, etc.) s'y appliquent aussi, selon le plan validé.
- [ ] Tests dans `apps/web/src/lib/server/mcp/server.spec.ts` pour les deux outils.
- [ ] Les tests passent.

## Plan
(rédigé par l'ouvrier ; reporté par le chef, l'écriture du ticket lui ayant été refusée depuis son worktree)

1. **`search_cards`** (`mcp/server.ts`, lecture seule) : `query` obligatoire (trim, min 1), `deck` facultatif (`namedDeck`, erreur qui liste les decks). Appelle `cards.list(ownerId, { query, deckId })`, garde les `SEARCH_LIMIT = 10` plus récentes. Sortie `{ cards: [{ card_id, deck, side_a, side_b, context }], total, truncated }`. Texte : une ligne par carte (`describeCard`, deck nommé s'il y en a plusieurs) ; au-delà de 10 « N cartes trouvées, voici les 10 plus récentes : affine la recherche » ; sinon « Aucune carte trouvée ».
2. **`check_card` gagne `card_id`** (uuid, facultatif) : carte lue par `cards.get` (introuvable : erreur d'outil) ; son deck s'impose ; exclue des doublons (`findDuplicates(…, { excludeId })`) ; sortie + `progress_reset` (`resetsProgress` du domaine) et « Cette modification réinitialisera sa progression. »
3. **`update_card`** : `card_id` (uuid) ; `side_a`, `side_b` facultatifs (absent = inchangé, mêmes limites que la capture) ; `context` (absent = inchangé, null ou vide = supprimé) ; appel sans champ = erreur d'outil. Fusion avec `cards.get` puis `cards.update`. Sortie `{ card_id, deck, side_a, side_b, context, progress_reset }` ; texte « Carte modifiée : … » puis « Progression réinitialisée (historique conservé) » ou « Progression conservée ». Annotations `destructiveHint: true`, `idempotentHint: true`. `NotFoundError` → « Carte introuvable : retrouve-la avec search_cards ».
4. **Guidage** : description de `update_card` et règle `EDIT_RULE` (`guidance.ts`, dans `SHARED_RULES`) : modifier seulement à la demande, après `search_cards` ; si une face change, `check_card` avec `card_id` d'abord (DeepL, `FACT_SOURCE` / « Source : », doublons) ; relire l'avant et l'après ; prévenir qu'une face changée remet la progression à zéro (pas le contexte seul) ; attendre une confirmation explicite.
5. **Tests** (`mcp/server.spec.ts`) : dix outils listés avec le bon `readOnlyHint` ; `search_cards` (accents et casse, filtre deck, deck inconnu, limite et `total`, isolation entre comptes, aucun résultat) ; `check_card` avec `card_id` (s'exclut des doublons, autre doublon signalé, deck trouvé sans `deck` avec plusieurs decks, `progress_reset`, carte inconnue) ; `update_card` (face changée → révisions réinitialisées en base ; contexte seul → progression gardée ; champ absent inchangé ; contexte effaçable ; autre compte ou appel vide → erreur) ; règles présentes dans descriptions et consignes.
6. **Documents** : `doc/specs/mcp.md` (sections `search_cards`, `update_card`, `card_id` de `check_card`, hors-périmètre réduit à la suppression, libellé du scope) ; `doc/decisions.md` (entrée 2026-11-13 qui remplace en partie le rejet du 2026-10-29 dans `doc/story/connexion-assistants.md`, « corriger ou supprimer une carte à l'oral ») ; libellé du scope `cards` dans `apps/web/src/lib/server/oauth-flow.ts` et `apps/web/e2e/oauth.e2e.ts` : « Lire, créer, modifier et réviser tes cartes ».
7. **Vérification** : commande de tests complète ; API REST et contrat inchangés, pas d'`ios:test`.

**Décisions proposées**
- Recherche : 10 résultats au plus, les plus récents, avec `total` et `truncated` ; id, deck, faces, contexte, sans progression ; limite dans la couche MCP (contrainte d'affichage vocal), domaine inchangé. · 8/10
- Vérifications de `update_card` : les mêmes qu'à la création, via `check_card` avec `card_id` (DeepL, doublons sans la carte elle-même, faits pour un sujet), non imposées par le serveur comme pour `create_card`. Alternative : refuser un doublon sauf `allow_duplicate` (garanti par le serveur, mais sans DeepL ni faits). · 7/10
- Confirmation avant modification : toujours, avec relecture avant/après et avertissement de réinitialisation. · 9/10
- Suppression : hors périmètre, reste sur le web (WEB-6). · 8/10
- Pendant une révision : modification seulement sur demande explicite ; Claude ne propose jamais de lui-même de corriger (décision 2026-10-24 « Prévenir les cartes fausses plutôt que les corriger »). · 6/10
- Modification partielle plutôt que remplacement : Claude ne peut pas effacer le contexte ou sa ligne « Source : » par oubli. · 8/10
- Libellé de consentement modifié (visible ; jetons existants valides, scope inchangé). · 7/10
- Story : ajouter une courte CL-7 « Retrouver et corriger une carte » à `doc/story/connecteur-claude.md`. · 5/10

**Risques**
- `cards.list` charge toutes les cartes trouvées avec leurs révisions avant de couper à 10 : négligeable en usage personnel, sinon un `take` dans le domaine.
- Le serveur ne garantit pas que `check_card` précède `update_card` (même limite que `create_card`).
- `destructiveHint: true` peut ajouter une approbation dans claude.ai (souhaitable).
- Carte supprimée entre `get` et `update` : `NotFoundError` traduite par `guard`.
- Descriptions plus longues (tokens) ; les assertions existantes doivent rester vertes.

## Questions
- 2026-11-13 — Pendant une révision, Claude peut-il proposer de lui-même de corriger une carte ? → **non**, seulement sur demande explicite (décision du 2026-10-24). Les autres décisions proposées sont retenues (développeur).
- 2026-11-13 — Mon worktree (`.claude/worktrees/agent-aaf730da0b934094e`) n'existe plus, et sa branche non plus : il a sans doute été nettoyé automatiquement à la fin du PLAN MODE, puisqu'il était inchangé. Mon répertoire de travail est maintenant le checkout principal, sur `dev`, où je ne dois rien modifier. `EnterWorktree` est refusé depuis un sous-agent. Rien n'a été codé, donc rien n'est perdu.
  - Option A : le chef me relance avec un worktree neuf (isolation worktree), en EXECUTION MODE. Le plan validé et les décisions sont dans ce ticket. (Le plus propre ; un relancement de plus.)
  - Option B : je crée moi-même `git worktree add .claude/worktrees/t46-outils-recherche-modification -b ticket/t46-outils-recherche-modification dev` depuis le checkout principal, puis j'y travaille. (Plus rapide, mais cela touche les métadonnées git du dépôt principal, ce qui m'est interdit, et contourne le refus d'`EnterWorktree`.)
  - Recommendation: A, parce que c'est l'orchestrateur qui pose les worktrees et que B contournerait un refus du harness · confidence: 8/10
  - → **A** (chef) : relève de la mécanique de lancement, pas d'un choix produit ; nouvel ouvrier sur un worktree neuf.

## Review
/simplify : 5 corrections appliquées (helper `editedCard` partagé par check_card et update_card, `deckCardOutput`, `cardGuard`, clause `CHECK_BEFORE_EDIT` en une constante, `cardsOf` dans la spec).
- [ ] apps/web/src/lib/server/mcp/guidance.ts:86 · 7/10 · Texte de `EDIT_RULE` et `EDIT_ON_REQUEST` (repris dans la description de update_card, server.ts:733) : la consigne « ne propose jamais de toi-même de corriger une carte, même pendant une révision » est-elle formulée comme souhaité ? Elle seule empêche Claude de proposer une correction.
- [ ] apps/web/src/lib/server/oauth-flow.ts:38 · 7/10 · Libellé de consentement visible changé en « Lire, créer, modifier et réviser tes cartes » (scope inchangé, jetons existants valides) ; e2e `oauth.e2e.ts` vert.
- [ ] apps/web/src/lib/server/mcp/server.ts:733 · 8/10 · update_card : fusion partielle (`cards.get` puis `cards.update`), `destructiveHint: true` : claude.ai peut demander une approbation à chaque modification.
- [ ] apps/web/src/lib/server/mcp/server.ts:733 · 8/10 · /simplify non corrigé : `cards.get` charge révisions et logs, puis `cards.update` relit la carte (trois requêtes) ; domaine inchangé comme prévu au plan, coût négligeable.
- [ ] apps/web/src/lib/server/mcp/server.ts:315 · 8/10 · /simplify non corrigé : `cards.list` charge toutes les cartes trouvées avec leurs révisions avant de garder les 10 premières ; suite possible : un `take` dans le domaine.
- [ ] apps/web/src/lib/server/mcp/server.ts:315 · 9/10 · /simplify non corrigé : `truncated` dérivable de `total` (sortie validée au plan) ; `guard` en objet d'options toucherait les appels existants, hors diff.

## Log
- 2026-11-13 — créé depuis une remarque du développeur, après enquête sur le serveur MCP. Zones communes avec `t45-revision-hesitation` (`mcp`) : part après son intégration.
- 2026-11-13 — `t45-revision-hesitation` intégré : lancé en PLAN MODE (opus, high).
- 2026-11-13 — plan rédigé par l'ouvrier (reporté par le chef), en lecture seule. Il rouvre le rejet du 2026-10-29 (« corriger ou supprimer une carte à l'oral », `doc/story/connexion-assistants.md`) et le hors-périmètre de `doc/specs/mcp.md`. `review: required` posé : le plan modifie le libellé de consentement OAuth (`oauth-flow.ts`).
- 2026-11-13 — plan validé par le développeur ; ouvrier relancé en EXECUTION MODE (branche à renommer en `ticket/t46-outils-recherche-modification`, e2e `oauth.e2e.ts` à lancer).
- 2026-11-13 — ouvrier bloqué avant de commencer : son worktree a disparu après le PLAN MODE et `EnterWorktree` est refusé depuis un sous-agent. Rien n'a été codé ni commité, et ni `dev` ni le checkout principal n'ont été touchés. Voir `## Questions`.
- 2026-11-13 — worktree du premier ouvrier disparu après le PLAN MODE (rien de codé) : nouvel ouvrier lancé en EXECUTION MODE sur un worktree neuf (opus, effort par défaut), plan validé tel quel.
- 2026-11-13 — (reporté par le chef : écriture du ticket refusée à l'ouvrier depuis son worktree.) Implémenté selon le plan validé : `search_cards`, `update_card`, `card_id` sur `check_card`, règle `EDIT_RULE`, libellé du scope (`oauth-flow.ts`, `e2e/oauth.e2e.ts`), docs (`doc/specs/mcp.md`, `doc/decisions.md`, CL-7 dans `doc/story/connecteur-claude.md`). Nombre d'outils mis à jour aussi dans `oauth.spec.ts` (8 → 10). Commit `94eb6ab` « let claude search and edit cards from the connector », rebasé sur `dev` sans conflit.
  - Commande de tests verte après rebase (390 tests) ; `e2e/oauth.e2e.ts` vert (preview 4193). Contrat et API REST inchangés, pas d'`ios:test`. Rien à faire après intégration.
- 2026-11-13 — relecture ouverte puis refermée sans réponse (arrêt de session demandé) : 0 point coché, reste `in-review`.
- 2026-11-13 — intégré sans relecture à la demande explicite du développeur (malgré `review: required`). Avance rapide sur `dev` (1 commit, `94eb6ab`), sans conflit. Worktree et branche supprimés.
