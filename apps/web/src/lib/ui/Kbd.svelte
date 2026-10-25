<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<!-- Raccourci clavier : masqué au toucher, où il n'a pas de sens. -->
<kbd
	class="hidden h-5 min-w-5 items-center justify-center rounded-sm border border-line-strong bg-surface px-1 font-sans text-[0.6875rem] leading-none font-medium text-ink-3 [@media(hover:hover)]:inline-flex"
>
	{@render children()}
</kbd>
