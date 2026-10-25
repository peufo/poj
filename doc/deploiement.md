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
2. **Application :**
   - provider Docker, image `ghcr.io/peufo/poj:main` ;
   - registre : `ghcr.io`, avec un jeton GitHub (classic) au scope `read:packages`, tant que le paquet est privé.
3. **Variables d'environnement** (modèle : `.env.example` à la racine) :
   - `ORIGIN=https://poj.ch` ;
   - `DATABASE_URL` : l'URL interne de la base ;
   - `BETTER_AUTH_SECRET` : `openssl rand -base64 32`, à ne plus changer ensuite (il signe les sessions et chiffre les clés JWKS) ;
   - `DEEPL_API_KEY` (facultative ; `:fx` pour le plan gratuit).
4. **Domaine :** `poj.ch`, HTTPS activé (Let's Encrypt), port du conteneur `3000`.
5. **Webhook :** copier l'URL de l'onglet Deployments dans le secret GitHub.

### DNS

Un enregistrement `A` (et `AAAA` si le VPS a une IPv6) de `poj.ch` vers le VPS, avant de demander le certificat.

## Points propres à Poj

- **`ORIGIN` = l'URL HTTPS publique,** sans barre finale. Better Auth, l'émetteur OAuth (`${ORIGIN}/api/auth`) et la ressource MCP (`${ORIGIN}/mcp`) en dérivent.
  - adapter-node (SvelteKit 3) ne lit pas `ORIGIN` : il reconstruit l'URL des requêtes depuis l'en-tête `Host`, en supposant HTTPS. Derrière le proxy de Dokploy, cela donne `https://poj.ch`.
  - Une autre adresse (IP, port direct) ne correspond plus à `ORIGIN` : formulaires refusés (403) et `/api/auth/*` introuvable (404).
- **L'app doit joindre sa propre URL publique :** la vérification des jetons du MCP télécharge le JWKS sur `${ORIGIN}/api/auth/jwks`. À vérifier depuis le conteneur :

  ```sh
  docker exec <conteneur> node -e "fetch('https://poj.ch/api/auth/jwks').then((r) => console.log(r.status))"
  ```

- **Créer le compte juste après la première mise en ligne :** Poj n'a qu'un compte, et le premier visiteur de `/register` le prend. Ensuite, l'inscription est fermée.
- **Brancher Claude :** sur claude.ai, ajouter un connecteur personnalisé d'URL `https://poj.ch/mcp`. Claude s'enregistre (DCR), puis on se connecte et on accepte le consentement. Voir [specs/mcp.md](specs/mcp.md).
- **Pare-feu :** si l'accès entrant est filtré, autoriser les IP d'Anthropic, `160.79.104.0/21`.
- **Retour arrière :** déployer un tag `sha-<court>` dans Dokploy. Les migrations ne sont pas annulées : une version antérieure doit rester compatible avec le schéma.

## Stack de prod en local

Pour tester l'image avant de pousser, sans toucher aux bases de dev :

```sh
cp .env.example .env    # renseigner BETTER_AUTH_SECRET ; DATABASE_URL et ORIGIN sont imposés
bun run stack:up        # construit l'image, crée la base `poj`, http://localhost:3000
bun run stack:stop
```

- Le service `proxy` (Caddy, en HTTP) tient le rôle du proxy de Dokploy, et l'app joint sa propre `ORIGIN` à travers lui.
- Claude ne peut pas joindre `localhost` : le connecteur ne se teste qu'en ligne.
