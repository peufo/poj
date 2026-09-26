export type { Note } from '../../db/generated/prisma/client';

export interface NoteInput {
	title: string;
	content?: string;
}

export interface CreateNoteInput extends NoteInput {
	/** Identifiant optionnel fourni par le client (UUID), pour des créations idempotentes. */
	id?: string;
}

export type NotePatch = Partial<NoteInput>;
