# Comparatif des bibliothèques de validation par schémas (TypeScript), octobre 2026

Date de l'étude : 29 octobre 2026. Les versions viennent du registre npm (`registry.npmjs.org`), relevées le jour même. Les téléchargements couvrent la semaine du 21 au 27 octobre 2026 (`api.npmjs.org/downloads`).

Le coût de migration depuis Zod n'est **pas** pris en compte. L'adéquation à la stack (SvelteKit 3, Hono + OpenAPI → Swift, MCP SDK v2, Better Auth, Bun/Node, Vitest) est en revanche un critère.

Les mesures marquées **[mesuré]** ont été faites dans un dossier jetable, hors du dépôt : Node 22.18, esbuild, Rolldown et `tsc` 5.9. Ce sont des micro-mesures indicatives, pas des benchmarks rigoureux.

## 1. Versions vérifiées

| Paquet | Version | Date | Téléch./sem. |
|---|---|---|---|
| `zod` (inclut `zod/mini`) | 4.6.7 | 2026-10-12 | 371 M |
| `valibot` | 1.5.0 | 2026-09-09 | 26,4 M |
| `@valibot/to-json-schema` | 1.8.0 | 2026-09-11 | 6,9 M |
| `@valibot/i18n` | 1.3.0 | 2026-09-14 | — |
| `arktype` | 2.2.9 | 2026-10-20 | 2,9 M |
| `typebox` (ligne 1.x, ESM seulement) | 1.4.3 | 2026-10-22 | 13,8 M |
| `@sinclair/typebox` (ligne 0.x LTS) | 0.34.52 | 2026-07-11 | 135 M (surtout transitif) |
| `effect` (Schema intégré, `@effect/schema` déprécié) | 4.1.0 | 2026-10-29 (4.0.0 stable le 2026-10-01) | 54 M |
| `sury` | 11.1.0-rc.0 | 2026-10-01 | 0,4 M |
| `@hono/zod-openapi` | 1.6.3 | 2026-09-04 | 3,2 M |
| `@asteasolutions/zod-to-openapi` (moteur du précédent) | 9.1.0 | 2026-07-19 | — |
| `hono-openapi` (rhinobase) | 1.5.0 | 2026-10-18 | 2,7 M |
| `@hono/standard-validator` | 0.4.1 | 2026-10-26 | 2,3 M |
| `@standard-community/standard-json` | 0.4.0 | 2026-10-29 | — |
| `@standard-community/standard-openapi` | 0.2.11 | 2026-10-18 | — |
| `@modelcontextprotocol/server` (SDK v2) | 2.4.0 | 2026-10-23 | 16,8 M |
| `@modelcontextprotocol/sdk` (v1, maintenance) | 1.32.2 | 2026-10-23 | 71,9 M |
| `sveltekit-superforms` | 3.1.0 | 2026-10-29 | 0,3 M |
| `better-auth` | 1.7.14 | 2026-10-26 | — |
| `@sveltejs/kit` | 3.1.0 (`latest`) | 2026-10-14 | 3,7 M |
| `@standard-schema/spec` | 1.1.0 | 2025-12-15 | — |

## 2. Tableau de synthèse (notes de 1 à 5)

| Critère | Zod 4 (classique) | `zod/mini` | Valibot | ArkType | TypeBox 1.x | Effect Schema 4 |
|---|---|---|---|---|---|---|
| 1. OpenAPI depuis Hono | **5** | 3 | 3 | 3 | 2 | 2 |
| 2. SDK MCP | **5** | 4 | 4 | **5** | 3 | 3 |
| 3. Formulaires SvelteKit | **5** | 4 | 4 | 4 | 2 | 2 |
| 4. Standard Schema | **5** | 4 | 4 | **5** | 1 | 4 |
| 5. Inférence et ergonomie, i18n | **4** | 3 | 4 | 3 | 3 | 3 |
| 6. Bundle client | 2 | 4 | **5** | 1 | 1 | 3 |
| 7. Performance et coût `tsc` | 4 | 3 | 3 | 3 | **5** | 4 |
| 8. Maturité | **5** | **5** | 4 | 3 | 4 | 3 |
| 9. Écosystème (Better Auth, Prisma…) | **5** | 4 | 3 | 2 | 2 | 2 |
| **Total / 45** | **40** | 34 | 34 | 29 | 23 | 26 |

Les critères 1 à 3 (Hono/OpenAPI, MCP, formulaires) sont ceux qui comptent le plus pour cette stack. Avec cette pondération, l'écart en faveur de Zod se creuse.

