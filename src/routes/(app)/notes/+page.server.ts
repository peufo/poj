import { fail } from '@sveltejs/kit';
import { db } from '#lib/server/db/index.js';
import { createNotesService } from '#lib/server/domain/index.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const notes = await createNotesService(db).list(locals.user!.id);
	return {
		notes: notes.map(({ id, title, content, updatedAt }) => ({ id, title, content, updatedAt }))
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const form = await request.formData();
		const title = form.get('title')?.toString().trim() ?? '';
		const content = form.get('content')?.toString() ?? '';
		if (!title) return fail(400, { title, content, message: 'Le titre est requis' });

		await createNotesService(db).create(locals.user!.id, { title, content });
	}
};
