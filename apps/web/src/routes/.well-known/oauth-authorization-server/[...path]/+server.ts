import { oauthProviderAuthServerMetadata } from '@better-auth/oauth-provider';
import { auth } from '#lib/server/auth.js';
import { publicMetadata } from '#lib/server/mcp/discovery.js';
import type { RequestHandler } from './$types';

const atRoot = oauthProviderAuthServerMetadata(auth);

// Métadonnées du serveur d'autorisation (RFC 8414). L'émetteur est `${ORIGIN}/api/auth` :
// - `/.well-known/oauth-authorization-server/api/auth` (insertion du chemin, spec MCP
//   2025-06-18 et suivantes) est servi par le plugin ;
// - `/.well-known/oauth-authorization-server` (racine, spec MCP 2025-03-26) par son helper.
// `/api/auth/.well-known/{oauth-authorization-server,openid-configuration}` passent par
// `svelteKitHandler` (hooks.server.ts).
export const GET: RequestHandler = ({ request, params }) =>
	publicMetadata(params.path ? auth.handler(request) : atRoot(request));