## 3. Sections par candidat

### 3.1 Zod 4 (4.6.7)

**1. OpenAPI depuis Hono : 5.** Deux intégrations mûres existent.

- **`@hono/zod-openapi` :**
  - c'est le seul générateur OpenAPI du monorepo officiel `honojs/middleware`. Ce dépôt n'a pas d'équivalent Valibot, ArkType ou Effect : son dossier `packages` liste seulement des `*-validator` pour ces bibliothèques ;
  - `createRoute` porte l'`operationId`, et `.openapi('Nom')` ou `.meta({ id })` envoie le schéma dans `components.schemas` en `$ref` ;
  - limite connue et documentée : `.extend()` d'un schéma nommé produit un `allOf` **[mesuré]** : `{"allOf":[{"$ref":"#/components/schemas/B2"},{…}]}` ;
  - ce paquet ne fonctionne **pas** avec `zod/mini` **[mesuré]** : `zodSchema.meta is not a function`.
- **`hono-openapi` :**
  - il fonctionne aussi avec Zod (ref par `.meta({ ref })`) ;
  - il aplatit les `.extend()` au lieu de produire un `allOf` **[mesuré]** ;
  - il distingue entrée et sortie : un schéma avec `transform` utilisé en réponse devient un composant `ZCoOutput` séparé **[mesuré]**. C'est le seul candidat à le faire proprement.
- **Qualité du JSON Schema :** `z.toJSONSchema()` est intégré. La 4.6 a corrigé l'écrasement des bornes chaînées (`min(0).max(23).int()`) et retiré les lookaheads du motif e-mail.

**2. SDK MCP : 5.**

- Le SDK v2 dépend de `zod ^4.2.0` (dépendance directe de `@modelcontextprotocol/server`).
- Le guide de migration le décrit comme le chemin de référence : « Zod ≥4.2.0 self-converts via `~standard.jsonSchema` ».
- Zod 3 n'est plus accepté.

**3. Formulaires SvelteKit : 5.**

- **superforms 3 :** adaptateurs `zod` et `zodClient`.
- **Remote functions :** elles acceptent n'importe quel Standard Schema. Le coercitif `n:` / `b:` est fait par SvelteKit.
- **Coercition :** `z.coerce.*` et `z.stringbool()` couvrent les form actions classiques.
- **Erreurs par champ :** `flatten` / `treeifyError`, ou l'API de superforms.

**4. Standard Schema : 5.** Zod implémente Standard Schema **et** Standard JSON Schema nativement depuis la 4.2 **[mesuré]** : `~standard` contient `jsonSchema`.

**5. Ergonomie : 4.**

- **Points forts :**
  - API chaînée, lisible ;
  - `pipe`, `transform`, `refine` / `superRefine`, codecs ;
  - `.validate()` (4.6) ;
  - i18n intégrée : `z.config(z.locales.fr())`. La locale `fr` existe **[mesuré]**.
- **Bémols :**
  - deux API coexistent, classique et mini, ce qui peut casser l'uniformité si on mélange ;
  - les patchs 4.x restent fréquents.

**6. Bundle : 2.**

- **Petit formulaire (e-mail, mot de passe, entier coercé) [mesuré] :**
  - Rolldown, qui est le bundler de Vite 8 : **24,0 Ko gzip** ;
  - esbuild avec `import * as z from 'zod'` : 26,7 Ko ;
  - esbuild avec `import { z } from 'zod'` : **92,5 Ko**, car toutes les locales sont embarquées.
- La documentation officielle annonce 13,1 Ko pour un objet simple, contre 4,0 Ko pour Mini.
- **Conséquence :** la forme d'import compte. Il faut imposer `import * as z from 'zod'` (règle ESLint).

**7. Performance : 4 [mesuré].**

- **Objet à quatre champs :**
  - `safeParse` valide en 158 ns, invalide en 875 ns ;
  - `z.compile()` (4.5+) descend à 43 ns sur une entrée valide.
- **`tsc` :** 26 500 instanciations pour 40 schémas avec `extend` et `omit`, soit le deuxième coût le plus bas.
- **Annonces de Zod 4 :** objets 6,5 fois plus rapides qu'en Zod 3, et instanciations `tsc` divisées par plus de 100 sur `.extend()`.

**8. Maturité : 5.**

