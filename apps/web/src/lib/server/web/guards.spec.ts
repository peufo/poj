import { isHttpError, isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import type { UserRole } from '../domain/index';
import { ownerOf, requireAdmin } from './guards';

const localsOf = (role?: UserRole) =>
	(role ? { user: { id: 'u1', role } } : {}) as unknown as App.Locals;

/** Ce que lève la garde sur `path`, ou l'id renvoyé. */
function run(guard: (locals: App.Locals, url: URL) => string, locals: App.Locals, path = '/cards') {
	try {
		return guard(locals, new URL(path, 'http://poj.test'));
	} catch (thrown) {
		return thrown;
	}
}

describe('owner guard', () => {
	it('sends a visitor without session to the login page', () => {
		const thrown = run(ownerOf, localsOf());
		expect(isRedirect(thrown) && thrown.location).toBe('/login');
	});

	it('keeps the requested page for after the login', () => {
		const thrown = run(ownerOf, localsOf(), '/cards/abc/edit?q=chat');
		expect(isRedirect(thrown) && thrown.location).toBe(
			'/login?redirectTo=%2Fcards%2Fabc%2Fedit%3Fq%3Dchat'
		);
	});

	it('returns the id of any signed-in user', () => {
		expect(run(ownerOf, localsOf('user'))).toBe('u1');
	});
});

describe('admin guard', () => {
	it('sends a visitor without session to the login page, back to /admin', () => {
		const thrown = run(requireAdmin, localsOf(), '/admin');
		expect(isRedirect(thrown) && thrown.location).toBe('/login?redirectTo=%2Fadmin');
	});

	it('forbids a tester', () => {
		const thrown = run(requireAdmin, localsOf('user'), '/admin');
		expect(isHttpError(thrown) && thrown.status).toBe(403);
	});

	it('lets an administrator through', () => {
		expect(run(requireAdmin, localsOf('admin'), '/admin')).toBe('u1');
	});
});
