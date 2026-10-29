---
id: T-0003
titre: Ouvrir le modèle à plusieurs decks (champs et sens génériques, paire non écrite en dur)
statut: pret
priorite: normale
story: doc/story/decks.md
plan_requis: true
modele: opus
effort: high
zones: [apps/web/prisma, apps/web/src/lib/server/domain/cards, apps/web/src/lib/server/domain/reviews, apps/web/src/lib/server/domain/translation, apps/web/src/lib/server/mcp, apps/web/src/routes, apps/web/src/lib/components, apps/web/src/lib/format, apps/web/src/lib/server/testing]
branche: ticket/T-0003-decks-generiques
agent: a65de7b8fb5660b83
cree: 2026-10-29
maj: 2026-10-29
---

## Contexte
Aujourd'hui, tout est construit pour le seul français → anglais. Le développeur veut pouvoir ajouter plus tard d'autres decks : une autre langue, ou un sujet qui n'est pas une langue (jamais un simple thème). Il ne veut plus de choses écrites en dur. On ouvre donc le **modèle** maintenant. Le **comportement** ne change pas, et il n'y a pas d'interface multi-decks.

L'enquête préalable a établi les points suivants :
- le français et l'anglais sont en dur dans 36 fichiers de `src`, dont 9 de tests :
  - `Card.french` et `Card.english`, l'enum `Direction` (`fr_to_en`, `en_to_fr`) et `Review @@unique([cardId, direction])` ;
  - le domaine `cards`, `reviews` (5 fichiers) et `translation` (`Language = 'fr'|'en'`, source en dur, `EN-GB`) ;
  - `mcp/server.ts` : INSTRUCTIONS « expressions anglaises », schémas zod `french`/`english`, `deepl_french_to_english` ;
  - routes `(app)` et `lab`, `CardForm`, `lib/format`, la seed et les helpers de test ;
- le contrat OpenAPI n'expose pas les cartes. Il n'y a donc aucun impact sur l'app iOS, qui est gelée ;
- `ReviewLog.stateBefore` est un état FSRS sans langue ni sens, il n'y a rien à migrer ;
- il n'existe qu'une seule migration.

