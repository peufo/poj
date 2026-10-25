import { ORIGIN, BETTER_AUTH_SECRET } from '$app/env/private';
import { betterAuth } from 'better-auth/minimal';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { createAuthOptions } from '#lib/server/auth-config.js';
import { db } from '#lib/server/db/index.js';

const options = createAuthOptions({ db, origin: ORIGIN, secret: BETTER_AUTH_SECRET });

export const auth = betterAuth({
	...options,
	plugins: [
		...options.plugins,
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
});

export type AuthSession = typeof auth.$Infer.Session;