- 44 000 étoiles, 371 M de téléchargements par semaine, des publications toutes les deux semaines environ.
- **Incident de sécurité :** des commits malveillants ont été poussés sur `main` le 21 septembre 2026 avec un identifiant compromis. Ils ont été révertés le jour même, et aucun n'a été publié sur npm (notes de la 4.6.6). La provenance npm est publiée.

**9. Écosystème : 5.**

- **Better Auth :** il dépend directement de `zod ^4.5.4`, et `better-call` a `zod ^4` en peer.
- **MCP :** le SDK MCP dépend aussi de Zod.
- **Prisma :** générateurs `prisma-zod-generator` (3.3.1, 112 000 téléchargements par semaine) et `zod-prisma-types`.
- **Conséquence :** Zod est de toute façon présent côté serveur.

### 3.2 `zod/mini` (même paquet, 4.6.7)

- **OpenAPI : 3.** Il marche avec `hono-openapi` **[mesuré]** via `.register(z.globalRegistry, { ref })`, mais **pas** avec `@hono/zod-openapi`.
- **MCP : 4.**
  - Les schémas Mini n'exposent pas `~standard.jsonSchema` **[mesuré]**, et la page Standard JSON Schema indique « via `z.toJSONSchema()` ».
  - Le SDK devrait se rabattre sur son propre `z.toJSONSchema` (en perdant les `.describe()`), ou il faudra passer par `fromJsonSchema()`. C'est **incertain**.
- **Bundle : 4.** 5,7 Ko gzip pour le même formulaire avec Rolldown **[mesuré]**.
- **Performance :** plus lent que la version classique dans la micro-mesure (483 ns sur une entrée valide).
- **Ergonomie : 3.** L'API fonctionnelle est verbeuse (`z.string().check(z.minLength(8))`). La doc elle-même recommande Zod classique « pour la plupart des applications ».
- **Pertinence ici :** il sert de variante « client » de Zod, mais mélanger les deux API va contre l'exigence de structure uniforme.

### 3.3 Valibot (1.5.0)

**1. OpenAPI : 3.**

- **Seul chemin : `hono-openapi`**, tiers. Son README dit : « This package is still in development ».
- **Ce qui marche :**
  - les `$ref` via `v.metadata({ ref })` **[mesuré]**, en requête comme en réponse ;
  - l'`operationId` via `describeRoute`.
- **Ce qui manque :** `@valibot/to-json-schema` ne sait pas convertir `transform` en sortie **[mesuré]** : « The "transform" action cannot be converted to JSON Schema » (issue #72 ouverte).
- **Bugs ouverts dans `hono-openapi` sur les composants :**
  - #306 : deux schémas de même nom fusionnés, la dernière route gagne ;
  - #319 : un composant déclaré écrasé par un généré.

**2. MCP : 4.** La doc du SDK v2 documente le cas : « wrap it with `toStandardJsonSchema` from `@valibot/to-json-schema` ». Un emballage est donc nécessaire pour chaque outil.

**3. Formulaires : 4.**

- Adaptateurs superforms, et la doc des remote functions SvelteKit prend Valibot comme exemple.
- Pas de `coerce` intégré : il faut écrire `pipe(string(), transform(Number), …)` à la main pour les form actions classiques.

**4. Standard Schema : 4.** Natif pour la validation. Standard JSON Schema passe par un adaptateur.

**5. Ergonomie : 4.** Bonne inférence, `pipe` explicite, `@valibot/i18n` fournit `fr`. C'est plus verbeux que Zod.

**6. Bundle : 5.** 1,6 Ko gzip **[mesuré]**. La doc annonce 1,37 Ko pour un formulaire de connexion, contre 15 à 18 Ko pour Zod et 4 à 7 Ko pour Zod Mini.

**7. Performance : 3 [mesuré].** 299 ns sur une entrée valide et 557 ns sur une invalide. Côté `tsc`, 101 000 instanciations, soit quatre fois Zod. La doc se décrit elle-même comme « in the midfield » et sans compilateur.

**8. Maturité : 4.**

- 9 000 étoiles, 26 M de téléchargements par semaine, v1 stable.
- Organisation `open-circle`, avec plusieurs contributeurs par version.

**9. Écosystème : 3.**

- **Superforms :** adaptateur disponible.
- **Prisma :** `prisma-valibot-generator` est marginal (77 téléchargements par semaine).
- **Better Auth :** il impose Zod de toute façon, donc deux bibliothèques cohabitent côté serveur.

### 3.4 ArkType (2.2.9)

**1. OpenAPI : 3.**

- **Seul chemin : `hono-openapi`.** Le `$ref` passe par `.configure({ ref })`, après une déclaration globale `ArkEnv.meta` **[mesuré]** : ça marche.
- **Morphs :** `toJsonSchema()` lève une erreur par défaut (code `morph`) **[mesuré]**.
- **Réponses avec morph :** `hono-openapi` documente le schéma d'*entrée* (une chaîne avec motif au lieu d'un entier) **[mesuré]**. Le client Swift recevrait donc un type faux.

