# Story : connecter son assistant

Statut : validée le 2026-10-29. Tickets : T-0007, T-0008 (qui absorbe T-0002), T-0009.

## Le problème

Le développeur ne sait pas comment chaque fournisseur distribue les connecteurs MCP. Il veut deux choses :
- **une marche à suivre très simple sur le site :** on choisit son fournisseur (Anthropic, OpenAI), puis on connecte Poj ;
- **un comportement de l'assistant :** lancer les sessions de révision de manière fluide, et proposer d'ajouter des cartes.

Les deux doivent fonctionner aussi bien chez Anthropic que chez OpenAI.

## Faits (recherche web du 2026-10-29, à confirmer sur les docs officielles)

- **Claude :**
  - un connecteur personnalisé s'ajoute par son URL (Customize → Connectors), avec OAuth et DCR ; c'est déjà le cas de Poj (CL-1) ;
  - d'après un guide tiers, il est disponible dans tous les plans, avec un seul connecteur personnalisé en Free ;
  - il s'ajoute sur le web, puis s'utilise sur mobile, et le mode vocal l'utilise (validé avec Basic Memory) ;
  - les prompts MCP sont pris en charge. On ne sait pas comment Claude.ai exploite les `instructions` du serveur.
- **ChatGPT :**
  - les connecteurs MCP personnalisés passent par le « Developer mode » (bêta, d'abord sur le web), réservé aux plans payants ; les sources ne s'accordent pas sur la liste exacte des plans ;
  - le serveur doit être distant, avec OAuth 2.1 et DCR ;
  - le connecteur s'active conversation par conversation ;
  - **le mode vocal ne semble pas prendre en charge les connecteurs MCP** : c'est ce que rapportent des utilisateurs du forum OpenAI, sans confirmation officielle.

## Coût multi-utilisateur (enquête du 2026-10-29)

- **Isolation des données :** aucun trou trouvé.
  - Le domaine filtre par propriétaire, y compris le SQL brut.
  - Les actions web passent par `ownerOf(locals)`.
  - Le MCP utilise `sub` du JWT.
  - L'API REST v1 est vide.
- **Compte unique :** le hook `user.create.before` (`single-account.ts`) refuse toute création dès qu'un compte existe. Il refuserait aussi `admin.createUser`, il faut donc revoir la règle.
- **Plugin `admin` de Better Auth (1.7.12) :** il est disponible. Il ajoute des colonnes à `users` (role, banned…) et à `sessions` (impersonated_by), donc il faut une migration.
- **Aucun envoi d'e-mail n'est configuré.** Le lien magique et la réinitialisation de mot de passe supposent un e-mail.
- **Ressources partagées :** une seule clé DeepL et le fuseau Europe/Zurich, écrit en dur (ce qui va pour des proches en Suisse).
- **Connecteur Claude :** un deuxième utilisateur peut l'ajouter avec son propre compte, sans autre réglage (non testé en réel).
- **Coût :** moyen, 1 à 2 jours, avec une migration.

## Questions ouvertes


## Décisions

- **2026-10-29 : Poj s'ouvre bientôt à l'entourage du développeur.** C'est d'abord pour moi, mais des testeurs viendront rapidement. Les inscriptions restent fermées : un administrateur root ajoute les comptes à la main depuis une page d'admin.
  - *Écart :* cela revient sur la vision (« pour moi ») et sur la décision « compte unique » du 2026-10-24.
  - *Pas encore :* le partage de la clé DeepL.
- **2026-10-29 : Claude seulement pour l'instant.** La marche à suivre et le comportement visent Claude. ChatGPT est reporté, notamment parce que son mode vocal ne prendrait pas en charge les connecteurs MCP.
- **2026-10-29 : un testeur accède par un lien d'invitation à usage unique.** La page d'admin génère le lien, et je le transmets moi-même (WhatsApp, SMS). Le testeur choisit son mot de passe en ouvrant le lien.
  - *Raison :* aucun envoi d'e-mail n'est configuré, et aucun mot de passe ne circule.
  - *Rejeté :* le mot de passe provisoire, et l'envoi d'e-mails (magic link, réinitialisation).
- **2026-10-29 : le comportement de Claude vit côté serveur.** Consignes du connecteur, descriptions d'outils et prompts MCP (« Réviser », « Ajouter une carte ») : il s'applique à tous les testeurs sans réglage de leur part. Un test court sur mon compte vérifie d'abord ce que Claude.ai fait des consignes du serveur.
  - *Rejeté :* un projet Claude ou des instructions personnalisées, à configurer par chaque utilisateur.
