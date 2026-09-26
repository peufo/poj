import { OpenAPIHono } from '@hono/zod-openapi';
import type { AppEnv } from './types';

/** Toute sous-app OpenAPI passe par ici pour partager le format des erreurs de validation. */
export function createApp() {
	return new OpenAPIHono<AppEnv>({
		defaultHook: (result, c) => {
			if (!result.success) {
				return c.json({ error: 'validation_error', issues: result.error.issues }, 422);
			}
		}
	});
}
