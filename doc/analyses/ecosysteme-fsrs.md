# Analyse : l'écosystème FSRS (awesome-fsrs)

Source : [open-spaced-repetition/awesome-fsrs](https://github.com/open-spaced-repetition/awesome-fsrs), consultée le 2026-10-24.

Deux questions distinctes :

1. **Quelle bibliothèque FSRS utiliser** si on construit l'application ?
2. **Une application existante rend-elle la construction inutile ?**

## 1. Bibliothèques

Notre serveur est en TypeScript (SvelteKit et Hono sous bun). Seules les implémentations utilisables depuis Node/bun sont pertinentes :

| Implémentation | Version FSRS | Rôle | Verdict |
| --- | --- | --- | --- |
| [ts-fsrs](https://github.com/open-spaced-repetition/ts-fsrs) | v6 | planificateur | **Retenu.** Officiel, TS natif, et utilisé par de nombreuses applications de la liste (MySummaries, Quanta, Read Frog, Rember, Gnoseed, Verbamor…). |
| [rs-fsrs-nodejs](https://github.com/open-spaced-repetition/rs-fsrs-nodejs) | v5 | planificateur (binding Rust) | Écarté : version plus ancienne, binaire natif à compiler, aucun gain pour nos volumes. |
| [fsrs-rs](https://github.com/open-spaced-repetition/fsrs-rs) / [fsrs-browser](https://github.com/open-spaced-repetition/fsrs-browser) | v6 | planificateur et **optimiseur** | Utile plus tard pour l'optimisation des paramètres. Le planificateur s'exécute côté serveur, pas dans le navigateur. |
| [py-fsrs](https://github.com/open-spaced-repetition/py-fsrs) / [fsrs-optimizer](https://github.com/open-spaced-repetition/fsrs-optimizer) | v6 | optimiseur | Alternative pour l'optimisation : un script ponctuel, lancé sur un export de l'historique, qui produit des paramètres à recopier dans la configuration. |

**Conclusion :** `ts-fsrs` pour la planification. L'optimisation viendra plus tard, hors ligne, sur l'historique exporté. C'est une raison de plus de conserver un historique complet des réponses.

## 2. Applications existantes

Critères, tirés de [vision.md](../vision.md) :

- **A.** Capture en langage naturel via Claude, et révision vocale avec Claude depuis le mobile (connecteur MCP **distant**).
- **B.** Révision dans les deux sens, contexte d'origine conservé.
- **C.** Contrôle de la fiabilité des cartes à la création.
- **D.** Coût, dépendance, réversibilité (export des données).

| Application | A | B | C | D | Verdict |
| --- | --- | --- | --- | --- | --- |
| **Flipnem** (web/PWA, FSRS-6, MCP) | MCP annoncé, mais transport distant/OAuth et liste d'outils **non documentés** | Compatible Anki (cartes inversées probables) | Non | Abonnement. En cas de résiliation, la bibliothèque est réduite à 3 paquets après 30 jours. Export `.apkg` | **Candidat à tester.** Le seul qui coche potentiellement A. |
| **Loudwalk** (iPhone/Mac, FSRS-6) | Pas de MCP. Révision vocale **sans Claude**, avec son propre tuteur (OpenAI). Une CLI permet à un agent d'écrire des cartes. | Oui (cartes Anki) | Non | 9,99 $/mois pour 2 000 révisions vocales. Export JSON/CSV/Anki | **Concurrent direct de l'usage voiture.** À essayer (essai de 7 jours, 150 cartes). |
| **spacedrep** (CLI + MCP, py-fsrs, MIT) | MCP **local** (stdio via `uvx`), inutilisable depuis Claude mobile | Oui (cartes inversées) | Non | Gratuit, SQLite au format Anki | Pas utilisable tel quel. **Bonne référence de conception** pour nos outils MCP. |
| **MemPro** | MCP pour Claude Code et Cursor | — | — | 15 $/mois | Écarté : exercices de programmation, pas de langues. |
| **Anki** | Les serveurs MCP communautaires passent par AnkiConnect, donc par Anki desktop allumé sur une machine. Inaccessible depuis Claude mobile sans bricolage réseau. | Oui | Non | Gratuit, standard de fait | Écarté pour l'usage Claude mobile. |

Aucune application ne couvre le critère C. C'est pourtant celui qui m'a fait abandonner la dernière application essayée.

## Idées à reprendre, qu'on construise ou non

- **Loudwalk : verdict sur le sens, note par règles déterministes.** L'IA juge le *sens* de la réponse, puis des règles fixes en déduisent *Again*, *Hard*, *Good* ou *Easy*. Appliqué à Poj : Claude rapporte des faits (juste ou faux, indice demandé, hésitation), et c'est le serveur qui calcule la note. Les notes deviennent cohérentes d'une session à l'autre, quelle que soit l'humeur du modèle.
- **spacedrep : un trio d'outils minimal** (`get_next_card`, `submit_review`, `get_card`), et le sens inverse d'une carte est mis de côté pendant 24 h après une révision. C'est notre règle « pas les deux sens coup sur coup », en plus robuste.
- **Tous : l'export au format Anki** (`.apkg` ou CSV). C'est une porte de sortie peu coûteuse si le projet s'arrête.
