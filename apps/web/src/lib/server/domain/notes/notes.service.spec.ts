import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { PrismaClient } from '../../db/generated/prisma/client';
import { ConflictError, NotFoundError } from '../errors';
import { createNotesService } from './notes.service';

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: inject('databaseUrl') }) });
const notes = createNotesService(db);

let alice: string;
let bob: string;

beforeEach(async () => {
	await db.$executeRaw`TRUNCATE notes, users CASCADE`;
	({ id: alice } = await db.user.create({ data: { name: 'Alice', email: 'alice@test.dev' } }));
	({ id: bob } = await db.user.create({ data: { name: 'Bob', email: 'bob@test.dev' } }));
});

afterAll(() => db.$disconnect());

describe('notes service', () => {
	it('creates notes and lists only the owner’s', async () => {
		const { note, created } = await notes.create(alice, { title: 'Hello' });
		await notes.create(bob, { title: 'Bob note' });

		expect(created).toBe(true);
		expect(note.content).toBe('');
		expect(await notes.list(alice)).toEqual([note]);
	});

	it('generates UUID v7 ids', async () => {
		const { note } = await notes.create(alice, { title: 'Hello' });
		expect(note.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
	});

	it('is idempotent when the client replays a create with the same id', async () => {
		const id = crypto.randomUUID();
		const first = await notes.create(alice, { id, title: 'Once' });
		const replay = await notes.create(alice, { id, title: 'Once' });

		expect(replay).toEqual({ note: first.note, created: false });
		expect(await notes.list(alice)).toHaveLength(1);
	});

	it('rejects an id already owned by another user', async () => {
		const id = crypto.randomUUID();
		await notes.create(bob, { id, title: 'Bob note' });

		await expect(notes.create(alice, { id, title: 'Mine?' })).rejects.toBeInstanceOf(ConflictError);
		await expect(notes.upsert(alice, id, { title: 'Mine?' })).rejects.toBeInstanceOf(ConflictError);
	});

	it('hides other users’ notes', async () => {
		const { note } = await notes.create(bob, { title: 'Secret' });

		await expect(notes.get(alice, note.id)).rejects.toBeInstanceOf(NotFoundError);
		await expect(notes.update(alice, note.id, { title: 'x' })).rejects.toBeInstanceOf(
			NotFoundError
		);
		await expect(notes.softDelete(alice, note.id)).rejects.toBeInstanceOf(NotFoundError);
	});

	it('upserts: creates then replaces', async () => {
		const id = crypto.randomUUID();
		const created = await notes.upsert(alice, id, { title: 'v1', content: 'a' });
		const replaced = await notes.upsert(alice, id, { title: 'v2' });

		expect(created.created).toBe(true);
		expect(replaced.created).toBe(false);
		expect(replaced.note).toMatchObject({ id, title: 'v2', content: '' });
	});

	it('updates only the given fields', async () => {
		const { note } = await notes.create(alice, { title: 'Title', content: 'Body' });
		const updated = await notes.update(alice, note.id, { title: 'New title' });

		expect(updated).toMatchObject({ title: 'New title', content: 'Body' });
		expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(note.updatedAt.getTime());
	});

	it('soft-deletes idempotently', async () => {
		const { note } = await notes.create(alice, { title: 'Bye' });

		await notes.softDelete(alice, note.id);
		await notes.softDelete(alice, note.id);

		expect(await notes.list(alice)).toEqual([]);
		await expect(notes.get(alice, note.id)).rejects.toBeInstanceOf(NotFoundError);
		expect((await db.note.findUnique({ where: { id: note.id } }))?.deletedAt).toBeInstanceOf(Date);
	});
});
