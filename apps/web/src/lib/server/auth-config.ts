import { mcp } from '@better-auth/mcp';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { bearer, jwt } from 'better-auth/plugins';
import type { Db, UserRole } from '#lib/server/domain/index.js';
import { signUpHooks } from '#lib/server/sign-up-hooks.js';

/** Scope propre au serveur MCP : lire et modifier les cartes et leurs révisions. */
export const MCP_SCOPE = 'cards';

/** Scopes que l'autorisation OAuth accepte (OIDC standard + `cards`). */
export const OAUTH_SCOPES = ['openid', 'profile', 'email', 'offline_access', MCP_SCOPE];

/** Identifiant de la ressource protégée (RFC 8707/9728) : l'URL du serveur MCP. */
export const mcpResource = (origin: string) => `${origin}/mcp`;

/**
 * Options Better Auth partagées par l'app (`auth.ts`, qui ajoute `sveltekitCookies` en
 * dernier) et les tests (`testing/auth.ts`). Sans import SvelteKit.
 *
 * Better Auth est aussi le serveur d'autorisation OAuth du connecteur Claude
 * (`@better-auth/mcp`, doc/specs/mcp.md) : DCR ouvert, connexion par `/login`,
 * consentement par `/oauth/consent`, jetons JWT liés à la ressource `${origin}/mcp`.
 */
export function createAuthOptions({
	db,
	origin,
	secret
}: {
	db: Db;
	origin: string;
	secret: string;
}) {
	const resource = mcpResource(origin);
	return {
		baseURL: origin,
		secret,
		database: prismaAdapter(db, { provider: 'postgresql' }),
		emailAndPassword: { enabled: true },
		user: {
			additionalFields: {
				// Lu dans `locals.user`, jamais modifiable par les endpoints (inscription,
				// `/update-user`). Le premier compte devient admin (`signUpHooks`).
				role: {
					type: ['user', 'admin'] as UserRole[],
					input: false,
					defaultValue: 'user'
				}
			}
		},
		advanced: { database: { generateId: 'uuid' as const } },
		databaseHooks: signUpHooks(db),
		// `/token` (plugin jwt) émettrait un JWT pour une session : inutile ici.
		disabledPaths: ['/token'],
		plugins: [
			bearer(), // session via `Authorization: Bearer <token>` (client mobile)
			jwt(), // clés de signature (JWKS) des jetons OAuth
			mcp({
				resource,
				loginPage: '/login',
				consentPage: '/oauth/consent',
				scopes: OAUTH_SCOPES,
				// Avec Prisma sur PostgreSQL, la ressource doit déclarer ses scopes.
				resources: [{ identifier: resource, name: 'Poj', allowedScopes: OAUTH_SCOPES }],
				resourceSeedMode: 'overwrite',
				// Claude s'enregistre par DCR (client public, PKCE obligatoire).
				allowDynamicClientRegistration: true,
				allowUnauthenticatedClientRegistration: true,
				// Clients natifs (Claude Code, boucle locale) qui omettent `application_type`.
				clientRegistrationDefaultApplicationType: 'infer'
			})
		]
	};
}
