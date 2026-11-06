---
id: t5
title: Claude choisit le deck d'une carte capturée (outil MCP pour lister les decks)
status: done
priority: normal
story: doc/story/decks.md
plan_required: true
review: required
model: opus
effort: high
zones: [apps/web/src/lib/server/mcp, apps/web/src/lib/server/domain/decks]
branch: ticket/t5-mcp-choix-deck
agent: ab0bdccb898646869
created: 2026-10-29
updated: 2026-10-30
---

## Context
Ce ticket fait suite à t3 (modèle ouvert aux decks : type langue ou sujet, noms des faces, option des deux sens). Dans t3, le deck d'une carte est le deck par défaut, implicite. Ici, Claude choisit le deck d'une carte capturée : il le **déduit**, par exemple de la langue de l'expression, ou il **demande** quand il hésite. Voir la story `doc/story/decks.md`.

Règles de la story :
- **Deck de langue :** vérification DeepL, comme aujourd'hui.
- **Deck de sujet :** pas de second avis. La relecture par Claude, suivie de ma confirmation, reste obligatoire.
- **Révision avec Claude :** « on révise » mélange tous les decks. On peut aussi demander un deck précis.

## Done criteria
- [ ] Un outil MCP liste les decks : nom, type, langues ou noms des faces, nombre de cartes.
- [ ] La création et la vérification d'une carte acceptent un deck explicite. Sans deck, c'est le deck par défaut.
- [ ] Les consignes MCP disent à Claude :
  - [ ] de déduire le deck ou de demander en cas de doute ;
  - [ ] de vérifier avec DeepL seulement pour un deck de langue ;
  - [ ] de toujours relire la carte avant de la créer.
- [ ] La révision accepte un deck facultatif. Sans deck, elle mélange tous les decks.
- [ ] `doc/specs/mcp.md` est à jour.
- [ ] Les tests passent.

