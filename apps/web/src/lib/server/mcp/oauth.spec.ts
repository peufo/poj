import { createHash, randomBytes } from 'node:crypto';
import { oauthProviderAuthServerMetadata } from '@better-auth/oauth-provider';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MCP_SCOPE, mcpResource } from '../auth-config';
import type { Jwks } from '../db/generated/prisma/client';
import {
	createAccountsService,
	createCardsService,
	createDecksService,
	createReviewsService,
	createTranslationService
} from '../domain/index';
import { oauthApiContext, oauthQuery, oauthRedirect } from '../oauth-flow';
import { createTestAuth, TEST_ORIGIN, type TestAuth } from '../testing/auth';
import { useTestDatabase } from '../testing/db';
import { createMcpEndpoint } from './endpoint';
import { createMcpRequestHandler } from './handler';

// Parcours OAuth complet du connecteur Claude, au niveau HTTP (comme Claude) contre
// `auth.handler`, sauf la connexion et le consentement : les pages SvelteKit (`/login`,
// `/oauth/consent`) ne font qu'appeler `signInEmail` / `oauth2Consent` avec la requête
// signée, ce que ces tests reproduisent avec les mêmes helpers (`oauth-flow.ts`).

const db = useTestDatabase();
const resource = mcpResource(TEST_ORIGIN);
const CLAUDE_CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
const email = 'jonas@test.dev';
const password = 'motdepasse123';

let auth: TestAuth;
let endpoint: (request: Request) => Promise<Response>;
/**
 * Clé de signature (plugin jwt) conservée d'un test à l'autre, comme en production : le
 * JWKS est mis en cache par URL et ne peut être retéléchargé que toutes les 30 s.
 */
let signingKey: Jwks | null = null;

beforeEach(async () => {
	if (signingKey) await db.jwks.create({ data: signingKey });
	// Après la remise à zéro de la base : l'instance réinscrit la ressource au démarrage.
	auth = createTestAuth(db);
	endpoint = createMcpEndpoint({
		auth,
		accounts: createAccountsService(db),
		handle: createMcpRequestHandler({
			cards: createCardsService(db),
			decks: createDecksService(db),
			reviews: createReviewsService(db),
			translation: createTranslationService(null)
		}),
		resource,
		scope: MCP_SCOPE
	});
	// `requireMcpAuth` télécharge le JWKS (`/api/auth/jwks`) : on route vers l'instance.
	const realFetch = globalThis.fetch;
	vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
		const request = new Request(input, init);
		return request.url.startsWith(TEST_ORIGIN) ? auth.handler(request) : realFetch(request);
	});
	await auth.api.signUpEmail({ body: { name: 'Jonas', email, password } });
});

afterEach(async () => {
	vi.unstubAllGlobals();
	signingKey ??= await db.jwks.findFirst();
});

const url = (path: string) => new URL(path, TEST_ORIGIN).toString();

const get = (path: string, headers?: HeadersInit) =>
	auth.handler(new Request(url(path), { headers, redirect: 'manual' }));

const postForm = (path: string, body: Record<string, string>) =>
	auth.handler(
		new Request(url(path), {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams(body)
		})
	);

/** Enregistrement dynamique (RFC 7591), comme le fait Claude. */
async function register(body: Record<string, unknown> = {}) {
	const response = await auth.handler(
		new Request(url('/api/auth/oauth2/register'), {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				client_name: 'Claude',
				redirect_uris: [CLAUDE_CALLBACK],
				grant_types: [
					'authorization_code',
					'refresh_token',
					'urn:ietf:params:oauth:grant-type:jwt-bearer'
				],
				response_types: ['code'],
				token_endpoint_auth_method: 'none',
				...body
			})
		})
	);
	expect(response.status).toBeLessThan(300);
	return (await response.json()) as { client_id: string; [key: string]: unknown };
}

function pkce() {
	const verifier = randomBytes(32).toString('base64url');
	const challenge = createHash('sha256').update(verifier).digest('base64url');
	return { verifier, challenge };
}

function authorizePath(
	clientId: string,
	challenge: string,
	{ redirectUri = CLAUDE_CALLBACK, scope = `${MCP_SCOPE} offline_access` } = {}
) {
	const params = new URLSearchParams({
		response_type: 'code',
		client_id: clientId,
		redirect_uri: redirectUri,
		scope,
		state: 'xyz',
		code_challenge: challenge,
		code_challenge_method: 'S256',
		resource
	});
	return `/api/auth/oauth2/authorize?${params}`;
}

