---
name: integrate
description: Rapatrie le travail d'un ou plusieurs worktrees (`.claude/worktrees/*`) sur la branche `dev` : commite le reliquat, rebase sans commit de merge, vérifie (check, lint, tests, contrat OpenAPI, iOS si touché), puis supprime le worktree et sa branche. Sans argument, liste les worktrees et demande lesquels intégrer. À utiliser dès que Jonas parle d'intégrer, rapatrier, merger, poser sur dev, finir ou nettoyer un worktree, une session worktree ou une branche `worktree-*`, même sans dire « worktree ».
argument-hint: '[worktree…]'
---

# /integrate : poser un worktree sur `dev`

Jonas travaille sur `dev` dans le checkout principal. Les sessions longues tournent dans des
worktrees et y commitent librement. Ce skill termine le cycle : le contenu du worktree arrive sur
`dev` en **historique linéaire**, vérifié, et le worktree disparaît.

Arguments : `$ARGUMENTS` (fragments de nom, de chemin ou de branche ; vide = choisir).

Deux choses ne se négocient pas, parce qu'aucune ne se rattrape :

- **Le checkout principal doit être propre.** S'il porte la moindre modification, elle est à
  Jonas et n'a pas d'autre copie : on l'avertit et on s'arrête (étape 0). Jamais de stash,
  d'autostash, de checkout ou de reset pour contourner.
- **Jamais de push, jamais de `--force`** (ni `worktree remove --force`, ni `branch -D`). Leurs
  refus sont précisément les garde-fous qui signalent du travail non rapatrié.

## 0. Repérer

```bash
git worktree list --porcelain
```

Le premier bloc est le checkout principal. Deux conditions, vérifiées avant toute autre chose :

- il est sur `dev`, sinon le skill ne sait pas où Jonas veut poser le travail ;
- `git -C <principal> status --short` est vide, fichiers non suivis compris.

Si l'une manque, **avertir et s'arrêter là** : nommer la branche ou lister les fichiers, et ne
rien faire d'autre, pas même commiter ou rebaser un worktree. Jonas range son principal lui-même,
puis relance `/integrate`.

Toutes les commandes passent par `git -C <chemin>` : la session peut tourner dans le principal
comme dans un worktree, et les refs (`dev`, les branches) sont partagées entre tous.

## 1. Choisir

Avec un argument, retrouver le ou les worktrees qui correspondent (nom de dossier, chemin ou
branche). Ambigu ou introuvable : montrer la liste et demander.

Sans argument, présenter un tableau de tous les worktrees hors principal :

| worktree | branche | avance / retard sur dev | fichiers sales | dernière activité | verrou |
| -------- | ------- | ----------------------- | -------------- | ----------------- | ------ |

```bash
git rev-list --left-right --count dev...<branche>   # retard, avance
git -C <wt> status --short | wc -l
git -C <wt> log -1 --format=%cr
```

Puis `AskUserQuestion` : « Tous » ou « Une sélection ». Pour une sélection, une question
multiSelect s'il y a au plus quatre worktrees, sinon demander les noms en texte.

Deux cas à signaler dans le tableau plutôt qu'à découvrir en route :

- **Rien à intégrer** (propre, aucune avance sur `dev`) : proposer seulement la suppression.
- **Session peut-être encore active** : avertir avant d'y commiter quoi que ce soit, car on
  couperait l'herbe sous le pied d'un travail en cours. Indices :
  - le bloc porcelain affiche `locked` et la raison (`claude session <nom> (pid <pid> …)`) donne un
    pid encore vivant (`ps -p <pid>`) ;
  - `ListAgents` montre une session dans ce dossier ;
  - des fichiers modifiés il y a quelques minutes.

Les worktrees retenus se traitent **l'un après l'autre**, chacun rebasé sur le `dev` laissé par
le précédent. Un échec sur l'un n'empêche pas les suivants : le laisser en place, le noter pour le
rapport, continuer.

## 2. Nettoyer le worktree

