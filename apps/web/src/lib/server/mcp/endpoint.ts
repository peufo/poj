import { requireMcpAuth } from '@better-auth/mcp';
import { createResourceServerChallenge } from '@better-auth/oauth-provider';
import type { AuthInfo } from '@modelcontextprotocol/server';
import { APIError } from 'better-auth/api';
import type { AccountsService } from '../domain/index';
import type { McpRequestHandler } from './handler';

/** Claims vérifiés du jeton d'accès (JWT), tels que `requireMcpAuth` les transmet. */
type AccessTokenClaims = Parameters<Parameters<typeof requireMcpAuth>[1]>[1];

export type McpEndpointDeps = {
	/** Instance Better Auth portant le plugin `mcp()` (vérifie les jetons via son JWKS). */
	auth: Parameters<typeof requireMcpAuth>[0];
	accounts: Pick<AccountsService, 'exists'>;
	handle: McpRequestHandler;
	/** Ressource protégée, identique à `mcp({ resource })` : `${ORIGIN}/mcp`. */
	resource: string;
	/** Scope exigé sur le jeton. */
	scope: string;
};

/**
 * Route `/mcp` protégée par OAuth : sans jeton valide (signature, émetteur, audience,
 * expiration), 401 + `WWW-Authenticate` pointant vers les métadonnées de la ressource ;
 * sans le scope, 403 `insufficient_scope`. Sinon, la requête MCP est servie pour
 * l'utilisateur du jeton (`sub`), s'il existe encore.
 */
export function createMcpEndpoint({ auth, accounts, handle, resource, scope }: McpEndpointDeps) {
	return requireMcpAuth(
		auth,
		async (request, claims) => {
			const userId = typeof claims.sub === 'string' ? claims.sub : '';
			if (!(await accounts.exists(userId))) return unauthorized(resource, scope);
			return handle(request, userId, toAuthInfo(request, claims, resource));
		},
		{ resource, requiredScopes: [scope] }
	);
}

function toAuthInfo(request: Request, claims: AccessTokenClaims, resource: string): AuthInfo {
	const authorization = request.headers.get('authorization') ?? '';
	const clientId = claims.azp ?? claims.client_id;
	return {
		token: authorization.replace(/^\S+\s+/, ''),
		clientId: typeof clientId === 'string' ? clientId : '',
		scopes: typeof claims.scope === 'string' ? claims.scope.split(' ').filter(Boolean) : [],
		expiresAt: claims.exp,
		resource: new URL(resource),
		extra: { userId: claims.sub }
	};
}

/** Même réponse que le plugin pour un jeton refusé (JSON-RPC, 401, `WWW-Authenticate`). */
function unauthorized(resource: string, scope: string): Response {
	const challenge = createResourceServerChallenge(
		new APIError('UNAUTHORIZED', { message: 'unknown user' }),
		resource,
		{ challengeScopes: [scope] }
	);
	if (!challenge) throw new Error('missing resource challenge');
	const headers = new Headers(challenge.headers);
	headers.set('Content-Type', 'application/json');
	return Response.json(
		{ jsonrpc: '2.0', error: { code: -32000, message: challenge.message }, id: null },
		{ status: challenge.statusCode, headers }
	);
}