## Plan
(rendu par l'ouvrier le 2026-10-30)

1. **Domaine :** il fait déjà presque tout (`reviews.next` prend un `deckId` ; `createOnce` et `findDuplicates` prennent un deck vérifié). On ajoute seulement un helper pur `findDeckByName` (casse et espaces ignorés), et on supprime `first()`.
2. **`mcp/handler.ts` :** il charge `decks.list` ; `PojMcpDeps.decks: DeckWithCount[]`.
3. **Nouvel outil `list_decks` :** lecture seule. Il renvoie nom, type, faces, langues et nombre de cartes, une ligne par deck. Sans deck, il invite à créer un deck sur /decks/new.
4. **`check_card` et `create_card` :**
   - nouveau paramètre `deck` facultatif : le **nom** du deck, en chaîne libre et non en enum ;
   - un nom inconnu donne une erreur qui liste les decks ;
   - DeepL et les doublons se calculent sur le deck résolu ;
   - la sortie indique `deck`.
5. **Rendu des descriptions :**
   - avec 1 seul deck, rien ne change ;
   - avec plusieurs decks, les faces sont décrites de façon générique, et la correspondance de chaque deck est donnée dans la description de `deck` et dans les consignes.
6. **Consignes :**
   - Claude déduit le deck, et ne pose qu'une seule question courte en cas de doute ;
   - il garde le même deck pour la suite de la conversation ;
   - DeepL ne s'applique qu'aux decks de langue ;
   - la relecture, deck compris, est suivie de la confirmation ;
   - « on révise » lance `next_review` sans deck.
7. **`next_review` :** il prend un `deck` facultatif. Sans deck, les decks sont mélangés ; avec un deck, `nothing_due` est restreint à ce deck.
8. **Tests dans `server.spec.ts` :**
   - `list_decks` ;
   - deck nommé, seul deck, erreur avec plusieurs decks et sans nom, nom inconnu, casse différente ;
   - deck de sujet sans DeepL ;
   - `next_review` filtré ou mélangé ;
   - consignes avec plusieurs decks.
9. **`doc/specs/mcp.md`** est mis à jour.
10. **Finalisation :** les tests, puis un rebase après t13.

**Décisions proposées :**
- Le deck est désigné par son nom (unique par propriétaire) : aucun id n'est exposé à Claude.
- Une chaîne libre plutôt qu'un enum : si un deck est renommé entre deux appels, l'erreur reste lisible.
- Avec un seul deck, le rendu ne change pas.
- Ni le contrat ni iOS ne sont touchés.

**Risques :**
- Un petit conflit avec t13 dans `decks.service.ts`.
- t8 réécrira les mêmes consignes.
- En vocal, un nom de deck mal transcrit donne une erreur qui liste les noms ; les accents ne sont pas ignorés.
- Le comportement réel de Claude n'est pas testable automatiquement.

## Questions
- 2026-10-30 — **Q1, `deck` omis** (le ticket parlait d'un deck par défaut, que t4 a supprimé) :
  - A : on prend le seul deck s'il n'y en a qu'un ; avec plusieurs, une erreur liste les noms ;
  - B : on prend le plus ancien deck, au risque de ranger une carte dans le mauvais deck sans rien dire ;
  - l'ouvrier recommande A.
- 2026-10-30 — **Q2, `remaining` dans une session restreinte à un deck :**
  - A : ajouter un `deck` facultatif à `submit_review` et `amend_review`, pour que `remaining` se compte sur ce deck (ça prépare aussi l'enchaînement de `submit_review`) ;
  - B : garder un `remaining` global, et le dire dans la description ;
  - l'ouvrier recommande A.

- 2026-10-30 — **Réponses du développeur :**
  - Q1 : A. Pour une capture sans `deck` alors qu'il y en a plusieurs, l'outil renvoie une erreur qui liste les noms ; Claude devine (langue, sujet) ou demande. Avec un seul deck, la carte y va.
  - Q2 : A. `deck` facultatif sur `submit_review` et `amend_review`, pour que `remaining` se compte sur ce deck.
  - Révision, confirmée par le développeur : sans précision, session globale (tous decks) ; avec un deck nommé, session limitée à ce deck ; un nom inconnu donne une erreur qui liste les noms.
  - **Plan validé.**

## Review
- **Rapport DONE du 2026-10-30.** 214 tests au vert, contrat inchangé, ni migration. Worktree `.claude/worktrees/agent-t5-mcp-choix-deck`.
  - Nouvel outil `list_decks` (lecture seule) : pour chaque deck non supprimé, nom, type, faces, langues, deux sens et nombre de cartes.
  - Paramètre facultatif `deck`, désigné par son nom (sans tenir compte de la casse ni des espaces), sur `check_card`, `create_card`, `next_review`, `submit_review` et `amend_review`.
    - Capture sans `deck` : la carte va dans le seul deck s'il n'y en a qu'un. Sinon, ou avec un nom inconnu ou supprimé, l'outil renvoie une erreur qui liste les noms.
    - Révision sans `deck` : tous les decks sont mélangés.
  - Consignes à plusieurs decks : déduire le deck ou demander, DeepL pour un deck de langue seulement, toujours relire la carte. Avec un seul deck, les textes restent ceux d'avant.
  - `decks.first` est remplacé par le helper pur `findDeckByName`. `doc/specs/mcp.md` est à jour.
- **Décisions de l'ouvrier :**
  - son worktree de plan avait été supprimé : il a recréé la branche depuis `dev` ;
  - un deck de langue se reconnaît à `kind === 'language'`.
- **À relire en premier :**
  - [x] `apps/web/src/lib/server/mcp/server.ts:101` : le texte des consignes à plusieurs decks. Il décide du comportement de Claude et n'est testé que par extraits.
  - [x] `apps/web/src/lib/server/mcp/server.ts:303` : les règles de choix du deck à la capture (décision Q1 A).
  - [x] `apps/web/src/lib/server/mcp/server.ts:645` : sur submit et amend, un deck inconnu est toléré (`remaining` est compté sur tous les decks) au lieu de renvoyer une erreur, pour ne pas perdre une note. C'est un choix de l'ouvrier, à confirmer.
- **Revue auto `/simplify` :** 9 corrections appliquées. Points restants :
  - [x] `apps/web/src/lib/server/domain/decks/decks.service.ts:77` : `assertNameFree` pourrait réutiliser `findDeckByName`, pour n'avoir qu'une règle de nom. Code existant, hors du diff.
  - [x] `apps/web/src/lib/server/mcp/handler.ts:25` : `decks.list`, avec le comptage des cartes, tourne à chaque requête MCP. Coût faible.
  - [x] `apps/web/src/lib/server/mcp/server.ts:303` : la règle de choix du deck existe aussi côté web (`web/guards.ts` `deckInScope`). Un `resolveDeck` commun dans le domaine serait plus juste. Hors périmètre.
  - [x] Rendu à un deck et rendu à plusieurs decks : deux modes gardés à dessein.
    - 2026-10-30, Jonas : règle commune → ticket `t18-regle-commune-deck` ; le reste ignoré.


## Log
- 2026-10-29 — créé depuis la story decks. Part après t3, puis t4 ou en parallèle si les zones le permettent.
- 2026-10-30 — ouvrier lancé en PLAN MODE (opus, high), en parallèle de t13 (lecture seule, sans tests).
- 2026-10-30 — plan prêt avec 2 questions, en attente de validation. L'exécution partira après l'intégration de t13 (zone `decks.service.ts` commune).
- 2026-10-30 — plan validé (Q1 A, Q2 A). L'exécution attend l'intégration de t13 (zone `decks.service.ts` commune), puis repartira avec l'ouvrier du plan.
- 2026-10-30 — t13 intégré : ouvrier du plan relancé en EXECUTION MODE (opus, high), base dev, AUTO REVIEW /simplify
- 2026-10-30 — **DONE**, 214 tests au vert. Relecture obligatoire (serveur MCP). [delivered]
- 2026-10-30 — relecture terminée : suggestions → t18, deck inconnu toléré sur submit/amend accepté
- 2026-10-30 — intégré sur dev par avance rapide (1 commit, aucun conflit) après relecture
