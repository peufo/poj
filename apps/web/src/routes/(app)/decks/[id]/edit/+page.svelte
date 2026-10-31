<script lang="ts">
	import DeckForm from '#lib/components/DeckForm.svelte';
	import DeleteConfirm from '#lib/components/DeleteConfirm.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { deleteDeck, saveDeck } from './deck.remote';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const back = $derived({ href: `/cards?deck=${data.deck.id}`, label: data.deck.name });
	const cardCount = $derived(data.nav.decks.find((d) => d.id === data.deck.id)?.cardCount ?? 0);
	const deleteMessage = $derived(
		`« ${data.deck.name} » sera supprimé. ` +
			(cardCount === 0
				? 'Il ne contient aucune carte.'
				: cardCount === 1
					? 'Sa carte disparaîtra avec lui et ne reviendra plus en révision.'
					: `Ses ${cardCount} cartes disparaîtront avec lui et ne reviendront plus en révision.`)
	);
</script>

<svelte:head><title>Modifier le deck · Poj</title></svelte:head>

<div class="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 pb-12 md:px-8">
	<PageHeader title="Modifier le deck" {back} />

	<DeckForm form={saveDeck} mode="edit" values={data.values} cancelHref={back.href} />

	<DeleteConfirm
		form={deleteDeck}
		label="Supprimer le deck"
		title="Supprimer ce deck ?"
		message={deleteMessage}
	/>
</div>