## Critères de fin
- [ ] Une entité Deck existe, avec un type (seul le type langue est géré pour l'instant) et une paire de langues. Chaque carte appartient à un deck.
- [ ] Une migration crée le deck par défaut « Français → Anglais » de chaque utilisateur et y rattache les cartes existantes, sans perte de données ni d'historique de révision.
- [ ] Les champs de carte et les sens de révision sont génériques, sans référence au français ni à l'anglais dans le schéma.
- [ ] La traduction (DeepL), les consignes et les schémas MCP ainsi que l'affichage web prennent la paire de langues du deck, au lieu de l'avoir en dur. La variante `EN-GB` vient de la configuration du deck ou de la langue.
- [ ] Le comportement est inchangé pour l'utilisateur : création, révision, indice, correction de note, capture par Claude. Aucune interface de choix de deck n'est ajoutée.
- [ ] Les conventions du schéma sont respectées (uuid(7), snake_case, `deletedAt`), ainsi que l'idempotence des mutations.
- [ ] La seed et les tests sont mis à jour, et les tests passent.

## Plan
(révision rendue par l'ouvrier le 2026-10-29, elle remplace la première version)

1. **Schéma :**
   - `DeckKind { language, subject }`.
   - `Deck` : name, kind, languageA et languageB (BCP 47, nullables), labelA et labelB (nullables), bothDirections (vrai par défaut), deletedAt.
   - `Card` : deckId obligatoire, `sideA`/`sideB`.
   - `Direction` : `a_to_b`/`b_to_a`.
2. **Migration :** une nouvelle migration, générée après le rebase sur T-0001.
   - Elle commence par `TRUNCATE cards, reviews, review_logs`. Les utilisateurs sont gardés.
   - Elle ne crée aucun deck.
   - Un CHECK impose que `kind = language` si et seulement si les deux langues sont renseignées.
   - Vérifications : `migrate diff`, puis `sandbox:reset`.
3. **`domain/decks` :**
   - `ensureDefault`, sous verrou, crée le deck fr / en-GB : c'est le seul endroit où la paire est écrite.
   - `resolve(ownerId, deckId?)` est le point d'entrée de toute création de carte.
4. **`cards` :**
   - Les révisions créées respectent bothDirections.
   - Les doublons sont cherchés par deck, sur la face B pour une langue et sur la face A pour un sujet.
5. **`reviews` :** les sens passent en a/b. On ajoute promptLanguage et expectedLanguage (nuls pour un sujet) et les libellés de face.
6. **Traduction :** les langues viennent du deck, en BCP 47 : source `EN`, cible `EN-GB`. DeepL n'est appelé que pour une langue.
7. **`lib/format/decks.ts` :** `faceLabels` (libellé, sinon nom de la langue via Intl.DisplayNames, sinon Question/Réponse), `directionLabel` et les articles.
8. **MCP :**
   - Les consignes et descriptions sont rendues selon le deck.
   - Les clés `side_a`, `side_b`, `deepl_a_to_b` et `deepl_b_to_a`.
   - Pour un sujet : pas de DeepL, relecture obligatoire.
9. **Web :** CardForm (DeepL masqué hors langue), CardRow, DueChip, les pages, lab. Mise à jour de `doc/specs/mcp.md`.
10. **Tests :** `createDeck`, ensureDefault (y compris en concurrence), resolve, sens unique, doublons, sujet sans DeepL, CHECK, faceLabels.

**Décisions proposées :**
- Pour une langue, A est la langue connue et B la langue apprise. Pour un sujet, A est la question et B la réponse.
- Un libellé renseigné l'emporte, même pour une langue.
- Changer l'option des deux sens :
  - de vrai à faux, les révisions b_to_a sont conservées mais filtrées ;
  - de faux à vrai, les b_to_a existantes reprennent leur état et les manquantes sont créées neuves.
  - Ce sera codé dans T-0004, puisque T-0003 n'offre aucun moyen de basculer l'option.
- « Parle français » reste en dur : c'est la langue de l'interface.

**Risques :**
- Le TRUNCATE efface aussi les cartes de prod au déploiement, ce qui est voulu.
- La migration doit être générée après l'intégration de T-0001.
- Le diff touche environ 45 fichiers.
- Les decks de sujet ne sont testés qu'au niveau domaine et MCP.

## Questions
- 2026-10-29 — **Correction du développeur : aucune donnée à préserver.**
  - La migration n'a pas à reprendre les données : elle peut vider `cards`, `reviews` et `review_logs`. Pas de deck créé dans le SQL : le deck par défaut est créé à la volée par `ensureDefault`. Le risque lié à `uuidv7()` disparaît.
  - On garde les comptes utilisateurs.
  - On ne réécrit pas les migrations existantes, déjà appliquées en prod : on en ajoute une nouvelle.
  - La vérification sur la sandbox se réduit à `sandbox:reset` sur le nouveau schéma.
- 2026-10-29 — Ajout : mettre à jour `doc/specs/mcp.md` (french/english, deepl_french_to_english).
- 2026-10-29 — L'interface multi-decks est sortie de ce ticket : elle fera l'objet de T-0004.
- 2026-10-29 — **Élargissement : les sujets qui ne sont pas des langues entrent dans le modèle.**
  - Le type « sujet » s'ajoute à `language`, et languageA/languageB deviennent nullables.
  - DeepL ne s'applique qu'aux decks de langue. Pour un sujet, la relecture par Claude reste obligatoire.
  - Chaque deck nomme ses deux faces, « Question » / « Réponse » par défaut. Pour une langue, ce sont les noms des langues.
  - Une option « réviser dans les deux sens » existe, vraie par défaut pour une langue.
  - Les outils MCP de choix du deck relèvent de T-0005.

## Journal
- 2026-10-29 — créé depuis la story decks. Le développeur ouvre le modèle maintenant, contre la recommandation d'attendre.
- 2026-10-29 — ouvrier lancé en MODE PLAN (opus, high)
- 2026-10-29 — plan prêt, en attente de validation
- 2026-10-29 — plan renvoyé en révision (aucune donnée à préserver, decks de sujet, libellés des faces, option des deux sens)
- 2026-10-29 — plan révisé prêt, en attente de validation
- 2026-10-29 — plan révisé validé ; attend l'intégration de T-0001 pour passer en MODE EXÉCUTION (même ouvrier)
