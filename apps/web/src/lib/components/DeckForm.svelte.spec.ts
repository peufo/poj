import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { NEW_DECK_VALUES } from '#lib/format/decks.js';
import DeckForm from './DeckForm.svelte';
import type { DeckEditForm, NewDeckForm } from '#lib/server/web/deck-form.js';

/** Remote form inerte : des champs nommés comme ceux du kit, sans erreur ni envoi. */
function fakeForm<F extends NewDeckForm | DeckEditForm>(): F {
	const methods = { issues: () => undefined, allIssues: () => undefined, value: () => undefined };
	const field = (name: string) => ({ ...methods, as: () => ({ name: `${name}/fake` }) });
	const attributes = { method: 'POST' as const, action: '?/remote=fake' };
	// Comme dans le kit, seuls la méthode et l'action se répandent sur `<form>`.
	return Object.defineProperties(
		{ ...attributes },
		{
			pending: { value: 0 },
			result: { value: undefined },
			fields: {
				value: new Proxy(methods, {
					get: (root, key) => (key in root ? root[key as keyof typeof root] : field(String(key)))
				})
			},
			enhance: { value: () => attributes }
		}
	) as unknown as F;
}

/** `first` précède `then` dans le formulaire, donc aussi à la tabulation. */
function expectBefore(first: Element, then: Element) {
	expect(first.compareDocumentPosition(then) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
}

describe('DeckForm', () => {
	it('asks for the two languages of a language deck, both directions checked', async () => {
		render(DeckForm, { form: fakeForm<NewDeckForm>(), mode: 'create', values: NEW_DECK_VALUES });

		await expect.element(page.getByRole('radio', { name: /Langue/ })).toBeChecked();
		await expect.element(page.getByLabelText('Langue connue')).toHaveValue('fr');
		await expect.element(page.getByLabelText('Langue apprise')).toBeVisible();
		await expect.element(page.getByLabelText('Première face')).not.toBeVisible();
		await expect
			.element(page.getByRole('checkbox', { name: /Réviser dans les deux sens/ }))
			.toBeChecked();
	});

	it('names a language deck after its learned language, without a name field', async () => {
		render(DeckForm, { form: fakeForm<NewDeckForm>(), mode: 'create', values: NEW_DECK_VALUES });

		await expect.element(page.getByLabelText('Nom')).not.toBeVisible();
		await page.getByLabelText('Langue apprise').selectOptions('fi');
		await expect.element(page.getByText('Le deck s’appellera « Finnois ».')).toBeVisible();
		await page.getByLabelText('Langue apprise').selectOptions('de');
		await expect.element(page.getByText('Le deck s’appellera « Allemand ».')).toBeVisible();
	});

	it('asks for the kind first, then the name of a subject', async () => {
		render(DeckForm, { form: fakeForm<NewDeckForm>(), mode: 'create', values: NEW_DECK_VALUES });

		await page.getByRole('radio', { name: /Sujet/ }).click();

		const name = page.getByLabelText('Nom');
		await expect.element(name).toBeVisible();
		await expect.element(name).toBeRequired();
		expectBefore(page.getByRole('group', { name: 'Type' }).element(), name.element());
	});

	it('switches to the faces of a subject, Question / Réponse, one way by default', async () => {
		render(DeckForm, { form: fakeForm<NewDeckForm>(), mode: 'create', values: NEW_DECK_VALUES });

		await page.getByRole('radio', { name: /Sujet/ }).click();

		await expect.element(page.getByLabelText('Langue connue')).not.toBeVisible();
		await expect.element(page.getByLabelText('Première face')).toHaveValue('Question');
		await expect.element(page.getByLabelText('Seconde face')).toHaveValue('Réponse');
		await expect
			.element(page.getByRole('checkbox', { name: /Réviser dans les deux sens/ }))
			.not.toBeChecked();
	});

	it('keeps the directions chosen by hand when the kind changes', async () => {
		render(DeckForm, { form: fakeForm<NewDeckForm>(), mode: 'create', values: NEW_DECK_VALUES });
		const both = page.getByRole('checkbox', { name: /Réviser dans les deux sens/ });

		await both.click();
		await page.getByRole('radio', { name: /Sujet/ }).click();
		await page.getByRole('radio', { name: /Langue/ }).click();

		await expect.element(both).not.toBeChecked();
	});

	it('does not offer to change the kind or the languages of a saved deck', async () => {
		render(DeckForm, {
			form: fakeForm<DeckEditForm>(),
			mode: 'edit',
			values: { ...NEW_DECK_VALUES, name: 'Anglais', languageB: 'en-GB' },
			cancelHref: '/cards?deck=d1'
		});

		await expect.element(page.getByLabelText('Nom')).not.toBeInTheDocument();
		await expect.element(page.getByRole('radio')).not.toBeInTheDocument();
		await expect.element(page.getByRole('combobox')).not.toBeInTheDocument();
		await expect.element(page.getByText(/ne se modifient pas/)).toBeInTheDocument();
		await expect.element(page.getByText(/Son nom est celui\s+de la langue apprise/)).toBeVisible();
		await expect
			.element(page.getByRole('button', { name: 'Enregistrer les modifications' }))
			.toBeInTheDocument();
	});

	it('shows the kind of a saved subject before its name', async () => {
		render(DeckForm, {
			form: fakeForm<DeckEditForm>(),
			mode: 'edit',
			values: { ...NEW_DECK_VALUES, kind: 'subject', name: 'Capitales', languageB: '' },
			cancelHref: '/cards?deck=d1'
		});

		const name = page.getByLabelText('Nom');
		await expect.element(name).toHaveValue('Capitales');
		expectBefore(page.getByText(/Deck de sujet/).element(), name.element());
	});
});
