---
id: t8
title: Comportement de Claude — prompts MCP Réviser / Ajouter une carte, consignes et inspiration
status: done
priority: normal
story: doc/story/connexion-assistants.md
plan_required: true
review: required
model: opus
effort: high
zones: [apps/web/src/lib/server/mcp, doc/specs/mcp.md]
branch: ticket/t8-consignes-prompts-mcp
agent: a5b4ec66379372809
created: 2026-10-29
updated: 2026-11-01
---

## Context
Le comportement de l'assistant vit **côté serveur**, pour s'appliquer à tous les utilisateurs sans réglage de leur part. Seul Claude est visé. Le but : lancer les sessions de révision de manière fluide, et proposer d'ajouter des cartes. Voir `doc/story/connexion-assistants.md`.

Ce ticket **absorbe t2**, qui touche les mêmes consignes : quand l'inspiration manque, Claude aide à retrouver une **situation réelle** (ma journée, ce que j'aurais voulu dire, ce que j'ai entendu), ou s'appuie sur ce qu'il sait de moi. Il ne propose jamais de cartes génériques « selon le niveau » (story `doc/story/ajout-quotidien.md`). Claude n'annonce pas l'état de l'objectif quotidien, qui est une gratification visuelle propre au web.

Après t3, le serveur MCP (`mcp/server.ts`) a 6 outils, qui reçoivent les faces du deck : `check_card`, `create_card`, `next_review`, `get_hint`, `submit_review` et `amend_review`. Les consignes serveur `INSTRUCTIONS` sont rendues selon le deck. Il n'y a encore ni prompt ni ressource MCP. Les outils de choix du deck relèvent de t5.

