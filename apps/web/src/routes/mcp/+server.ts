import { ORIGIN } from '$app/env/private';
import { auth } from '#lib/server/auth.js';
import { MCP_SCOPE, mcpResource } from '#lib/server/auth-config.js';
import { handleMcpRequest } from '#lib/server/mcp/index.js';
import { createMcpEndpoint } from '#lib/server/mcp/endpoint.js';
import { accounts } from '#lib/server/web/services.js';
import type { RequestHandler } from './$types';

// Serveur MCP sans état : POST seulement (GET et DELETE répondent 405).
const endpoint = createMcpEndpoint({
	auth,
	accounts,
	handle: handleMcpRequest,
	resource: mcpResource(ORIGIN),
	scope: MCP_SCOPE
});

export const POST: RequestHandler = ({ request }) => endpoint(request);
