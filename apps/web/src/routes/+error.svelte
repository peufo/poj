<script lang="ts">
	import { page } from '$app/state';
	import ErrorState from '#lib/components/ErrorState.svelte';
	import Wordmark from '#lib/components/Wordmark.svelte';
</script>

<!-- Hors du cadre de l'application (route inconnue) : mise en page de la connexion. -->
<main class="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-8 px-4 py-12">
	<Wordmark size={28} />
	<ErrorState status={page.status} message={page.error?.message} />
</main>
