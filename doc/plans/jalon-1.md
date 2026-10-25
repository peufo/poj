# Plan d'implémentation : jalon 1 (web)

Périmètre : [stories/web.md](../stories/web.md) (WEB-1 à WEB-8), selon les règles de [specs/repetition.md](../specs/repetition.md). Le modèle de données anticipe déjà le jalon 2 ([specs/mcp.md](../specs/mcp.md)).

## Choix structurants

- **Pas d'API REST pour les cartes au jalon 1.** Les pages appellent le domaine via `load` et les form actions, et le serveur MCP du jalon 2 l'appellera directement. L'API `/api/v1` ne servait qu'à l'app iOS, qui est gelée.
- **Le module d'exemple `notes` est supprimé** : domaine, routes API, page, modèle Prisma.
- **DeepL est hors du domaine.** Le domaine reste du TS pur ; il reçoit un `Translator` (interface), et l'implémentation DeepL vit dans `src/lib/server/deepl/`. Les tests utilisent un faux traducteur.
- **La logique FSRS est isolée dans un module pur** (`scheduler.ts`), testable sans base : conversion entre une ligne `Review` et une `Card` de ts-fsrs, application d'une note, plafond *Hard*.
- **`ts-fsrs` 5.4.2**, la dernière version stable, épinglée. Les bêtas 6.0 sont écartées. Paramètres : rétention 0,9 ; *learning steps* par défaut (1 min, 10 min), si bien qu'une carte ratée revient dans la même session ; *fuzz* activé.
- **« Dû aujourd'hui »** veut dire : échéance au plus tard à la fin du jour civil en Europe/Zurich. **« Dû maintenant »** veut dire : échéance passée ou égale à l'instant présent.

## Modèle de données

Esquisse Prisma, qui suit les conventions du schéma (UUID v7, snake_case, `createdAt`/`updatedAt`) :

```prisma
enum Origin {
  web
  claude
  @@map("origin")
}

enum Direction {
  fr_to_en
  en_to_fr
  @@map("direction")
}

enum Rating {
  again
  hard
  good
  easy
  @@map("rating")
}

model Card {
  id        String    @id @default(uuid(7)) @db.Uuid
  ownerId   String    @map("owner_id") @db.Uuid
  french    String
  english   String
  context   String?
  origin    Origin
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")
  deletedAt DateTime? @map("deleted_at")
  reviews   Review[]
  // owner User @relation(...)

  @@index([ownerId, createdAt])
  @@map("cards")
}

// Une révision par sens. L'état FSRS reprend les champs de `Card` de ts-fsrs 5
// (liste exacte à confirmer contre ses types à l'implémentation).
model Review {
  id              String      @id @default(uuid(7)) @db.Uuid
  cardId          String      @map("card_id") @db.Uuid
  direction       Direction
  due             DateTime
  stability       Float
  difficulty      Float
  scheduledDays   Int         @map("scheduled_days")
  learningSteps   Int         @map("learning_steps")
  reps            Int
  lapses          Int
  state           Int         // State de ts-fsrs : New, Learning, Review, Relearning
  lastReview      DateTime?   @map("last_review")
  hintRequestedAt DateTime?   @map("hint_requested_at")
  createdAt       DateTime    @default(now()) @map("created_at")
  updatedAt       DateTime    @updatedAt @map("updated_at")
  logs            ReviewLog[]

  @@unique([cardId, direction])
  @@index([due])
  @@map("reviews")
}

model ReviewLog {
  id          String    @id @default(uuid(7)) @db.Uuid
  reviewId    String    @map("review_id") @db.Uuid
  rating      Rating
  hintUsed    Boolean   @map("hint_used")
  origin      Origin
  reviewedAt  DateTime  @map("reviewed_at")
  stateBefore Json      @map("state_before") // état FSRS avant la réponse, pour corriger la note
  amendedAt   DateTime? @map("amended_at")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  @@index([reviewId, reviewedAt])
  @@map("review_logs")
}
```

Écarts assumés par rapport aux conventions :
- **Pas de `deletedAt` sur `Review` ni `ReviewLog`** : ils suivent leur carte. Une carte supprimée exclut ses révisions des sessions.
- **Pas d'`id` fourni par le client** : aucun client hors ligne n'est prévu ([décision iOS](../decisions.md)).

