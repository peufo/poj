---
id: T-0004
titre: Interface web multi-decks (navigation, création de deck, révision par deck)
statut: pret
priorite: normale
story: doc/story/decks.md
plan_requis: true
modele: opus
effort: high
zones: [apps/web/src/routes/(app), apps/web/src/lib/components, apps/web/src/lib/server/domain/decks, apps/web/src/lib/server/domain/reviews]
branche:
agent:
cree: 2026-10-29
maj: 2026-10-29
---

## Contexte
Ce ticket fait suite à T-0003, qui ouvre le modèle : il crée l'entité Deck avec son type (langue ou sujet), sa paire de langues, le nom de ses faces et l'option « réviser dans les deux sens ». T-0004 ajoute l'**interface web** multi-decks. Voir la story `doc/story/decks.md`.

Capture du développeur : `doc/tickets/captures/2026-10-29-nav-cartes.png`. La navigation affiche aujourd'hui « Cartes 1 » puis « + Nouvelle carte ». L'entrée générique « Cartes » doit être remplacée par le nom du deck.

Le plan doit partir de l'état du code **après** l'intégration de T-0003 (et de T-0001, avec le calendrier en tête de `/cards`).

## Critères de fin
- [ ] La navigation liste chaque deck sous son nom, avec son nombre de cartes, à la place de « Cartes ».
- [ ] On peut créer un deck depuis le web :
  - [ ] un nom ;
  - [ ] un type, langue ou sujet ;
  - [ ] pour une langue : la langue connue et la langue apprise ;
  - [ ] pour un sujet : le nom des deux faces, « Question » / « Réponse » par défaut ;
  - [ ] l'option « réviser dans les deux sens », vraie par défaut pour une langue.
- [ ] Une nouvelle carte se crée dans un deck choisi : celui en cours, ou un choix explicite. Le formulaire affiche les noms des faces du deck. La suggestion DeepL n'apparaît que pour un deck de langue.
- [ ] La révision se lance de deux façons :
  - [ ] l'entrée « Réviser » globale, qui mélange tous les decks ;
  - [ ] un bouton « Réviser » sur chaque deck, qui ne propose que ses cartes.
- [ ] Le suivi (objectif quotidien, série, calendrier de T-0001) reste global.
- [ ] Le comportement est inchangé pour un utilisateur qui n'a que le deck par défaut.
- [ ] Les tests passent.

## Plan
(à rédiger en MODE PLAN)

À inclure, selon le plan de T-0003 :
- le changement de l'option « réviser dans les deux sens » d'un deck ;
- le filtre commun qui exclut les b_to_a d'un deck à sens unique ;
- la création des b_to_a manquantes lors du passage de faux à vrai.

Points à trancher dans le plan, avec une recommandation :
- La modification et la suppression d'un deck sont-elles dans ce ticket ? Que deviennent les cartes d'un deck supprimé ?
- Le routage : `/decks/[id]` ou un paramètre sur `/cards` ?
- Le choix des langues : une liste fermée (celles de DeepL), ou une saisie libre ?

## Questions

## Journal
- 2026-10-29 — créé depuis la story decks. Part après T-0003.
