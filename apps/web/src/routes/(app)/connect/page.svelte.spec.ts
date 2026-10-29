import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

describe('/connect', () => {
	it('shows the connector url, the three steps and the free plan limit', async () => {
		render(Page, {
			data: { connectorUrl: 'https://poj.test/mcp' }
		} as never);

		await expect
			.element(page.getByLabelText('URL du connecteur'))
			.toHaveValue('https://poj.test/mcp');
		await expect.element(page.getByRole('button', { name: 'Copier' })).toBeInTheDocument();
		await expect.element(page.getByRole('heading', { level: 2 }).nth(2)).toBeInTheDocument();
		await expect.element(page.getByText(/plan Free/)).toBeInTheDocument();
	});
});
