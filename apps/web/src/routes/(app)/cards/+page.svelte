<script lang="ts">
	import { goto } from '$app/navigation';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Horizon from '#lib/components/Horizon.svelte';
	import GoalCalendar from '#lib/components/GoalCalendar.svelte';
	import MasteryBar from '#lib/components/MasteryBar.svelte';
	import CardRow from '#lib/components/CardRow.svelte';
	import DeckChips from '#lib/components/DeckChips.svelte';
	import AccountMenu from '#lib/components/AccountMenu.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import { faces } from '#lib/format/decks.js';
	import { formatWeekday, plural } from '#lib/format/labels.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	// Deck affiché, `null` pour tous les decks : ses liens gardent `?deck=`.
	const deck = $derived(data.deck);
	const deckQuery = $derived(deck ? `?deck=${deck.id}` : '');
	const face = $derived(deck && faces(deck));

	let day: number | null = $state(null);
	let timer: ReturnType<typeof setTimeout> | undefined;

	const later = $derived(data.stats.dueToday - data.stats.dueNow);
	const visible = $derived(
		day === null ? data.cards : data.cards.filter((c) => c.reviews.some((r) => r.day === day))
	);

	const dayLabel = (i: number) =>
		i === 0 ? "aujourd'hui" : i === 1 ? 'demain' : formatWeekday(data.horizon[i].date);

	const countLabel = $derived(
		plural(visible.length, 'carte') +
			(day === null ? '' : ` ${visible.length > 1 ? 'dues' : 'due'} ${dayLabel(day)}`)
	);

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
	<PageHeader title={deck?.name ?? 'Cartes'} count={data.stats.totalCards}>
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

	<GoalCalendar
		progress={data.goal}
		bounds={data.goalBounds}
		error={form?.goalError}
		value={form?.goalValue}
	/>

	{#if data.stats.totalCards === 0}
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
		<!-- L'échéancier : ce qui est dû, ce qui vient, où en est le paquet -->
		<section aria-label="Échéancier" class="flex flex-col gap-5 rounded-2xl bg-surface p-4 md:p-5">
			<div class="flex items-center justify-between gap-4">
				<div class="min-w-0">
					<p class="text-lg font-semibold">
						<span class="text-accent-text tabular-nums">{data.stats.dueToday}</span>
						{data.stats.dueToday > 1 ? 'dues' : 'due'} aujourd'hui
					</p>
					<p class="text-sm text-ink-2">
						{data.stats.dueNow} maintenant{#if later > 0}, {later} plus tard{/if}
					</p>
				</div>
				<Button href="/review{deckQuery}" variant="primary" icon="review">Réviser</Button>
			</div>

			<Horizon days={data.horizon} bind:selected={day} />

			<div class="border-t border-line pt-4">
				<MasteryBar counts={data.mastery} />
			</div>
		</section>

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
						oninput={(e) => search(e.currentTarget.value)}
						placeholder="Rechercher une carte"
						class="h-11 w-full rounded-xl border border-transparent bg-surface pr-3 pl-10 text-base text-ink transition-[border-color,box-shadow] duration-150 placeholder:text-ink-3 focus:border-accent focus:ring-3 focus:ring-accent/20 focus:outline-none"
					/>
				</label>
			</form>

			<div class="flex min-h-9 items-center justify-between gap-3 pt-2">
				<p class="text-sm text-ink-3" aria-live="polite">
					{countLabel}
				</p>
				{#if day !== null}
					<button
						type="button"
						onclick={() => (day = null)}
						class="inline-flex h-7 items-center gap-1 rounded-full bg-accent-soft pr-2 pl-2.5 text-xs font-medium text-accent-text"
					>
						{dayLabel(day)}
						<Icon name="x" size={14} label="Retirer le filtre" />
					</button>
				{/if}
			</div>

			{#if visible.length}
				<ul>
					{#each visible as c (c.id)}
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
			{:else if data.query}
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
			{:else}
				<p class="py-8 text-ink-2">Aucune carte due {dayLabel(day ?? 0)}.</p>
			{/if}
		</section>
	{/if}
</div>
