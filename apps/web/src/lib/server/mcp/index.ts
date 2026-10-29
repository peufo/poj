import { db } from '#lib/server/db/index.js';
import { translator } from '#lib/server/deepl/index.js';
import {
	createCardsService,
	createDecksService,
	createReviewsService,
	createTranslationService
} from '#lib/server/domain/index.js';
import { createMcpRequestHandler } from './handler';

export { createMcpRequestHandler, type McpRequestHandler } from './handler';
export { createPojMcpServer, type PojMcpDeps } from './server';

/** Réponse MCP à une requête dont le propriétaire est déjà authentifié (route `/mcp`). */
export const handleMcpRequest = createMcpRequestHandler({
	cards: createCardsService(db),
	decks: createDecksService(db),
	reviews: createReviewsService(db),
	translation: createTranslationService(translator)
});