Lire `git -C <wt> status --short`, le diff et le contenu des fichiers non suivis. Le but est de
commiter le travail de la session, pas tout ce qui traîne : écarter les sorties de build
(`.build/`, `DerivedData/`, `test-results/`), logs, captures, fichiers temporaires, état d'outils
(`.impeccable/` par exemple). En cas de doute sur un fichier, demander plutôt que de l'embarquer.

Commiter dans le style du dépôt (`git log --format=%s -20` pour s'en imprégner) : anglais,
minuscules, impératif sans préfixe de scope (`add cards service`, `remove notes example module`).
Si le diff porte plusieurs intentions distinctes, faire plusieurs commits. Aucun trailer
`Co-Authored-By` (`attribution.commit` est vide dans les réglages du projet).

Si le worktree a touché une route ou un schéma de l'API, `openapi.json` doit faire partie du même
commit : lancer `bun run api:export` dans le worktree avant de commiter si `bun run api:check`
échoue.

## 3. Rebaser sur `dev`

```bash
git -C <wt> rebase dev
```

Pas de merge : Jonas veut un historique linéaire où chaque commit du worktree reste lisible.

En cas de conflit, la tentation est de choisir un côté. Le plus souvent, il faut **composer** :
les deux côtés ont fait quelque chose de voulu. Pour chaque fichier en conflit :

1. Lire ce que `dev` a fait (`git log dev -- <fichier>`, puis `git show` du commit concerné) et ce
   que le commit du worktree en cours de rejeu voulait faire.
2. Écrire la version qui réalise les deux intentions. Si elles se contredisent vraiment, ou si
   l'une des deux n'est pas claire, demander avec `AskUserQuestion` en résumant chaque côté.
3. `git -C <wt> add <fichier>`, puis `GIT_EDITOR=true git -C <wt> rebase --continue`.

Garder la liste des fichiers en conflit et une phrase sur la façon dont chacun a été tranché :
elle sert à décider des vérifications iOS (étape 4) et au rapport. Si la situation devient
confuse, `git -C <wt> rebase --abort` ramène exactement à l'état d'avant.

Cas propres au dépôt :

- **`packages/api-contract/openapi.json`** est un fichier généré : ne jamais le fusionner à la
  main. Résoudre d'abord les routes et schémas Zod, prendre n'importe quel côté du JSON, puis
  `bun run api:export` depuis le worktree et `git add` le résultat avant `rebase --continue`.
- **Migrations** : si `dev` et le worktree ont chacun ajouté une migration dans
  `apps/web/prisma/migrations/`, le rebase ne signale aucun conflit mais l'ordre des horodatages
  peut ne plus correspondre à l'ordre d'application voulu. Le vérifier et le signaler. Un conflit
  dans `schema.prisma` se compose comme le reste, en gardant les conventions (snake_case via
  `@map`, `uuid(7)`, `deletedAt`).
- **`bun.lock`** : ne pas le fusionner à la main. Composer `package.json`, prendre le lock de `dev`,
  puis `bun install` pour le régénérer.

## 4. Vérifier, dans le worktree

On vérifie **avant** de toucher `dev`, dans le worktree, qui a son propre `node_modules` et son
`apps/web/.env` : si quelque chose casse, `dev` n'a pas bougé. S'il manque l'un des deux, le
signaler (copier `.env` depuis le principal, `bun install`) plutôt que de vérifier depuis le
principal.

Si `package.json` ou `bun.lock` a changé d'un côté ou de l'autre, `bun install` d'abord ; si
`apps/web/prisma/schema.prisma` a changé, `bun --filter @poj/web db:generate`. Puis, depuis la
racine du worktree :

```bash
bun run check        # 0 erreur attendue
bun run lint
bun run test         # projets client (Chromium) et server (base poj_test)
bun run api:check    # le contrat versionné correspond aux routes
```

Les quatre tournent **à chaque intégration**, conflit ou non : un rebase textuellement propre peut
casser sémantiquement (une fonction de domaine renommée sur `dev`, encore appelée par le
worktree ; deux routes qui ont chacune bougé le contrat).

La base `poj_test` est **partagée** par tous les checkouts et chaque test vide les tables : si une
autre session lance ses tests en même temps, des échecs aléatoires apparaissent. En cas d'échec
inexplicable, vérifier qu'aucun autre `vitest` ne tourne (`pgrep -fl vitest`) avant de chercher
plus loin. Pour la même raison, une migration du worktree reste appliquée à `poj_test` après
coup : le signaler si elle n'arrive finalement pas sur `dev`.

Un échec dû à l'intégration se corrige par un commit dans le worktree, dont le message nomme ce
qui est réparé (pas « fix after rebase »), puis on relance. Un échec qui existe déjà sur `dev`
n'est pas à mettre au compte du worktree : le dire, ne pas le corriger ici.

### iOS, seulement si touché

Si le worktree ou `dev` depuis la base commune a modifié `apps/ios/` ou `openapi.json` :

```bash
bun run ios:test     # régénère le client Swift depuis le contrat et lance ses tests
```

`ios:build` (précédé de `bun run ios:project`, le `.xcodeproj` n'étant pas versionné) prend
plusieurs minutes. Il ne se lance qu'en cas de doute que `ios:test` ne peut pas trancher : conflit
résolu dans du Swift de l'app (`apps/ios/Poj/`), dans `project.yml` ou `Package.swift`, ou contrat
modifié des deux côtés alors que l'app consomme les opérations concernées. L'annoncer avec sa
durée.

### L'e2e

Playwright est configuré (`*.e2e.ts`, build + preview sur le port 4173), mais ne le lancer que si
des specs existent et couvrent une zone où une résolution de conflit a fusionné deux changements
de comportement. Avant : `lsof -i :4173` (un preview déjà lancé servirait un build périmé : le
signaler, ne pas le tuer), puis `bunx playwright test --workers=1 --reporter=list <spec>` depuis
`apps/web`.

## 5. Poser sur `dev`

Revérifier que le principal est toujours propre (Jonas a pu y toucher pendant la vérification) ;
sinon, avertir et s'arrêter comme à l'étape 0, le worktree restant rebasé et vérifié. Puis :

```bash
git -C <principal> merge --ff-only <branche>
```

L'avance rapide ne crée aucun commit. Si elle refuse parce que `dev` a avancé entre-temps (Jonas
a commité), revenir à l'étape 3.

Si le travail apporte une migration, rappeler à Jonas de lancer `bun run db:migrate` dans le
principal pour sa base de dev ; ne pas le faire à sa place.

## 6. Supprimer

Une fois le contenu sur `dev` (`git merge-base --is-ancestor <branche> dev`) :

```bash
git worktree remove <chemin>
git branch -d <branche>
```

Sans `--force`, `worktree remove` refuse s'il reste des fichiers non suivis non ignorés, et
`branch -d` refuse si un commit manque sur `dev` : dans les deux cas, c'est qu'un bout de travail
n'a pas été rapatrié. Regarder ce qui reste plutôt que forcer.

Un worktree verrouillé (`locked`) est aussi refusé. Si le pid de la raison du verrou est mort, la
session est finie : `git worktree unlock <chemin>`, puis `remove`. S'il est vivant, ne pas
déverrouiller : laisser la suppression à Jonas.

Si la session courante tourne dans ce worktree, supprimer le dossier sous ses pieds la casserait.
`ExitWorktree` avec `action: "remove"` en sort proprement, mais seulement si c'est elle qui l'a
ouvert (`EnterWorktree`) ; sinon il ne fait rien. À défaut, laisser la suppression à Jonas et lui
donner les commandes à lancer depuis le principal.

## 7. Rendre compte

En français, court. Par worktree :

```
design-init (worktree-design-init) → dev   intégré, worktree et branche supprimés
  3 commits : a1b2c3d add design tokens, …
  conflits : src/routes/+layout.svelte (gardé la nav de dev et le thème du worktree)
             openapi.json (régénéré)
  check ✓  lint ✓  test ✓  api:check ✓  ios:test ✓ (contrat modifié)

decks (worktree-decks)   arrêté avant dev, rebasé et vérifié
  le principal n'est plus propre (apps/web/src/env.ts modifié) : relance /integrate decks
  une fois rangé.
```

Rien n'est poussé : le dire si Jonas pourrait s'y attendre.
