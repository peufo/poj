import { isHttpError, isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import type { UserRole } from '../domain/index';
import { requireAdmin } from './admin';

const localsOf = (role?: UserRole) =>
	(role ? { user: { id: 'u1', role } } : {}) as unknown as App.Locals;

/** Ce que lève la garde, ou l'id renvoyé. */
function guard(locals: App.Locals) {
	try {
		return requireAdmin(locals);
	} catch (thrown) {
		return thrown;
	}
}

describe('admin guard', () => {
	it('sends a visitor without session to the login page', () => {
		const thrown = guard(localsOf());
		expect(isRedirect(thrown) && thrown.location).toBe('/login');
	});

	it('forbids a tester', () => {
		const thrown = guard(localsOf('user'));
		expect(isHttpError(thrown) && thrown.status).toBe(403);
	});

	it('lets an administrator through', () => {
		expect(guard(localsOf('admin'))).toBe('u1');
	});
});