Règles portées par ces champs :
- **Plafond *Hard* :** une note est plafonnée si `hintRequestedAt` est postérieur à `lastReview`, ou si la révision n'a encore jamais été notée.
- **Jeton `version` du jalon 2 :** c'est `lastReview`, et non `updatedAt`. Demander un indice modifie `updatedAt`, ce qui invaliderait le jeton entre `next_review` et `submit_review`.
- **Correction de la note :** seul le `ReviewLog` le plus récent d'une révision est corrigeable, dans l'heure qui suit, et seulement si `lastReview` correspond encore à son `reviewedAt`. Une réinitialisation survenue entre-temps interdit donc la correction. On recalcule l'état depuis `stateBefore`, avec la nouvelle note et le même `reviewedAt`, puis on renseigne `amendedAt`.
- **Réinitialisation lors d'une modification :** les deux `Review` reprennent l'état de `createEmptyCard()`, `hintRequestedAt` est vidé, et les logs sont conservés.

## Étapes

Chaque étape se termine par `bun run check`, `bun run lint` et `bun run test` au vert.

### 1. Nettoyage

- Supprimer le domaine `notes` (service, types, spec), `api/v1/notes.ts`, la page `(app)/notes` et le modèle `Note`.
- Laisser `v1` vide mais monté, ce qui garde l'infrastructure OpenAPI en place. Lancer `bun run api:export` et commiter le contrat.
- Rediriger après connexion vers `/cards` (au lieu de `/notes`), et faire rediriger `/` vers `/cards`.

### 2. Schéma

- Ajouter `Card`, `Review`, `ReviewLog` et les trois enums, puis `bun run db:migrate` (la migration supprime aussi `notes`).
- Ajouter la dépendance `ts-fsrs@5.4.2`.

### 3. Planification FSRS : `domain/reviews/scheduler.ts`

Fonctions pures, sans base :
- `emptyState()` : l'état d'une révision neuve.
- `toFsrsCard(review)` et `fromFsrsCard(card)` : conversions entre une ligne `Review` et une `Card` de ts-fsrs.
- `applyRating(state, rating, now, { hintUsed })` : renvoie le nouvel état et la note effectivement retenue (plafonnée à *Hard* si un indice a été utilisé).

Tests : une révision neuve notée *Good* est replanifiée ; *Again* fait revenir la carte dans les minutes qui suivent ; *Good* et *Easy* deviennent *Hard* quand un indice a été utilisé ; la conversion aller-retour d'un état ne perd rien.

### 4. Service des cartes : `domain/cards/cards.service.ts`

`createCardsService(db)` :
- `create(ownerId, { french, english, context }, origin)` : crée la carte et ses deux `Review` neuves, dans une transaction.
- `findDuplicates(ownerId, english, { excludeId })` : cartes non supprimées au même anglais, casse et espaces ignorés.
- `list(ownerId, { query })` : cartes non supprimées, des plus récentes aux plus anciennes, avec l'échéance de chaque sens. La recherche porte sur le français, l'anglais et le contexte (`contains`, insensible à la casse).
- `get(ownerId, id)` : la carte, ses deux révisions et l'historique complet.
- `update(ownerId, id, input)` : réinitialise les deux révisions si le français ou l'anglais change. Renvoie aussi `progressReset: boolean`.
- `softDelete(ownerId, id)` : suppression logique, idempotente.
- `stats(ownerId, now)` : nombre de cartes, et nombre de révisions dues aujourd'hui.

Tests :
- une carte créée a ses deux révisions dues ;
- les doublons sont détectés (casse et espaces ignorés), sans compter la carte elle-même ni les cartes supprimées ;
- modifier le français ou l'anglais réinitialise la progression, modifier le contexte seul ne la touche pas, et l'historique est conservé ;
- une carte supprimée disparaît de la liste et des statistiques ;
- un autre utilisateur ne voit pas mes cartes : le cloisonnement par `ownerId` est gardé, même avec un compte unique.

### 5. Service des révisions : `domain/reviews/reviews.service.ts`

`createReviewsService(db)` :
- `next(ownerId, now, { ahead })` : la prochaine révision à présenter, ou `{ nothingDue, nextDue }`.
  - Avec `ahead` à `false`, seules les révisions dont l'échéance est passée sont candidates. Avec `true`, ce sont les prochaines à venir, par échéance croissante.
  - Le sens inverse est exclu s'il a été noté dans les 24 dernières heures.
  - Les cartes supprimées sont exclues.
  - Renvoie aussi `remaining`.
