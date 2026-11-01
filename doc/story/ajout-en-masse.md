# Story : ajouter beaucoup de cartes d'un coup

Statut : validée le 2026-11-01. Tickets : t29, t31, t30 (plus tard).

## Le problème

Aujourd'hui, une carte s'ajoute une à une, avec une confirmation à chaque fois. Remplir un deck de sujet (par exemple « Géographie », avec ~200 pays) ou absorber une page de cours devient fastidieux. Le développeur veut que l'assistant IA absorbe des sources variées (photo d'une page de cours, Wikipedia, fichier…) puis fasse des appels MCP propres, et que l'application gère le remplissage rapide d'un deck sans le rendre décourageant.

Remarque d'origine (2026-10-31) : « si les premières révisions des cartes sont correctement lissées dans le temps, ça peut, à l'inverse, être une super source de motivation. »

## Volets proposés

1. **Web :** importer un CSV ou le contenu du presse-papiers, avec mise en correspondance des colonnes.
2. **MCP :** un ajout en lot.
3. **Domaine :** les premières révisions d'un lot sont lissées dans le temps.

## Coût (enquête du 2026-11-01)

- **Aujourd'hui, une carte neuve est due immédiatement** (`cards.service.ts:42-45`), avec une révision par sens (2 pour un deck à deux sens). `next` prend la plus ancienne échéance, sans distinguer neuves et dues (`reviews.service.ts:129-143`). Il n'existe **aucune limite de nouvelles cartes**. Un lot de 200 cartes crée donc 200 à 400 révisions dues d'un coup, ce qui menace aussi la partie « révision » de la journée et la série (`review-day.ts`, à confirmer).
- **Objectif d'ajout :** compte les cartes par `createdAt` et par jour civil (`daily-goal.service.ts:62-135`). Un lot de 200 cartes marque un seul jour « atteint », rien de plus.
- **MCP :** `create_card` crée une carte par appel ; `check_card` fait 2 appels DeepL par carte de langue. Le vrai frein d'un lot est la consigne de confirmation explicite avant **chaque** `create_card`. Pas de limite de débit (t19 ne limite que la longueur).
- **Contrat :** les cartes ne sont pas dans l'OpenAPI, l'app iOS n'est pas concernée.
- **Coût des options :**
  - (a) limite de nouvelles cartes par jour, appliquée à la révision : 1 migration (réglage), ~8-12 fichiers, touche le cœur de `next` (partagé web et MCP) ;
  - (b) échéances étalées à l'insertion : pas de migration, ~3-5 fichiers, mais figé à l'insertion ;
  - (c) import web CSV / presse-papiers avec mise en correspondance : le plus gros, ~8-15 fichiers, sans migration.

## Décisions remises en cause

- `decks.md`, 2026-10-29 : « pas d'import de gros deck tout fait » (décourageant, peu personnel ; les cartes naissent de situations réelles).
- `connexion-assistants.md`, 2026-10-29 : ajout groupé MCP rejeté (« pas un usage réel »).

## Questions ouvertes

- Atomicité d'un lot rejoué après une erreur partielle : tranchée au plan de t31.

## Décisions remises en cause

- `decks.md`, 2026-10-29 : « pas d'import de gros deck tout fait » (décourageant, peu personnel ; les cartes naissent de situations réelles).
- `connexion-assistants.md`, 2026-10-29 : ajout groupé MCP rejeté (« pas un usage réel »).

## Questions ouvertes

Contre-lecture à froid (ork:critic, 2026-11-01), à trancher :
- **Les cartes neuves retenues par la limite ne doivent pas être « dues ».** La journée de révision compte comme due toute carte échue à minuit, neuves comprises (`review-day.ts:33-36`, `95-104`) ; une carte neuve est due dès sa création (`cards.service.ts:42-45`). Sans règle commune, un lot casserait la journée et la série, et stats / horizon / `nextDue` afficheraient 200 à 400 révisions. Proposition : une seule règle de présentation partagée par `countDue`, `next` (et `ahead`), `nextDue`, stats/horizon et la journée de révision ; une carte neuve au-delà du quota est un stock, pas une dette.
- **Unité de la limite.** Le second sens est mis de côté 24 h et revient le lendemain encore neuf (`availability.ts:7`, `reviews.service.ts:64-79`). Proposition : compter des cartes (première réponse, quel que soit le sens), par jour civil Europe/Zurich, le second sens hors quota ; préciser l'effet de `ahead`.
- **Le lot doit aussi vérifier en lot.** La consigne impose `check_card` avant chaque création (`mcp/server.ts:119`, `133-144`) : 50 cartes de langue = 50 appels et 100 appels DeepL. Sur t8, `FACT_CHECK` demande une recherche par carte, et `REAL_SITUATION` interdit les cartes génériques, ce qui contredit un deck de 200 pays. Une confirmation de 50 cartes heurte l'usage vocal. Proposition : vérification portée par le lot (ne renvoyer que doublons et divergences DeepL), révision de `REAL_SITUATION` dans t31, et confirmation sur un résumé (nombre, deck, doublons, divergences, quelques exemples).
- Doutes du critique : atomicité d'un lot rejoué après une erreur partielle ; la source mise dans le contexte est lue comme indice par `get_hint` (concerne t8).

