# Image de production de l'app web (apps/web), construite depuis la racine du workspace bun.
# Bun installe les dépendances ; Node construit (comme en local) et exécute la sortie
# d'adapter-node. L'image finale ne contient que cette sortie et les dépendances de
# production, dont la CLI Prisma pour `migrate deploy` au démarrage.

FROM node:22.23.0-bookworm-slim AS base
# Le moteur de migration de Prisma a besoin d'OpenSSL, dont il détecte la version.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
	&& rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS install
# Même version de Bun que celle qui a écrit `bun.lock`, pour que `--frozen-lockfile` soit fiable.
COPY --from=oven/bun:1.2.22-slim /usr/local/bin/bun /usr/local/bin/bun
COPY package.json bun.lock ./
COPY apps/web/package.json apps/web/

FROM install AS build
RUN bun install --frozen-lockfile
COPY . .
# Le client Prisma (ignoré par git) est généré puis embarqué par Vite. Les variables de
# `src/env.ts` sont validées dès l'analyse des routes, et `prisma.config.ts` exige
# `DATABASE_URL` : des valeurs factices suffisent, car aucune n'est figée dans le build
# (toutes sont lues au démarrage). L'erreur de connexion à la base que Better Auth
# journalise pendant l'analyse est sans conséquence.
RUN cd apps/web \
	&& export DATABASE_URL=postgres://build@localhost/build ORIGIN=http://localhost:3000 \
		BETTER_AUTH_SECRET=build-build-build-build-build-build \
	&& bun run db:generate && bun run build

FROM install AS deps
RUN bun install --frozen-lockfile --production

FROM base
# Les dates affichées (échéancier, « aujourd'hui ») suivent le fuseau du processus.
ENV NODE_ENV=production PORT=3000 TZ=Europe/Zurich
COPY --from=deps /app ./
COPY apps/web/prisma.config.ts apps/web/
COPY apps/web/prisma apps/web/prisma
COPY --from=build /app/apps/web/build apps/web/build
WORKDIR /app/apps/web
# `.git` est exclu du contexte : le sha du commit déployé entre par ici.
ARG BUILD_COMMIT
ENV BUILD_COMMIT=$BUILD_COMMIT
USER node
EXPOSE 3000/tcp
# `start` applique les migrations (`prisma migrate deploy`), puis lance le serveur.
CMD ["npm", "start"]
