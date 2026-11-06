import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Wordmark from './Wordmark.svelte';

describe('Wordmark', () => {
	it('is named poj for assistive technologies', async () => {
		render(Wordmark);

		await expect.element(page.getByRole('img', { name: 'poj' })).toBeVisible();
	});

	it('scales to the requested height, keeping its proportions', async () => {
		render(Wordmark, { size: 28 });
		const logo = page.getByRole('img', { name: 'poj' });

		await expect.element(logo).toHaveAttribute('height', '28');
		const { width, height } = (logo.element() as SVGSVGElement).viewBox.baseVal;
		expect(Number(logo.element().getAttribute('width'))).toBeCloseTo((28 * width) / height, 5);
	});
});
