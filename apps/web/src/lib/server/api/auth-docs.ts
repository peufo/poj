import { z, type OpenAPIHono } from '@hono/zod-openapi';
import { ErrorSchema, jsonContent } from './schemas';

// Documentation uniquement : ces endpoints sont servis par Better Auth (hooks.server.ts),
// pas par Hono (le basePath /api est ajouté au chemin). Ils figurent dans le contrat pour que
// les clients mobiles les génèrent.

const AuthUserSchema = z
	.object({
		id: z.uuid(),
		name: z.string(),
		email: z.email(),
		emailVerified: z.boolean(),
		image: z.string().nullable().optional(),
		createdAt: z.iso.datetime(),
		updatedAt: z.iso.datetime()
	})
	.openapi('AuthUser');

const AuthResponseSchema = z
	.object({ token: z.string().nullable().optional(), user: AuthUserSchema })
	.openapi('AuthResponse');

const AuthErrorSchema = z
	.object({ code: z.string().optional(), message: z.string().optional() })
	.openapi('AuthError');

const tokenHeader = {
	'set-auth-token': {
		description: 'Token à envoyer ensuite dans `Authorization: Bearer <token>`.',
		schema: { type: 'string' as const }
	}
};

const authFailure = {
	400: jsonContent(AuthErrorSchema, 'Requête refusée'),
	401: jsonContent(AuthErrorSchema, 'Identifiants invalides'),
	422: jsonContent(AuthErrorSchema, 'Données invalides')
};

export function registerAuthDocs(registry: OpenAPIHono['openAPIRegistry']) {
	registry.registerPath({
		method: 'post',
		path: '/auth/sign-in/email',
		operationId: 'signInEmail',
		tags: ['Auth'],
		request: {
			body: {
				required: true,
				content: {
					'application/json': {
						schema: z.object({ email: z.email(), password: z.string() }).openapi('SignInEmail')
					}
				}
			}
		},
		responses: {
			200: { ...jsonContent(AuthResponseSchema, 'Connecté'), headers: tokenHeader },
			...authFailure
		}
	});

	registry.registerPath({
		method: 'post',
		path: '/auth/sign-up/email',
		operationId: 'signUpEmail',
		tags: ['Auth'],
		request: {
			body: {
				required: true,
				content: {
					'application/json': {
						schema: z
							.object({ name: z.string(), email: z.email(), password: z.string().min(8) })
							.openapi('SignUpEmail')
					}
				}
			}
		},
		responses: {
			200: { ...jsonContent(AuthResponseSchema, 'Compte créé et connecté'), headers: tokenHeader },
			...authFailure
		}
	});

	registry.registerPath({
		method: 'post',
		path: '/auth/sign-out',
		operationId: 'signOut',
		tags: ['Auth'],
		security: [{ Bearer: [] }],
		responses: {
			200: jsonContent(z.object({ success: z.boolean() }), 'Déconnecté'),
			401: jsonContent(ErrorSchema, 'Non authentifié')
		}
	});
}
