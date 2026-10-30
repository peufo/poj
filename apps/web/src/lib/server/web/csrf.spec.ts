import { describe, expect, it } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { handleCsrf } from './csrf';

const ORIGIN = 'https://poj.ch';
const FORM = 'application/x-www-form-urlencoded';

function send(path: string, headers: Record<string, string>) {
	const request = new Request(`${ORIGIN}${path}`, { method: 'POST', headers, body: 'a=1' });
	const event = { request, url: new URL(request.url) } as RequestEvent;
	return handleCsrf({ event, resolve: async () => new Response('passed') });
}

describe('csrf', () => {
	it('lets the OAuth token exchange through, without Origin or from another site', async () => {
		for (const path of ['/api/auth/oauth2/token', '/api/auth/oauth2/revoke']) {
			expect(await (await send(path, { 'content-type': FORM })).text()).toBe('passed');
			const crossSite = await send(path, { 'content-type': FORM, origin: 'https://claude.ai' });
			expect(await crossSite.text()).toBe('passed');
		}
	});

	it('refuses cross-site form submissions to the app', async () => {
		const cases: Record<string, string>[] = [
			{ 'content-type': FORM, origin: 'https://evil.example' },
			{ 'content-type': 'multipart/form-data; boundary=x', origin: 'https://evil.example' },
			{ 'content-type': FORM },
			{ origin: 'https://evil.example' }
		];
		for (const headers of cases) {
			const response = await send('/decks/new', headers);
			expect(response.status).toBe(403);
			expect(await response.text()).toBe('Cross-site POST form submissions are forbidden');
		}
	});

	it('refuses cross-site form submissions to the other auth endpoints', async () => {
		const response = await send('/api/auth/sign-in/email', {
			'content-type': FORM,
			origin: 'https://evil.example',
			accept: 'application/json'
		});
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({
			message: 'Cross-site POST form submissions are forbidden'
		});
	});

	it('lets same-origin submissions, JSON requests and reads through', async () => {
		expect(await (await send('/decks/new', { 'content-type': FORM, origin: ORIGIN })).text()).toBe(
			'passed'
		);
		const json = await send('/api/auth/oauth2/register', {
			'content-type': 'application/json',
			origin: 'https://evil.example'
		});
		expect(await json.text()).toBe('passed');
		const request = new Request(`${ORIGIN}/cards`);
		const event = { request, url: new URL(request.url) } as RequestEvent;
		const read = await handleCsrf({ event, resolve: async () => new Response('passed') });
		expect(await read.text()).toBe('passed');
	});
});
