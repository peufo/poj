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

	it('builds the login URL, without a parameter for the home page', () => {
		expect(loginUrl('/review?ahead=1')).toBe('/login?redirectTo=%2Freview%3Fahead%3D1');
		expect(loginUrl('/cards')).toBe('/login');
	});
});
