# Spécification : serveur MCP

Le serveur MCP permet à Claude de capturer, de retrouver, de modifier et de réviser des cartes : [story/connecteur-claude.md](../story/connecteur-claude.md). Les règles de répétition sont celles de [specs/repetition.md](repetition.md).

## Principes

- **Une couche fine, comme le reste.** Les outils valident leurs entrées, appellent les services du domaine (`cards`, `reviews`, `deepl`), puis sérialisent. Aucune règle métier ne vit dans le serveur MCP. Le web et Claude ont ainsi exactement le même comportement.
- **Le serveur garantit ce qu'il peut garantir.** Les règles qui dépendent du comportement de Claude (relire la carte avant de la créer, ne jamais proposer _Easy_) figurent dans les descriptions des outils. Toutes celles que le serveur peut appliquer lui-même, il les applique : plafond à _Hard_ après un indice, mise de côté du sens inverse, rejeu sans effet, lot créé en tout ou rien et sans doublon, source jamais donnée comme indice, note enregistrée avant le choix de la carte suivante.
- **Pensé pour la voix.** Les résultats sont courts et directement exploitables, avec des dates relatives (« dans 3 jours »). Il n'y a pas de liste longue à lire au volant.
- **Sans état de session.** Chaque appel se suffit à lui-même. L'état est en base, pas dans la connexion MCP.

## Transport et authentification

