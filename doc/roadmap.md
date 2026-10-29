# Feuille de route

## Jalon 1 — Web : gérer et réviser mes cartes

Objectif : pouvoir tout faire sans Claude, et **voir que tout est en ordre** (cartes, échéances, historique). Plan : [plans/jalon-1.md](plans/jalon-1.md).

- Accès réservé à mon compte : [WEB-1](story/web.md#web-1--accès-réservé)
- Créer, lister, consulter, modifier et supprimer des cartes, avec la suggestion DeepL à la création : [WEB-2 à WEB-6](story/web.md)
- Réviser avec FSRS : [WEB-7](story/web.md#web-7--réviser), [WEB-8](story/web.md#web-8--rien-à-réviser)

## Jalon 2 — Claude : capturer et réviser en conversation

Objectif : capturer une carte sur le vif, et réviser à la voix dans la voiture. Spec : [specs/mcp.md](specs/mcp.md).

- Mettre Poj en ligne sur poj.ch (prérequis du connecteur) : [deploiement.md](deploiement.md)
- Connecter Claude à Poj (MCP distant et OAuth) : [CL-1](story/connecteur-claude.md#cl-1--connecter-claude-à-poj)
- Capturer une carte en langage naturel, avec vérification : [CL-2](story/connecteur-claude.md#cl-2--capturer-une-carte), [CL-3](story/connecteur-claude.md#cl-3--capturer-une-expression-entendue-en-anglais)
- Réviser en conversation : [CL-4 à CL-6](story/connecteur-claude.md)

## Plus tard

- Export des données (Anki, CSV).
- Optimisation des paramètres FSRS sur mon historique.
- Wiktionary comme troisième source de vérification.
- App iOS (gelée).
