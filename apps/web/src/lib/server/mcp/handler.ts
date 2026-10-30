import { createMcpHandler, type AuthInfo } from '@modelcontextprotocol/server';
import type { DecksService } from '#lib/server/domain/index.js';
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
export function createMcpRequestHandler({
	decks,
	...deps
}: Omit<PojMcpDeps, 'ownerId' | 'decks' | 'newDeckUrl'> & {
	decks: DecksService;
}): McpRequestHandler {
	return async (request, ownerId, authInfo) => {
		// Consignes et schémas d'outils sont rendus avec les decks du propriétaire (supprimés
		// exclus) ; sans deck, la capture renvoie vers la page de création, sur le même site.
		const owned = await decks.list(ownerId);
		const newDeckUrl = new URL('/decks/new', request.url).href;
		return createMcpHandler(() =>
			createPojMcpServer({ ...deps, ownerId, decks: owned, newDeckUrl })
		).fetch(request, { authInfo });
	};
}
