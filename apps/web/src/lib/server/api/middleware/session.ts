import { createMiddleware } from 'hono/factory';
import { auth } from '#lib/server/auth.js';
import type { AppEnv } from '../types';

/**
 * Exige une session valide, par cookie (web) ou par `Authorization: Bearer <token>`
 * (mobile, via le plugin `bearer`). Réutilise la session résolue par `hooks.server.ts`
 * quand l'app est montée dans SvelteKit, sinon la résout depuis les headers.
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
	const locals = c.env?.locals;
	const current =
		locals?.user && locals.session
			? { user: locals.user, session: locals.session }
			: await auth.api.getSession({ headers: c.req.raw.headers });

	if (!current) {
		return c.json({ error: 'unauthorized' }, 401);
	}

	c.set('user', current.user);
	c.set('session', current.session);
	await next();
});
