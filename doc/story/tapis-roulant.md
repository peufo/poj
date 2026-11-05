# Story : le tapis roulant des révisions

Statut : en idéation depuis le 2026-11-01, en pause depuis le 2026-11-05 (tickets t33, t34, t35 créés en `idea`).

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
- **2026-11-01 : la densité est un défi de design assumé** (rendre lisible et joli des centaines de cartes sur le tapis).

## Hors périmètre
