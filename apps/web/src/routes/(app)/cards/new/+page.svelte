<script lang="ts">
	import PageHeader from '#lib/components/PageHeader.svelte';
	import CardForm from '#lib/components/CardForm.svelte';
	import SelectField from '#lib/ui/SelectField.svelte';
	import { NO_DECK } from '#lib/format/decks.js';
	import { createCard } from './card.remote';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Deck de la carte : celui de la page, ou celui qu'on choisit dans la liste (à partir de
	// deux decks). Sans choix, des faces neutres et pas de DeepL.
	// svelte-ignore state_referenced_locally
	let deckId = $state(data.selectedDeck ?? '');
	const deck = $derived(data.nav.decks.find((d) => d.id === deckId) ?? null);
	const deckOptions = $derived(data.nav.decks.map((d) => ({ value: d.id, label: d.name })));
	const back = $derived(data.back ?? { href: '/cards', label: 'Cartes' });
</script>

<svelte:head><title>Nouvelle carte · Poj</title></svelte:head>

<div class="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 md:px-8">
	<PageHeader title="Nouvelle carte" {back} />

	<CardForm form={createCard} mode="create" deck={deck ?? NO_DECK} {deckId} cancelHref={back.href}>
		{#snippet header()}
			{#if data.nav.decks.length > 1}
				<SelectField
					label="Deck"
					field={createCard.fields.deckId}
					bind:value={deckId}
					options={deckOptions}
					placeholder="Choisis un deck"
				/>
			{:else}
				<input {...createCard.fields.deckId.as('hidden', deckId)} />
			{/if}
		{/snippet}
	</CardForm>
</div>
