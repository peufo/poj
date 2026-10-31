import { expect, type Page } from '@playwright/test';
import { SANDBOX_ACCOUNT } from '../src/lib/server/testing/sandbox-account';

// Outils partagés des specs e2e. La base est chargée avec la seed du bac à sable
// (`src/lib/server/testing/seed.ts`) : un compte administrateur et le deck
// « Français → Anglais », avec des révisions dues.

/**
 * Ouvre `path` et attend que l'app ait démarré (SvelteKit marque alors l'entrée
 * d'historique) et que plus rien ne charge : avant, un envoi partirait sans les remote
 * functions, en rechargeant la page.
 */
export async function open(page: Page, path: string) {
	await page.goto(path);
	await page.waitForFunction(() => history.state !== null);
	await page.waitForLoadState('networkidle');
}

/** Un envoi sans redirection est passé par la remote function : l'URL n'a pas changé. */
export async function expectRemoteSubmission(page: Page) {
	await expect(page).not.toHaveURL(/\/remote=/);
}

/** Connexion au compte de la seed (formulaire `/login`). */
export async function signIn(page: Page) {
	await open(page, '/login');
	await page.getByLabel('Email').fill(SANDBOX_ACCOUNT.email);
	await page.getByLabel('Mot de passe').fill(SANDBOX_ACCOUNT.password);
	await page.getByRole('button', { name: 'Se connecter' }).click();
	await expect(page).toHaveURL(/\/cards/);
}

/** Id du deck « Français → Anglais » de la seed (deck de langue, avec DeepL). */
export async function languageDeckId(page: Page) {
	await open(page, '/cards');
	const href = await page
		.getByRole('link', { name: /^Français → Anglais/ })
		.first()
		.getAttribute('href');
	return new URL(href!, page.url()).searchParams.get('deck')!;
}

/** Nom unique d'un lancement à l'autre et d'un test à l'autre. */
export const unique = (prefix: string) => `${prefix} ${Math.random().toString(36).slice(2, 8)}`;

/** Crée un deck de sujet (`Question` / `Réponse`) et renvoie son id. */
export async function createSubjectDeck(page: Page, name = unique('Sujet')) {
	await open(page, '/decks/new');
	await page.getByLabel('Nom').fill(name);
	await page.getByRole('radio', { name: /Sujet/ }).check();
	await page.getByRole('button', { name: 'Créer le deck' }).click();
	await expect(page).toHaveURL(/\/cards\?deck=/);
	return new URL(page.url()).searchParams.get('deck')!;
}

/** Crée une carte dans le deck de sujet `deckId` et renvoie son id. */
export async function createCard(page: Page, deckId: string, question: string, answer: string) {
	await open(page, `/cards/new?deck=${deckId}`);
	await page.getByLabel('Question').fill(question);
	await page.getByLabel('Réponse').fill(answer);
	await page.getByRole('button', { name: 'Enregistrer la carte' }).click();
	await expect(page).toHaveURL(new RegExp(`/cards\\?deck=${deckId}$`));
	await page
		.getByRole('link', { name: new RegExp(question) })
		.first()
		.click();
	await expect(page).toHaveURL(/\/cards\/[0-9a-f-]{36}$/);
	return page.url().split('/').pop()!;
}
