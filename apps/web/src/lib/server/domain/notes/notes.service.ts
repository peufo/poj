import type { Db } from '../db';
import { ConflictError, NotFoundError } from '../errors';
import type { CreateNoteInput, Note, NoteInput, NotePatch } from './types';

export type NotesService = ReturnType<typeof createNotesService>;

export function createNotesService(db: Db) {
	async function findOwned(ownerId: string, id: string): Promise<Note> {
		const note = await db.note.findFirst({ where: { id, ownerId, deletedAt: null } });
		if (!note) throw new NotFoundError(`Note ${id} not found`);
		return note;
	}

	/** Lève une ConflictError si l'id existe déjà chez un autre propriétaire. */
	async function assertNotForeign(ownerId: string, id: string): Promise<Note | null> {
		const existing = await db.note.findUnique({ where: { id } });
		if (existing && existing.ownerId !== ownerId) {
			throw new ConflictError(`Note ${id} already exists`);
		}
		return existing;
	}

	return {
		list(ownerId: string): Promise<Note[]> {
			return db.note.findMany({
				where: { ownerId, deletedAt: null },
				orderBy: { updatedAt: 'desc' }
			});
		},

		get: findOwned,

		/**
		 * Idempotent quand `id` est fourni : rejouer la même création renvoie la note
		 * existante (`created: false`) au lieu d'un doublon.
		 */
		async create(
			ownerId: string,
			{ id, title, content = '' }: CreateNoteInput
		): Promise<{ note: Note; created: boolean }> {
			if (id) {
				const existing = await assertNotForeign(ownerId, id);
				if (existing) return { note: existing, created: false };
			}
			const note = await db.note.create({ data: { id, title, content, ownerId } });
			return { note, created: true };
		},

		/** Crée ou remplace la note `id` (PUT idempotent). Restaure une note supprimée. */
		async upsert(
			ownerId: string,
			id: string,
			{ title, content = '' }: NoteInput
		): Promise<{ note: Note; created: boolean }> {
			const existing = await assertNotForeign(ownerId, id);
			const note = await db.note.upsert({
				where: { id },
				create: { id, title, content, ownerId },
				update: { title, content, deletedAt: null }
			});
			return { note, created: !existing };
		},

		async update(ownerId: string, id: string, patch: NotePatch): Promise<Note> {
			await findOwned(ownerId, id);
			return db.note.update({ where: { id }, data: patch });
		},

		/** Suppression logique, idempotente : supprimer une note déjà supprimée réussit. */
		async softDelete(ownerId: string, id: string): Promise<void> {
			const existing = await db.note.findFirst({ where: { id, ownerId } });
			if (!existing) throw new NotFoundError(`Note ${id} not found`);
			if (existing.deletedAt) return;
			await db.note.update({ where: { id }, data: { deletedAt: new Date() } });
		}
	};
}
