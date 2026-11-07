<script lang="ts">
	import { goto } from '$app/navigation';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Belt from '#lib/components/Belt.svelte';
	import Velocities from '#lib/components/Velocities.svelte';
	import CardRow from '#lib/components/CardRow.svelte';
	import DeckChips from '#lib/components/DeckChips.svelte';
	import AccountMenu from '#lib/components/AccountMenu.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import { NO_AUTOFILL } from '#lib/ui/autofill.js';
	import { faces } from '#lib/format/decks.js';
	import { plural } from '#lib/format/labels.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	// Deck affiché, `null` pour tous les decks : ses liens gardent `?deck=`.
	const deck = $derived(data.deck);
	const deckQuery = $derived(deck ? `?deck=${deck.id}` : '');
	const face = $derived(deck && faces(deck));
	const hasCards = $derived(data.totalCards > 0);

	let timer: ReturnType<typeof setTimeout> | undefined;

	// La recherche se fait côté serveur (`?q=`) ; avec JavaScript, au fil de la frappe.
	function search(value: string, delay = 250) {
		clearTimeout(timer);
		timer = setTimeout(() => {
			const q = value.trim();
			const params = new URLSearchParams(deck ? { deck: deck.id, q } : { q });
			goto(q ? `?${params}` : `/cards${deckQuery}`, { replace: true, reset: false });
		}, delay);
	}
</script>

<svelte:head><title>{deck?.name ?? 'Cartes'} · Poj</title></svelte:head>

<div class="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-10 md:px-8">
	{#if hasCards}
		<!-- Ce qui vient, tout en haut : le tapis, puis le passé en deux chiffres. -->
		<div class="flex flex-col gap-3 pt-3 md:pt-8">
			<Belt {...data.belt} reviewHref="/review{deckQuery}" />
			<Velocities {...data.velocities} allDecks={deck !== null && data.nav.decks.length > 1} />
		</div>
	{/if}

	<PageHeader title={deck?.name ?? 'Cartes'} count={data.totalCards} flush={hasCards}>
		{#snippet actions()}
			{#if deck}
				<Button href="/decks/{deck.id}/edit" icon="pencil" size="sm">Modifier le deck</Button>
			{/if}
			<Button href="/cards/new{deckQuery}" icon="plus" size="sm" class="max-md:hidden"
				>Nouvelle carte</Button
			>
			<!-- Au téléphone, la barre latérale (et sa déconnexion) n'existe pas. -->
			<AccountMenu email={data.user.email} isAdmin={data.user.isAdmin} class="md:hidden" />
		{/snippet}
		<!-- Au téléphone, la barre latérale (et ses decks) n'existe pas : les decks en puces. -->
		<DeckChips decks={data.nav.decks} active={deck?.id ?? null} class="pt-2 md:hidden" />
	</PageHeader>

	{#if !hasCards}
		<div class="flex flex-col items-start gap-3 py-8">
			<p class="text-lg font-semibold">Aucune carte pour l'instant</p>
			<p class="max-w-[50ch] text-ink-2">
				Capture une expression entendue, avec son contexte d'origine : elle sera à réviser{deck?.bothDirections ===
				false
					? '.'
					: ' dans les deux sens.'}
			</p>
			<Button href="/cards/new{deckQuery}" variant="primary" icon="plus">Créer une carte</Button>
		</div>
	{:else}
		<section aria-label="Liste des cartes" class="flex flex-col gap-2">
			<form
				method="get"
				action="/cards"
				role="search"
				onsubmit={(e) => {
					e.preventDefault();
					search(new FormData(e.currentTarget).get('q')?.toString() ?? '', 0);
				}}
			>
				{#if deck}<input type="hidden" name="deck" value={deck.id} />{/if}
				<label class="relative block">
					<span class="sr-only">Rechercher dans les cartes</span>
					<Icon
						name="search"
						size={18}
						class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3"
					/>
					<input
						type="search"
						name="q"
						value={data.query}
						{...NO_AUTOFILL}
						oninput={(e) => search(e.currentTarget.value)}
						placeholder="Rechercher une carte"
						class="h-11 w-full rounded-xl border border-transparent bg-surface pr-3 pl-10 text-base text-ink transition-[border-color,box-shadow] duration-150 placeholder:text-ink-3 focus:border-accent focus:ring-3 focus:ring-accent/20 focus:outline-none"
					/>
				</label>
			</form>

			{#if data.query}
				<p class="pt-2 text-sm text-ink-3" aria-live="polite">
					{plural(data.cards.length, 'carte')}
				</p>
			{/if}

			{#if data.cards.length}
				<ul>
					{#each data.cards as c (c.id)}
						<CardRow
							href="/cards/{c.id}"
							sideA={c.sideA}
							sideB={c.sideB}
							deck={c.deck}
							reviews={c.reviews}
							now={data.now}
						/>
					{/each}
				</ul>
			{:else}
				<div class="flex flex-col items-start gap-3 py-8">
					<p class="text-ink">Aucune carte ne contient « {data.query} ».</p>
					<p class="text-sm text-ink-2">
						La recherche porte sur {face ? `${face.a.the}, ${face.b.the}` : 'les deux faces'} et le contexte
						d'origine.
					</p>
					<div class="flex gap-2">
						<Button size="sm" href="/cards{deckQuery}">Effacer la recherche</Button>
						<Button size="sm" variant="ghost" icon="plus" href="/cards/new{deckQuery}"
							>Créer la carte</Button
						>
					</div>
				</div>
			{/if}
		</section>
	{/if}
</div>
