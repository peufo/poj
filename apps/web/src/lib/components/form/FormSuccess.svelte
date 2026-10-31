<script lang="ts">
	import type { Snippet } from 'svelte';
	import Notice from '#lib/ui/Notice.svelte';

	// Succès d'un formulaire qui ne redirige pas (d'après le résultat du remote form),
	// annoncé aux lecteurs d'écran (`role="status"`).
	let { children }: { children?: Snippet } = $props();
</script>

<Notice icon="check" {children} />