/** En-tête `Cookie` à partir des `Set-Cookie` d'une réponse. */
const cookiesOf = (headers: Headers) =>
	headers
		.getSetCookie()
		.map((c) => c.split(';')[0])
		.join('; ');

/** Requête POST d'un formulaire de la page `page` (navigateur, éventuellement connecté). */
const formPost = (page: URL, cookie?: string) =>
	new Request(page, { method: 'POST', headers: cookie ? { cookie } : {} });

/** Action de `/login` : `signInEmail` avec la requête signée reprend le flux. */
async function signIn(login: URL) {
	const result = await auth.api.signInEmail({
		// Comme l'action : `oauth_query` est ajouté par le plugin, hors du type de `signInEmail`.
		body: { email, password, ...{ oauth_query: oauthQuery(login) } },
		...oauthApiContext(formPost(login)),
		returnHeaders: true
	});
	return {
		next: new URL(oauthRedirect(result.response)!, TEST_ORIGIN),
		cookie: cookiesOf(result.headers)
	};
}

/** Action de `/oauth/consent` : `oauth2Consent` avec la requête signée. */
async function decide(consent: URL, cookie: string, accept: boolean) {
	const result = await auth.api.oauth2Consent({
		body: { accept, oauth_query: oauthQuery(consent)! },
		...oauthApiContext(formPost(consent, cookie))
	});
	return new URL(oauthRedirect(result)!);
}

/** Parcours navigateur : authorize → /login → /oauth/consent → redirection avec le code. */
async function authorizeInBrowser(
	clientId: string,
	challenge: string,
	{ redirectUri, clientName = 'Claude' }: { redirectUri?: string; clientName?: string } = {}
) {
	const authorize = await get(authorizePath(clientId, challenge, { redirectUri }));
	expect(authorize.status).toBe(302);
	const login = new URL(authorize.headers.get('location')!, TEST_ORIGIN);
	expect(login.pathname).toBe('/login');

	const { next: consent, cookie } = await signIn(login);
	expect(consent.pathname).toBe('/oauth/consent');

	// Page de consentement : le client affiché est celui enregistré par DCR.
	const query = new URLSearchParams(oauthQuery(consent));
	const client = await auth.api.getOAuthClientPublic({
		query: { client_id: query.get('client_id')! },
		headers: new Headers({ cookie })
	});
	expect(client.client_name).toBe(clientName);
	expect(query.get('scope')).toBe(`${MCP_SCOPE} offline_access`);

	return { callback: await decide(consent, cookie, true), cookie };
}

type Tokens = {
	access_token: string;
	refresh_token: string;
	token_type: string;
	expires_in: number;
	scope: string;
};

async function exchangeCode(clientId: string, code: string, verifier: string) {
	const response = await postForm('/api/auth/oauth2/token', {
		grant_type: 'authorization_code',
		code,
		redirect_uri: CLAUDE_CALLBACK,
		client_id: clientId,
		code_verifier: verifier,
		resource
	});
	expect(response.status).toBe(200);
	return (await response.json()) as Tokens;
}

/** Jetons d'un client Claude enregistré et autorisé de bout en bout. */
async function connectClaude() {
	const { client_id } = await register();
	const { verifier, challenge } = pkce();
	const { callback } = await authorizeInBrowser(client_id, challenge);
	const tokens = await exchangeCode(client_id, callback.searchParams.get('code')!, verifier);
	return { clientId: client_id, tokens };
}

/** Client MCP (Streamable HTTP) branché sur la route `/mcp`, avec ce jeton. */
async function mcpClient(accessToken: string) {
	const transport = new StreamableHTTPClientTransport(new URL(resource), {
		fetch: (input, init) => {
			const request = new Request(input, init);
			request.headers.set('authorization', `Bearer ${accessToken}`);
			return endpoint(request);
		}
	});
	const client = new Client({ name: 'claude-test', version: '1.0.0' });
	await client.connect(transport);
	return client;
}

const mcpPost = (headers: HeadersInit = {}) =>
	endpoint(
		new Request(resource, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				accept: 'application/json, text/event-stream',
				...headers
			},
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
		})
	);

