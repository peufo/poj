<script lang="ts">
	import PageHeader from '#lib/components/PageHeader.svelte';
	import CardForm from '#lib/components/CardForm.svelte';
	import { updateCard } from './card.remote';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Les champs partent du texte enregistré.
	// svelte-ignore state_referenced_locally
	const card = data.card;
</script>

<svelte:head><title>Modifier · Poj</title></svelte:head>

<div class="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 md:px-8">
	<PageHeader title="Modifier la carte" back={{ href: `/cards/${card.id}`, label: 'Carte' }} />
	<CardForm
		form={updateCard}
		mode="edit"
		deck={data.deck}
		sideA={card.sideA}
		sideB={card.sideB}
		context={card.context ?? ''}
		original={{ sideA: card.sideA, sideB: card.sideB }}
		cancelHref="/cards/{card.id}"
	/>
</div>
