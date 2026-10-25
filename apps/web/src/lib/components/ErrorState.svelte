<script lang="ts">
	import Button from '#lib/ui/Button.svelte';

	// Contenu d'une page d'erreur : titre, explication et retour aux cartes. Les messages
	// d'erreur du serveur sont déjà en français (« Carte introuvable ») ; les autres
	// (« Not Found » d'une route inconnue) sont remplacés.
	type Props = { status: number; message?: string };

	let { status, message }: Props = $props();

	const notFound = $derived(status === 404);
	const title = $derived(
		notFound
			? message?.endsWith('introuvable')
				? message
				: 'Page introuvable'
			: 'Une erreur est survenue'
	);
	const explanation = $derived(
		notFound
			? 'Elle a peut-être été supprimée, ou le lien est incorrect.'
			: 'Réessaie dans un instant. Si le problème persiste, recharge la page.'
	);
</script>

<svelte:head><title>{title} · Poj</title></svelte:head>

<div class="flex flex-col items-start gap-3">
	<p class="text-sm text-ink-3 tabular-nums">Erreur {status}</p>
	<h1 class="text-2xl font-bold tracking-tight">{title}</h1>
	<p class="max-w-[50ch] text-ink-2">{explanation}</p>
	<div class="pt-3">
		<Button href="/cards" variant="primary" icon="cards">Voir les cartes</Button>
	</div>
</div>
