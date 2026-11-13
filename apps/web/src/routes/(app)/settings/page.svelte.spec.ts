import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Page from './+page.svelte';

describe('/settings', () => {
	it('says notifications are unavailable without VAPID keys', async () => {
		render(Page, { data: { notifications: null } } as never);

		await expect.element(page.getByText('Notifications indisponibles')).toBeInTheDocument();
		await expect
			.element(page.getByRole('button', { name: 'Activer les notifications' }))
			.not.toBeInTheDocument();
		await expect.element(page.getByLabelText('Seuil de cartes prêtes')).not.toBeInTheDocument();
	});

	it('shows the threshold of the account when notifications are available', async () => {
		render(Page, {
			data: {
				notifications: {
					vapidPublicKey:
						'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
					endpoints: [],
					threshold: { value: 12, min: 1, max: 100 }
				}
			}
		} as never);

		await expect.element(page.getByLabelText('Seuil de cartes prêtes')).toHaveValue(12);
		await expect.element(page.getByText('Notifications indisponibles')).not.toBeInTheDocument();
	});
});