- `requestHint(ownerId, reviewId, now)` : renseigne `hintRequestedAt` et renvoie le contexte.
- `answer(ownerId, reviewId, { rating, version, origin }, now)` : applique la note via le scheduler et écrit le `ReviewLog` avec `stateBefore`. Si la version est périmée, renvoie la réponse déjà enregistrée sans rien appliquer.
- `amend(ownerId, reviewId, rating, now)` : corrige la note selon les règles du modèle. Lève une `ConflictError` si la correction n'est plus possible.

Tests :
- l'ordre : la révision la plus en retard sort d'abord ;
- la mise de côté du sens inverse pendant 24 h ;
- la révision en avance ;
- l'indice, puis le plafond ;
- une version périmée n'applique pas la note deux fois ;
- la correction recalcule l'état depuis `stateBefore` ;
- la correction est refusée après une heure, sur un log qui n'est pas le dernier, ou après une réinitialisation ;
- les cartes supprimées sont exclues.

Ce service est celui qu'appelleront les outils MCP du jalon 2.

### 6. Traduction DeepL

- `domain/translation/` : l'interface `Translator` (`translate(text, { from, to, context })`), et un service qui renvoie soit une suggestion, soit une erreur explicite (indisponible, quota).
- `src/lib/server/deepl/` : l'implémentation, avec `fetch` vers l'API DeepL. La clé gratuite se termine par `:fx` et passe par `api-free.deepl.com`.
- Variable `DEEPL_API_KEY` dans `src/env.ts` et `.env.example`.
- À vérifier : le paramètre `context` de l'API DeepL (disponibilité, effet sur une traduction courte).

Tests : le service avec un faux traducteur (succès, panne). Le client DeepL réel n'est pas appelé en test.

### 7. Compte unique (WEB-1)

- Dans `auth.ts`, un `databaseHooks.user.create.before` refuse la création d'un utilisateur s'il en existe déjà un. C'est la garantie côté serveur : elle vaut pour l'endpoint Better Auth comme pour la page.
- `(auth)/login` : s'il n'existe aucun compte, redirige vers `/register`.
- `(auth)/register` : s'il en existe déjà un, redirige vers `/login`.
- Test : une seconde inscription est refusée, y compris par un appel direct à l'endpoint d'inscription.

### 8. Pages

Sous `(app)`, toutes protégées par le layout existant :

| Route | Contenu | Stories |
| --- | --- | --- |
| `/cards` | Statistiques, recherche, liste des cartes | WEB-3 |
| `/cards/new` | Formulaire, action `translate` (suggestion DeepL), avertissement de doublon, action `create` | WEB-2 |
| `/cards/[id]` | Détail, état des deux sens, historique, action `delete` (avec confirmation) | WEB-4, WEB-6 |
| `/cards/[id]/edit` | Formulaire, suggestion DeepL, avertissement de réinitialisation, action `update` | WEB-5 |
| `/review` | Session : question, action `hint`, réponse, quatre notes (action `answer`), action `amend` pour la note précédente, état « rien à réviser » et révision en avance | WEB-7, WEB-8 |

Détails :
- **Le doublon** est signalé avant création, en deux temps : une première soumission avertit, et une seconde soumission avec `confirm` enregistre.
- **La réponse attendue** fait partie des données de la page de révision et s'affiche côté client. L'**indice**, lui, passe par une action serveur, pour que le domaine applique le plafond.
- **La navigation** gagne les liens Cartes, Nouvelle carte et Réviser.

### 9. Vérification de bout en bout

- Lancer l'app (`bun run dev`) sur une base vide et dérouler le parcours complet :
  1. création du compte, puis vérification que l'inscription est fermée ;
  2. création de cartes avec DeepL, et un doublon ;
  3. modification et réinitialisation ;
  4. suppression ;
  5. session de révision avec indice et correction de note ;
  6. rien à réviser, puis révision en avance.
- Vérifier sur la page de détail que l'historique et les échéances sont cohérents.

## Hors jalon 1

- Le serveur MCP et OAuth (jalon 2).
- Le déploiement sur VPS. Il sera décrit à part ; il faudra créer le compte juste après la première mise en ligne.