**2. MCP : 5.** La doc du SDK v2 dit qu'il fonctionne « as-is, no wrapper ».

**3. Formulaires : 4.** Adaptateur superforms (ArkType sorti de bêta dans superforms 3.0). La coercition s'écrit élégamment (`'string.integer.parse'`).

**4. Standard Schema : 5.** Il implémente nativement Standard Schema et Standard JSON Schema, avec `input` et `output` séparés **[mesuré]**.

**5. Ergonomie : 3.**

- Le DSL en chaînes, proche de TypeScript, est concis, mais c'est un second langage à côté de l'API fluide.
- Pas d'i18n officielle. La doc dit : « still a topic we're working on investigating ».

**6. Bundle : 1.** 46 Ko gzip **[mesuré]**.

**7. Performance : 3 [mesuré].**

- Le plus rapide sur une entrée valide (27 ns), mais très lent sur une entrée invalide (11,6 µs, soit 13 fois Zod).
- `tsc` : 281 000 instanciations, dix fois Zod.
- Le site annonce « 20x faster than Zod 4 », mesuré sur entrée valide.

**8. Maturité : 3.** 7 900 étoiles, 2,9 M de téléchargements par semaine, des publications fréquentes. Le projet repose essentiellement sur un mainteneur.

**9. Écosystème : 2.** Rien pour Prisma ou Better Auth.

### 3.5 TypeBox (1.4.3)

**1. OpenAPI : 2.**

- Les schémas TypeBox **sont** du JSON Schema : c'est la meilleure fidélité possible, avec `$id` et `$ref` natifs.
- En revanche, l'intégration Hono est faible :
  - `@hono/typebox-validator` 1.1.0 ne fait que valider ;
  - `@hono/standard-validator` est inutilisable sans adaptateur ;
  - la page `hono-openapi` dédiée à TypeBox contient des copier-coller de la page Valibot. Son fonctionnement réel est **incertain**.

**2. MCP : 3.** Passage via `fromJsonSchema(schema)`, naturel puisque le schéma est du JSON Schema. Le type des arguments doit être passé à la main (`Static<typeof T>`).

**3. Formulaires : 2.**

- Superforms a un adaptateur.
- Les remote functions exigent Standard Schema, donc un adaptateur maison.
- Les messages d'erreur sont formulés en termes de JSON Schema.

**4. Standard Schema : 1.** Ni les schémas ni les validateurs compilés n'exposent `~standard` **[mesuré]**. Le dépôt fournit seulement un adaptateur d'exemple à copier (`example/standard/standard.ts`).

**5. Ergonomie : 3.** `Type.Object`, `Static<>` : verbeux mais clair. Peu adapté aux transformations.

**6. Bundle : 1.** De 29 Ko (`Value`) à 39 Ko (`Compile`) gzip **[mesuré]**.

**7. Performance : 5 [mesuré].** `Compile(...).Check` prend 10 ns, et `tsc` 55 000 instanciations. Attention : `Compile` utilise `new Function`, avec un repli automatique. Le README le présente comme une alternative à Ajv.

**8. Maturité : 4.** Mainteneur unique mais historique très long. Deux lignes coexistent, 1.x en ESM seulement et 0.x en LTS.

**9. Écosystème : 2.** Il est centré sur Fastify, et rien n'est prévu pour cette stack.

### 3.6 Effect Schema (`effect` 4.1.0)

**1. OpenAPI : 2.**

- `hono-openapi` 1.5.0 produit bien un `$ref` à partir de `identifier` **[mesuré]**, grâce à `standard-json` 0.4.0 publié le 29 octobre. Celui-ci corrige l'issue #26 : « effect 4 schemas can't be converted ».
- Mais `standard-openapi` déclare toujours `effect ^3.20.0` en peer.
- La réponse documente le côté *encodé* : `NumberFromString` donne `string` **[mesuré]**, avec `additionalProperties: true`.
- Effect a son propre `HttpApi` avec OpenAPI, mais il ne s'intègre pas à Hono.

**2. MCP : 3.**

