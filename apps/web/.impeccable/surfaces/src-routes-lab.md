---
version: 1
slug: 'src-routes-lab'
primary_target: 'src/routes/lab'
related_targets: ['src/routes/(app)', 'src/routes/(auth)']
---

# Surface brief : application web Poj (jalon 1) et route /lab

Scope : le shell de l'app (`(app)`, `(auth)`) et ses écrans clés — Cartes (le paquet), détail d'une carte, création/modification, révision —, maquettés dans `/lab` avec le matériel du design system. Mode : **Operate**.

Audience et tâche : un seul utilisateur, téléphone d'abord, sessions de quelques minutes ; vérifier que le paquet est en ordre, capturer une carte, réviser au pouce. Moment clé : **le paquet**. À éviter (confirmé) : le décoratif qui ralentit une révision, et le look back-office. Thèmes clair et sombre à égalité, suivant le système.

Direction : le standard du genre, choisi délibérément. Barre de finition : **Linear** et **Things 3**.

## Direction contract

THESIS: Poj possède « voir que tout est en ordre » : le paquet se lit comme un échéancier calme de deux sens par carte. Il refuse le tableau de bord gamifié à streaks et la table grise de back-office.

OWN-WORLD: police système (SF sur iPhone), neutres froids légèrement teintés en paliers de surfaces, un seul accent indigo pour l'action, la sélection et le « dû » ; quatre teintes réservées aux notes (Again, Hard, Good, Easy). Tokens `light-dark()` conçus par paires, rayons 10 px, filets d'un pixel, ombres douces seulement sur ce qui flotte.

STORY: j'ouvre Poj au téléphone, je vois combien de révisions sont dues et l'horizon des quatorze prochains jours, je fais confiance aux échéances des deux sens, je lance la révision d'un geste, je note au pouce et je pars quand je veux.

FIRST VIEWPORT: Cartes à 390 px : grand titre « Cartes » avec le total, ligne « 12 dues aujourd'hui » et bouton principal « Réviser » à droite ; horizon de 14 barres sur toute la largeur (aujourd'hui marqué, un jour touché filtre la liste) ; barre de maîtrise ; recherche ; premières lignes FR / EN avec leurs deux échéances. Barre d'onglets en bas : Réviser (pastille), Cartes, Nouvelle.

FORM: le standard du genre (canon), hors de ma liste ordonnée ; seed e1f5184d. Interaction signature : toucher un jour de l'horizon filtre la liste à ses cartes dues. Grammaire du mouvement : 150 à 220 ms, ease-out, changements d'état uniquement.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Décisions ouvertes

- Libellé de maîtrise : proposition dans le lab (Nouvelle, En cours, Acquise, Solide), à valider.
