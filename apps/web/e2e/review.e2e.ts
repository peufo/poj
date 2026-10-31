import { expect, test } from '@playwright/test';
import { expectRemoteSubmission, open, signIn } from './helpers';

// Formulaires de la révision : note de la carte présentée, puis correction de cette note.
// La seed laisse des révisions dues dans le deck « Français → Anglais ».

test.beforeEach(async ({ page }) => signIn(page));

test('rates a card, then amends the rating', async ({ page }) => {
	await open(page, '/review');
	await page.getByRole('button', { name: /Afficher la réponse/ }).click();
	await page
		.getByRole('group', { name: 'Noter la réponse' })
		.getByRole('button', { name: /Again/ })
		.click();

	// La carte suivante arrive sans sa réponse ; la note donnée peut être corrigée.
	await expect(page.getByRole('button', { name: /Afficher la réponse/ })).toBeVisible();
	await expect(page.getByText(/revient dans/)).toBeVisible();
	await expectRemoteSubmission(page);

	await page.getByRole('button', { name: /Corriger/ }).click();
	await page
		.getByRole('dialog')
		.getByRole('group', { name: 'Noter la réponse' })
		.getByRole('button', { name: /Hard/ })
		.click();

	await expect(page.getByText('Note corrigée : Hard.')).toBeVisible();
});
