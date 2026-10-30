# Déploiement

Poj tourne en production sur [poj.ch](https://poj.ch), sur un VPS administré avec [Dokploy](https://dokploy.com). Seule l'app web (`apps/web`) est déployée.

## Architecture

```
push sur main → GitHub Actions : tests → image ghcr.io/peufo/poj:main → webhook Dokploy → redémarrage
```

- **Workflow** (`.github/workflows/deploy.yml`) :
  - `test` tourne sur `main`, `dev` et les pull requests : `check`, `lint`, tests Vitest (avec un service Postgres et Chromium), `api:check` ;
  - sur `main` seulement : construction de l'image, poussée sur GHCR avec les tags `main` et `sha-<court>`, puis appel du webhook Dokploy. `dev` n'est jamais déployée.
- **Image** (`Dockerfile` à la racine) : Bun installe, Node construit (adapter-node) et exécute. Au démarrage, `npm start` applique les migrations (`prisma migrate deploy`), puis lance le serveur sur le port **3000**.
- **Base :** le Postgres de Dokploy, sur le réseau interne du VPS.

## Configuration

### GitHub

- **Secret** `DEPLOY_HOOK_URL` (Settings → Secrets and variables → Actions) : l'URL du webhook de l'application Dokploy.
- **Paquet :** le job déclare `packages: write`, le `GITHUB_TOKEN` suffit pour pousser. Le paquet `poj` est créé privé au premier push. Si un paquet du même nom existait déjà, lui donner l'accès en écriture pour le dépôt (Package settings → Manage Actions access).

### Dokploy

1. **Postgres :** créer une base (nom `poj`), et noter son URL de connexion **interne**.
   - La recherche de cartes utilise l'extension **`unaccent`**, créée par une migration (`CREATE EXTENSION IF NOT EXISTS unaccent`). Elle fait partie des modules contrib de l'image `postgres` officielle (celle de Dokploy, de `compose.yaml` et de la CI). C'est une extension de confiance : l'utilisateur propriétaire de la base suffit, sans droits de superutilisateur.
2. **Application :**
   - provider Docker, image `ghcr.io/peufo/poj:main` ;
   - registre : `ghcr.io`, avec un jeton GitHub (classic) au scope `read:packages`, tant que le paquet est privé.
3. **Variables d'environnement** (modèle : `.env.example` à la racine ; toutes lues au démarrage, aucune n'est figée dans l'image) :
   - `ORIGIN=https://poj.ch`, sans barre finale ;
   - `DATABASE_URL` : l'URL interne de la base ;
   - `BETTER_AUTH_SECRET` : `openssl rand -base64 32`, à garder dans un gestionnaire de mots de passe et à ne plus changer ensuite (il signe les sessions et chiffre les clés JWKS) ;
   - `DEEPL_API_KEY` (facultative ; `:fx` pour le plan gratuit) ;
   - `PROTOCOL_HEADER=x-forwarded-proto` (facultative, voir [`ORIGIN`](#points-propres-à-poj)).
4. **Domaine :** `poj.ch`, HTTPS activé (Let's Encrypt), port du conteneur `3000`.
5. **Webhook :** copier l'URL de l'onglet Deployments dans le secret GitHub.

### DNS

Un enregistrement `A` (et `AAAA` si le VPS a une IPv6) de `poj.ch` vers le VPS, avant de demander le certificat.

## Points propres à Poj

- **`ORIGIN` = l'URL HTTPS publique,** sans barre finale. Better Auth, l'émetteur OAuth (`${ORIGIN}/api/auth`) et la ressource MCP (`${ORIGIN}/mcp`) en dérivent.
  - adapter-node (SvelteKit 3) ne lit pas `ORIGIN` : il reconstruit l'URL des requêtes depuis l'en-tête `Host`, en supposant HTTPS, sauf si `PROTOCOL_HEADER` désigne l'en-tête du protocole. Le proxy de Dokploy (Traefik) transmet le `Host` d'origine, termine le TLS et renseigne `X-Forwarded-Proto: https` : cela donne `https://poj.ch`, avec ou sans `PROTOCOL_HEADER`. La stack locale, en HTTP, a besoin de `PROTOCOL_HEADER` (posé par `compose.yaml`).
  - Une autre adresse (IP, port direct) ne correspond plus à `ORIGIN` : formulaires refusés (403) et `/api/auth/*` introuvable (404).
- **L'app doit joindre sa propre URL publique :** la vérification des jetons du MCP télécharge le JWKS sur `${ORIGIN}/api/auth/jwks`. À vérifier depuis le conteneur (voir [Vérification après déploiement](#vérification-après-déploiement)).

- **Créer le compte admin juste après la première mise en ligne :** le premier visiteur de `/register` crée le compte administrateur, puis l'inscription se ferme. Les testeurs arrivent ensuite par un lien d'invitation, généré sur `/admin`.
- **Brancher Claude :** sur claude.ai, ajouter un connecteur personnalisé d'URL `https://poj.ch/mcp`. Claude s'enregistre (DCR), puis redirige vers `/login` et `/oauth/consent` : on se connecte et on accepte le consentement. Voir [specs/mcp.md](specs/mcp.md).
- **Pare-feu :** si l'accès entrant est filtré, autoriser les IP d'Anthropic, `160.79.104.0/21`.
- **Retour arrière :** déployer un tag `sha-<court>` dans Dokploy. Les migrations ne sont pas annulées : une version antérieure doit rester compatible avec le schéma.

## Checklist de mise en ligne

À suivre dans l'ordre pour la première mise en ligne. Chaque étape renvoie au détail plus haut et dit ce qu'il faut constater avant de passer à la suivante.

1. **Image :** `bun run stack:up` passe sur une base vide ([Stack de prod en local](#stack-de-prod-en-local)), et `dev` est vert en CI.
2. **[DNS](#dns) :** `dig +short poj.ch` renvoie l'IP du VPS.
3. **[Dokploy](#dokploy), étapes 1 à 5 :** la base `poj` est vide, ce qui est attendu ; `prisma migrate deploy` y appliquera la migration initiale au premier démarrage. Les variables d'environnement sont toutes renseignées, `ORIGIN` comprise ([`ORIGIN` et proxy](#points-propres-à-poj)). Le certificat Let's Encrypt est délivré.
4. **[GitHub](#github) :** le secret `DEPLOY_HOOK_URL` est posé.
5. **Déployer :** avancer `main` sur `dev` (avance rapide) et pousser. Dans les logs Dokploy, l'app affiche `Applying migration`, puis `Listening on http://0.0.0.0:3000`.
6. **Compte admin :** ouvrir tout de suite `https://poj.ch/register` ([pourquoi](#points-propres-à-poj)).
7. **[Vérification après déploiement](#vérification-après-déploiement) :** la section entière.
8. **[Brancher Claude](#points-propres-à-poj) :** après le consentement, le connecteur liste ses outils.

## Vérification après déploiement

**Découverte OAuth, JWKS et MCP**, depuis n'importe quel poste :

```sh
O=https://poj.ch
# Ressource protégée : "resource" vaut $O/mcp, "authorization_servers" [$O/api/auth].
curl -s $O/.well-known/oauth-protected-resource/mcp
# Serveur d'autorisation : "issuer" vaut $O/api/auth, tous les endpoints sont en https://poj.ch.
curl -s $O/.well-known/oauth-authorization-server/api/auth
# JWKS : 200.
curl -s -o /dev/null -w '%{http_code}\n' $O/api/auth/jwks
# MCP sans jeton : 401, avec
# WWW-Authenticate: Bearer resource_metadata="$O/.well-known/oauth-protected-resource/mcp", scope="cards"
curl -si -X POST $O/mcp -H 'content-type: application/json' -d '{}' | grep -iE '^HTTP|www-authenticate'
```

Une URL en `http://` ou avec un autre hôte que `poj.ch` dans ces réponses signale une `ORIGIN` mal réglée.

**Depuis le conteneur**, l'app doit joindre sa propre URL publique, sinon le MCP refuse tous les jetons :

```sh
docker exec <conteneur> node -e "fetch('https://poj.ch/api/auth/jwks').then((r) => console.log(r.status))"   # 200
```

**Parcours dans le navigateur :**

1. `/register` crée le compte admin ; un second passage sur `/register` renvoie vers `/login`.
2. Déconnexion, puis `/login` avec ce compte : retour sur `/cards`.
3. `/admin` est accessible et génère un lien d'invitation. Le révoquer aussitôt s'il ne sert qu'au test : un compte créé ne se supprime pas depuis l'interface.
4. Avec le premier vrai testeur : son lien, ouvert en navigation privée, crée son compte, qui reçoit un 403 sur `/admin`.

## Stack de prod en local

Pour tester l'image avant de pousser, sans toucher aux bases de dev :

```sh
cp .env.example .env    # renseigner BETTER_AUTH_SECRET ; DATABASE_URL et ORIGIN sont imposés
bun run stack:up        # construit l'image, crée la base `poj`, http://localhost:3000
bun run stack:stop
```

- Le service `proxy` (Caddy, en HTTP) tient le rôle du proxy de Dokploy, et l'app joint sa propre `ORIGIN` à travers lui.
- `stack:up` passe le sha court de `HEAD` à l'image (`BUILD_COMMIT`, `local` à défaut), comme la CI passe celui du commit déployé.
- Claude ne peut pas joindre `localhost` : le connecteur ne se teste qu'en ligne.
- Le projet Compose s'appelle `poj` : depuis un worktree, `stack:up` remplace `app` et `proxy` et réutilise `db`.
- La base `poj` survit à `stack:stop`. Pour rejouer une première mise en ligne (migrations sur base vide, puis `/register`), la supprimer avant `stack:up`, qui la recrée : `docker exec poj-db-1 psql -U root -d postgres -c 'DROP DATABASE poj WITH (FORCE)'`.
