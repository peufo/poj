import { Scalar } from '@scalar/hono-api-reference';
import { HTTPException } from 'hono/http-exception';
import { ConflictError, NotFoundError } from '#lib/server/domain/index.js';
import { createApp } from './factory';
import { v1 } from './v1';

export const api = createApp().basePath('/api');

api.openAPIRegistry.registerComponent('securitySchemes', 'Bearer', {
	type: 'http',
	scheme: 'bearer',
	description: 'Token renvoyé dans le header `set-auth-token` par `POST /api/auth/sign-in/email`.'
});
api.openAPIRegistry.registerComponent('securitySchemes', 'Cookie', {
	type: 'apiKey',
	in: 'cookie',
	name: 'better-auth.session_token'
});

api.route('/v1', v1);

api.doc31('/openapi.json', {
	openapi: '3.1.0',
	info: { title: 'poj API', version: '1.0.0' }
});
api.get('/docs', Scalar({ url: '/api/openapi.json', pageTitle: 'poj API' }));

api.notFound((c) => c.json({ error: 'not_found' }, 404));

api.onError((err, c) => {
	if (err instanceof NotFoundError)
		return c.json({ error: 'not_found', message: err.message }, 404);
	if (err instanceof ConflictError) return c.json({ error: 'conflict', message: err.message }, 409);
	if (err instanceof HTTPException) return err.getResponse();
	console.error(err);
	return c.json({ error: 'internal_error' }, 500);
});

export type Api = typeof api;
