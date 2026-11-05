<script lang="ts">
	import type { Snippet } from 'svelte';
	import Wordmark from './Wordmark.svelte';

	// Coquille des écrans hors de l'app (connexion, inscription, consentement OAuth, erreurs).
	let { children }: { children: Snippet } = $props();
</script>

<main class="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-4 py-12">
	<Wordmark size={28} />
	{@render children()}
</main>
