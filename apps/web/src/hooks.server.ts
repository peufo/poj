import { sequence, type Handle } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { auth } from '#lib/server/auth.js';
import { handleCsrf } from '#lib/server/web/csrf.js';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import * as z from 'zod';

// Messages de Zod en français (formulaires, API, MCP), pour les règles sans message explicite.
z.config(z.locales.fr());

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

// Le CSRF passe en premier : un envoi refusé ne doit atteindre ni la session ni Better Auth.
export const handle: Handle = sequence(handleCsrf, handleBetterAuth);
