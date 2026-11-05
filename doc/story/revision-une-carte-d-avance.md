# Story : réviser avec une carte d'avance

Statut : validée le 2026-11-05. Ticket : t36.

## Le problème

Remarque du développeur (2026-11-05) : en révision par la voix avec Claude, « quand Claude pose la question, il devrait déjà connaître la réponse et la carte suivante. Ça lui permettrait de ne pas attendre un appel d'outil pour valider (ou non) avant de passer à la question suivante. En gros, il peut toujours avoir une carte d'avance. »

Chaque appel d'outil crée un silence en vocal (piste déjà notée le 2026-10-29, ticket t8). Aujourd'hui (t8, intégré dans dev, pas encore déployé) : Claude connaît déjà la réponse attendue de la carte en cours (`next_review` renvoie `expected`) ; après la réponse de l'utilisateur, il appelle `submit_review`, qui renvoie la carte suivante seulement si la note retenue est good/easy. Le silence restant est donc celui de `submit_review`, sur le chemin critique entre deux cartes.

## Questions ouvertes


## Décisions

- **2026-11-05 : une carte d'avance, roulante (+1).** Quand Claude pose une carte, il connaît déjà sa réponse et la carte suivante. Après la réponse de l'utilisateur, il juge, annonce et pose aussitôt la carte suivante, puis enregistre la note (`submit_review`), qui lui renvoie la carte d'après.
  - *Rejeté :* un lot de cartes (N cartes d'un coup, notes envoyées ensemble) : le développeur n'en veut pas (notes perdues si la session coupe, carte ratée renvoyée trop tard).
- **2026-11-05 : l'ordre « parler d'abord, appeler ensuite » est porté par les consignes MCP.**
  - *Point à vérifier en conditions réelles :* que Claude.ai prononce en vocal le texte écrit avant l'appel d'outil sans attendre sa réponse. C'est un comportement du client, que les consignes ne garantissent pas ; à tester après déploiement.
- **2026-11-05 : un seul outil `review` remplace `next_review` et `submit_review`.** Le serveur renvoie toujours de quoi avoir une carte d'avance : deux cartes si Claude n'en tient aucune, une sinon. L'appel porte la réponse précédente (id, note, version) et ce que Claude tient déjà : le serveur reste sans état. `deck` et `ahead` restent des options ; `get_hint` et `amend_review` restent à part.
  - *Raison :* une seule règle pour Claude, aucun appel oublié, pas de mémoire côté serveur (rejouable).
  - *Rejeté :* garder deux outils et faire renvoyer par `submit_review(1)` la carte 3 (le serveur devrait savoir que Claude tient la carte 2).
- **2026-11-05 : Claude dit ce qu'il tient par l'id de la révision (`holding`), pas par un nombre de cartes à sauter.** L'id ne sert qu'à exclure (la carte et son autre sens) ; un id inconnu ou étranger est ignoré.
  - *Raison :* l'ordre des cartes peut changer entre deux appels (une carte devient due) ; sauter « N cartes » ferait reposer une carte tenue et en sauter une autre.
  - *Rejeté :* le nombre de cartes tenues.

## Hors périmètre
