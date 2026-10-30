# Spécification : serveur MCP

Le serveur MCP permet à Claude de capturer et de réviser des cartes : [story/connecteur-claude.md](../story/connecteur-claude.md). Les règles de répétition sont celles de [specs/repetition.md](repetition.md).

## Principes

- **Une couche fine, comme le reste.** Les outils valident leurs entrées, appellent les services du domaine (`cards`, `reviews`, `deepl`), puis sérialisent. Aucune règle métier ne vit dans le serveur MCP. Le web et Claude ont ainsi exactement le même comportement.
- **Le serveur garantit ce qu'il peut garantir.** Les règles qui dépendent du comportement de Claude (relire la carte avant de la créer, ne jamais proposer _Easy_) figurent dans les descriptions des outils. Toutes celles que le serveur peut appliquer lui-même, il les applique : plafond à _Hard_ après un indice, mise de côté du sens inverse, rejeu sans effet.
- **Pensé pour la voix.** Les résultats sont courts et directement exploitables, avec des dates relatives (« dans 3 jours »). Il n'y a pas de liste longue à lire au volant.
- **Sans état de session.** Chaque appel se suffit à lui-même. L'état est en base, pas dans la connexion MCP.

## Transport et authentification

- **Transport :** Streamable HTTP, en mode sans état, sur la route `/mcp` de l'app SvelteKit. On utilise le SDK MCP TypeScript officiel.
- **Authentification :** OAuth, avec Better Auth comme serveur d'autorisation, via le plugin `@better-auth/mcp` (et `jwt` pour la signature des jetons).
  - L'enregistrement dynamique des clients (DCR) est activé : c'est ainsi que Claude s'enregistre.
  - L'URL de redirection `https://claude.ai/api/mcp/auth_callback` est autorisée.
  - Le rafraîchissement des jetons est supporté : Claude renouvelle ses jetons quand ils expirent.
  - La connexion réutilise la page de connexion du web. Il faut ajouter une page de consentement (« Claude demande l'accès à vos cartes ») : elle ne s'affiche qu'à l'ajout du connecteur, et elle protège contre un client qui se ferait passer pour Claude. Pas d'approbation automatique.
- **Exposition :** l'enregistrement est ouvert à tout client, mais n'importe qui ne peut pas utiliser mes cartes pour autant : il faut ensuite se connecter avec un compte Poj ([WEB-1](../story/web.md#web-1--accès-réservé)). Les comptes sont le mien, le premier créé et administrateur, et ceux des testeurs que j'ai invités ([connexion-assistants](../story/connexion-assistants.md)). Un jeton ne donne accès qu'aux cartes du compte qui a donné son consentement.
- **Scope :** l'accès au MCP exige le scope `cards` (« lire, créer et réviser vos cartes »), annoncé dans les métadonnées de la ressource et dans le `401`. Claude y ajoute `offline_access` pour obtenir un jeton de rafraîchissement.
- **Découverte :** la ressource est `${ORIGIN}/mcp`, l'émetteur `${ORIGIN}/api/auth`. Sont servis : `/.well-known/oauth-protected-resource` (et `/…/mcp`), `/.well-known/oauth-authorization-server` (à la racine et suffixé par `/api/auth`), et sous `/api/auth/.well-known/` les métadonnées OAuth et OpenID.
- **Clients :** DCR seulement, sans CIMD (Claude se rabat sur DCR quand CIMD n'est pas annoncé). Les clients natifs sans `application_type` (anciens Claude Code, boucle locale) sont enregistrés comme natifs : leur redirection `http://localhost:<port>` est acceptée quel que soit le port.
- **À vérifier :** le parcours complet est testé (tests serveur, puis curl et MCP Inspector en CLI sur le bac à sable). Reste à le tester avec claude.ai, une fois Poj joignable en HTTPS.

Références : [Build an MCP server for Claude](https://claude.com/docs/connectors/building/index.md), [Better Auth : MCP](https://www.better-auth.com/docs/plugins/mcp).

## Outils

Les noms des outils et de leurs paramètres sont en anglais, les textes renvoyés en français.

Les cartes capturées vont dans le deck par défaut (« Français → Anglais » tant qu'il n'y a pas de choix de deck, voir [decisions.md](../decisions.md)). Les clés des outils sont génériques : `side_a` et `side_b` pour les deux faces, `a_to_b` et `b_to_a` pour les sens. Les instructions du serveur, la description des outils et de leurs paramètres, ainsi que les textes renvoyés, nomment les faces d'après le deck : le nom des langues pour un deck de langue (`side_a` : « Texte en français de la carte »), ses libellés ou « Question » / « Réponse » pour un sujet.

### `check_card` — vérifier une carte avant création

Appelé **avant chaque création**, avec la proposition de Claude.

- **Entrée :** `side_a` (le français), `side_b` (l'anglais), `context` (facultatif).
- **Sortie :**
  - `deepl_a_to_b` : traduction DeepL de la face A dans la langue de la face B (anglais britannique, variante tirée du deck), en tenant compte du contexte ;
  - `deepl_b_to_a` : traduction DeepL de la face B, utile quand l'expression a été entendue en anglais ([CL-3](../story/connecteur-claude.md#cl-3--capturer-une-expression-entendue-en-anglais)) ;
  - `duplicates` : cartes existantes du même deck au même texte anglais (casse et espaces ignorés), avec leurs deux faces (`side_a`, `side_b`) et leur contexte ;
  - si DeepL est indisponible ou que le quota est épuisé : `deepl_error` avec la raison. Claude me le signale, et je décide de créer quand même ou pas.
- **Deck de sujet :** DeepL ne s'applique qu'aux decks de langue. Pour un sujet, `deepl_a_to_b` et `deepl_b_to_a` sont nuls, sans `deepl_error`, et les doublons portent sur la face A (la question). La relecture de la carte par Claude reste obligatoire.
- **Lecture seule :** il ne modifie rien.

### `create_card` — créer une carte

- **Entrée :** `side_a`, `side_b`, `context` (facultatif).
- **Effet :** crée la carte (origine : Claude) dans le deck par défaut, et ses deux révisions, dues immédiatement. Dans un deck à sens unique, seule la révision `a_to_b` est créée.
- **Sortie :** `card_id` et un récapitulatif de la carte.
- **Rejeu :** si une carte identique (mêmes trois champs) a été créée dans les 10 dernières minutes, l'outil renvoie celle-ci au lieu d'en créer une seconde. C'est la protection contre les relances réseau. On n'utilise pas d'identifiant fourni par le client, car Claude génère mal les UUID.
- **Description de l'outil (consignes à Claude) :**
  - toujours appeler `check_card` d'abord ;
  - si DeepL diverge, exposer les options et me laisser trancher ;
  - me relire la carte finale et attendre ma confirmation explicite avant d'appeler cet outil.

### `next_review` — obtenir la prochaine révision

- **Entrée :** `ahead` (booléen, `false` par défaut). Avec `true`, il propose les prochaines révisions à venir quand rien n'est dû ([CL-6](../story/connecteur-claude.md#cl-6--rien-à-réviser)).
- **Sortie :**
  - `review_id`, `direction` (`a_to_b` ou `b_to_a`), `prompt` (le texte à me dire), `expected` (la réponse attendue, que Claude ne lit pas avant ma réponse) ;
  - `has_hint` : vrai si la carte a un contexte ;
  - `version` : jeton opaque à renvoyer avec la note ;
  - `remaining` : nombre de révisions qui seront encore présentées dans la session, au plus une par carte (voir [Sessions](repetition.md#sessions)) ;
  - si rien n'est dû et que `ahead` vaut `false` : `nothing_due` et la date de la prochaine échéance.
- **Le contexte n'est pas renvoyé ici :** il ne s'obtient que par `get_hint`. Le serveur sait ainsi quand un indice a été demandé.
- **Ordre et mise de côté** du sens inverse : ceux de la spec de répétition, appliqués par le serveur.
- **Lecture seule.**

### `get_hint` — obtenir un indice

- **Entrée :** `review_id`.
- **Effet :** renvoie le contexte d'origine et **mémorise sur la révision** qu'un indice a été demandé.
- **Sortie :** `context`, ou l'absence de contexte.

### `submit_review` — enregistrer la note

- **Entrée :** `review_id`, `version` (tel que renvoyé par `next_review`), `rating` (`again`, `hard`, `good` ou `easy`).
- **Effet :**
  - si un indice a été demandé pour cette révision, la note est **plafonnée à `hard`** par le serveur ;
  - FSRS calcule le nouvel état, et la réponse est ajoutée à l'historique (origine : Claude).
- **Sortie :** la note retenue, la prochaine échéance relative (« dans 3 jours »), le contexte (à évoquer en renforcement si utile) et `remaining`.
- **Rejeu :** si `version` ne correspond plus (la révision a déjà été notée), l'outil renvoie le résultat déjà enregistré sans rien appliquer une seconde fois.
- **Description de l'outil (consignes à Claude) :** proposer `again`, `hard` ou `good` en tolérant synonymes et approximations. N'utiliser `easy` que si je le demande explicitement.

### `amend_review` — corriger la dernière note

Sert quand je conteste une note **après** son enregistrement (voir le déroulé ci-dessous).

- **Entrée :** `review_id`, `rating`.
- **Effet :** remplace la dernière réponse de cette révision. L'état FSRS est recalculé à partir de l'état antérieur, que conserve l'historique. Le plafond `hard` lié à l'indice s'applique toujours.
- **Limite :** seule la **dernière** réponse d'une révision est corrigeable, et seulement dans l'heure qui suit.
- **Note inchangée :** si la note retenue (plafond compris) est déjà celle enregistrée, rien n'est modifié et la sortie l'indique (`changed` à `false`).

## Déroulé d'une révision vocale

Pour que la session reste fluide en voiture, Claude n'attend pas mon accord sur chaque note :

1. Claude appelle `next_review` et me dit le `prompt`.
2. Je réponds. Si je demande un indice, Claude appelle `get_hint`.
3. Claude donne la réponse attendue, annonce la note qu'il retient, appelle `submit_review`, puis enchaîne avec `next_review` et la carte suivante.
4. Si je conteste (« non, compte-la fausse »), Claude appelle `amend_review` sur la carte précédente, puis reprend.

## Consignes générales

Les instructions du serveur MCP (transmises à l'initialisation, si le client les prend en compte) résument le rôle de Poj et les règles ci-dessus : langue de travail français, carte relue avant création, _Easy_ jamais proposé, réponses brèves en mode vocal. Les règles critiques figurent **aussi** dans la description des outils concernés, que Claude lit de manière certaine.

## Hors périmètre

- Prompts et ressources MCP : la voix ne permet pas de les déclencher. Les outils suffisent.
- MCP Apps (interface intégrée à la conversation).
- Modifier ou supprimer une carte depuis Claude : on corrige sur le web ([décision](../decisions.md)).
- Statistiques : Claude résume lui-même une session à partir de la conversation.
