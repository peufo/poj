---
id: t16
title: Isoler les bases de données et les ports de chaque worktree
status: done
priority: normal
story:
depends_on: []
plan_required: true
review:
model: opus
effort: high
zones: [apps/web/vitest.global-setup.ts, apps/web/vite.config.ts, apps/web/playwright.config.ts, apps/web/scripts, apps/web/.env.example, compose.yaml, package.json, CLAUDE.md]
branch: ticket/t16-isolation-worktrees
agent: a6447ab16afab9d40
created: 2026-10-30
updated: 2026-10-30
---

## Context
Aujourd'hui, tous les worktrees partagent les bases `poj_test` et `poj_sandbox`, ainsi que les ports fixes 5173 (dev, `ORIGIN`), 5174 (bac à sable), 4173 (preview Playwright), 3000 et 5433 (Docker). C'est pour cela que `max_parallel` est à 1 dans `doc/ork.md` : deux suites de tests lancées en même temps se vident mutuellement les tables. Par ailleurs, une migration testée dans un worktree reste appliquée à `poj_test` (incident pendant t15). Le développeur veut isoler chaque worktree pour pouvoir paralléliser.

Piste, à confirmer dans le plan : dériver du nom du worktree (ou d'une variable) un suffixe de base (`poj_test_<slug>`, `poj_sandbox_<slug>`) et un décalage de ports. Le checkout principal garderait les noms et ports actuels. Le serveur Postgres Docker (5433) peut rester unique et partagé, seules les bases changent.

## Done criteria
- [ ] Deux suites `bun run test` lancées en même temps depuis deux worktrees passent sans interférence
- [ ] Le bac à sable d'un worktree n'efface pas celui d'un autre
- [ ] Les ports de dev, du bac à sable et du preview Playwright ne se percutent pas entre worktrees ; `ORIGIN` suit le port réel
- [ ] Le checkout principal garde son comportement actuel (mêmes bases, mêmes ports)
- [ ] Les outils destructifs refusent toujours toute base hors de leur périmètre (garde-fou actuel conservé, étendu aux bases suffixées)
- [ ] La préparation d'un worktree (CLAUDE.md, « Préparer un worktree ») est mise à jour, et le nettoyage des bases d'un worktree supprimé est documenté ou automatisé
- [ ] Les tests passent

## Plan
Rendu le 2026-10-30 (opus, high). Branche de plan : `worktree-agent-a6447ab16afab9d40`, renommée `ticket/t16-isolation-worktrees` à l'exécution.
1. **`testing/worktree.ts`** (Node natif seulement) :
   - détecte un worktree lié (`git rev-parse --git-dir` ≠ `--git-common-dir`) ;
   - calcule un slug de dossier (`[a-z0-9_]`, 40 caractères au plus) et les bases `poj_test_wt_<slug>` / `poj_sandbox_wt_<slug>` ;
   - calcule les ports et réécrit le `.env`.
2. **Ports** dérivés du seul port d'`ORIGIN` : dev = port, sandbox = port+1, preview = port−1000. Le checkout principal garde 5173 / 5174 / 4173. Un worktree reçoit l'emplacement k (1 à 20, port 5173+10k), le premier libre parmi les `.env` des worktrees.
3. **Configuration :**
   - `vite.config.ts` : `server.port` / `preview.port` lus dans `ORIGIN`, avec `strictPort: true`, sauf sous Vitest ;
   - `playwright.config.ts` : port du preview et `webServer.env.ORIGIN` ;
   - `scripts/sandbox.ts` : port = `ORIGIN`+1.
4. **Garde-fou** de `database.ts` : `^poj_(test|sandbox)(_wt_[a-z0-9_]{1,40})?$`. Ajout d'un `dropDatabase` protégé par le même garde-fou.
5. **Filet de sécurité :** dans un worktree lié, une base sans `_wt_` produit une erreur claire (« lance `bun run worktree:setup` »), dans `vitest.global-setup.ts` comme dans `sandbox.ts`.
6. **`scripts/worktree.ts`**, appelé par `worktree:setup` et `worktree:prune` (racine et `apps/web`) :
   - `setup` copie le `.env` du checkout principal et réécrit les bases et `ORIGIN`. On peut le relancer, et il refuse de tourner dans le checkout principal ;
   - `prune` supprime les bases `*_wt_*` orphelines et les liste.
7. **Tests :** `worktree.spec.ts` couvre les fonctions pures, et `database.spec.ts` le garde-fou élargi.
8. **Documentation :**
   - `CLAUDE.md` : préparation (`bun install && bun run worktree:setup`), nettoyage (`worktree:prune`), base de test, bac à sable, port e2e ;
   - `.env.example` et `compose.yaml`.
9. **Vérification :**
   - deux suites lancées en parallèle sur `poj_test_wt_a` / `_b` ;
   - setup, sandbox et dev dans le worktree, contrôlés par curl, avec `poj_sandbox` intact ;
   - comportement par défaut inchangé ;
   - prune, puis la suite complète.

**Décisions de l'ouvrier :**
- l'isolation est écrite explicitement dans le `.env` par un script, et non dérivée à chaque lancement ;
- le marqueur `_wt_` permet de continuer à refuser `poj_sandbox_old` ;
- la base de dev, Postgres 5433 et la stack Docker (port 3000, une seule à la fois) restent partagés, et iOS reste sur 5173 ;
- le nettoyage est une commande, et non un hook du harnais.

**Risques :**
- après l'intégration, un worktree dont le `.env` est une simple copie voit ses tests refusés tant qu'il n'a pas lancé `worktree:setup` (voulu) ;
- le mode navigateur de Vitest ne doit pas hériter de `strictPort` ;
- `db:migrate` depuis un worktree touche toujours la base de dev (hors ticket) ;
- environ 12 fichiers touchés ;
- ne pas lancer la suite en même temps que celle de t5.

**À relire en premier (à l'exécution) :**
- `vite.config.ts`, `strictPort` : si 5173 est occupé, `bun run dev` échoue au lieu de passer sur 5174 avec un `ORIGIN` faux ;
- `database.ts` : le garde-fou élargi ;
- `scripts/worktree.ts` : `prune` ne doit supprimer que les `*_wt_*` orphelines.

## Questions

## Review
- **Rapport DONE du 2026-10-30** (commit 63c42df, rebasé sur dev 37458a5). Worktree `.claude/worktrees/agent-t16-isoler-worktrees` (recréé à la main par l'ouvrier, car celui du plan avait été nettoyé). 221 tests au vert, contrat à jour.
  - `bun run worktree:setup` écrit dans le `.env` du worktree ses propres bases et une `ORIGIN` sur un port libre (5183, 5193…). `bun run worktree:prune` supprime les bases des worktrees disparus.
  - Tous les ports viennent d'`ORIGIN`, avec `strictPort`. Le checkout principal garde 5173/5174/4173, `poj_test` et `poj_sandbox`. Dans un worktree, Vite, le bac à sable et Vitest refusent ces valeurs.
  - Le garde-fou accepte les bases `_wt_`, et refuse dans un worktree les bases principales. CLAUDE.md, .env.example, compose.yaml et le README web sont à jour.
  - Vérifié : deux suites complètes en parallèle (212/212 chacune), dev sur 5183, bac à sable sur 5184 avec `poj_sandbox` intacte.
- **Décisions de l'ouvrier :**
  - préparation d'un worktree : `bun install && bun run worktree:setup && bun --filter @poj/web db:generate` (le `prepare` de `bun install` échoue sans `.env`) ;
  - Playwright passe `--port` explicitement au preview, avec sa propre `ORIGIN`.
- **À relire en premier :**
  - [x] `apps/web/vite.config.ts:17` : `strictPort` dans le checkout principal (déjà accepté avec le plan).
  - [x] `apps/web/src/lib/server/testing/database.ts:38` : garde-fou élargi (`^poj_(test|sandbox)_wt_[a-z0-9_]{1,40}$`, plus le refus des bases principales dans un worktree).
  - [x] `apps/web/scripts/worktree.ts:77` : `prune` supprime les bases `poj_*_wt_*` dont le slug ne correspond à aucun worktree de `git worktree list`.
- **Revue auto `/simplify` :** 8 corrections. Points restants (sans enjeu, cochés) :
  - [x] `apps/web/playwright.config.ts:10` : une variable dédiée au port de base serait plus propre, mais ajouterait un réglage.
  - [x] `apps/web/scripts/worktree.ts:77` : `prune` ouvre une connexion par base supprimée.
- **Pour le développeur, après l'intégration :**
  - `bun run worktree:prune` après chaque suppression de worktree (le chef s'en charge à l'intégration) ;
  - passer `max_parallel` à 2 dans `doc/ork.md`.

## Log
- 2026-10-30 — créé depuis une remarque du développeur. Une fois intégré, le chef proposera de passer `max_parallel` à 2 dans `doc/ork.md`.
- 2026-10-30 — ouvrier lancé en PLAN MODE (opus, high)
- 2026-10-30 — PLAN READY, attend la validation du développeur
- 2026-10-30 — plan validé tel quel (5173/5174/4173 réservés au checkout principal), ouvrier relancé en EXECUTION MODE
- 2026-10-30 — ouvrier arrêté par une erreur réseau (ENOTFOUND) en cours d'exécution, relancé par SendMessage
- 2026-10-30 — **DONE**, 221 tests au vert. Relecture (ticket passé par un plan). [delivered]
- 2026-10-30 — intégré sur dev par avance rapide (1 commit, aucun conflit) après relecture