- `toStandardSchemaV1` est stable.
- `toStandardJSONSchemaV1` est marqué **expérimental** dans la référence d'API, et composable depuis la 4.0.6.
- La page « schema libraries » du SDK ne mentionne pas Effect.

**3. Formulaires : 2.** L'adaptateur superforms importe `JSONSchema` depuis `effect`, un module supprimé en 4.x, avec le peer `effect ^3.21.0`. Il est donc **incompatible avec Effect 4**. Les remote functions fonctionnent via `toStandardSchemaV1`.

**4. Standard Schema : 4.** Il passe par des emballeurs officiels plutôt que par le schéma lui-même.

**5. Ergonomie : 3.** Les codecs bidirectionnels encode/decode sont très puissants, mais ils imposent le paradigme Effect. Pas d'i18n packagée.

**6. Bundle : 3.** 23,7 Ko gzip avec Rolldown, et 99 Ko avec esbuild **[mesuré]**.

**7. Performance : 4 [mesuré].** 303 ns sur une entrée valide, 587 ns sur une invalide. Côté `tsc`, 19 000 instanciations, le plus bas de tous.

**8. Maturité : 3.** Entreprise derrière (Effectful), mais la v4 n'est stable que depuis quatre semaines, et le passage de v3 à v4 est cassant. Le support LTS jusqu'en 2029 vient d'une source communautaire : c'est **incertain**.

**9. Écosystème : 2.** L'écosystème est en retard sur la v4 : superforms, `standard-openapi`.

### 3.7 Autres candidats

- **Sury (ex-rescript-schema), 11.1.0-rc.0.**
  - **Pour :** probablement le plus rapide des validateurs sans étape de build, et compatible Standard JSON Schema (`S.enableStandardJSONSchema()`).
  - **Contre :** version RC, 491 étoiles, mainteneur unique. `standard-openapi` ne déclare que `sury ^10`.
  - **Verdict :** à surveiller, pas sérieux pour du long terme aujourd'hui.
- **VineJS (4.3+) :** il expose Standard JSON Schema et superforms a un adaptateur, mais il est centré sur le serveur (AdonisJS). Aucune intégration Hono/OpenAPI.
- **Typia :** il exige une transformation à la compilation (plugin TS ou Vite). C'est fragile avec Bun, `svelte-check` et `vite build`.
- **Écartés en une ligne :**
  - **Yup (1.7.1, septembre 2025) :** pensé pour les formulaires, inférence faible, aucune voie OpenAPI ni MCP ;
  - **Joi (18.3.1) :** pas d'inférence de types native, lourd ;
  - **Superstruct (2.0.2) :** dernière version en juillet 2024, projet en sommeil.

## 4. Recommandation pour cette stack

**Choix : Zod 4 classique partout** (domaine, form actions, Hono, MCP, client), avec trois conventions.

1. **Import unique :** `import * as z from 'zod'`. Proscrire `import { z }` par une règle ESLint `no-restricted-syntax` : l'écart mesuré avec esbuild est de 27 contre 92 Ko gzip. Ne pas utiliser `zod/mini`, pour garder une seule API.
2. **OpenAPI :** garder `@hono/zod-openapi`. Il est officiel, le plus utilisé, et son `createRoute` avec `operationId` obligatoire correspond au besoin du client Swift. Garder la règle « pas de `.extend()` sur un schéma nommé ». Si cette règle devient trop contraignante, `hono-openapi` est une alternative crédible : il aplatit les `extend` et sépare entrée et sortie. Il est en revanche moins mûr, avec des bugs ouverts sur les noms de composants.
3. **MCP et formulaires :** `zod ≥ 4.2` est le chemin natif du SDK v2. Côté formulaires, superforms (`zod` / `zodClient`) ou les remote functions, plus `z.config(z.locales.fr())` pour les messages.

**Pourquoi Zod :**

- c'est le seul candidat à 5 sur les trois critères structurants (OpenAPI Hono, MCP, formulaires) ;
- Better Auth et le SDK MCP l'imposent déjà comme dépendance ;
- une seule bibliothèque couvre toute la codebase, ce que demande un développeur seul.

Son vrai défaut est le poids côté client, d'environ 24 Ko gzip. Il ne compte que pour des pages publiques sensibles au poids.

**Solution de repli : Valibot + `hono-openapi` + `@valibot/to-json-schema`.** Ce choix se justifie si le poids client devient prioritaire, ou si le développement de Zod s'arrête. Il coûte :

