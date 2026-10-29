# Story : plusieurs decks

Statut : validée le 2026-10-29. Tickets : T-0003, T-0004, T-0005.

## Le problème

Tout est construit pour le seul français → anglais (voir [vision.md](../vision.md)). Le développeur ne veut pas enfermer l'application dans ce cadre. Un autre deck pourrait être une autre langue, ou un sujet qui n'est pas une langue. La question se pose tôt, pour ne pas figer le modèle.

## Pistes du développeur (2026-10-29)

- Un deck a un type, par exemple « Langue », avec une option de paire (français-anglais).
- Les sens deviennent génériques : `a_to_b` et `b_to_a`, au lieu de `fr_to_en` et `en_to_fr`.
- Le suivi (objectif, série) reste global, et les sessions de révision se font par deck.
- Pas d'import d'un gros deck d'un coup : ce serait décourageant et peu personnel.

## Coût (enquête du 2026-10-29)

- Le français et l'anglais sont en dur dans 36 fichiers de `src`, dont 9 de tests :
  - modèles `Card` (`french` et `english`), `Review` et enum `Direction` ;
  - domaine `cards`, `reviews` et `translation` (DeepL : `Language = 'fr'|'en'`, `EN-GB`) ;
  - MCP (INSTRUCTIONS et schémas d'outils) ;
  - routes et composants web ;
  - seed.
- **Le contrat OpenAPI n'expose pas les cartes**, il n'y a aucune occurrence. L'app iOS n'est donc pas concernée.
- `ReviewLog.stateBefore` est un état FSRS sans langue ni sens, il n'y a rien à migrer.
- **Ouvrir le modèle maintenant** est un chantier moyen : environ 36 fichiers, surtout des renommages, plus une migration simple (`ALTER TYPE RENAME VALUE`). Le gain est faible tant qu'aucune autre langue n'arrive : INSTRUCTIONS, DeepL et l'interface restent à généraliser au moment utile.
- **Attendre :** migrer les données reste simple. C'est le nombre de fichiers à reprendre qui augmente.
- **Point de non-retour :** exposer les cartes dans le contrat REST, car elles seraient figées dans des clients générés.

## Interface (demande du 2026-10-29)

- L'interface multi-decks entre dans le périmètre dès maintenant.
- Dans la navigation, l'entrée générique « Cartes » est remplacée par le nom du deck (capture : `doc/tickets/captures/2026-10-29-nav-cartes.png`).

## Questions ouvertes

- Côté Claude, dans quel deck une carte capturée est-elle créée ?

## Décisions

- **2026-10-29 : un deck, c'est une autre langue ou un autre sujet, pas un thème.**
- **2026-10-29 : pas d'import de gros deck tout fait.**
  - *Raison :* ce serait décourageant et peu personnel. Les cartes naissent de situations réelles.
- **2026-10-29 : le modèle est ouvert maintenant (T-0003).** L'entité Deck porte un type et une paire de langues. Les champs et les sens deviennent génériques, et la paire n'est plus écrite en dur (DeepL, consignes MCP). Il n'y a qu'un seul deck « Français → Anglais », et le comportement ne change pas.
  - *Raison :* le développeur ne veut pas de choses écrites en dur.
  - *Rejeté :* attendre le premier vrai deuxième deck ou l'exposition des cartes dans le contrat REST, comme le recommandait l'enquête.
  - *Hors T-0003 :* l'interface multi-decks (T-0004).
- **2026-10-29 : la révision se lance de deux façons.** L'entrée « Réviser » globale mélange tous les decks, et chaque deck a son propre bouton « Réviser ». Le suivi (objectif, série) reste global.
  - *Raison :* au volant, « on révise » ne demande aucun choix.
- **2026-10-29 : les decks se créent depuis le web, y compris pour des sujets qui ne sont pas des langues.**
- **2026-10-29 : chaque deck nomme ses deux faces.** Exemple : « Pays » / « Capitale ». Pour une langue, ce sont les noms des langues. Par défaut : « Question » / « Réponse ».
- **2026-10-29 : sans DeepL, seule la relecture fiabilise un deck de sujet.** La relecture par Claude, suivie de ma confirmation, reste obligatoire, sans autre source.
- **2026-10-29 : les deux sens deviennent une option par deck.** Elle est activée par défaut pour une langue, au choix pour un sujet.
- **2026-10-29 : à la capture, Claude choisit le deck.** Il le déduit, ou me le demande s'il hésite. Un outil MCP lui permet de lister les decks.
- **2026-10-29 : modèle, interface et MCP sont découpés.** T-0003 couvre le modèle, T-0004 l'interface web, T-0005 le choix du deck par Claude.