describe('OAuth discovery', () => {
	it('serves the protected resource metadata at the root and path-suffixed URLs', async () => {
		for (const path of [
			'/.well-known/oauth-protected-resource',
			'/.well-known/oauth-protected-resource/mcp'
		]) {
			const response = await get(path);
			expect(response.status).toBe(200);
			expect(await response.json()).toMatchObject({
				resource,
				authorization_servers: [`${TEST_ORIGIN}/api/auth`],
				scopes_supported: [MCP_SCOPE]
			});
		}
	});

	it('serves the authorization server metadata, with DCR, PKCE S256 and refresh', async () => {
		const paths = [
			'/.well-known/oauth-authorization-server/api/auth',
			'/api/auth/.well-known/oauth-authorization-server',
			'/api/auth/.well-known/openid-configuration'
		];
		const documents = await Promise.all(paths.map(async (path) => (await get(path)).json()));
		documents.push(
			await (await oauthProviderAuthServerMetadata(auth)(new Request(url('/.well-known/x')))).json()
		);

		for (const metadata of documents) {
			expect(metadata).toMatchObject({
				issuer: `${TEST_ORIGIN}/api/auth`,
				authorization_endpoint: `${TEST_ORIGIN}/api/auth/oauth2/authorize`,
				token_endpoint: `${TEST_ORIGIN}/api/auth/oauth2/token`,
				registration_endpoint: `${TEST_ORIGIN}/api/auth/oauth2/register`,
				code_challenge_methods_supported: ['S256']
			});
			expect(metadata.token_endpoint_auth_methods_supported).toContain('none');
			expect(metadata.scopes_supported).toEqual(
				expect.arrayContaining([MCP_SCOPE, 'offline_access'])
			);
			expect(metadata.grant_types_supported).toContain('refresh_token');
		}
	});
});

describe('/mcp without a valid token', () => {
	const metadataUrl = `${TEST_ORIGIN}/.well-known/oauth-protected-resource/mcp`;

	it('answers 401 with a WWW-Authenticate pointing to the resource metadata', async () => {
		const response = await mcpPost();
		expect(response.status).toBe(401);
		const challenge = response.headers.get('www-authenticate');
		expect(challenge).toContain(`resource_metadata="${metadataUrl}"`);
		expect(challenge).toContain(`scope="${MCP_SCOPE}"`);
	});

	it('answers 401 to an invalid or session token', async () => {
		const { token } = await auth.api.signInEmail({ body: { email, password } });
		for (const bad of ['not-a-jwt', 'a.b.c', token]) {
			const response = await mcpPost({ authorization: `Bearer ${bad}` });
			expect(response.status).toBe(401);
			expect(response.headers.get('www-authenticate')).toContain('resource_metadata=');
		}
	});

	it('answers 401 when the token user no longer exists', async () => {
		const { tokens } = await connectClaude();
		await db.user.deleteMany();

		const response = await mcpPost({ authorization: `Bearer ${tokens.access_token}` });
		expect(response.status).toBe(401);
		expect(response.headers.get('www-authenticate')).toContain(
			`resource_metadata="${metadataUrl}"`
		);
	});

	it('answers 403 insufficient_scope to a token without the cards scope', async () => {
		const { client_id } = await register();
		const { verifier, challenge } = pkce();
		const authorize = await get(authorizePath(client_id, challenge, { scope: 'openid' }));
		const login = new URL(authorize.headers.get('location')!, TEST_ORIGIN);
		const { next: consent, cookie } = await signIn(login);
		const code = (await decide(consent, cookie, true)).searchParams.get('code')!;
		const tokens = await exchangeCode(client_id, code, verifier);

		const response = await mcpPost({ authorization: `Bearer ${tokens.access_token}` });
		expect(response.status).toBe(403);
		expect(response.headers.get('www-authenticate')).toContain('error="insufficient_scope"');
	});
});