- **Transport :** Streamable HTTP, en mode sans état, sur la route `/mcp` de l'app SvelteKit. On utilise le SDK MCP TypeScript officiel.
- **Authentification :** OAuth, avec Better Auth comme serveur d'autorisation, via le plugin `@better-auth/mcp` (et `jwt` pour la signature des jetons).
  - L'enregistrement dynamique des clients (DCR) est activé : c'est ainsi que Claude s'enregistre.
  - L'URL de redirection `https://claude.ai/api/mcp/auth_callback` est autorisée.
  - Le rafraîchissement des jetons est supporté : Claude renouvelle ses jetons quand ils expirent.
  - La connexion réutilise la page de connexion du web. Il faut ajouter une page de consentement (« Claude demande l'accès à tes cartes ») : elle ne s'affiche qu'à l'ajout du connecteur, et elle protège contre un client qui se ferait passer pour Claude. Pas d'approbation automatique.
- **Exposition :** l'enregistrement est ouvert à tout client, mais n'importe qui ne peut pas utiliser mes cartes pour autant : il faut ensuite se connecter avec un compte Poj ([WEB-1](../story/web.md#web-1--accès-réservé)). Les comptes sont le mien, le premier créé et administrateur, et ceux des testeurs que j'ai invités ([connexion-assistants](../story/connexion-assistants.md)). Un jeton ne donne accès qu'aux cartes du compte qui a donné son consentement.
- **Scope :** l'accès au MCP exige le scope `cards` (« lire, créer, modifier et réviser tes cartes »), annoncé dans les métadonnées de la ressource et dans le `401`. Claude y ajoute `offline_access` pour obtenir un jeton de rafraîchissement.
- **Découverte :** la ressource est `${ORIGIN}/mcp`, l'émetteur `${ORIGIN}/api/auth`. Sont servis : `/.well-known/oauth-protected-resource` (et `/…/mcp`), `/.well-known/oauth-authorization-server` (à la racine et suffixé par `/api/auth`), et sous `/api/auth/.well-known/` les métadonnées OAuth et OpenID.
- **Clients :** DCR seulement, sans CIMD (Claude se rabat sur DCR quand CIMD n'est pas annoncé). Les clients natifs sans `application_type` (anciens Claude Code, boucle locale) sont enregistrés comme natifs : leur redirection `http://localhost:<port>` est acceptée quel que soit le port.
- **À vérifier :** le parcours complet est testé (tests serveur, puis curl et MCP Inspector en CLI sur le bac à sable). Reste à le tester avec claude.ai, une fois Poj joignable en HTTPS.

Références : [Build an MCP server for Claude](https://claude.com/docs/connectors/building/index.md), [Better Auth : MCP](https://www.better-auth.com/docs/plugins/mcp).

## Outils

Les noms des outils et de leurs paramètres sont en anglais, les textes renvoyés en français.

Les clés des outils sont génériques : `side_a` et `side_b` pour les deux faces, `a_to_b` et `b_to_a` pour les sens.

### Choix du deck

Claude choisit le deck d'une carte capturée ([story/decks.md](../story/decks.md)) : il le **déduit** (langue de l'expression, sujet) ou il **demande** en cas de doute.

- **Désignation :** un deck se désigne par son **nom**, dans le paramètre facultatif `deck`, et pas par son identifiant, car Claude génère mal les UUID. La comparaison ignore la casse et les espaces, comme l'unicité des noms. Un nom inconnu, ou celui d'un deck supprimé, renvoie une erreur d'outil qui liste les decks de l'utilisateur.
- **Capture sans `deck`** (`check_card`, `create_card`, `check_cards`, `create_cards`) **:** avec un seul deck, la carte y va. Avec plusieurs, l'outil renvoie une erreur qui liste les decks : il n'y a pas de deck par défaut, et Claude doit déduire le deck ou le demander. Sans aucun deck, l'erreur invite à créer un deck sur `/decks/new`.
- **Révision :** sans `deck`, la session mélange tous les decks (« on révise » ne demande aucun choix). Un deck nommé limite la session à ce deck. Claude le repasse à chaque appel de `review` et à `amend_review`, pour que `remaining` soit compté dans ce deck. Pour `review`, un nom inconnu renvoie l'erreur qui liste les decks, sans rien enregistrer. Pour `amend_review`, il ne bloque pas la note : `remaining` est alors compté dans tous les decks.
- **Rendu selon les decks :** à chaque requête, le serveur lit les decks non supprimés de l'utilisateur.
  - **Un seul deck (ou aucun) :** les instructions, les descriptions des outils et de leurs paramètres nomment les faces d'après ce deck : le nom des langues pour un deck de langue (`side_a` : « Texte en français de la carte »), ses libellés ou « Question » / « Réponse » pour un sujet.
  - **Plusieurs decks :** les instructions listent les decks (nom, type, faces et sens), et la description de `deck` donne la correspondance des faces de chacun. Les faces sont décrites de façon générique (face A, face B). Les textes renvoyés nomment le deck de la carte.

### `list_decks` — lister les decks

- **Entrée :** aucune.
- **Sortie :** `decks`, du plus ancien au plus récent, sans les decks supprimés : `name`, `kind` (`language` ou `subject`), `side_a` et `side_b` (noms des faces), `language_a` et `language_b` (étiquettes BCP 47, nulles pour un sujet), `both_directions` et `card_count`. Le texte tient en une ligne par deck. Sans deck, il invite à en créer un sur `/decks/new`.
- **Lecture seule.**

### `check_card` — vérifier une carte avant création ou modification

Appelé **avant chaque création**, avec la proposition de Claude, et **avant chaque modification d'une face** (voir `update_card`), avec la carte modifiée en entier.

- **Entrée :** `side_a` (le français), `side_b` (l'anglais), `context` (facultatif), `deck` (facultatif, voir [Choix du deck](#choix-du-deck)), `card_id` (facultatif : la carte à modifier).
- **Sortie :**
  - `deck` : le nom du deck retenu ;
  - `deepl_a_to_b` : traduction DeepL de la face A dans la langue de la face B (anglais britannique, variante tirée du deck), en tenant compte du contexte ;
  - `deepl_b_to_a` : traduction DeepL de la face B, utile quand l'expression a été entendue en anglais ([CL-3](../story/connecteur-claude.md#cl-3--capturer-une-expression-entendue-en-anglais)) ;
  - `duplicates` : cartes existantes du même deck au même texte anglais (casse et espaces ignorés), avec leurs deux faces (`side_a`, `side_b`) et leur contexte ;
  - si DeepL est indisponible ou que le quota est épuisé : `deepl_error` avec la raison. Claude me le signale, et je décide de créer quand même ou pas.
- **Modification (`card_id`) :** la carte est celle du compte (sinon erreur d'outil, qui renvoie vers `search_cards`). Son deck s'impose, `deck` est ignoré. Elle n'est pas comptée parmi ses propres doublons. Un `context` absent reprend le sien. La sortie ajoute `progress_reset` : vrai si la modification change une face et réinitialisera donc sa progression.
- **Deck de sujet :** DeepL ne s'applique qu'aux decks de langue. Pour un sujet, `deepl_a_to_b` et `deepl_b_to_a` sont nuls, sans `deepl_error`, et les doublons portent sur la face A (la question). La relecture de la carte par Claude reste obligatoire, et toute information vérifiable est vérifiée auprès d'une source récente et fiable (voir [Consignes générales](#consignes-générales)).
- **Lecture seule :** il ne modifie rien.

### `create_card` — créer une carte

- **Entrée :** `side_a`, `side_b`, `context` (facultatif), `deck` (facultatif, voir [Choix du deck](#choix-du-deck)).
- **Effet :** crée la carte (origine : Claude) dans le deck retenu, et ses deux révisions, dues immédiatement. Dans un deck à sens unique, seule la révision `a_to_b` est créée.
- **Sortie :** `card_id`, `deck` et un récapitulatif de la carte.
- **Rejeu :** si une carte identique (mêmes trois champs) a été créée dans les 10 dernières minutes, l'outil renvoie celle-ci au lieu d'en créer une seconde. C'est la protection contre les relances réseau. On n'utilise pas d'identifiant fourni par le client, car Claude génère mal les UUID.
- **Description de l'outil (consignes à Claude) :**
  - toujours appeler `check_card` d'abord, avec le même deck ;
  - pour un deck de langue, si DeepL diverge, exposer les options et me laisser trancher ; pour un sujet, vérifier lui-même la carte, et toute information vérifiable auprès d'une source récente et fiable (recherche web), avec la source et sa date dans le contexte ;
  - me relire la carte finale (avec son deck quand j'en ai plusieurs) et attendre ma confirmation explicite avant d'appeler cet outil.

### `check_cards` — vérifier un lot avant création

Appelé **avant `create_cards`**, à la place de `check_card` carte par carte, pour un lot tiré d'une source (photo d'une page de cours, article, fichier ou texte collé, liste comme les pays du monde) : [story/ajout-en-masse.md](../story/ajout-en-masse.md).

- **Entrée :** `cards`, de 1 à 50 cartes (`side_a`, `side_b`, `context` facultatif, mêmes limites de longueur que `check_card`), et `deck` (facultatif, voir [Choix du deck](#choix-du-deck)) : un lot va dans un seul deck. Au-delà de 50 cartes, l'outil refuse (« 50 cartes au plus par appel : découpe le lot en plusieurs appels »).
- **Sortie :** seulement les problèmes, chaque carte repérée par sa `position` dans le lot (à partir de 1), avec ses deux faces :
  - `deck` et `count` (nombre de cartes du lot) ;
  - `duplicates` : doublons d'une carte du deck (`existing`, même face que pour `check_card` : B pour une langue, A pour un sujet) ou d'une carte précédente du lot (`same_as`, sa position) ;
  - `already_created` : cartes identiques (mêmes trois champs) créées il y a moins de 10 minutes, c'est-à-dire un lot déjà envoyé, avec leur `card_id` ;
  - `divergences` (deck de langue) : cartes pour lesquelles ni la traduction DeepL de la face A ne correspond à la face B, ni celle de la face B à la face A (casse, espaces et ponctuation finale ignorés), avec `deepl_a_to_b` et `deepl_b_to_a`. Un seul sens qui correspond suffit : synonymes et tournures idiomatiques ne sont pas signalés ;
  - `deepl_error` : une seule fois pour le lot si DeepL est indisponible ou que le quota est épuisé.
  - Le texte commence par un bilan d'une ligne (« Lot de 12 cartes pour « Anglais » : 1 doublon, 2 divergences DeepL. »), puis une ligne par problème.
- **DeepL :** seules les cartes qui seraient créées sont traduites, en une requête par sens et par contexte (les cartes d'une même source partagent souvent le leur), soit deux requêtes pour un lot sans contexte. Le client DeepL n'envoie jamais plus de 4 requêtes à la fois, tous appels confondus, pour ne pas déclencher de refus de DeepL (429). Rien pour un deck de sujet.
- **Lecture seule.**

### `create_cards` — créer un lot de cartes

- **Entrée :** la même que `check_cards`, 50 cartes au plus par appel. Un lot plus grand (200 pays) se découpe en plusieurs appels.
- **Effet :** crée les cartes (origine : Claude) dans le deck, comme `create_card`, sauf :
  - les doublons d'une carte du deck ou d'une carte précédente du lot, qui ne sont pas créés (`skipped`, avec `reason` : `duplicate` ou `duplicate_in_batch`). Pour garder un doublon quand même (homonyme), Claude passe par `create_card` ;
  - les cartes identiques créées il y a moins de 10 minutes (lot rejoué), qui ne sont pas recréées.
  - Les cartes sont horodatées dans l'ordre du lot (une milliseconde d'écart) : c'est leur ordre de présentation dans la limite de nouvelles cartes du deck ([specs/repetition.md](repetition.md)).
- **Tout ou rien :** le lot est créé dans une seule transaction. Si une carte échoue en base, aucune n'est créée, et l'outil renvoie une erreur qui invite à rejouer le même appel.
- **Rejeu :** rejouer le lot (après une erreur ou une coupure, quand Claude ignore si l'appel a abouti) ne crée aucun doublon : les cartes déjà créées sont reconnues (`already_created` dans les 10 minutes, doublons ensuite).
- **Sortie :** `deck`, `created` et `already_created` (nombres), `skipped`, et `cards` (`position`, `card_id`, `created`) pour les cartes créées ou déjà créées. Le texte tient en quelques lignes : nombre de cartes créées, doublons écartés.
- **Description de l'outil (consignes à Claude) :** vérifier le lot avec `check_cards`, puis me soumettre un résumé bref (nombre de cartes, deck, doublons, divergences DeepL, deux ou trois exemples), sans lire tout le lot, et attendre **une seule confirmation explicite** pour tout le lot, même découpé en plusieurs appels. Pour un deck de sujet, la vérification des faits vaut pour chaque carte du lot (voir [Consignes générales](#consignes-générales)).

### `search_cards` — retrouver des cartes

- **Entrée :** `query` (texte à chercher, obligatoire), `deck` (facultatif : limite la recherche à ce deck ; un nom inconnu renvoie l'erreur qui liste les decks).
- **Recherche :** celle de la liste du web : sur les deux faces et le contexte, sans tenir compte de la casse ni des accents, dans les cartes non supprimées du compte.
- **Sortie :** `cards`, les 10 plus récentes au plus (`card_id`, `deck`, `side_a`, `side_b`, `context`, sans la progression), `total` (nombre de cartes trouvées) et `truncated`. Le texte tient en une ligne par carte, avec son `card_id` et son deck quand j'en ai plusieurs. Au-delà de 10, il le dit et invite à affiner la recherche : une liste plus longue ne se lit pas à la voix.
- **Lecture seule.**

### `update_card` — modifier une carte

Sert à corriger une carte **quand je le demande** ([CL-7](../story/connecteur-claude.md#cl-7--retrouver-et-corriger-une-carte)). La suppression reste sur le web ([WEB-6](../story/web.md#web-6--supprimer-une-carte)).

- **Entrée :** `card_id` (renvoyé par `search_cards`), puis seulement ce qui change : `side_a`, `side_b` (mêmes limites de longueur qu'à la création) et `context` (absent : inchangé ; `null` ou vide : supprimé). Un champ absent garde sa valeur : Claude ne peut pas effacer un contexte ou sa ligne « Source : » par oubli. Un appel sans aucun champ à modifier renvoie une erreur d'outil.
- **Effet :** celui de [WEB-5](../story/web.md#web-5--modifier-une-carte). Modifier une face réinitialise la progression des sens de la carte (l'historique est conservé). Modifier seulement le contexte la conserve. La carte reste dans son deck.
- **Sortie :** `card_id`, `deck`, `side_a`, `side_b`, `context` et `progress_reset`. Le texte dit la carte modifiée, puis si la progression est réinitialisée ou conservée.
- **Erreurs :** une carte inconnue, supprimée ou d'un autre compte renvoie « Carte introuvable », qui renvoie vers `search_cards`.
- **Rejeu :** rejouer le même appel ne change rien de plus (la seconde fois, les faces sont déjà les nouvelles : rien n'est réinitialisé).
- **Annotations :** `destructiveHint` (la progression peut être perdue), `idempotentHint`.
- **Description de l'outil (consignes à Claude) :**
  - seulement à ma demande explicite : Claude ne propose jamais de lui-même de corriger une carte, même pendant une révision ([décision du 2026-10-24](../decisions.md#2026-10-24--prévenir-les-cartes-fausses-plutôt-que-les-corriger)) ;
  - si une face change, appeler d'abord `check_card` avec `card_id` et la carte modifiée en entier : second avis DeepL pour une langue, vérification des faits et ligne « Source : » pour un sujet, doublons. Le serveur ne l'impose pas, comme pour `create_card` ;
  - me relire la carte avant et après, me prévenir quand une face modifiée réinitialisera sa progression, et attendre ma confirmation explicite.

### `review` — réviser avec une carte d'avance

Un seul outil mène la session : [story/revision-une-carte-d-avance.md](../story/revision-une-carte-d-avance.md). Claude tient toujours **une carte d'avance** : quand il pose une carte, il connaît déjà la suivante. Après ma réponse, il juge, annonce et pose aussitôt la carte suivante, puis enregistre la note. Aucun appel d'outil ne sépare ma réponse de la question suivante.

- **Entrée :**
  - `answer` (facultatif, absent au début de la session) : ma réponse à la carte précédente, avec `review_id`, `version` (tel que renvoyé avec la carte) et `rating` (`again`, `hard`, `good` ou `easy`) ;
  - `holding` (facultatif) : le `review_id` de la carte que Claude tient déjà, posée ou gardée pour après une correction. Il ne sert qu'à exclure : ni cette carte ni l'autre sens de sa carte ne sont renvoyés. Un id inconnu ou d'un autre compte est ignoré (une carte supprimée depuis compte toujours comme tenue) ; un id mal formé est refusé ;
  - `deck` (facultatif) : limite la session à ce deck. Sans deck, tous les decks sont mélangés ;
  - `ahead` (booléen, `false` par défaut) : avec `true`, les prochaines révisions à venir sont aussi proposées quand rien n'est dû ([CL-6](../story/connecteur-claude.md#cl-6--rien-à-réviser)). Claude le repasse à chaque appel de la session.
- **Effet, dans cet ordre :**
  1. la note de `answer` est enregistrée, comme sur le web : plafond à `hard` si un indice a été demandé, nouvel état FSRS, réponse ajoutée à l'historique (origine : Claude) ;
  2. la ou les cartes suivantes sont choisies **après** cet enregistrement : le sens inverse de la carte notée est déjà mis de côté, et une carte ratée qui doit revenir vite peut revenir.
- **Cartes renvoyées (`cards`) :** deux si Claude ne tient aucune carte (la première à poser maintenant, l'autre à garder), une sinon (la carte d'avance), moins s'il n'y en a plus. Elles sont toujours de cartes différentes, jamais les deux sens d'une même carte. Chacune porte :
  - `review_id`, `deck` (le nom du deck de la carte), `direction` (`a_to_b` ou `b_to_a`), `prompt` (le texte à me dire), `expected` (la réponse attendue, que Claude ne lit pas avant ma réponse) ;
  - `has_hint` : vrai si la carte a un indice, c'est-à-dire un contexte qui ne se réduit pas à une mention de source (voir `get_hint`) ;
  - `version` : jeton opaque à renvoyer avec la note.
- **Sortie :**
  - `answer`, si une note était jointe : la note retenue, `capped`, `replayed`, la prochaine échéance relative (« dans 3 jours ») et le contexte (à évoquer en renforcement si utile) ;
  - `cards` ;
  - `remaining` : nombre de révisions qui seront encore présentées dans la session, carte tenue et cartes renvoyées comprises, au plus une par carte (voir [Sessions](repetition.md#sessions)) ;
  - `nothing_due` : vrai quand rien n'est renvoyé et que Claude ne tient aucune carte. S'y ajoute la date de la prochaine échéance (dans le deck demandé, s'il y en a un). Des cartes neuves en attente (limite du jour atteinte) la ramènent au plus tard à minuit. Après une note, la session est terminée : Claude propose de réviser en avance et, une fois, d'ajouter une carte.
  - Quand Claude tient la dernière carte et que rien d'autre n'est dû, `cards` est vide sans `nothing_due` : il pose sa carte, puis rappelle `review` avec la note, sans `holding`.
- **Exemple :** `review()` renvoie les cartes 1 et 2 ; `review(réponse 1, holding: 2)` renvoie la 3 ; `review(réponse 2, holding: 3)` renvoie la 4 ; `review(réponse 3)`, sans carte tenue, renvoie la 4 et la 5.
- **Le contexte n'est pas renvoyé avec la carte :** il ne s'obtient que par `get_hint`. Le serveur sait ainsi quand un indice a été demandé.
- **Ordre, mise de côté** du sens inverse **et limite de nouvelles cartes par jour** : ceux de la spec de répétition, appliqués par le serveur.
- **Sans état :** le serveur ne retient pas ce que Claude tient. C'est `holding` qui le lui dit à chaque appel.
- **Rejeu :** si `version` ne correspond plus (la note a déjà été enregistrée), l'outil renvoie la note déjà enregistrée (`replayed`) sans rien appliquer une seconde fois, puis choisit la carte d'avance comme d'habitude. Un appel qui n'aboutit pas (coupure) se rejoue donc à l'identique.
- **Conflit :** si la révision a été modifiée (réinitialisée) ou supprimée entre-temps, l'outil renvoie une erreur sans rien enregistrer ni choisir. Claude me le dit en un mot, puis rappelle `review` sans `answer`, avec le même `holding` : la carte qu'il tient reste valable.
- **Description de l'outil (consignes à Claude) :** juger ma réponse avec indulgence et proposer `again`, `hard` ou `good` en tolérant synonymes, approximations et transcription vocale déformée ; n'utiliser `easy` que si je le demande explicitement. Elle reprend aussi la carte d'avance (poser la carte tenue avant d'appeler l'outil), la correction après `again` ou `hard`, le rejeu, la révision en avance et la proposition d'ajout en fin de session.

### `get_hint` — obtenir un indice

- **Entrée :** `review_id`.
- **Effet :** renvoie le contexte d'origine et **mémorise sur la révision** qu'un indice a été demandé.
- **Sans la source :** la vérification des faits met la source et sa date dans le contexte (« Source : fr.wikipedia.org/wiki/Canberra, 2026-11-01 »), et elle peut nommer la réponse. L'indice est donc le contexte sans ses mentions de source : de « Source : » (ou « Sources : ») jusqu'à la fin de la ligne. Un contexte réduit à une source ne donne pas d'indice : `has_hint` est faux, `get_hint` renvoie l'absence de contexte et ne mémorise rien, et la note n'est pas plafonnée.
- **Sortie :** `context`, ou l'absence de contexte.

### `amend_review` — corriger la dernière note

Sert quand je conteste une note **après** son enregistrement (voir le déroulé ci-dessous).

- **Entrée :** `review_id`, `rating`, `deck` (facultatif : celui de la session, pour compter `remaining` dans ce deck).
- **Effet :** remplace la dernière réponse de cette révision. L'état FSRS est recalculé à partir de l'état antérieur, que conserve l'historique. Le plafond `hard` lié à l'indice s'applique toujours.
- **Limite :** seule la **dernière** réponse d'une révision est corrigeable, et seulement dans l'heure qui suit.
- **Note inchangée :** si la note retenue (plafond compris) est déjà celle enregistrée, rien n'est modifié et la sortie l'indique (`changed` à `false`).

## Déroulé d'une révision vocale

Pour que la session reste fluide en voiture, Claude n'attend pas mon accord sur chaque note :

1. Claude appelle `review`, qui lui renvoie deux cartes. Il me dit le `prompt` de la première et garde l'autre.
2. Je réponds. Si je demande un indice, Claude appelle `get_hint`.
3. Claude juge ma réponse avec indulgence (la transcription vocale déforme les mots étrangers : le jugement lui revient, jamais une comparaison exacte côté serveur).
4. **Note `good` ou `easy` :** dans le même message, Claude donne la réponse attendue, annonce la note et me pose la carte qu'il tient. Puis, dans le même tour, il appelle `review` avec ma réponse (`answer`) et la carte qu'il vient de poser (`holding`) : la carte renvoyée devient sa nouvelle carte d'avance. Aucun appel d'outil ne sépare ma réponse de la question suivante.
5. **Note `again` ou `hard`** (réponse fausse, inconnue, ou trouvée avec hésitation ou indice) : Claude donne clairement la bonne réponse, puis m'invite brièvement à la répéter à voix haute (« Répète-la une fois ? »). Il appelle `review` dans le même tour (`answer`, et `holding` : la carte qu'il tient, pas encore posée), puis attend ma réponse : jamais la carte suivante dans le même message, pour ne pas me couper la parole.
   - Répétée correctement : il confirme en un mot, puis me pose la carte qu'il tient.
   - Encore fausse : il corrige avec douceur et propose de la redire une fois.
   - Si je préfère passer, il enchaîne sans insister.
6. Si je conteste (« non, compte-la fausse »), Claude appelle `amend_review` sur la carte précédente, puis reprend la carte en cours.
7. « On arrête » met fin à la session : Claude résume le nombre de cartes révisées et la répartition des notes.

L'ordre « parler d'abord, appeler ensuite » est porté par les consignes. Reste à vérifier après déploiement que Claude.ai prononce en vocal le texte écrit avant l'appel d'outil sans attendre sa réponse.

## Prompts

Deux prompts MCP lancent les déroulés depuis le menu du connecteur, à l'écrit. Ils ne se déclenchent pas à la voix : en vocal, les consignes et les descriptions d'outils suffisent. Chacun rend un message de l'utilisateur qui reprend les règles du déroulé, selon mes decks.

- **`review` (« Réviser ») :** argument facultatif `deck`. Il lance une session selon [CL-4](../story/connecteur-claude.md#cl-4--réviser-en-conversation) à [CL-6](../story/connecteur-claude.md#cl-6--rien-à-réviser) : `review` sans deck (ou avec le deck nommé), carte d'avance, correction et répétition, rien à réviser (prochaine échéance, révision en avance), bilan à l'arrêt, puis une seule proposition d'ajout.
- **`add_card` (« Ajouter une carte ») :** argument facultatif `expression` (ce que j'ai entendu, lu ou voulu dire, et où).
  - **Avec une expression :** capture selon [CL-2](../story/connecteur-claude.md#cl-2--capturer-une-carte) et [CL-3](../story/connecteur-claude.md#cl-3--capturer-une-expression-entendue-en-anglais) : question si le sens est ambigu, forme idiomatique d'une expression entendue, `check_card`, divergence DeepL, doublons, relecture et confirmation. Le contexte d'origine est la situation où je l'ai rencontrée.
  - **Sans expression :** marche à suivre du manque d'idées (voir les consignes générales), puis la même capture.
  - **Selon les decks :** choix du deck quand j'en ai plusieurs, vérification des informations pour un deck de sujet, renvoi vers `/decks/new` sans deck.

## Consignes générales

Les instructions du serveur MCP (transmises à l'initialisation, si le client les prend en compte) résument le rôle de Poj et les règles ci-dessus : langue de travail français, carte relue avant création, déroulé de révision avec correction et répétition, jugement indulgent, _Easy_ jamais proposé, bilan à l'arrêt, réponses brèves en mode vocal. Les règles vivent dans `mcp/guidance.ts`, partagées par les instructions, les descriptions d'outils et les prompts.

Elles ajoutent le comportement de Claude hors révision :

- **Manque d'idées :** quand je veux ajouter une carte sans savoir laquelle, Claude m'aide à retrouver une situation réelle, une question courte à la fois (ma journée, ce que j'aurais voulu dire sans trouver les mots, ce que j'ai entendu ou lu), ou s'appuie sur ce qu'il sait de moi. Il en tire une carte dont le contexte d'origine est cette situation. Il ne propose jamais de cartes génériques sans situation réelle (« selon ton niveau », listes de vocabulaire) : voir [story/ajout-quotidien.md](../story/ajout-quotidien.md). Un lot tiré d'une source que j'apporte ou que je demande (mon cours, un article, les pays du monde) n'est pas générique : il suit l'ajout en lot. La carte suit ensuite la capture habituelle : `check_card`, second avis DeepL pour une langue, relecture et confirmation.
- **Proposer d'ajouter des cartes, au bon moment :**
  - en fin de révision (plus rien de dû, ou après le bilan quand j'arrête) : une proposition, en une phrase, d'ajouter une carte tirée de ma journée ;
  - hors révision, quand une expression utile surgit dans la conversation (je cherche un mot, je demande une traduction, je cite une expression entendue ou lue) : une proposition d'en faire une carte ;
  - jamais entre deux cartes d'une révision, et pas de relance si je décline.
- **Vérification (deck de sujet) :** toute information vérifiable que porte une carte (fait, chiffre, date, définition, attribution, procédure…) est vérifiée par Claude auprès d'une source récente et fiable, par une recherche web, avant d'être proposée, jamais de mémoire. La source et sa date figurent dans le contexte de la carte, sur une ligne à part qui commence par « Source : », pour que `get_hint` ne la donne jamais comme indice. Si Claude ne peut pas vérifier, il le dit au lieu d'inventer. Une carte demande un gros effort pour être retenue : elle doit être juste. La règle est reprise dans les descriptions de `check_card` et `create_card` et dans le prompt `add_card`, comme le second avis DeepL pour une langue.
- **Modifier une carte :** seulement à ma demande explicite, jamais de la propre initiative de Claude, même pendant une révision. Claude la retrouve avec `search_cards`, vérifie la modification d'une face avec `check_card` (`card_id`), me relit l'avant et l'après, me prévient qu'une face modifiée remet sa progression à zéro (pas le contexte seul), et attend ma confirmation explicite avant `update_card`. La suppression se fait sur le web.
- **Ajout en lot :** pour beaucoup de cartes tirées d'une source (photo d'une page de cours, article, fichier ou texte collé, liste), Claude prépare les cartes et les vérifie avec `check_cards` (50 au plus par appel), sans `check_card` carte par carte. Il me donne ensuite un résumé bref (nombre de cartes, deck, doublons, divergences DeepL pour une langue, deux ou trois exemples), sans lire tout le lot, et attend une seule confirmation explicite pour tout le lot, même découpé en plusieurs appels, avant `create_cards`. Pour un deck de sujet, la vérification des faits vaut pour chaque carte du lot : Claude vérifie le lot auprès d'une source récente et fiable (celle que j'apporte si elle l'est, sinon une recherche web), jamais de mémoire, et met la source et sa date sur une ligne « Source : » du contexte de chaque carte.

Les règles essentielles figurent **aussi** dans les descriptions des outils (indulgence, carte d'avance, correction, rejeu et proposition en fin de session pour `review` ; situation réelle et vérification pour `check_card` et `create_card` ; source, résumé, confirmation unique et vérification du lot pour `check_cards` et `create_cards` ; demande explicite, vérification, relecture et confirmation pour `update_card`), et dans les textes de résultat : Claude.ai ne garantit pas la lecture des instructions.

Avec plusieurs decks, elles listent les decks et ajoutent :

- déduire le deck de chaque carte, ou le demander en une question courte en cas de doute, puis le garder pour les cartes suivantes sauf indice contraire ;
- vérifier avec DeepL seulement pour un deck de langue, et vérifier soi-même une carte de sujet ;
- toujours relire la carte, avec son deck, avant de la créer ;
- réviser sans deck quand je dis « on révise », et ne passer un deck que si j'en nomme un. Les règles critiques figurent **aussi** dans la description des outils concernés, que Claude lit de manière certaine.

## Hors périmètre

- Ressources MCP : la voix ne permet pas de les déclencher. Les outils suffisent.
- MCP Apps (interface intégrée à la conversation).
- Supprimer une carte depuis Claude : on supprime sur le web ([décision](../decisions.md#2026-11-13--claude-retrouve-et-modifie-une-carte-à-la-demande)).
- Statistiques : Claude résume lui-même une session à partir de la conversation.
