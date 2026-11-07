import { page, userEvent } from 'vitest/browser';
import { assert, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { beltPosition } from '#lib/format/belt.js';
import Belt from './Belt.svelte';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const tokens = [
	{ position: beltPosition(2 * HOUR), level: 1 as const },
	{ position: beltPosition(36 * HOUR), level: 2 as const },
	{ position: beltPosition(40 * DAY), level: 3 as const }
];

describe('Belt', () => {
	it('shows the ready and waiting cards under the belt, and links to the review', async () => {
		render(Belt, { stock: 182, due: 10, tokens, reviewHref: '/review?deck=x' });

		await expect.element(page.getByText('10', { exact: true })).toBeVisible();
		await expect.element(page.getByText('prêtes')).toBeVisible();
		await expect.element(page.getByText('182', { exact: true })).toBeVisible();
		await expect.element(page.getByText('neuves')).toBeVisible();
		await expect
			.element(page.getByRole('link', { name: 'Réviser' }))
			.toHaveAttribute('href', '/review?deck=x');
	});

	it('leaves the waiting box out without new cards', async () => {
		render(Belt, { stock: 0, due: 1, tokens, reviewHref: '/review' });

		await expect.element(page.getByText('prête', { exact: true })).toBeVisible();
		await expect.element(page.getByText('neuve')).not.toBeInTheDocument();
	});

	it('reads the cards to review up to a stop, from the keyboard', async () => {
		render(Belt, { stock: 0, due: 10, tokens, reviewHref: '/review' });
		const slider = page.getByRole('slider', { name: "Cartes à réviser d'ici une date" });

		await expect.element(slider).toHaveAttribute('aria-valuetext', "11 cartes d'ici 1 j");
		slider.element().focus();
		await expect.element(slider).toHaveFocus();
		await expect.element(page.getByText("d'ici 1 j")).toBeVisible();

		await userEvent.keyboard('{ArrowRight}');
		await expect.element(slider).toHaveAttribute('aria-valuetext', "12 cartes d'ici 2 j");
		await userEvent.keyboard('{End}');
		await expect.element(slider).toHaveAttribute('aria-valuetext', "13 cartes d'ici 2 ans +");
	});

	it('places the line where the belt is touched', async () => {
		const { container } = render(Belt, { stock: 0, due: 0, tokens, reviewHref: '/review' });
		const tape = container.querySelector('[role="presentation"]');
		assert.exists(tape);

		await expect.element(page.getByText(/cartes? d'ici/)).not.toBeInTheDocument();
		const { left, width } = tape.getBoundingClientRect();
		const touch = (type: string, target: EventTarget = tape) =>
			target.dispatchEvent(
				new PointerEvent(type, { bubbles: true, pointerType: 'touch', clientX: left + width })
			);

		// Au bout du tapis : toutes les cartes.
		touch('pointerdown');
		touch('pointerleave');
		await expect.element(page.getByText(/3 cartes\s+d'ici 2 ans \+/)).toBeVisible();
		touch('pointerdown', document.body);
		await expect.element(page.getByText(/d'ici/)).not.toBeInTheDocument();
	});
});
