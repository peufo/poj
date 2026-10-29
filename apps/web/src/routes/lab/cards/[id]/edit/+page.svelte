<script lang="ts">
	import { goto } from '$app/navigation';
	import AppShell from '#lib/components/AppShell.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import CardForm, { type Suggestion } from '#lib/components/CardForm.svelte';
	import { LAB_DECK, dueNow, fakeDeepL, LAB_NAV_DECKS } from '#lib/lab/fixtures.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// Les champs partent du texte enregistré ; la maquette ne réagit pas à un changement de carte.
	// svelte-ignore state_referenced_locally
	const card = data.card;
	let sideA = $state(card.sideA);
	let sideB = $state(card.sideB);
	let context = $state(card.context ?? '');
	let suggestion: Suggestion = $state({ status: 'idle' });
	let saving = $state(false);

	function translate() {
		suggestion = { status: 'loading' };
		setTimeout(() => (suggestion = { status: 'ready', text: fakeDeepL(sideA, context) }), 700);
	}

	function submit(event: SubmitEvent) {
		event.preventDefault();
		saving = true;
		setTimeout(() => goto(`/lab/cards/${card.id}`), 600);
	}
</script>

<svelte:head><title>Modifier · Poj</title></svelte:head>

<AppShell current="cards" base="/lab" dueCount={dueNow.length} decks={LAB_NAV_DECKS} focus>
	<div class="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 md:px-8">
		<PageHeader
			title="Modifier la carte"
			back={{ href: `/lab/cards/${card.id}`, label: 'Carte' }}
		/>
		<CardForm
			mode="edit"
			deck={LAB_DECK}
			bind:sideA
			bind:sideB
			bind:context
			original={{ sideA: card.sideA, sideB: card.sideB }}
			{suggestion}
			{saving}
			cancelHref="/lab/cards/{card.id}"
			ontranslate={translate}
			onsubmit={submit}
		/>
	</div>
</AppShell>
