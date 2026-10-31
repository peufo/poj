import { requireAdmin } from '#lib/server/web/guards.js';
import { accounts, invitations } from '#lib/server/web/services.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
	requireAdmin(event);
	const [users, pending] = await Promise.all([accounts.list(), invitations.listPending()]);
	return { users, pending };
};