**Prérequis :** vérifier sur le compte du développeur ce que Claude.ai fait des `instructions` du serveur MCP et des prompts MCP (sont-ils lus, proposés dans l'interface, disponibles sur mobile et en vocal ?). Le résultat est à noter dans `## Questions
- 2026-10-29 — Le test sur Claude.ai demande que l'app soit en ligne : Claude.ai doit pouvoir joindre le serveur MCP. t8 attend donc la mise en ligne.
- 2026-10-29 — Réponse de Claude.ai, demandée par le développeur :
  - Les `instructions` du serveur sont envoyées à l'initialisation.
  - Les descriptions d'outils sont injectées dans le contexte. S'il y a beaucoup d'outils, le client peut n'injecter que les noms et charger le détail à la demande.
  - Les prompts MCP ne sont pas mentionnés.
  - **Limites :** c'est une description générale du protocole, et l'auto-description d'un modèle n'est pas une preuve. Le test réel reste nécessaire (consignes suivies ? prompts visibles ? mobile ? vocal ?).
  - **Conséquence pour le plan :** ne pas compter sur les seules `instructions`. Les règles essentielles doivent aussi figurer dans les descriptions d'outils, qui sont toujours vues au moment de l'appel.
- 2026-10-29 — Deuxième réponse de Claude.ai, sur le vocal :
  - Le protocole est identique en texte et en voix. Claude expose les outils en vocal, ce que le développeur a vérifié. ChatGPT et Gemini Live ne le font pas encore.
  - **Pistes pour le plan :**
    - **Latence :** chaque appel d'outil crée un silence en vocal. Fusionner « répondre » et « carte suivante » en un seul appel (par exemple un `answer_card` qui enregistre la réponse et renvoie la carte suivante) éviterait deux allers-retours par carte. Il faudra le comparer à `submit_review` + `next_review`.
    - **Lecture :** les réponses d'outil doivent rester courtes et peu structurées, puisqu'elles sont prononcées.
    - **Transcription :** les mots étrangers sont souvent mal transcrits. Le jugement de la réponse doit revenir au modèle, avec indulgence pour les erreurs de transcription, et jamais à une comparaison exacte de chaînes côté serveur. Les consignes doivent le dire.
- 2026-10-29 — **Décision (story connexion-assistants) :** on garde les outils actuels, et l'enchaînement de `submit_review` sur la révision suivante est retenu. Le développeur ne veut pas trancher maintenant les détails (ticket séparé, place des prompts MCP par rapport à la spec qui les met hors périmètre). On ajustera après le test en conditions réelles, une fois en ligne.` avant le plan.

**Remarque du 2026-10-31 — correction après une note `again` ou `hard`** (réponse fausse, inconnue, ou trouvée avec hésitation ou indice) :
- Claude donne la bonne réponse clairement, puis invite brièvement à la répéter à voix haute (« Répète-la une fois ? ») ;
- il attend la réponse avant d'appeler `next_review` : jamais la carte suivante dans le même message que la correction, pour ne pas couper la parole ;
- répétée correctement : confirmation en un mot, puis on enchaîne ;
- encore fausse : correction douce, et proposition de la redire une fois ;
- si l'utilisateur préfère passer, Claude enchaîne sans insister.

Attention : cela contredit la décision du 2026-10-29 d'enchaîner `submit_review` sur la révision suivante. Après `again`/`hard`, l'enchaînement doit être retenu ou différé.

## Done criteria
- [ ] Après une note `again` ou `hard`, les consignes font corriger, inviter à répéter et attendre la réponse avant la carte suivante, comme décrit dans la remarque du 2026-10-31.
- [ ] Un prompt MCP « Réviser » lance une session de révision selon CL-4 à CL-6.
- [ ] Un prompt MCP « Ajouter une carte » lance une capture selon CL-2 et CL-3, en partant d'une situation réelle.
- [ ] Les consignes MCP font proposer à Claude d'ajouter des cartes au bon moment, sans insister. Le plan définit ce bon moment : par exemple en fin de révision, ou quand une expression utile apparaît dans la conversation.
- [ ] Les consignes décrivent la marche à suivre quand je manque d'idées : interroger sur des situations réelles, ou s'appuyer sur le contexte de Claude, puis en tirer une carte avec son contexte d'origine. Elles interdisent les cartes génériques sans situation réelle.
- [ ] La carte issue de cette aide suit le déroulé habituel : `check_card`, DeepL pour une langue, relecture et confirmation.
- [ ] Pour un deck personnalisé (hors langue), toute information vérifiable portée par une carte (fait, chiffre, date, définition, attribution, procédure…) est vérifiée par Claude auprès d'une source récente et fiable (recherche web) avant d'être proposée, jamais de mémoire ; la source et sa date figurent dans le contexte de la carte. Si Claude ne peut pas vérifier, il le dit au lieu d'inventer.
- [ ] `doc/specs/mcp.md` est à jour.
- [ ] Les tests passent.

## Plan
Rendu le 2026-10-31 (opus, high). Branche `ticket/t8-consignes-prompts-mcp`.
1. **`mcp/guidance.ts`** (nouveau) : règles partagées par consignes et prompts. Y déplacer `REVIEW_RULE`, `RATING_RULE`, `VOICE_RULE` ; ajouter `CORRECTION_RULE` (après again/hard : réponse, « Répète-la une fois ? », attendre ; juste → un mot puis next_review ; encore faux → correction douce une fois ; « on passe » → enchaîner), `JUDGE_RULE` (jugement par Claude, indulgent pour la transcription vocale), `INSPIRATION_RULE` (situation réelle, une question à la fois, ou ce qu'il sait de moi ; carte avec ce contexte ; jamais générique ; puis check_card, DeepL, relecture, confirmation), `OFFER_RULE` (bon moment : (a) une fois en fin de révision, après le bilan ; (b) quand une expression utile de la langue apprise surgit ; jamais entre deux cartes, une phrase, une fois, pas de relance ; jamais d'annonce de l'objectif du jour).
2. **`server.ts`** : `singleDeckInstructions` / `multiDeckInstructions` ajoutent ces règles ; l'essentiel est aussi reporté dans les descriptions d'outils (`next_review` : indulgence ; `submit_review` : correction, enchaînement, proposition de fin ; `check_card` : situation réelle).
3. **`submit_review` enchaîne côté serveur** : sortie facultative `next` (review_id, deck, direction, prompt, expected, has_hint, version, remaining), renvoyée **seulement si la note retenue est good/easy** (un good plafonné à hard après indice n'enchaîne pas). Après again/hard : pas de `next`, le texte demande de corriger, faire répéter, attendre. Entrée facultative `ahead` pour enchaîner en révision en avance. Lignes « À demander… » de next_review factorisées. `amend_review` inchangé.
4. **`mcp/prompts.ts`** (`registerPrompts`) : `review` (« Réviser », arg. facultatif `deck`) lance CL-4 à CL-6 (next_review, jamais lire expected, get_hint, jugement indulgent, note annoncée, enchaînement ou correction, nothing_due → prochaine échéance puis révision en avance, « on arrête » → bilan, puis une proposition d'ajout) ; `add_card` (« Ajouter une carte », arg. facultatif `expression`) : fourni → CL-2/CL-3 ; vide → `INSPIRATION_RULE` puis même déroulé ; sans deck → renvoi vers `/decks/new`.
5. **Tests** (`mcp/server.spec.ts`) : listPrompts / getPrompt (avec et sans argument, un/plusieurs/aucun deck) ; consignes et descriptions ; submit_review (good → `next`, again/hard → pas de `next` et demande de répétition, plafond après indice, `ahead`, rien de dû → proposition).
6. **Docs** : `doc/specs/mcp.md` (section Prompts, submit_review `ahead`/`next`, déroulé vocal, consignes ; « Hors périmètre » ne garde que les ressources) ; `doc/story/connecteur-claude.md` CL-4 (attente de la répétition après again/hard).
7. **Vérification** : test_command. Contrat REST non touché.

**Décisions de l'ouvrier :**
- Enchaînement de submit_review inclus (décision du 2026-10-29) et retenu côté serveur après again/hard. Pas un critère de fin explicite : retirable (étape 3), la règle resterait dans les consignes.
- Enchaînement décidé sur la note **retenue**.
- Prompts nommés en anglais (`review`, `add_card`), titres en français ; arguments tous facultatifs.

**Risques :** comportement réel sur Claude.ai (menu « + », attente en vocal) invérifiable ici, à tester après déploiement ; les prompts ne se déclenchent pas à la voix, d'où la duplication dans les descriptions ; sortie de submit_review plus grosse, `ahead` à repasser ; descriptions plus longues.

**À relire en premier (à l'exécution) :**
- `apps/web/src/lib/server/mcp/server.ts` (submit_review, `next` seulement si good/easy) · 7/10 · enchaînement côté serveur et entrée `ahead`, hors critères de fin.
- `apps/web/src/lib/server/mcp/guidance.ts` (OFFER_RULE) · 6/10 · définition du « bon moment », question de goût produit.

## Questions

## Review
Rapport DONE du 2026-11-01. 297 tests verts, contrat inchangé, pas de migration. Worktree recréé : `.claude/worktrees/t8-consignes-prompts-mcp`.
- `mcp/guidance.ts` : règles (correction et répétition après again/hard, jugement indulgent, fin de session, moment pour proposer une carte, aide quand l'inspiration manque, vérification des faits des decks de sujet auprès d'une source récente). Reprises dans les consignes, les descriptions d'outils (check_card, create_card, next_review, submit_review) et les prompts.
- `mcp/prompts.ts` : prompts `review` (« Réviser », `deck` facultatif) et `add_card` (« Ajouter une carte », `expression` facultative ; vide → aide à trouver une situation réelle). Texte adapté aux decks (langue, sujet, plusieurs, aucun).
- `submit_review` : `next` seulement si la note retenue est good/easy (plafond compris), entrée `ahead`. Après again/hard : pas de `next`, consigne de corriger et d'attendre la répétition. `doc/specs/mcp.md` et story CL-4 à jour.
- Décisions : règle de vérification sans liste fermée ; sans deck, les faces neutres comptent comme un deck de sujet ; `remaining` via `countDue` (même compte, moins de requêtes) ; noms de prompts en anglais, titres en français, argument vide = absent.
- Revue auto /simplify : 6 corrections appliquées.
- [ ] REVIEW FIRST — `apps/web/src/lib/server/mcp/guidance.ts:24` · 6/10 · `OFFER_RULE` : une fois en fin de révision, ou quand une expression utile surgit ; jamais entre deux cartes ; pas de relance après un refus. Choix produit.
- [ ] REVIEW FIRST — `apps/web/src/lib/server/mcp/guidance.ts:35` · 7/10 · formulation de la règle de vérification (toute information vérifiable, source récente et fiable, jamais de mémoire, le dire si impossible). À tester sur Claude.ai (population du Portugal).
- [ ] REVIEW FIRST — `apps/web/src/lib/server/mcp/server.ts:664` · 7/10 · enchaînement côté serveur ; en session `ahead`, la carte qu'on vient de réussir peut revenir aussitôt en `next` (déjà le cas avec next_review ahead).
- [ ] remaining — `apps/web/src/lib/server/mcp/guidance.ts:35` · 8/10 · FACT_SOURCE et REAL_SITUATION sont des versions courtes de FACT_CHECK et INSPIRATION_RULE, gardées exprès pour les descriptions d'outils.
- [ ] remaining — `apps/web/src/lib/server/mcp/server.ts:664` · 8/10 · le test good/easy existe aussi dans `capRating` (domaine) ; un `isPass` partagé toucherait le domaine, laissé tel quel.
- Pour le développeur : après déploiement, tester sur Claude.ai les deux prompts (menu du connecteur), l'attente après again/hard en vocal, et la vérification des faits sur un deck de sujet.

## Log
- 2026-10-29 — créé depuis la story connexion-assistants. Absorbe t2. Attend l'intégration de t3, et le résultat du test des consignes sur Claude.ai.
- 2026-10-29 — en attente de la mise en ligne, qui est le prérequis du test sur Claude.ai.
- 2026-10-31 — remarque ajoutée : correction et répétition à voix haute après `again`/`hard`, sans enchaîner la carte suivante.
- 2026-10-31 — prérequis levé par le développeur (test fait ou inutile). Lancé en PLAN MODE (opus, high), en parallèle de t22.
- 2026-10-31 — PLAN READY, attend la validation du développeur (enchaînement côté serveur, bon moment pour proposer un ajout).
- 2026-11-01 — plan : le développeur questionne l'étape 3 (enchaînement côté serveur), préférerait passer par les seules INSTRUCTIONS.
- 2026-11-01 — plan validé par le développeur avec l'étape 3 (enchaînement côté serveur maintenant, plutôt qu'après un test vocal).
- 2026-11-01 — remarque ajoutée : pour un deck personnalisé, vérifier les faits (ex. population du Portugal donnée de mémoire, datée) auprès d'une source récente avant de proposer la carte. Critère ajouté, transmis à l'ouvrier comme correction du plan.
- 2026-11-01 — même ouvrier relancé en EXECUTION MODE (opus, high), AUTO REVIEW /simplify.
- 2026-11-01 — critère élargi par le développeur : toute information vérifiable, pas seulement chiffres et dates. Transmis à l'ouvrier.
- 2026-11-01 — /ork:status : ouvrier a5b4ec66379372809 injoignable (nouvelle session). Worktree avec modifications non commitées (server.ts, server.spec.ts, guidance.ts, prompts.ts ; dernière écriture 22:05), aucun commit. Relance à décider par le développeur.
- 2026-11-01 — ouvrier arrêté par la fin de session ; même ouvrier relancé (« reprends »), worktree avec 4 fichiers en cours. Le développeur : terminer t8, puis pause (rien d'autre à lancer sans son go).
- 2026-11-01 — pause levée par le développeur.
- 2026-11-01 — DONE, 297 tests verts, contrat inchangé. In-review (relecture requise). [delivered] prêt à relire.
- 2026-11-01 — contre-lecture (ork:critic) : get_hint lit le contexte comme indice ; la source ajoutée par la règle de vérification pourrait donc révéler la réponse. À voir en relecture (point guidance.ts:35).
- 2026-11-01 — intégration demandée par le développeur sans relecture des points (le point get_hint / source reste ouvert). Dépôt principal sale (doc/kanban.base, au développeur) ; dev avancé par le commit de la story : ouvrier relancé en INTEGRATION MODE pour rebaser.
- 2026-11-01 — rebasé sur dev 62856f7 (95ff347), sans conflit, 297 tests verts. Prêt à poser ; bloqué par doc/kanban.base modifié dans le dépôt principal.
- 2026-11-01 — dernier rebase sur ed33cf9 (check + lint, code identique à 95ff347 testé). Intégré dans dev par avance rapide (9a8b2da), sans relecture des points, à la demande du développeur. Après déploiement : tester sur Claude.ai les prompts, l'attente après again/hard en vocal, la vérification des faits.
