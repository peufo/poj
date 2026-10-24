# User stories : application web (jalon 1)

Règles de répétition : voir [specs/repetition.md](../specs/repetition.md).

## WEB-1 — Accès réservé

Je veux être le seul à pouvoir accéder à Poj, pour que mes cartes restent privées.

- Toutes les pages sauf la connexion exigent d'être connecté.
- **Premier lancement :** tant qu'aucun compte n'existe, la page de connexion est remplacée par un formulaire de création de compte.
- Dès qu'un compte existe, l'inscription est refusée **côté serveur** (et pas seulement masquée dans l'interface), y compris par un appel direct à l'endpoint d'inscription de Better Auth.
- Les mêmes règles valent pour l'API `/api/v1`.

## WEB-2 — Créer une carte

Je veux créer une carte avec un formulaire simple, pour pouvoir capturer sans Claude.

- Champs : **français** (obligatoire), **anglais** (obligatoire), **contexte d'origine** (facultatif, texte libre).
- Une action « Traduire avec DeepL » affiche la traduction DeepL du français, avec le contexte s'il est renseigné. Je peux la reprendre dans le champ anglais d'un clic, ou l'ignorer.
- La suggestion DeepL n'est jamais enregistrée automatiquement, et la carte n'a aucun statut particulier.
- À l'enregistrement, la carte reçoit ses deux révisions (`fr_to_en` et `en_to_fr`), dues immédiatement.
- **Doublon :** si une carte non supprimée a déjà le même texte anglais (casse et espaces ignorés), le formulaire m'en avertit avec un lien vers elle. Je peux enregistrer quand même : une même expression peut avoir un autre sens dans un autre contexte.

## WEB-3 — Lister mes cartes

Je veux voir toutes mes cartes, pour vérifier que mon paquet est en ordre.

- Liste des cartes non supprimées, des plus récentes aux plus anciennes : français, anglais, et prochaine échéance de chaque sens.
- Recherche texte sur le français, l'anglais et le contexte.
- En tête de liste : le nombre total de cartes et le nombre de révisions dues aujourd'hui.

## WEB-4 — Consulter une carte

Je veux voir le détail d'une carte, pour comprendre où elle en est.

- Français, anglais, contexte, date de création et origine (web ou Claude).
- Pour chaque sens : prochaine échéance (« dans 12 jours »), nombre de révisions, dernière note.
- Historique complet des réponses : date, sens, note, origine (web ou Claude).

## WEB-5 — Modifier une carte

Je veux corriger une carte, pour réparer une erreur que j'aurais repérée.

- Mêmes champs et même suggestion DeepL qu'à la création.
- Si le texte **français ou anglais** change, la progression FSRS des deux sens est réinitialisée : ils redeviennent neufs et dus immédiatement. L'historique des réponses est conservé. Le formulaire m'en avertit avant l'enregistrement.
- Modifier seulement le contexte ne change pas la progression.

## WEB-6 — Supprimer une carte

Je veux supprimer une carte, pour qu'elle ne revienne plus en révision.

- Suppression logique (`deletedAt`) : la carte disparaît de la liste, de la recherche et des sessions.
- Confirmation demandée avant suppression.

## WEB-7 — Réviser

Je veux réviser mes cartes dues dans le navigateur, pour apprendre sans Claude.

- La page affiche le nombre de révisions dues, puis les présente une à une, dans l'ordre et avec la mise de côté décrits dans la spec.
- Chaque révision montre la face de question : le français pour `fr_to_en`, l'anglais pour `en_to_fr`.
- **Indice :** une action « Voir le contexte » est disponible si la carte en a un. Une fois le contexte affiché, seules les notes *Again* et *Hard* restent possibles.
- « Afficher la réponse » révèle l'autre face et le contexte, puis propose les quatre notes : *Again*, *Hard*, *Good*, *Easy*.
- Chaque note est enregistrée immédiatement (origine : web). Je peux quitter la page à tout moment sans rien perdre.

## WEB-8 — Rien à réviser

Je veux pouvoir réviser quand même quand rien n'est dû, pour profiter d'un moment libre.

- Quand aucune révision n'est due, la page l'indique avec la date de la prochaine échéance.
- Elle propose de « Réviser en avance » les prochaines révisions à venir, avec le même déroulé que WEB-7.
