import { page, userEvent } from 'vitest/browser';
import { assert, beforeEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { ComponentProps } from 'svelte';
import Belt from './Belt.svelte';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = new Date();
const tokens = [
	{ id: 'a', dueAt: now.getTime() + 2 * HOUR, level: 1 as const },
	{ id: 'b', dueAt: now.getTime() + 36 * HOUR, level: 2 as const },
	{ id: 'c', dueAt: now.getTime() + 40 * DAY, level: 3 as const }
];
/** `n` cartes prêtes. */
const readyCards = (n: number) => Array.from({ length: n }, (_, i) => `r${i}`);

/** Ce que montre la boîte des prêtes, sans espaces : « 2prêtes ». */
const readyBox = () =>
	document
		.querySelector('[aria-label="Tapis des révisions"] > div:last-child > p')
		?.textContent.replace(/\s+/g, '') ?? '';

const forecast = [
	{ position: 0, perDay: 4 },
	{ position: 0.5, perDay: 2 },
	{ position: 1, perDay: 0.3 }
];
const props = (overrides: Partial<ComponentProps<typeof Belt>> = {}) => ({
	stock: 0,
	ready: [],
	tokens,
	forecast,
	now,
	reviewHref: '/review',
	...overrides
});

/** Les cartes vues en chute, dans l'ordre, avec ce que montrait alors la boîte des prêtes. */
function watchFalls() {
	const falls: { id: string; box: string }[] = [];
	const observer = new MutationObserver(() => {
		for (const mark of document.querySelectorAll('[data-falling]')) {
			const id = mark.getAttribute('data-falling') ?? '';
			if (!falls.some((fall) => fall.id === id)) falls.push({ id, box: readyBox() });
		}
	});
	observer.observe(document.body, { childList: true, subtree: true });
	return falls;
}

describe('Belt', () => {
	beforeEach(() => localStorage.clear());

	it('shows the ready and waiting cards under the belt, and links to the review', async () => {
		render(Belt, props({ stock: 182, ready: readyCards(10), reviewHref: '/review?deck=x' }));

		await expect.element(page.getByText('10', { exact: true })).toBeVisible();
		await expect.element(page.getByText('prêtes')).toBeVisible();
		await expect.element(page.getByText('182', { exact: true })).toBeVisible();
		await expect.element(page.getByText('neuves')).toBeVisible();
		await expect
			.element(page.getByRole('link', { name: 'Réviser' }))
			.toHaveAttribute('href', '/review?deck=x');
	});

	it('draws the ready cards in their box only, not on the belt', async () => {
		const { container } = render(Belt, props({ ready: readyCards(3) }));
		const tape = container.querySelector('[role="presentation"]');
		assert.exists(tape);

		// Le tapis est dessiné une fois sa largeur mesurée ; une carte prête n'y figure pas.
		await expect.poll(() => tape.querySelector('svg')).not.toBeNull();
		expect(tape.querySelectorAll('.fill-accent')).toHaveLength(0);
	});

	it('leaves the waiting box out without new cards', async () => {
		render(Belt, props({ ready: readyCards(1) }));

		await expect.element(page.getByText('prête', { exact: true })).toBeVisible();
		await expect.element(page.getByText('neuve')).not.toBeInTheDocument();
	});

	it('reads the cards to review up to a stop, from the keyboard', async () => {
		render(Belt, props({ ready: readyCards(10) }));
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
		const { container } = render(Belt, props());
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
		const shown = render(Belt, props({ ready: readyCards(1) }));
		await expect.element(page.getByText('≈ révisions par jour')).toBeVisible();
		await shown.unmount();

		const empty = forecast.map((point) => ({ ...point, perDay: 0 }));
		render(Belt, props({ ready: readyCards(1), forecast: empty }));
		await expect.element(page.getByText('≈ révisions par jour')).not.toBeInTheDocument();
	});

	it('drops the cards that became ready since the last visit into their box, once', async () => {
		const seen = [
			['x', now.getTime() - HOUR],
			['a', now.getTime() + 2 * HOUR]
		];
		localStorage.setItem('poj:belt-seen', JSON.stringify(seen));
		const falls = watchFalls();
		const visit = props({ ready: ['x', 'y'] });

		const first = render(Belt, visit);
		// `x` était sur le tapis : il tombe, et la boîte ne le compte qu'une fois arrivé.
		await expect.poll(() => falls).toEqual([{ id: 'x', box: '1prête' }]);
		await expect.poll(readyBox).toBe('2prêtes');
		expect(document.querySelector('[data-falling]')).toBeNull();
		await first.unmount();

		// Sans changement depuis, rien ne bouge.
		render(Belt, visit);
		await expect.poll(readyBox).toBe('2prêtes');
		expect(falls).toHaveLength(1);
	});

	it('drops a card into the box as it reaches the end of the belt, page open', async () => {
		const start = new Date();
		const falls = watchFalls();
		const { container } = render(
			Belt,
			props({ tokens: [{ id: 'z', dueAt: start.getTime() + 400, level: 1 }], now: start })
		);
		const onBelt = () => container.querySelector('path.fill-level-1');

		await expect.poll(onBelt).not.toBeNull();
		await expect.poll(() => falls).toEqual([{ id: 'z', box: '0prête' }]);
		expect(onBelt()).toBeNull();
		await expect.poll(readyBox).toBe('1prête');
	});
});
