# Notifications de révision

**Statut :** découpée le 2026-11-13 en trois tickets : PWA installable (t42), abonnement et seuil par compte (t43), envoi planifié (t44).

## Problème

Le tapis roulant montre les cartes qui deviennent prêtes, mais seulement quand on ouvre l'app. Rien ne prévient qu'une révision attend : les cartes prêtes s'accumulent sans qu'on le sache.

## Version retenue

- **Canal :** Web Push, via l'app web installée en PWA (y compris sur iPhone depuis l'écran d'accueil). L'app iOS reste gelée.
- **Réglage :** un seuil de cartes prêtes, par utilisateur. Exemple du développeur : rien sous 5 cartes, puis une notification qui dit qu'une révision attend. Web Push n'a pas de notification « silencieuse » fiable (Safari iOS) : sous le seuil, rien n'est envoyé.
- **Rythme :** une notification au franchissement du seuil, puis rien jusqu'au prochain franchissement.

## Décisions

- **2026-11-13 : notifications Web Push (PWA).**
  - *Raison :* la décision « pas de notification » (2026-10-29) reposait sur la série, supprimée depuis par le tapis roulant. La PWA couvre l'iPhone sans dégeler l'app iOS.
  - *Rejeté :* dégeler l'app iOS pour des notifications natives.

- **2026-11-13 : une seule notification par franchissement du seuil.** Plus rien tant que les cartes prêtes restent au-dessus ; la suivante attend qu'elles soient repassées sous le seuil, puis le refranchissent.
  - *Raison :* un rappel qui insiste finit coupé.
  - *Rejeté :* un rappel toutes les N heures ; une notification à chaque palier (10, 20…).

- **2026-11-13 : pas de plage de silence dans Poj.** La nuit est laissée au mode Concentration du téléphone.
  - *Raison :* une plage demanderait de stocker le fuseau de chaque compte et un réglage de plus ; le téléphone le fait déjà.
  - *Rejeté :* une plage réglable par compte (22 h–8 h par défaut), avec report de la notification.
  - *À rouvrir si :* des notifications nocturnes gênent malgré le mode Concentration.

## Hors périmètre

- Plage de silence et fuseau horaire par compte.
- Rappels répétés et paliers.
- App iOS native (reste gelée).
- Réglages exposés dans l'API OpenAPI ou le MCP.
