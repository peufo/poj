# Story : ajouter des cartes chaque jour

Statut : validée le 2026-10-29. Tickets : T-0001, T-0002.

## Le problème

Le stock de cartes ne grossit que lorsque j'y pense. Sans rythme, l'ajout s'arrête, et la révision finit par tourner à vide. L'idée : un objectif quotidien (par exemple 2 cartes par jour) et un calendrier d'accomplissement qui incite à ne pas rater un jour.

Les cartes que je propose moi-même sont les meilleures, parce qu'elles sont rattachées à une situation réelle (voir le principe « le contexte d'origine fait partie de la carte » dans [vision.md](../vision.md)). Quand l'inspiration manque, Claude m'aide à retrouver ces situations, grâce à son contexte ou en discutant. Il ne fournit pas de cartes toutes faites.

## Version retenue

- **Objectif quotidien :** un nombre de cartes à ajouter par jour (2 par défaut), modifiable sur le web.
- **Série :** un nombre de jours consécutifs où l'objectif est atteint. Un jour manqué est toléré : la série continue. Deux jours manqués d'affilée l'arrêtent.
- **Calendrier d'accomplissement** sur le web : c'est une gratification visuelle. Claude n'annonce pas l'état de l'objectif.
- **Ce qui compte, c'est l'acte d'ajouter :** une carte supprimée après coup compte toujours pour le jour où elle a été créée.
- **Inspiration par Claude :** quand je manque d'idées, Claude m'interroge sur des situations réelles (ma journée, ce que j'aurais voulu dire en anglais) ou s'appuie sur ce qu'il sait de moi, pour en tirer une carte. La carte suit ensuite le déroulé habituel de capture (CL-2) : vérification DeepL, relecture et confirmation.

## Décisions

- **2026-10-29 : un jour manqué toléré, deux arrêtent la série.**
  - *Raison :* une série stricte décourage. Un seul jour de tolérance suffit, sans mécanique de jokers à gérer.
  - *Rejeté :* les jokers, et l'objectif hebdomadaire.
- **2026-10-29 : pas de notification.**
  - *Raison :* la série fonctionne sans rappel. On ne rouvre pas l'app iOS pour ça.
- **2026-10-29 : de l'inspiration plutôt que des suggestions.**
  - *Raison :* une carte suggérée « selon mon niveau » n'a pas de situation réelle. Elle serait moins bonne, et elle coûterait des révisions pendant des mois.
  - *Rejeté :* les suggestions de cartes selon le niveau.
- **2026-10-29 : l'état de l'objectif n'est visible que sur le web.**
  - *Raison :* c'est une gratification visuelle. Dans Claude, l'annonce serait du bruit.
- **2026-10-29 : les cartes supprimées comptent.**
  - *Raison :* ce qui compte, c'est l'acte d'ajouter une carte.
- **2026-10-29 : l'objectif est modifiable dès la V1.**
  - *Raison :* une migration ne fait pas peur à ce stade.

## Coût (enquête du 2026-10-29)

- Le calendrier se calcule depuis `cards.createdAt`, il n'y a pas besoin de nouvelle table. Le fuseau est fixe (`Europe/Zurich`, `domain/time.ts`).
- Il n'existe aucun réglage utilisateur. Un objectif constant ne demande aucune migration. Le rendre réglable demande une colonne sur `users`, avec `additionalFields` de Better Auth.
- Côté MCP, il y a 6 outils et des `INSTRUCTIONS` serveur. `create_card` ne renvoie pas encore l'état de l'objectif.
- Sur le web, il n'y a pas de tableau de bord (`/` redirige vers `/cards`).
- Version minimale : environ 1 à 2 jours, sans migration ni changement du contrat OpenAPI.

## Hors périmètre

- Les suggestions de cartes selon le niveau, et un outil `list_cards`.
- Les notifications et rappels.
- Les jokers et l'objectif hebdomadaire.
- L'annonce de l'objectif ou de la série par Claude.

## Suite (2026-10-29) : calendrier des révisions et leviers de motivation

Le développeur veut aussi un calendrier d'accomplissement pour les révisions, et compte sur les leviers connus de la dopamine, puisqu'ils servent ici quelque chose d'utile. Ticket : T-0006.

### Décisions

- **Un jour de révision réussi, c'est être « à jour » :** chaque carte due ce jour-là a reçu au moins une réponse.
  - *Raison :* c'est ce dont FSRS a besoin. Un nombre de révisions récompenserait le volume, pas la régularité.
- **Une réponse compte, quelle que soit sa note.** Une carte notée *Again* qui revient dans la journée n'empêche pas le jour d'être réussi.
  - *Raison :* sinon, le calendrier pousse à noter *Good* par complaisance, ce qui fausse FSRS.
- **Le retard a un plafond.** Au-delà de 30 révisions dans la journée, le jour est réussi même s'il reste des cartes dues.
  - *Raison :* après une absence, un jour impossible décourage.
- **La série tolère un jour manqué**, comme pour les ajouts.
- **Deux leviers seulement :**
  - un moment de célébration bref quand l'objectif du jour est atteint ;
  - le record de série, affiché à côté de la série en cours.

  On amende `DESIGN.md` en conséquence.
  - *Rejeté :* les badges et les trophées à collectionner, parce qu'ils récompensent l'accumulation plutôt que l'habitude.
