<script lang="ts">
	import { resolve } from '$app/paths';
	import ActivityGrid from '#lib/components/ActivityGrid.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Velocities from '#lib/components/Velocities.svelte';
	import type { PageProps } from './$types';

	// Les statistiques en grand : les vélocités, puis l'année d'activité du deck affiché.
	// `/cards` montre la même année en petit, avec un lien vers cette page.
	let { data }: PageProps = $props();

	const deck = $derived(data.deck);
	const cardsHref = $derived(deck ? resolve(`cards?deck=${deck.id}`) : resolve('cards'));
</script>

<svelte:head><title>Statistiques · Poj</title></svelte:head>

<div class="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-10 md:px-8">
	<PageHeader title="Statistiques" back={{ href: cardsHref, label: 'Cartes' }}>
		<p class="text-sm text-ink-2">{deck?.name ?? 'Tous les decks'}</p>
	</PageHeader>

	<div class="flex flex-col gap-4 rounded-2xl bg-surface p-4 md:p-5">
		<Velocities {...data.velocities} allDecks={deck !== null && data.nav.decks.length > 1} />
		<hr class="border-line" />
		<ActivityGrid days={data.activity} size="lg" />
	</div>
</div>
