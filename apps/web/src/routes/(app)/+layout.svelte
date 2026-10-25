<script lang="ts">
	import type { LayoutProps } from './$types';

	let { data, children }: LayoutProps = $props();
</script>

<header class="flex items-center justify-between border-b border-gray-200 px-4 py-3">
	<a href="/cards" class="font-semibold">poj</a>
	<form method="post" action="/logout" class="flex items-center gap-3 text-sm">
		<span class="text-gray-600">{data.user.email}</span>
		<button class="rounded-md border border-gray-300 px-3 py-1 hover:bg-gray-50">Déconnexion</button
		>
	</form>
</header>
<main class="mx-auto max-w-2xl px-4 py-8">
	{@render children()}
</main>
