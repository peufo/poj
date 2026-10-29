<script lang="ts">
	import { page } from '$app/state';
	import AppShell from '#lib/components/AppShell.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const current = $derived.by(() => {
		const path = page.url.pathname;
		if (path.startsWith('/review')) return 'review';
		if (path === '/cards/new') return 'new';
		if (path.startsWith('/connect')) return 'connect';
		return 'cards';
	});

	// Révision et formulaires : la barre d'onglets s'efface (barre d'action au pouce).
	const focus = $derived(
		(current !== 'cards' && current !== 'connect') || (page.route.id?.endsWith('/edit') ?? false)
	);
</script>

<AppShell
	{current}
	user={data.user}
	dueCount={data.nav.dueCount}
	cardCount={data.nav.cardCount}
	{focus}
>
	{@render children()}
</AppShell>
