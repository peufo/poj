<script lang="ts">
	import { page } from '$app/state';
	import AppShell from '#lib/components/AppShell.svelte';
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();

	const current = $derived.by(() => {
		const path = page.url.pathname;
		if (path.startsWith('/review')) return 'review';
		if (path === '/cards/new') return 'new';
		return 'cards';
	});
</script>

<AppShell {current} user={data.user} focus={current === 'review'}>
	{@render children()}
</AppShell>
