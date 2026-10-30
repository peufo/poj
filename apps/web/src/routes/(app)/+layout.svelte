<script lang="ts">
	import { page } from '$app/state';
	import AppShell from '#lib/components/AppShell.svelte';
	import Celebration from '#lib/components/Celebration.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const current = $derived.by(() => {
		const path = page.url.pathname;
		if (path.startsWith('/review')) return 'review';
		if (path === '/cards/new') return 'new';
		if (path === '/decks/new') return 'new-deck';
		if (path.startsWith('/connect')) return 'connect';
		// Administration : hors des onglets, aucun n'est actif.
		if (path.startsWith('/admin')) return undefined;
		return 'cards';
	});

	// Deck affiché : `?deck=`, ou celui qu'on modifie.
	const activeDeck = $derived(
		page.url.searchParams.get('deck') ??
			(page.route.id === '/(app)/decks/[id]/edit' ? (page.params.id ?? null) : null)
	);

	// Révision et formulaires : la barre d'onglets s'efface (barre d'action au pouce).
	const focus = $derived(
		current === 'review' ||
			current === 'new' ||
			current === 'new-deck' ||
			(page.route.id?.endsWith('/edit') ?? false)
	);
</script>

<Celebration date={data.day.date} full={data.day.full} />

<AppShell
	{current}
	user={data.user}
	dueCount={data.nav.dueCount}
	decks={data.nav.decks}
	{activeDeck}
	{focus}
>
	{@render children()}
</AppShell>
