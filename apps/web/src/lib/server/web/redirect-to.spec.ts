import { describe, expect, it } from 'vitest';
import { loginUrl, safeRedirectTo } from './redirect-to';

describe('redirect after login', () => {
	it('accepts internal relative paths, with their query', () => {
		expect(safeRedirectTo('/review')).toBe('/review');
		expect(safeRedirectTo('/cards?q=%C3%A9cole')).toBe('/cards?q=%C3%A9cole');
		expect(safeRedirectTo('/cards/0199a0a0-0000-7000-8000-000000000000/edit')).toBe(
			'/cards/0199a0a0-0000-7000-8000-000000000000/edit'
		);
	});

	it('refuses anything that could leave the site', () => {
		for (const value of [
			null,
			'',
			'review',
			'//evil.example',
			'/\\evil.example',
			'/\t/evil.example',
			'https://evil.example/cards',
			'javascript:alert(1)',
			' /review'
		]) {
			expect(safeRedirectTo(value)).toBeNull();
		}
	});

	const page = (path: string) => new URL(path, 'http://poj.test');

	it('builds the login URL, without a parameter for the home page', () => {
		expect(loginUrl(page('/review?ahead=1'))).toBe('/login?redirectTo=%2Freview%3Fahead%3D1');
		expect(loginUrl(page('/cards'))).toBe('/login');
	});

	it('drops form action parameters from the page to return to', () => {
		expect(loginUrl(page('/cards?/goal'))).toBe('/login');
		expect(loginUrl(page('/review?ahead=1&/remote=x1y2/answer'))).toBe(
			'/login?redirectTo=%2Freview%3Fahead%3D1'
		);
		expect(loginUrl(page('/review?ahead=1&/answer'))).toBe(
			'/login?redirectTo=%2Freview%3Fahead%3D1'
		);
	});
});
