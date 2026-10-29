import { isHttpError, isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import type { UserRole } from '../domain/index';
import { ownerOf, requireAdmin } from './guards';

const localsOf = (role?: UserRole) =>
	(role ? { user: { id: 'u1', role } } : {}) as unknown as App.Locals;

/** Ce que lève la garde, ou l'id renvoyé. */
function run(guard: (locals: App.Locals) => string, locals: App.Locals) {
	try {
		return guard(locals);
	} catch (thrown) {
		return thrown;
	}
}

describe('owner guard', () => {
	it('sends a visitor without session to the login page', () => {
		const thrown = run(ownerOf, localsOf());
		expect(isRedirect(thrown) && thrown.location).toBe('/login');
	});

	it('returns the id of any signed-in user', () => {
		expect(run(ownerOf, localsOf('user'))).toBe('u1');
	});
});

describe('admin guard', () => {
	it('sends a visitor without session to the login page', () => {
		const thrown = run(requireAdmin, localsOf());
		expect(isRedirect(thrown) && thrown.location).toBe('/login');
	});

	it('forbids a tester', () => {
		const thrown = run(requireAdmin, localsOf('user'));
		expect(isHttpError(thrown) && thrown.status).toBe(403);
	});

	it('lets an administrator through', () => {
		expect(run(requireAdmin, localsOf('admin'))).toBe('u1');
	});
});
