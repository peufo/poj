---
id: T-0006
titre: Calendrier d'accomplissement des révisions, célébration et record de série
statut: pret
priorite: normale
story: doc/story/ajout-quotidien.md
plan_requis: true
modele: opus
effort: high
zones: [apps/web/src/lib/server/domain/reviews, apps/web/src/lib/server/domain/cards, apps/web/src/lib/components, apps/web/src/routes/(app), apps/web/DESIGN.md]
branche:
agent:
cree: 2026-10-29
maj: 2026-10-29
---

## Contexte
Ce ticket suit T-0001 (objectif quotidien d'ajout, série et calendrier `GoalCalendar` en tête de `/cards`). La gamification s'étend aux **révisions**, et deux leviers de motivation s'ajoutent. Voir la section « Suite » de `doc/story/ajout-quotidien.md`.

Le plan doit partir de l'état du code **après** l'intégration de T-0001 et de T-0003 (decks : les sens sont `a_to_b` et `b_to_a`).

## Règles
- **Jour de révision réussi**, en jour civil Europe/Zurich, si l'une de ces conditions est remplie :
  - chaque carte due ce jour-là a reçu au moins une réponse, quelle que soit la note : une carte notée *Again* qui revient dans la journée n'empêche pas le jour d'être réussi ;
  - 30 révisions au moins ont été faites dans la journée (plafond pour le retard accumulé).
- **Jour sans aucune carte due :** à trancher dans le plan, avec une recommandation (neutre, ou réussi).
- **Série :** même règle que pour les ajouts. Un jour manqué est toléré, deux d'affilée arrêtent la série, et aujourd'hui ne compte que s'il est réussi.
- **Toutes les révisions comptent,** sur le web comme par Claude, et tous les decks ensemble.
- **Leviers :**
  - un moment de célébration bref quand l'objectif du jour est atteint (ajout et révision) ;
  - le record de série affiché à côté de la série en cours (ajout et révision).
  - Pas de badges ni de trophées.

## Critères de fin
- [ ] Un service du domaine calcule le calendrier et la série des révisions. Il est couvert par des tests :
  - [ ] le cas « à jour » ;
  - [ ] une note *Again* suivie d'une reprise dans la journée ;
  - [ ] le plafond de 30 ;
  - [ ] le jour toléré et deux jours manqués ;
  - [ ] la limite à minuit à Zurich ;
  - [ ] les révisions faites par Claude.
- [ ] Le calendrier des révisions est visible sur le web, à côté de celui des ajouts. Le composant de T-0001 est réutilisé.
- [ ] Le record de série est affiché pour les ajouts comme pour les révisions.
- [ ] Un moment de célébration bref apparaît quand l'objectif du jour est atteint. Il ne revient pas à chaque chargement de page une fois vu, et il respecte `prefers-reduced-motion`.
- [ ] `apps/web/DESIGN.md` est amendé : célébration brève et record de série permis, ni badges ni trophées.
- [ ] Les tests passent.

## Plan
(à rédiger en MODE PLAN)

Points à trancher dans le plan, avec une recommandation :
- Le jour sans carte due.
- La définition exacte de « due ce jour-là » : les cartes dues à l'ouverture de la journée, ou celles devenues dues pendant la journée.
- L'endroit où la célébration se déclenche : fin de révision, après une création de carte, ou au chargement de `/cards`.

## Questions

## Journal
- 2026-10-29 — créé depuis la suite de la story ajout-quotidien. Part après T-0001 et T-0003.
