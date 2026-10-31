import { expect, test } from '@playwright/test';
import { createSubjectDeck, expectRemoteSubmission, open, signIn, unique } from './helpers';

// Formulaires des decks : création, nom déjà pris, modification, suppression confirmée.

test.beforeEach(async ({ page }) => signIn(page));

test('creates a deck, then refuses a name already taken', async ({ page }) => {
	const name = unique('Capitales');
	await createSubjectDeck(page, name);

	await open(page, '/decks/new');
	await page.getByLabel('Nom').fill(name);
	await page.getByRole('radio', { name: /Sujet/ }).check();
	await page.getByRole('button', { name: 'Créer le deck' }).click();

	await expect(page.getByText('Tu as déjà un deck de ce nom.')).toBeVisible();
	await expectRemoteSubmission(page);
	await expect(page.getByLabel('Nom')).toHaveValue(name);
	await expect(page.getByRole('radio', { name: /Sujet/ })).toBeChecked();
});

test('renames a deck', async ({ page }) => {
	const id = await createSubjectDeck(page);
	const renamed = unique('Renommé');

	await open(page, `/decks/${id}/edit`);
	await page.getByLabel('Nom').fill(renamed);
	await page.getByRole('button', { name: 'Enregistrer les modifications' }).click();

	await expect(page).toHaveURL(new RegExp(`/cards\\?deck=${id}$`));
	await expect(page.getByText(renamed).first()).toBeVisible();
});

test('deletes a deck after confirmation', async ({ page }) => {
	const id = await createSubjectDeck(page);

	await open(page, `/decks/${id}/edit`);
	await page.getByRole('button', { name: 'Supprimer le deck' }).click();
	const confirmation = page.getByRole('dialog');
	await expect(confirmation.getByText('Supprimer ce deck ?')).toBeVisible();
	await confirmation.getByRole('button', { name: 'Supprimer', exact: true }).click();

	await expect(page).toHaveURL(/\/cards$/);
	await open(page, `/decks/${id}/edit`);
	await expect(page.getByText('Deck introuvable')).toBeVisible();
});
