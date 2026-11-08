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
const forecast = [
	{ position: 0, perDay: 4 },
	{ position: 0.5, perDay: 2 },
	{ position: 1, perDay: 0.3 }
];

describe('Belt', () => {
	it('shows the ready and waiting cards under the belt, and links to the review', async () => {
		render(Belt, { stock: 182, due: 10, tokens, forecast, reviewHref: '/review?deck=x' });

		await expect.element(page.getByText('10', { exact: true })).toBeVisible();
		await expect.element(page.getByText('prêtes')).toBeVisible();
		await expect.element(page.getByText('182', { exact: true })).toBeVisible();
		await expect.element(page.getByText('neuves')).toBeVisible();
		await expect
			.element(page.getByRole('link', { name: 'Réviser' }))
			.toHaveAttribute('href', '/review?deck=x');
	});

	it('draws the ready cards in their box only, not on the belt', async () => {
		const { container } = render(Belt, { stock: 0, due: 3, tokens, forecast, reviewHref: '/r' });
		const tape = container.querySelector('[role="presentation"]');
		assert.exists(tape);

		// Le tapis est dessiné une fois sa largeur mesurée ; une carte prête n'y figure pas.
		await expect.poll(() => tape.querySelector('svg')).not.toBeNull();
		expect(tape.querySelectorAll('.fill-accent')).toHaveLength(0);
	});

	it('leaves the waiting box out without new cards', async () => {
		render(Belt, { stock: 0, due: 1, tokens, forecast, reviewHref: '/review' });

		await expect.element(page.getByText('prête', { exact: true })).toBeVisible();
		await expect.element(page.getByText('neuve')).not.toBeInTheDocument();
	});

	it('reads the cards to review up to a stop, from the keyboard', async () => {
		render(Belt, { stock: 0, due: 10, tokens, forecast, reviewHref: '/review' });
		const slider = page.getByRole('slider', { name: "Cartes à réviser d'ici une date" });

		const estimate = (rate: string) =>
			`, environ ${rate} révisions par jour à ce moment, estimation`;
		await expect
			.element(slider)
			.toHaveAttribute('aria-valuetext', `11 cartes d'ici 1 j${estimate('2')}`);
		slider.element().focus();
		await expect.element(slider).toHaveFocus();
		await expect.element(page.getByText("d'ici 1 j")).toBeVisible();

		await userEvent.keyboard('{ArrowRight}');
		await expect
			.element(slider)
			.toHaveAttribute('aria-valuetext', `12 cartes d'ici 2 j${estimate('2')}`);
		await userEvent.keyboard('{End}');
		await expect
			.element(slider)
			.toHaveAttribute('aria-valuetext', `13 cartes d'ici 2 ans +${estimate('0,3')}`);
		await expect.element(page.getByText('· ≈ 0,3/j')).toBeVisible();
	});

	it('places the line where the belt is touched', async () => {
		const { container } = render(Belt, {
			stock: 0,
			due: 0,
			tokens,
			forecast,
			reviewHref: '/review'
		});
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

	it('presents the forecast as an estimate, and leaves it out without reviews', async () => {
		const shown = render(Belt, { stock: 0, due: 1, tokens, forecast, reviewHref: '/review' });
		await expect.element(page.getByText('≈ révisions par jour')).toBeVisible();
		await shown.unmount();

		const empty = forecast.map((point) => ({ ...point, perDay: 0 }));
		render(Belt, { stock: 0, due: 1, tokens, forecast: empty, reviewHref: '/review' });
		await expect.element(page.getByText('≈ révisions par jour')).not.toBeInTheDocument();
	});
});
