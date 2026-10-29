import { isHttpError, isRedirect } from '@sveltejs/kit';
import { describe, expect, it } from 'vitest';
import type { UserRole } from '../domain/index';
import { ownerOf, requireAdmin, type GuardEvent } from './guards';

/** Faux event sur `path`, avec un utilisateur du rôle donné (aucun sans rôle). */
const eventOf = (path = '/cards', role?: UserRole): GuardEvent => ({
	locals: (role ? { user: { id: 'u1', role } } : {}) as unknown as App.Locals,
	url: new URL(path, 'http://poj.test')
});

/** Ce que lève la garde, ou l'id renvoyé. */
function run(guard: (event: GuardEvent) => string, event: GuardEvent) {
	try {
		return guard(event);
	} catch (thrown) {
		return thrown;
	}
}

/** Adresse de la redirection levée par la garde. */
const redirectOf = (thrown: unknown) => isRedirect(thrown) && thrown.location;

describe('owner guard', () => {
	it('sends a visitor without session to the login page', () => {
		expect(redirectOf(run(ownerOf, eventOf()))).toBe('/login');
	});

	it('keeps the requested page for after the login', () => {
		expect(redirectOf(run(ownerOf, eventOf('/cards/abc/edit?q=chat')))).toBe(
			'/login?redirectTo=%2Fcards%2Fabc%2Fedit%3Fq%3Dchat'
		);
	});

	it('drops form action parameters from the requested page', () => {
		expect(redirectOf(run(ownerOf, eventOf('/cards?/goal')))).toBe('/login');
		expect(redirectOf(run(ownerOf, eventOf('/review?ahead=1&/answer')))).toBe(
			'/login?redirectTo=%2Freview%3Fahead%3D1'
		);
	});

	it('returns the id of any signed-in user', () => {
		expect(run(ownerOf, eventOf('/cards', 'user'))).toBe('u1');
	});
});

describe('admin guard', () => {
	it('sends a visitor without session to the login page, back to /admin', () => {
		expect(redirectOf(run(requireAdmin, eventOf('/admin?/revoke')))).toBe(
			'/login?redirectTo=%2Fadmin'
		);
	});

	it('forbids a tester', () => {
		const thrown = run(requireAdmin, eventOf('/admin', 'user'));
		expect(isHttpError(thrown) && thrown.status).toBe(403);
	});

	it('lets an administrator through', () => {
		expect(run(requireAdmin, eventOf('/admin', 'admin'))).toBe('u1');
	});
});
