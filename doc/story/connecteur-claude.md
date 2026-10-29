# User stories : Claude (jalon 2)

Règles de répétition : voir [specs/repetition.md](../specs/repetition.md). Outils MCP et authentification : voir [specs/mcp.md](../specs/mcp.md).

## CL-1 — Connecter Claude à Poj

Je veux ajouter Poj comme connecteur dans Claude, pour l'utiliser depuis l'app Claude, y compris sur mobile et en vocal.

- Poj expose un serveur MCP distant (HTTP) à une URL publique.
- L'ajout du connecteur sur claude.ai déclenche une connexion OAuth avec mon compte Poj.
- Une fois ajouté sur claude.ai, le connecteur est disponible dans l'app Claude mobile.

## CL-2 — Capturer une carte

Je veux dire ou écrire à Claude, en langage naturel, un mot ou une phrase que je viens de rencontrer, pour en faire une carte sans effort.

- Exemple : « Ajoute *tenir pour acquis*, mon chef l'a dit en réunion à propos du budget. »
- Si le sens est ambigu (mot à plusieurs sens, contexte insuffisant), Claude **pose une question avant de proposer** une carte.
- Claude construit une proposition : français, anglais, contexte. Il récupère la traduction DeepL via Poj.
- **Si DeepL diverge** de sa proposition, Claude expose les deux options avec ses arguments, et c'est moi qui tranche.
- Claude **me relit la carte finale** et attend ma confirmation explicite avant de la créer (origine : Claude).
- Si une carte proche existe déjà, Claude me le signale et me demande si je veux quand même en créer une nouvelle.

## CL-3 — Capturer une expression entendue en anglais

Je veux ajouter une expression anglaise que j'ai entendue, pour apprendre ce que disent vraiment les anglophones.

- Exemple : « J'ai entendu *it's not rocket science* dans un podcast. »
- Ma restitution peut être inexacte. Claude vérifie d'abord que l'expression existe et est idiomatique. Sinon, il propose la forme correcte.
- Le reste du déroulé est celui de CL-2 (DeepL, relecture, confirmation).

## CL-4 — Réviser en conversation

Je veux réviser mes cartes dues en parlant avec Claude, pour valoriser un trajet en voiture.

- « On révise » lance la session. Claude présente les révisions dues une à une, selon l'ordre et la mise de côté de la spec.
- `fr_to_en` : Claude dit le français, je réponds en anglais. `en_to_fr` : Claude dit l'anglais, je réponds en français.
- Après ma réponse, Claude donne la réponse attendue et propose une note (*Again*, *Hard* ou *Good*) en tolérant synonymes et approximations.
- Claude enregistre la note (origine : Claude) et enchaîne avec la carte suivante, sans attendre mon accord.
- Je peux contester la note de la carte précédente (« compte-la fausse », « non, c'était juste ») : Claude la corrige, puis reprend. *Easy* n'est appliqué que si je le dis.
- « On arrête » met fin à la session à tout moment. Claude résume : nombre de cartes révisées et répartition des notes.

## CL-5 — Demander un indice

Je veux pouvoir demander un indice quand je bloque, pour ne pas rester sec au volant.

- « Un indice » : Claude donne le contexte d'origine de la carte, s'il existe.
- Une révision avec indice reçoit au mieux la note *Hard*. Le serveur l'applique, quelle que soit la note transmise par Claude.

## CL-6 — Rien à réviser

Je veux savoir quand rien n'est dû, et pouvoir réviser quand même.

- Claude indique qu'aucune révision n'est due et quand arrive la prochaine.
- Il propose de réviser en avance, avec le même déroulé que CL-4.
