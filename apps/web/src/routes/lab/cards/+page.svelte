<script lang="ts">
	import AppShell from '#lib/components/AppShell.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import Horizon from '#lib/components/Horizon.svelte';
	import MasteryBar from '#lib/components/MasteryBar.svelte';
	import CardRow from '#lib/components/CardRow.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import { formatWeekday, plural } from '#lib/format/labels.js';
	import {
		LAB_DECK,
		LAB_NOW as now,
		cards,
		dueNow,
		dueToday,
		horizon,
		isDueOnDay,
		masteryCounts,
		normalize,
		LAB_NAV_DECKS
	} from '#lib/lab/fixtures.js';

	let query = $state('');
	let day: number | null = $state(null);

	const days = horizon(14);
	const later = dueToday.length - dueNow.length;

	const sorted = [...cards].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
	const visible = $derived(
		sorted.filter((c) => {
			const q = normalize(query);
			const matches =
				!q || [c.sideA, c.sideB, c.context ?? ''].some((t) => normalize(t).includes(q));
			const onDay = day === null || c.reviews.some((r) => isDueOnDay(r.due, day!));
			return matches && onDay;
		})
	);

	const dayLabel = (i: number) =>
		i === 0 ? "aujourd'hui" : i === 1 ? 'demain' : formatWeekday(days[i].date);
</script>

<svelte:head><title>Cartes · Poj</title></svelte:head>

<AppShell current="cards" base="/lab" dueCount={dueNow.length} decks={LAB_NAV_DECKS}>
	<div class="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-10 md:px-8">
		<PageHeader title="Cartes" count={cards.length}>
			{#snippet actions()}
				<Button href="/lab/cards/new" icon="plus" size="sm" class="max-md:hidden"
					>Nouvelle carte</Button
				>
			{/snippet}
		</PageHeader>

		<!-- L'échéancier : ce qui est dû, ce qui vient, où en est le paquet -->
		<section aria-label="Échéancier" class="flex flex-col gap-5 rounded-2xl bg-surface p-4 md:p-5">
			<div class="flex items-center justify-between gap-4">
				<div class="min-w-0">
					<p class="text-lg font-semibold">
						<span class="text-accent-text tabular-nums">{dueToday.length}</span> dues aujourd'hui
					</p>
					<p class="text-sm text-ink-2">
						{dueNow.length} maintenant{#if later > 0}, {later} plus tard dans la journée{/if}
					</p>
				</div>
				<Button href="/lab/review" variant="primary" icon="review">Réviser</Button>
			</div>

			<Horizon {days} bind:selected={day} />

			<div class="border-t border-line pt-4">
				<MasteryBar counts={masteryCounts} />
			</div>
		</section>

		<section aria-label="Liste des cartes" class="flex flex-col gap-2">
			<label class="relative block">
				<span class="sr-only">Rechercher dans les cartes</span>
				<Icon
					name="search"
					size={18}
					class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3"
				/>
				<input
					type="search"
					bind:value={query}
					placeholder="Rechercher une carte"
					class="h-11 w-full rounded-xl border border-transparent bg-surface pr-3 pl-10 text-base text-ink transition-[border-color,box-shadow] duration-150 placeholder:text-ink-3 focus:border-accent focus:ring-3 focus:ring-accent/20 focus:outline-none"
				/>
			</label>

			<div class="flex min-h-9 items-center justify-between gap-3 pt-2">
				<p class="text-sm text-ink-3" aria-live="polite">
					{plural(visible.length, 'carte')}{#if day !== null}
						dues {dayLabel(day)}{/if}
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
							href="/lab/cards/{c.id}"
							sideA={c.sideA}
							sideB={c.sideB}
							deck={LAB_DECK}
							reviews={c.reviews}
							{now}
						/>
					{/each}
				</ul>
			{:else}
				<div class="flex flex-col items-start gap-3 py-8">
					<p class="text-ink">Aucune carte ne contient « {query} ».</p>
					<p class="text-sm text-ink-2">
						La recherche porte sur le français, l'anglais et le contexte d'origine.
					</p>
					<div class="flex gap-2">
						<Button size="sm" onclick={() => (query = '')}>Effacer la recherche</Button>
						<Button size="sm" variant="ghost" icon="plus" href="/lab/cards/new"
							>Créer la carte</Button
						>
					</div>
				</div>
			{/if}
		</section>
	</div>
</AppShell>