- un emballage `toStandardJsonSchema` sur chaque outil MCP ;
- une dépendance à un générateur OpenAPI tiers moins mûr ;
- l'absence de `transform` dans les schémas de réponse ;
- la présence de Zod quand même, à cause de Better Auth.

ArkType serait l'alternative « tout natif Standard JSON Schema ». Il est trop lourd, trop lent sur les erreurs, sans i18n, et porté par un mainteneur unique.

## 5. Points incertains

- **`zod/mini` avec le SDK MCP v2 :** les schémas Mini n'ont pas `~standard.jsonSchema`. Le repli sur le `z.toJSONSchema` embarqué du SDK n'est documenté que pour Zod 4.0 et 4.1. Non testé.
- **TypeBox avec `hono-openapi` :** la doc semble recopiée de la page Valibot, et TypeBox n'expose pas Standard Schema. Non testé.
- **Effect 4 :** le statut de `toStandardJSONSchemaV1` diffère selon les sources (expérimental dans l'API, stable dans une issue). Le support de la v4 par `hono-openapi` repose sur `standard-json` 0.4.0, publié le jour même. L'engagement LTS jusqu'en 2029 vient d'une source non officielle.
- **Remote functions SvelteKit :** elles sont toujours marquées « experimental » dans la doc.
- **Mesures :** taille et performance viennent d'un seul petit schéma, sans isolation des processus. L'ordre de grandeur est fiable, pas les chiffres exacts. Le benchmark de référence reste celui de moltar.
- **Better Auth :** je n'ai pas trouvé de documentation sur l'acceptation de schémas Standard Schema arbitraires dans les plugins. L'interne est Zod.

**Hors sujet mais remarqué :** le projet déclare `@sveltejs/kit: "next"`, et le lock résout `3.0.0-next.32` (2026-10-01). Or la 3.0.0 stable (2026-10-01) puis la 3.1.0 (2026-10-14) sont publiées sous `latest`, et le tag `next` n'avance plus.

## 6. Sources

- Registre et téléchargements npm : https://registry.npmjs.org/<paquet>, https://api.npmjs.org/downloads/point/last-week/<paquet>
- Zod v4 : https://zod.dev/v4 · Zod Mini : https://zod.dev/packages/mini · Zod 4.6 : https://zod.dev/blog/zod-4-6 · versions : https://github.com/colinhacks/zod/releases
- zod-to-openapi : https://github.com/asteasolutions/zod-to-openapi · middleware Hono : https://github.com/honojs/middleware/tree/main/packages
- hono-openapi : https://github.com/rhinobase/hono-openapi, https://honohub.dev/docs/openapi, https://honohub.dev/docs/openapi/helpers, …/zod, …/valibot, …/arktype, …/effect, …/typebox · issues : https://github.com/rhinobase/hono-openapi/issues (#72, #306, #319)
- standard-json et Effect 4 : https://github.com/standard-community/standard-json/issues/26 · standard-openapi : https://github.com/standard-community/standard-openapi/issues
- Standard JSON Schema : https://standardschema.dev/json-schema
- SDK MCP TypeScript : https://github.com/modelcontextprotocol/typescript-sdk, https://ts.sdk.modelcontextprotocol.io/v2/migration/upgrade-to-v2, https://ts.sdk.modelcontextprotocol.io/v2/advanced/schema-libraries.html
- SvelteKit remote functions : https://svelte.dev/docs/kit/remote-functions · versions : https://github.com/sveltejs/kit/releases
- Superforms : https://superforms.rocks/get-started, https://github.com/ciscoheat/sveltekit-superforms/releases, adaptateurs : https://github.com/ciscoheat/sveltekit-superforms/tree/main/src/lib/adapters
- Valibot : https://valibot.dev/guides/comparison/, https://github.com/open-circle/valibot/releases, https://github.com/open-circle/valibot/issues
- ArkType : https://arktype.io/, https://arktype.io/docs/configuration
- TypeBox : https://github.com/sinclairzx81/typebox (README, `example/standard/`)
- Effect : https://github.com/Effect-TS/effect/releases/tag/effect%404.0.0, https://effect.website/docs/v4/api/effect/Schema, https://effect.website/blog/effect-v4-rc-september-recap, https://github.com/slovakian/butter/issues/16 (LTS, source communautaire)
- Benchmarks : https://github.com/moltar/typescript-runtime-type-benchmarks, https://moltar.github.io/typescript-runtime-type-benchmarks
- Better Auth : https://better-auth.com/docs/concepts/plugins
