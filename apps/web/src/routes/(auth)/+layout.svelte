<script lang="ts">
	import Wordmark from '#lib/components/Wordmark.svelte';

	let { children } = $props();
</script>

<main class="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-4 py-12">
	<Wordmark size={28} />
	{@render children()}
</main>
