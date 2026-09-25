import type { AuthSession } from '#lib/server/auth.js';

export type AppEnv = {
	Bindings: {
		/** `event.locals` transmis par la route SvelteKit (session déjà résolue par le hook). */
		locals?: App.Locals;
	};
	Variables: {
		user: AuthSession['user'];
		session: AuthSession['session'];
	};
};
