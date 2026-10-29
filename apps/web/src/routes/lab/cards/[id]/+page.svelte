<script lang="ts">
	import { goto } from '$app/navigation';
	import AppShell from '#lib/components/AppShell.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import MasteryMeter from '#lib/components/MasteryMeter.svelte';
	import RatingPill from '#lib/components/RatingPill.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Sheet from '#lib/ui/Sheet.svelte';
	import { describeDue } from '#lib/format/due.js';
	import { directionLabel } from '#lib/format/decks.js';
	import {
		capitalize,
		formatDate,
		formatDateTime,
		originLabels,
		plural
	} from '#lib/format/labels.js';
	import { LAB_DECK, LAB_NOW as now, dueNow, LAB_NAV_DECKS } from '#lib/lab/fixtures.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const card = $derived(data.card);

	let confirmDelete = $state(false);

	const dueDate = new Intl.DateTimeFormat('fr-FR', {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit'
	});
</script>

<svelte:head><title>{card.sideA} · Poj</title></svelte:head>

<AppShell current="cards" base="/lab" dueCount={dueNow.length} decks={LAB_NAV_DECKS}>
	<div class="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 pb-12 md:px-8">
		<PageHeader title="Carte : {card.sideA}" compact back={{ href: '/lab/cards', label: 'Cartes' }}>
			{#snippet actions()}
				<Button href="/lab/cards/{card.id}/edit" icon="pencil" size="sm">Modifier</Button>
			{/snippet}
		</PageHeader>

		<!-- La carte elle-même -->
		<dl class="-mt-2 flex flex-col gap-5">
			<div class="flex flex-col gap-1">
				<dt class="text-sm text-ink-3">Français</dt>
				<dd class="text-2xl font-semibold tracking-tight">{card.sideA}</dd>
			</div>
			<div class="flex flex-col gap-1">
				<dt class="text-sm text-ink-3">Anglais</dt>
				<dd class="text-2xl font-semibold tracking-tight" lang="en">{card.sideB}</dd>
			</div>
			<div class="flex flex-col gap-1">
				<dt class="flex items-center gap-1.5 text-sm text-ink-3">
					<Icon name="hint" size={15} />Contexte d'origine
				</dt>
				<dd class={card.context ? 'max-w-[65ch] text-ink-2' : 'text-ink-3'}>
					{card.context ?? 'Aucun contexte : la révision se fera sans indice.'}
				</dd>
			</div>
			<p class="flex items-center gap-1.5 text-sm text-ink-3">
				<Icon name={card.origin === 'claude' ? 'claude' : 'monitor'} size={15} />
				Créée le {formatDate(card.createdAt)} via {originLabels[card.origin]}
			</p>
		</dl>

		<section class="flex flex-col gap-3" aria-labelledby="progress-title">
			<h2 id="progress-title" class="text-lg font-semibold">Progression</h2>
			<div class="grid gap-3 sm:grid-cols-2">
				{#each card.reviews as r (r.direction)}
					{@const due = describeDue(r.due, now, { isNew: r.isNew })}
					<article class="flex flex-col gap-3 rounded-2xl bg-surface p-4">
						<h3 class="flex items-center gap-1.5 text-sm font-medium text-ink-2">
							{directionLabel(r.direction, LAB_DECK)}
						</h3>
						<div>
							<p
								class="text-xl font-semibold tracking-tight {due.tone === 'due' ||
								due.tone === 'new'
									? 'text-accent-text'
									: ''}"
							>
								{capitalize(due.long)}
							</p>
							{#if !r.isNew}
								<p class="text-sm text-ink-3 tabular-nums">{dueDate.format(r.due)}</p>
							{/if}
						</div>
						<div
							class="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3"
						>
							<MasteryMeter level={r.mastery} />
							<span class="flex items-center gap-2 text-sm text-ink-2">
								{plural(r.reps, 'révision')}
								{#if r.lastRating}<RatingPill rating={r.lastRating} />{/if}
							</span>
						</div>
					</article>
				{/each}
			</div>
		</section>

		<section class="flex flex-col gap-3" aria-labelledby="history-title">
			<h2 id="history-title" class="text-lg font-semibold">
				Historique <span class="font-normal text-ink-3 tabular-nums">{card.history.length}</span>
			</h2>
			{#if card.history.length}
				<ol class="flex flex-col">
					{#each card.history as log, i (i)}
						<li
							class="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 border-b border-line py-2.5 last:border-0 sm:grid-cols-[9rem_10rem_1fr_auto]"
						>
							<time
								datetime={log.at.toISOString()}
								class="text-sm text-ink tabular-nums sm:text-ink-2">{formatDateTime(log.at)}</time
							>
							<span class="justify-self-end sm:order-last"><RatingPill rating={log.rating} /></span>
							<span class="text-sm text-ink-2">{directionLabel(log.direction, LAB_DECK)}</span>
							<span
								class="flex items-center gap-1.5 justify-self-end text-sm text-ink-3 sm:justify-self-start"
							>
								<Icon name={log.origin === 'claude' ? 'claude' : 'monitor'} size={14} />
								{originLabels[log.origin]}
								{#if log.hintUsed}
									<span class="flex items-center gap-1">· <Icon name="hint" size={14} />indice</span
									>
								{/if}
							</span>
						</li>
					{/each}
				</ol>
			{:else}
				<p class="text-ink-2">Pas encore révisée. Elle est due dans les deux sens.</p>
			{/if}
		</section>

		<div class="border-t border-line pt-6">
			<Button variant="danger" icon="trash" onclick={() => (confirmDelete = true)}>
				Supprimer la carte
			</Button>
		</div>
	</div>
</AppShell>

<Sheet
	bind:open={confirmDelete}
	title="Supprimer cette carte ?"
	description="« {card.sideA} » ne reviendra plus en révision et disparaîtra de la liste. Son historique est conservé."
>
	{#snippet actions()}
		<Button size="lg" onclick={() => (confirmDelete = false)}>Annuler</Button>
		<Button size="lg" variant="danger" icon="trash" onclick={() => goto('/lab/cards')}>
			Supprimer
		</Button>
	{/snippet}
</Sheet>
