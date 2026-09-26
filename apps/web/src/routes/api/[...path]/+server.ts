import type { RequestHandler } from './$types';
import { api } from '#lib/server/api/index.js';

// Délègue toutes les requêtes /api/* (hors /api/auth/*, servi par Better Auth
// dans hooks.server.ts) à l'app Hono.
const handler: RequestHandler = ({ request, locals }) => api.fetch(request, { locals });

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
