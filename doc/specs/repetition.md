# Spécification : répétition espacée (FSRS)

## Modèle

- Une **carte** contient un texte français, un texte anglais (mot ou phrase entière) et un contexte d'origine facultatif.
- Chaque carte porte **deux révisions indépendantes** :
  - `fr_to_en` : on voit le français, on produit l'anglais ;
  - `en_to_fr` : on voit l'anglais, on produit le français.
- Chaque révision a son propre état FSRS (stabilité, difficulté, échéance…). Réussir dans un sens ne fait pas progresser l'autre.
- **Chaque réponse est conservée** dans un historique : révision, date, note, origine (Claude ou web), et **état FSRS d'avant la réponse**. Cet historique sert aux statistiques, au diagnostic, à corriger la dernière note (voir plus bas), et plus tard à optimiser les paramètres FSRS sur mes propres données.
- Chaque carte porte aussi son origine (Claude ou web).
- **Indice :** chaque révision mémorise si un indice a été demandé depuis sa dernière réponse. C'est le domaine qui applique le plafond *Hard*, pour le web comme pour Claude.

## Algorithme

- FSRS via la bibliothèque [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs), avec ses paramètres par défaut et une rétention cible de 90 %.
- Une révision nouvellement créée est due immédiatement.
- La planification est entièrement déléguée à `ts-fsrs` : on lui donne l'état courant, la note et la date, et on stocke l'état qu'il renvoie.
- **Optimisation des paramètres :** hors périmètre pour l'instant. À envisager après quelques centaines de révisions (`@open-spaced-repetition/binding`).

## Notes

| Note    | Sens                                                     |
| ------- | -------------------------------------------------------- |
| *Again* | Faux, ou je ne sais pas.                                 |
| *Hard*  | Juste, mais avec un indice ou après une longue hésitation. |
| *Good*  | Juste.                                                   |
| *Easy*  | Trop facile.                                             |

- **Avec Claude :** Claude propose *Again*, *Hard* ou *Good* d'après la conversation, en tolérant synonymes, variantes et approximations. Il ne propose **jamais** *Easy*, qui ne s'applique que si je le demande (« trop facile »). Je peux contester la note avant de passer à la carte suivante. Seule la note finale est enregistrée.
- **Sur le web :** la réponse est affichée, puis je choisis l'une des quatre notes.
- **Indice :** demander le contexte d'origine pendant une révision entraîne au mieux la note *Hard*.

## Corriger la dernière note

- La **dernière** réponse d'une révision peut être corrigée dans l'heure qui suit : la note est remplacée, et l'état FSRS est recalculé à partir de l'état antérieur conservé dans l'historique.
- Le plafond *Hard* lié à l'indice s'applique toujours.
- Avec Claude, la note est enregistrée d'office et je conteste ensuite ([specs/mcp.md](mcp.md#déroulé-dune-révision-vocale)). Sur le web, c'est un bouton pendant la révision ([WEB-7](../stories/web.md#web-7--réviser)).

## Sessions

- Une session est une suite de révisions dues, présentées une à une. Ce n'est pas une entité persistée : il n'y a ni début ni fin à enregistrer.
- **Chaque réponse est enregistrée immédiatement.** Interrompre une session (arrivée à destination, appel) ne perd rien et ne pénalise rien.
- **Ordre de présentation :** les révisions les plus en retard d'abord.
- **Mise de côté du sens inverse :** quand une carte vient d'être révisée dans un sens, l'autre sens n'est pas présenté avant 24 heures, même s'il est dû. Sinon, la seconde révision révélerait la réponse de la première. L'idée vient de spacedrep.
- **Compteurs :** ils ne comptent que ce qui sera réellement présenté.
  - Révisions restantes d'une session : au plus une par carte, car répondre à un sens mettra l'autre de côté ; les sens déjà mis de côté sont exclus.
  - Dues aujourd'hui et échéancier : un sens mis de côté compte au jour où sa mise de côté se termine, s'il est encore dû. Quand les deux sens d'une carte viendraient à moins de 24 heures d'intervalle, le second compte 24 heures après le premier.
- **Révision en avance :** quand rien n'est dû, on peut réviser les prochaines révisions à venir. FSRS tient compte du temps réellement écoulé ; une révision anticipée fait peu progresser la carte, mais ne fausse rien.

## Affichage de la progression

Les notions de stabilité et de difficulté ne sont pas exposées telles quelles. On montre plutôt la prochaine échéance (« dans 12 jours ») et une indication simple de maîtrise. Le libellé exact reste à définir.
