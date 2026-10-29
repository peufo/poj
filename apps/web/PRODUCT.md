# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

SvelteKit 3 + Svelte 5 (runes), déjà en place ; Tailwind 4 installé par le scaffold. Le choix de l'approche de style (Tailwind, CSS vanilla, ou hybride) et l'architecture des composants d'interface sont **délégués** : à trancher pendant l'initialisation du design et à consigner dans DESIGN.md.

## Users

Un seul utilisateur : l'auteur, francophone qui apprend le vocabulaire anglais (mots et phrases entières). Il capture des expressions rencontrées dans des situations réelles et les révise par petites sessions. Sur le web, il utilise **d'abord le téléphone** (navigateur mobile, temps morts, souvent d'une main) ; l'ordinateur sert surtout à vérifier que le paquet est en ordre.

## Product Purpose

Poj est une application de flashcards à répétition espacée (FSRS), français → anglais, dont l'interface principale à terme est Claude (serveur MCP : capture en langage naturel, révision à la voix). L'interface web (jalon 1) doit permettre de tout faire sans Claude — créer, lister, consulter, modifier, supprimer, réviser — et surtout de **voir que tout est en ordre** : cartes, échéances, historique.

Succès : capturer une carte en quelques secondes, réviser six minutes et s'arrêter sans rien perdre, et avoir confiance dans chaque carte.

## Positioning

Une carte fausse ne doit jamais exister : la fiabilité se joue à la création (contexte d'origine, second avis DeepL, relecture par Claude), pas en révision. Le contexte d'origine fait partie de la carte : il lève l'ambiguïté à la création et sert d'indice à la révision. Chaque carte se révise dans les deux sens, avec des états FSRS indépendants.

## Operating Context

- Révision au téléphone dans des temps morts ; à la voix au volant (via Claude, hors web).
- Sessions de durée libre : pas de début ni de fin, chaque note est enregistrée immédiatement.
- Le web est purement textuel : aucun audio (l'audio passe exclusivement par Claude).
- Cartes créées depuis deux origines : web (formulaire) et Claude (MCP) ; l'origine est visible.

## Capabilities and Constraints

- Carte : français (obligatoire), anglais (obligatoire), contexte d'origine (facultatif, texte libre).
- Deux révisions par carte : `fr_to_en` et `en_to_fr`.
- Notes FSRS : _Again_, _Hard_, _Good_, _Easy_. Après l'indice (« Voir le contexte »), seules _Again_ et _Hard_ restent possibles.
- Corriger la dernière note : dernière réponse uniquement, dans l'heure.
- Mise de côté du sens inverse pendant 24 h ; ordre : les plus en retard d'abord.
- Rien à réviser : afficher la prochaine échéance et proposer « Réviser en avance ».
- Création : suggestion DeepL reprenable d'un clic, jamais enregistrée d'office ; avertissement de doublon (même anglais) avec lien, enregistrement possible quand même.
- Modifier le français ou l'anglais réinitialise la progression des deux sens (avertissement avant enregistrement) ; modifier le contexte seul ne change rien.
- Suppression logique avec confirmation.
- Liste : recherche texte, total de cartes et révisions dues aujourd'hui en tête.
- Détail : échéance relative par sens (« dans 12 jours »), nombre de révisions, dernière note, historique complet (date, sens, note, origine).
- Progression : stabilité et difficulté ne sont pas exposées ; on montre l'échéance et une indication simple de maîtrise (libellé **à définir**).
- Accès réservé à un compte unique, créé au premier lancement.
- Interface en français.

## Brand Commitments

- Nom : **Poj**, sans signification imposée ; identité entièrement à créer.
- **Thèmes sombre et clair à égalité**, suivant le système. Le dark mode est l'exigence principale de l'utilisateur : il doit être conçu, pas dérivé.
- **Le standard du genre, exécuté avec soin**, choisi délibérément plutôt qu'un monde visuel singulier. Barre de finition : **Linear** et **Things 3**.
- À éviter (confirmé) : le décoratif qui ralentit une révision, et le look back-office.

## Evidence on Hand

Aucun asset de marque (le favicon actuel est celui du scaffold Svelte). Pas de vraies cartes en base : les maquettes utilisent des cartes d'exemple, signalées comme telles.

## Product Principles

1. **On ne crée pas de carte fausse.** L'interface de création sert la vérification avant la vitesse apparente.
2. **Le contexte fait partie de la carte.** Il est visible, et son usage comme indice a un coût explicite.
3. **Une session dure le temps qu'on a.** Rien à terminer, rien à perdre, on part quand on veut.
4. **Voir que tout est en ordre.** Échéances, historique et origine sont lisibles sans jargon FSRS.
5. **Un seul utilisateur.** Pas d'onboarding, pas de gamification, pas de partage.

## Accessibility & Inclusion

Usage à une main sur téléphone : cibles tactiles généreuses, actions de révision à portée du pouce. Contrastes conformes WCAG AA dans les deux thèmes.
