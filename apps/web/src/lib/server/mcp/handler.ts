import { createMcpHandler, type AuthInfo } from '@modelcontextprotocol/server';
import { createPojMcpServer, type PojMcpDeps } from './server';

export type McpRequestHandler = (
	request: Request,
	ownerId: string,
	authInfo?: AuthInfo
) => Promise<Response>;

/**
 * Sert une requête MCP (Streamable HTTP, sans état) pour un propriétaire déjà
 * authentifié : un serveur neuf par requête, l'état restant en base. Les clients
 * 2025 sont servis par le repli sans état du SDK.
 */
export function createMcpRequestHandler(deps: Omit<PojMcpDeps, 'ownerId'>): McpRequestHandler {
	return (request, ownerId, authInfo) =>
		createMcpHandler(() => createPojMcpServer({ ...deps, ownerId })).fetch(request, { authInfo });
}
