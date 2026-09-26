import { createRoute, z } from '@hono/zod-openapi';
import { db } from '#lib/server/db/index.js';
import { createNotesService, type Note } from '#lib/server/domain/index.js';
import { createApp } from '../factory';
import { requireAuth } from '../middleware/session';
import { ErrorSchema, errorResponses, jsonContent } from '../schemas';

const NoteSchema = z
	.object({
		id: z.uuid(),
		title: z.string(),
		content: z.string(),
		createdAt: z.iso.datetime(),
		updatedAt: z.iso.datetime()
	})
	.openapi('Note');

// Schémas plats (pas de `.extend()` sur un schéma nommé, exporté en `allOf`) pour
// des types simples côté clients générés.
const noteInputShape = {
	title: z.string().trim().min(1).max(200),
	content: z.string().max(100_000).optional()
};

const NoteInputSchema = z.object(noteInputShape).openapi('NoteInput');

const CreateNoteSchema = z
	.object({
		id: z.uuid().optional().openapi({
			description:
				'Identifiant généré par le client. Rejouer la requête avec le même id est sans effet.'
		}),
		...noteInputShape
	})
	.openapi('CreateNote');

const NotePatchSchema = z.object(noteInputShape).partial().openapi('NotePatch');

const IdParams = z.object({
	id: z.uuid().openapi({ param: { name: 'id', in: 'path' } })
});

const notFound = { 404: jsonContent(ErrorSchema, 'Note introuvable') } as const;
const security: Record<string, string[]>[] = [{ Bearer: [] }, { Cookie: [] }];

const toDto = (note: Note) => ({
	id: note.id,
	title: note.title,
	content: note.content,
	createdAt: note.createdAt.toISOString(),
	updatedAt: note.updatedAt.toISOString()
});

const notes = () => createNotesService(db);

export const notesApp = createApp();

notesApp.use('*', requireAuth);

notesApp.openapi(
	createRoute({
		method: 'get',
		operationId: 'listNotes',
		path: '/notes',
		tags: ['Notes'],
		security,
		responses: {
			200: jsonContent(z.object({ data: z.array(NoteSchema) }), 'Notes de l’utilisateur'),
			...errorResponses
		}
	}),
	async (c) => {
		const list = await notes().list(c.var.user.id);
		return c.json({ data: list.map(toDto) }, 200);
	}
);

notesApp.openapi(
	createRoute({
		method: 'post',
		operationId: 'createNote',
		path: '/notes',
		tags: ['Notes'],
		security,
		request: {
			body: { content: { 'application/json': { schema: CreateNoteSchema } }, required: true }
		},
		responses: {
			201: jsonContent(NoteSchema, 'Note créée'),
			200: jsonContent(NoteSchema, 'Note déjà existante (requête rejouée)'),
			409: jsonContent(ErrorSchema, 'Identifiant déjà utilisé'),
			...errorResponses
		}
	}),
	async (c) => {
		const { note, created } = await notes().create(c.var.user.id, c.req.valid('json'));
		return created ? c.json(toDto(note), 201) : c.json(toDto(note), 200);
	}
);

notesApp.openapi(
	createRoute({
		method: 'get',
		operationId: 'getNote',
		path: '/notes/{id}',
		tags: ['Notes'],
		security,
		request: { params: IdParams },
		responses: { 200: jsonContent(NoteSchema, 'Note'), ...notFound, ...errorResponses }
	}),
	async (c) => {
		const note = await notes().get(c.var.user.id, c.req.valid('param').id);
		return c.json(toDto(note), 200);
	}
);

notesApp.openapi(
	createRoute({
		method: 'put',
		operationId: 'putNote',
		path: '/notes/{id}',
		tags: ['Notes'],
		security,
		summary: 'Crée ou remplace une note (idempotent)',
		request: {
			params: IdParams,
			body: { content: { 'application/json': { schema: NoteInputSchema } }, required: true }
		},
		responses: {
			200: jsonContent(NoteSchema, 'Note remplacée'),
			201: jsonContent(NoteSchema, 'Note créée'),
			409: jsonContent(ErrorSchema, 'Identifiant déjà utilisé'),
			...errorResponses
		}
	}),
	async (c) => {
		const { note, created } = await notes().upsert(
			c.var.user.id,
			c.req.valid('param').id,
			c.req.valid('json')
		);
		return created ? c.json(toDto(note), 201) : c.json(toDto(note), 200);
	}
);

notesApp.openapi(
	createRoute({
		method: 'patch',
		operationId: 'updateNote',
		path: '/notes/{id}',
		tags: ['Notes'],
		security,
		request: {
			params: IdParams,
			body: { content: { 'application/json': { schema: NotePatchSchema } }, required: true }
		},
		responses: { 200: jsonContent(NoteSchema, 'Note modifiée'), ...notFound, ...errorResponses }
	}),
	async (c) => {
		const note = await notes().update(c.var.user.id, c.req.valid('param').id, c.req.valid('json'));
		return c.json(toDto(note), 200);
	}
);

notesApp.openapi(
	createRoute({
		method: 'delete',
		operationId: 'deleteNote',
		path: '/notes/{id}',
		tags: ['Notes'],
		security,
		summary: 'Suppression logique (idempotente)',
		request: { params: IdParams },
		responses: { 204: { description: 'Note supprimée' }, ...notFound, ...errorResponses }
	}),
	async (c) => {
		await notes().softDelete(c.var.user.id, c.req.valid('param').id);
		return c.body(null, 204);
	}
);
