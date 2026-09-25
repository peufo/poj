import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => {
	if (!locals.user) redirect(302, '/login');
	return { user: { id: locals.user.id, name: locals.user.name, email: locals.user.email } };
};
