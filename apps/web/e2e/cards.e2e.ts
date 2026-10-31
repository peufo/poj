import { expect, test } from '@playwright/test';
import {
	createCard,
	createSubjectDeck,
	expectRemoteSubmission,
	languageDeckId,
	open,
	signIn,
	unique
} from './helpers';

// Formulaires des cartes : création et doublon, bouton DeepL, modification et
// avertissement de réinitialisation, suppression, objectif du jour.

test.beforeEach(async ({ page }) => signIn(page));

test('warns about a duplicate, then saves it once confirmed', async ({ page }) => {
	const deckId = await createSubjectDeck(page);
	const question = unique('Pays');
	await createCard(page, deckId, question, 'Paris');

	await open(page, `/cards/new?deck=${deckId}`);
	await page.getByLabel('Question').fill(question);
	await page.getByLabel('Réponse').fill('Lyon');
	await page.getByRole('button', { name: 'Enregistrer la carte' }).click();

	await expect(page.getByText(/Une carte a déjà/)).toBeVisible();
	await expectRemoteSubmission(page);
	await expect(page.getByLabel('Réponse')).toHaveValue('Lyon');
	await page.getByRole('button', { name: 'Enregistrer quand même' }).click();

	await expect(page).toHaveURL(new RegExp(`/cards\\?deck=${deckId}$`));
	await expect(page.getByText('Lyon')).toBeVisible();
});

test('offers DeepL once there is a text to translate', async ({ page }) => {
	// Le deck de langue de la seed (sans appeler DeepL).
	await open(page, `/cards/new?deck=${await languageDeckId(page)}`);
	const deepl = page.getByRole('button', { name: 'Traduire avec DeepL' });
	await expect(deepl).toBeDisabled();
	await page.getByRole('textbox').first().fill('le chat');
	await expect(deepl).toBeEnabled();
});

test('edits a card after the reset warning', async ({ page }) => {
	const deckId = await createSubjectDeck(page);
	const id = await createCard(page, deckId, unique('Pays'), 'Rome');

	await open(page, `/cards/${id}/edit`);
	await page.getByLabel('Réponse').fill('Milan');
	await expect(page.getByText('La progression repartira de zéro')).toBeVisible();
	await page.getByRole('button', { name: 'Enregistrer les modifications' }).click();

	await expect(page).toHaveURL(new RegExp(`/cards/${id}$`));
	await expect(page.getByText('Milan')).toBeVisible();
});

test('deletes a card after confirmation', async ({ page }) => {
	const deckId = await createSubjectDeck(page);
	const question = unique('Pays');
	const id = await createCard(page, deckId, question, 'Berne');

	await open(page, `/cards/${id}`);
	await page.getByRole('button', { name: 'Supprimer la carte' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Supprimer', exact: true }).click();

	await expect(page).toHaveURL(/\/cards$/);
	await open(page, `/cards?deck=${deckId}`);
	await expect(page.getByText(question)).toHaveCount(0);
});

test('sets the daily goal', async ({ page }) => {
	await open(page, '/cards');
	await page.getByText(/Objectif : \d+ cartes? par jour/).click();
	await page.getByLabel('Cartes à ajouter par jour').fill('7');
	await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();

	await expect(page.getByText('Objectif enregistré : 7 cartes par jour.')).toBeVisible();
	await expectRemoteSubmission(page);
	await expect(page.getByText('Objectif : 7 cartes par jour')).toBeVisible();
});