describe('Claude connector flow', () => {
	it('registers by DCR, signs in, consents, exchanges the code and lists the tools', async () => {
		const { client_id, ...registered } = await register();
		expect(registered).toMatchObject({
			client_name: 'Claude',
			redirect_uris: [CLAUDE_CALLBACK],
			token_endpoint_auth_method: 'none',
			grant_types: ['authorization_code', 'refresh_token']
		});

		const { challenge } = pkce();
		const { callback, cookie } = await authorizeInBrowser(client_id, challenge);
		expect(`${callback.origin}${callback.pathname}`).toBe(CLAUDE_CALLBACK);
		expect(callback.searchParams.get('state')).toBe('xyz');
		expect(callback.searchParams.get('iss')).toBe(`${TEST_ORIGIN}/api/auth`);

		// Sans le bon `code_verifier`, le code est refusé (PKCE).
		const code = callback.searchParams.get('code')!;
		const stolen = await postForm('/api/auth/oauth2/token', {
			grant_type: 'authorization_code',
			code,
			redirect_uri: CLAUDE_CALLBACK,
			client_id,
			code_verifier: pkce().verifier,
			resource
		});
		expect(stolen.status).toBe(400);

		// Le code a été consommé par la tentative : on recommence l'autorisation. Le
		// consentement est mémorisé, le navigateur connecté repart directement vers Claude.
		const second = pkce();
		const again = await get(authorizePath(client_id, second.challenge), { cookie });
		expect(again.status).toBe(302);
		const location = new URL(again.headers.get('location')!);
		expect(`${location.origin}${location.pathname}`).toBe(CLAUDE_CALLBACK);

		const tokens = await exchangeCode(
			client_id,
			location.searchParams.get('code')!,
			second.verifier
		);
		expect(tokens).toMatchObject({ token_type: 'Bearer' });
		expect(tokens.scope.split(' ')).toEqual(expect.arrayContaining([MCP_SCOPE, 'offline_access']));
		expect(tokens.refresh_token).toBeTruthy();

		const client = await mcpClient(tokens.access_token);
		const { tools } = await client.listTools();
		expect(tools).toHaveLength(6);
		await client.close();
	});

	it('serves the MCP tools for the token user', async () => {
		const { tokens } = await connectClaude();
		const user = await db.user.findUniqueOrThrow({ where: { email } });
		await createCardsService(db).create(
			user.id,
			{ sideA: 'tenir pour acquis', sideB: 'to take for granted' },
			'web'
		);

		const client = await mcpClient(tokens.access_token);
		const result = await client.callTool({ name: 'next_review', arguments: {} });
		expect(result.structuredContent).toMatchObject({ nothing_due: false, remaining: 1 });
		await client.close();
	});

	it('refreshes the access token, rotating the refresh token', async () => {
		const { clientId, tokens } = await connectClaude();

		const response = await postForm('/api/auth/oauth2/token', {
			grant_type: 'refresh_token',
			refresh_token: tokens.refresh_token,
			client_id: clientId,
			resource
		});
		expect(response.status).toBe(200);
		const refreshed = (await response.json()) as Tokens;
		expect(refreshed.access_token).not.toBe(tokens.access_token);
		expect(refreshed.refresh_token).not.toBe(tokens.refresh_token);

		const client = await mcpClient(refreshed.access_token);
		expect((await client.listTools()).tools).toHaveLength(6);
		await client.close();

		// Un jeton de rafraîchissement inconnu : `invalid_grant` (exigé par Claude).
		const invalid = await postForm('/api/auth/oauth2/token', {
			grant_type: 'refresh_token',
			refresh_token: 'unknown',
			client_id: clientId
		});
		expect(invalid.status).toBe(400);
		expect(await invalid.json()).toMatchObject({ error: 'invalid_grant' });
	});

	it('lets the user deny access', async () => {
		const { client_id } = await register();
		const authorize = await get(authorizePath(client_id, pkce().challenge));
		const login = new URL(authorize.headers.get('location')!, TEST_ORIGIN);
		const { next: consent, cookie } = await signIn(login);

		const callback = await decide(consent, cookie, false);
		expect(`${callback.origin}${callback.pathname}`).toBe(CLAUDE_CALLBACK);
		expect(callback.searchParams.get('error')).toBe('access_denied');
	});

	it('accepts Claude Code loopback redirects on any port', async () => {
		// Anciennes versions de Claude Code : DCR sans `application_type`.
		const { client_id, ...registered } = await register({
			client_name: 'Claude Code',
			redirect_uris: ['http://localhost:3118/callback']
		});
		expect(registered.application_type).toBe('native');

		const { challenge } = pkce();
		const { callback } = await authorizeInBrowser(client_id, challenge, {
			redirectUri: 'http://localhost:49152/callback',
			clientName: 'Claude Code'
		});
		expect(callback.host).toBe('localhost:49152');
	});
});