## Décisions

- **2026-11-01 : l'ajout en masse est admis.** Les décisions du 2026-10-29 sont révisées : « pas d'import de gros deck » (`decks.md`) et le rejet de l'ajout groupé MCP (`connexion-assistants.md`).
  - *Raison :* remplir un deck de sujet ou absorber une source (cours, Wikipedia) carte par carte ne tient pas ; c'est l'assistant qui absorbe les sources, et un afflux bien lissé peut motiver au lieu de décourager.
- **2026-11-01 : le lissage se fait au moment de la révision**, par une limite de nouvelles cartes par jour, et non par des échéances étalées à l'insertion.
  - *Raison :* vaut pour toutes les sources (web, MCP, saisie), se règle et se défait sans toucher aux données, et protège la révision du jour et la série.
  - *Rejeté :* étaler les échéances à l'insertion (moins cher, mais figé dans les données).
- **2026-11-01 : première version = lot MCP + limite. L'import web (CSV, presse-papiers, mise en correspondance des colonnes) viendra plus tard**, dans un ticket séparé (t30).
  - *Raison :* Claude sait déjà lire un fichier ou un texte collé ; l'écran de mise en correspondance est la pièce la plus chère. L'app devra quand même l'intégrer à terme.
- **2026-11-01 : l'objectif d'ajout quotidien reste tel quel.** Un lot marque simplement le jour comme atteint.
  - *Raison :* l'impact se limite à un jour. L'objectif perd un peu de sa pertinence avec les lots, sans solution évidente pour l'instant.

- **2026-11-01 : la limite de nouvelles cartes est par deck**, 10 par jour par défaut, réglable dans les réglages du deck.
  - *Raison :* une limite globale laisserait un gros deck de sujet bloquer les nouvelles cartes d'un autre deck pendant des semaines.
  - *Rejeté :* une limite globale dans les réglages du compte.
- **2026-11-01 : le lot MCP passe par un outil `create_cards`**, plafonné (~50 cartes par appel), avec une seule confirmation de l'utilisateur pour tout le lot.
  - *Raison :* 200 appels `create_card` à la suite sont longs et coûteux en contexte.
  - *Rejeté :* la consigne seule, avec `create_card` en boucle.

- **2026-11-01 : une carte neuve au-delà du quota est un stock, pas une dette** (contre-lecture ork:critic). Une seule règle de présentation, partagée par `countDue`, `next` (et `ahead`), `nextDue`, stats / horizon et la journée de révision.
  - *Raison :* sinon les cartes retenues restent « dues » sans être présentées, et un lot casse la journée et la série.
- **2026-11-01 : la limite compte des cartes** (première réponse, quel que soit le sens), par jour civil Europe/Zurich ; le second sens d'un deck à deux sens est hors quota.
  - *Raison :* sinon le second sens, qui revient neuf le lendemain, mange le quota (≈ 5 cartes par jour).
- **2026-11-01 : le lot vérifie en lot.** La vérification (doublons, divergences DeepL pour une langue) porte sur tout le lot et ne renvoie que les problèmes ; la confirmation porte sur un résumé (nombre, deck, doublons, divergences, quelques exemples), compatible avec la voix. La règle « pas de carte générique » de t8 est révisée dans t31 pour admettre un lot tiré d'une source (ex. 200 pays).
  - *Raison :* sinon 50 cartes de langue = 50 appels d'outil et 100 appels DeepL, et la règle de t8 interdirait le cas d'usage.

## Hors périmètre

- Import web CSV / presse-papiers (t30, plus tard).
