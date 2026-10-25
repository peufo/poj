import { auth } from '#lib/server/auth.js';
import { publicMetadata } from '#lib/server/mcp/discovery.js';
import type { RequestHandler } from './$types';

// Métadonnées de la ressource protégée (RFC 9728), servies par le plugin `mcp()` :
// `/.well-known/oauth-protected-resource` et la variante suffixée `/…/mcp`.
export const GET: RequestHandler = ({ request }) => publicMetadata(auth.handler(request));
