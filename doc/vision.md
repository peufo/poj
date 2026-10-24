# Vision

## Le problème

J'apprends du vocabulaire anglais (depuis le français). Les mots et les phrases utiles surgissent dans des situations réelles, au moment où je n'ai ni carte en carton ni envie de remplir un formulaire. Et une fois les cartes créées, les réviser demande d'être assis devant un écran.

Les applications de flashcards existantes que j'ai essayées échouent sur deux points :

- **la saisie** n'est pas assez rapide ni assez naturelle pour capturer une expression sur le vif ;
- **la confiance** : une erreur de traduction (probablement faute de contexte) suffit à décourager de continuer.

Les cartes en carton fonctionnent, mais on ne les a pas sur soi, et elles ne permettent pas de valoriser des temps morts comme le trajet en voiture.

## La solution

Une application de flashcards à répétition espacée (FSRS, voir [specs/repetition.md](specs/repetition.md)), dont l'interface principale est **Claude**, via un serveur MCP :

- **capturer** une carte en langage naturel, à l'écrit ou à l'oral, au moment où la situation se présente ;
- **réviser** de manière conversationnelle, y compris à la voix, les mains sur le volant.

L'application reste **utilisable sans Claude**, via son interface web.

## Pour qui

Moi. Un seul utilisateur, pas d'intention de commercialisation à ce stade. Les choix techniques n'ont pas à anticiper le multi-utilisateur au-delà de ce que l'authentification fournit déjà.

## Ce que ce n'est pas

- Pas une application multilingue : une seule paire, français → anglais.
- Pas une app iOS native (voir [decisions.md](decisions.md)).
- Pas un produit commercial : pas d'onboarding, pas de monétisation, pas de partage de paquets.

## Principes

- **Le contexte d'origine fait partie de la carte.** Il lève l'ambiguïté à la création et sert d'indice à la révision.
- **On ne crée pas de carte fausse.** En pleine révision, je ne peux pas repérer une erreur dans une langue que j'apprends. La fiabilité se joue donc à la création.
- **L'audio compte, et c'est Claude qui le porte.** Le mode vocal sert à entendre et à dire l'anglais. L'application, elle, ne gère pas d'audio.
- **Une session dure le temps qu'on a.** Six minutes suffisent, et on peut s'arrêter à tout moment sans rien perdre.
