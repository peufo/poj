import { page } from 'vitest/browser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import Celebration, { CELEBRATED_KEY } from './Celebration.svelte';

const today = new Date('2026-01-11T23:00:00Z');
const message = () => page.getByText('Journée complète');

/** Simule la préférence `prefers-reduced-motion`. */
function reduceMotion(reduce: boolean) {
	const matchMedia = window.matchMedia.bind(window);
	vi.spyOn(window, 'matchMedia').mockImplementation((query) =>
		query.includes('prefers-reduced-motion')
			? ({ ...matchMedia(query), matches: reduce } as MediaQueryList)
			: matchMedia(query)
	);
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('Celebration', () => {
	it('stays hidden while the day is not complete', async () => {
		render(Celebration, { date: today, full: false });

		await expect.element(message()).not.toBeInTheDocument();
		expect(localStorage.getItem(CELEBRATED_KEY)).toBeNull();
	});

	it('celebrates a complete day once, not again on the next load', async () => {
		const first = render(Celebration, { date: today, full: true });
		await expect.element(message()).toBeVisible();
		expect(localStorage.getItem(CELEBRATED_KEY)).toBe(today.toISOString());
		first.unmount();

		render(Celebration, { date: today, full: true });
		await expect.element(message()).not.toBeInTheDocument();
	});

	it('celebrates when the day becomes complete, and again the next day', async () => {
		const screen = render(Celebration, { date: today, full: false });
		await screen.rerender({ date: today, full: true });
		await expect.element(message()).toBeVisible();

		localStorage.setItem(CELEBRATED_KEY, today.toISOString());
		screen.unmount();
		render(Celebration, { date: new Date('2026-01-12T23:00:00Z'), full: true });
		await expect.element(message()).toBeVisible();
	});

	it('appears without motion when motion is reduced', async () => {
		reduceMotion(true);
		render(Celebration, { date: today, full: true });

		await expect.element(message()).toBeVisible();
		expect(message().element().getAnimations()).toHaveLength(0);
	});

	it('slides in otherwise', async () => {
		reduceMotion(false);
		render(Celebration, { date: today, full: true });

		await expect.element(message()).toBeInTheDocument();
		expect(message().element().getAnimations().length).toBeGreaterThan(0);
	});
});
