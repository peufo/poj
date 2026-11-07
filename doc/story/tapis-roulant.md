# Story : le tapis roulant des révisions

Statut : en idéation depuis le 2026-11-01, en pause du 2026-11-05 au 2026-11-06. t33 (vélocités) réalisé le 2026-11-06, t34 repris en plan le 2026-11-06, t35 reste en `idea`.

## Le problème

Remarque du développeur (2026-11-01) : « le rythme journalier qui est imposé n'est pas forcément le bon et l'historique à la GitHub prend beaucoup de place. Je me demande si une échelle logarithmique ne serait pas plus adaptée. Une sorte de tapis roulant sur lequel repose une représentation des cartes. Au bout du tapis, les cartes prêtes à être révisées. »

Deux constats :
- le rythme journalier (objectif du jour, série) n'est peut-être pas le bon ;
- le calendrier d'accomplissement façon GitHub prend beaucoup de place.

Une piste : une vue tournée vers l'avenir, à échelle logarithmique, où les cartes avancent vers leur prochaine révision.

## Existant (enquête du 2026-11-01)

- **Calendrier :** un seul composant, `GoalCalendar.svelte`, sur `/cards` : 8 semaines × 7 jours en cases de 1rem, même taille sur desktop et mobile. Il affiche aussi l'objectif, la série et le record (l. 108-110). Données : `progress = {goal, today, streak, best, days[]}` (`daily-goal.service.ts:165`), série calculée côté serveur (`streaksOf`, l. 45).
- **Une vue tournée vers l'avenir existe déjà :** `Horizon.svelte`, sur la même page, en barres par jour sur 14 jours (comptes seulement, pas de cartes individuelles), clic = filtre de la liste ; `cards.service.ts:280-293` (`horizon()`, retard dans le jour 0). La célébration est un composant séparé (`Celebration.svelte`).
- **Données :** l'échéance (`due`) suffit pour placer une révision ; stabilité et état FSRS existent en base mais ne sont pas chargés par la page. Seed : ~27 cartes, 1 ou 2 révisions chacune.
- **Coût d'un tapis log :** un calcul serveur (tranches log, sur le modèle de `horizon()`) + un composant, 3-5 fichiers, sans migration ni contrat. Supprimer le calendrier oblige à reloger objectif, série et record.

## Décisions en jeu

- `ajout-quotidien.md`, 2026-10-29 / 2026-10-30 : calendrier d'accomplissement comme gratification visuelle ; un seul calendrier, une seule journée Poj (ajout + révision), une seule série, un record, une célébration.

## Questions ouvertes

## Décisions

- **2026-11-01 : l'interface principale montre l'avenir : le tapis roulant.** Le passé (historique, accomplissement) se résume en un seul chiffre, la **vélocité**, qui devient l'objectif. Un graphe détaillé a sa propre page.
  - *Raison :* le calendrier façon GitHub prend beaucoup de place pour une information secondaire ; ce qui compte au quotidien, c'est ce qui arrive.
- **2026-11-01 : le tapis n'est pas découpé en jours.** Axe logarithmique continu, des minutes (étapes d'apprentissage FSRS, plusieurs révisions par jour) aux mois et aux années.
  - *Raison :* FSRS fait plusieurs révisions par jour et ses intervalles deviennent vite très longs ; un découpage journalier ne colle à aucune des deux échelles.
- **2026-11-01 : deux vélocités** : le nombre de répétitions (moyenne glissante) et le nombre de cartes mûres (mémoire durable, stabilité FSRS au-delà d'un seuil).
  - *Raison :* les cartes mûres seules ne motivent pas au début (il en faut des semaines pour en avoir) ; les répétitions récompensent l'effort dès le premier jour.
  - *Rejeté :* les cartes ajoutées (n'ont plus de sens avec les lots, story ajout-en-masse).
- **2026-11-01 : la série est supprimée**, avec l'objectif quotidien et le calendrier d'accomplissement : les vélocités les remplacent. Révise les décisions du 2026-10-29 et du 2026-10-30 de `ajout-quotidien.md`.
  - *Raison :* le découpage journalier ne colle pas à FSRS ; une moyenne glissante motive sans punir un jour manqué.
  - *Conséquence :* t29 n'a plus à protéger la journée de révision ni la série (étape 5 de son plan), et la raison d'historiser la limite (ne pas casser rétroactivement la série) disparaît.
- **2026-11-05 : l'objectif quotidien est supprimé, table comprise** (migration), pas seulement masqué.
- **2026-11-05 : la célébration est supprimée.**
- **2026-11-06 : définition des deux vélocités** (`reviews.velocities`).
  - *Répétitions :* les réponses des 7 dernières périodes de 24 h, divisées par 7. Toutes les notes, web et Claude, cartes supprimées ou réinitialisées comprises.
  - *Cartes mûres :* un stock, le nombre actuel de cartes non supprimées dont **chaque sens révisé** est mûr : hors apprentissage, avec une stabilité FSRS d'au moins 21 jours. Le nombre peut baisser (oubli, carte modifiée, deck passé à deux sens).
  - *Portée :* tous les decks, comme le suivi avant elles (`decks.md`) ; `/cards?deck=x` précise « Tous les decks » dès que le compte en a plusieurs.
  - *Écart assumé :* la barre de maîtrise appelle « Solide » une stabilité d'au moins 30 jours et compte des sens. Elle ne change pas.
  - *Rejeté :* un flux (cartes devenues mûres sur 7 jours) : à reconstruire depuis les logs, il relève plutôt de la page de détail (t35). Une carte mûre dès qu'un seul sens l'est : elle n'est durable que dans les deux sens.
- **2026-11-06 : `new_cards_limits` reste une table d'historique**, bien que seule la limite du jour soit encore lue.
  - *Raison :* une seconde migration de données n'apporte rien à t33. À reprendre par un ticket à part si le besoin apparaît.
- **2026-11-01 : la densité est un défi de design assumé** (rendre lisible et joli des centaines de cartes sur le tapis).
- **2026-11-06 : disposition du tapis (retours sur l'aperçu de t34).** Le tapis est tout en haut de `/cards`, et son axe croît de gauche à droite depuis maintenant. Dessous : la boîte des prêtes collée à gauche, puis celle des neuves, et « Réviser » collé à droite. Les marques sont teintées selon la maîtrise. Le titre « N dues aujourd'hui » et le sous-titre « N maintenant, N plus tard » disparaissent.
  - *Effet recherché :* les cartes semblent tomber dans la boîte des prêtes quand elles arrivent au bout du tapis ; elles restent donc représentées de bout en bout.
  - *Raison :* un sens de lecture plus chronologique, et moins de chiffres redondants : le tapis les montre déjà.
- **2026-11-06 : toucher le tapis affiche une simple ligne et le nombre de cartes de maintenant jusqu'à cette date.**
  - *Raison :* une période découpée, comme 7 à 30 jours, n'a aucun intérêt.
  - *Rejeté :* les tranches cliquables.
- **2026-11-06 : la distribution des cartes acquises quitte `/cards`**, pour une autre page (`t35-page-velocites`).
- **2026-11-06 : chaque carte est dessinée indépendamment sur le tapis**, sans blocs regroupés.
- **2026-11-06 : le tapis porte une ligne d'estimation du nombre de révisions par unité de temps.**
  - *Raison :* les cartes seules ne représentent pas les révisions à venir, et le cumul sous-estime le travail à long terme.

## Hors périmètre
