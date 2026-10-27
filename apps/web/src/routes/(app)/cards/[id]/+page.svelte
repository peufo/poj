<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import MasteryMeter from '#lib/components/MasteryMeter.svelte';
	import RatingPill from '#lib/components/RatingPill.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import Sheet from '#lib/ui/Sheet.svelte';
	import { describeDue } from '#lib/format/due.js';
	import {
		directionLabels,
		formatDate,
		formatDateTime,
		formatDue,
		originLabels,
		plural
	} from '#lib/format/labels.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const card = $derived(data.card);

	let confirmDelete = $state(false);
	let deleting = $state(false);

	const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

	const submitDelete: SubmitFunction = () => {
		deleting = true;
		return async ({ update }) => {
			await update();
			deleting = false;
		};
	};
</script>

<svelte:head><title>{card.french} · Poj</title></svelte:head>

<div class="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 pb-12 md:px-8">
	<PageHeader title="Carte : {card.french}" compact back={{ href: '/cards', label: 'Cartes' }}>
		{#snippet actions()}
			<Button href="/cards/{card.id}/edit" icon="pencil" size="sm">Modifier</Button>
		{/snippet}
	</PageHeader>

	<!-- La carte elle-même -->
	<dl class="-mt-2 flex flex-col gap-5">
		<div class="flex flex-col gap-1">
			<dt class="text-sm text-ink-3">Français</dt>
			<dd class="text-2xl font-semibold tracking-tight">{card.french}</dd>
		</div>
		<div class="flex flex-col gap-1">
			<dt class="text-sm text-ink-3">Anglais</dt>
			<dd class="text-2xl font-semibold tracking-tight" lang="en">{card.english}</dd>
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
				<!-- Un sens mis de côté n'est présenté qu'à la fin de sa mise de côté. -->
				{@const due = r.buriedUntil
					? describeDue(r.buriedUntil, data.now)
					: describeDue(r.due, data.now, { isNew: r.isNew })}
				<article class="flex flex-col gap-3 rounded-2xl bg-surface p-4">
					<h3 class="flex items-center gap-1.5 text-sm font-medium text-ink-2">
						{directionLabels[r.direction].long}
					</h3>
					<div>
						<p
							class="text-xl font-semibold tracking-tight {due.tone === 'due' || due.tone === 'new'
								? 'text-accent-text'
								: ''}"
						>
							{capitalize(due.long)}
						</p>
						{#if r.buriedUntil}
							<p class="text-sm text-ink-3 tabular-nums">
								{r.isNew ? 'Nouvelle, mise' : 'Mise'} de côté jusqu’à {formatDue(
									r.buriedUntil,
									data.now
								)} : l’autre sens a été révisé il y a moins de 24 h.
							</p>
						{:else if !r.isNew}
							<p class="text-sm text-ink-3 tabular-nums">{formatDue(r.due, data.now)}</p>
						{/if}
					</div>
					<div class="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
						<MasteryMeter level={r.mastery} />
						<span class="flex items-center gap-2 text-sm text-ink-2">
							{plural(r.answers, 'révision')}
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
				{#each card.history as log (log.id)}
					<li
						class="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-0.5 border-b border-line py-2.5 last:border-0 sm:grid-cols-[9rem_10rem_1fr_auto]"
					>
						<time
							datetime={log.at.toISOString()}
							class="text-sm text-ink tabular-nums sm:text-ink-2">{formatDateTime(log.at)}</time
						>
						<span class="justify-self-end sm:order-last"><RatingPill rating={log.rating} /></span>
						<span class="text-sm text-ink-2">{directionLabels[log.direction].long}</span>
						<span
							class="flex items-center gap-1.5 justify-self-end text-sm text-ink-3 sm:justify-self-start"
						>
							<Icon name={log.origin === 'claude' ? 'claude' : 'monitor'} size={14} />
							{originLabels[log.origin]}
							{#if log.hintUsed}
								<span class="flex items-center gap-1">· <Icon name="hint" size={14} />indice</span>
							{/if}
							{#if log.amended}<span>· corrigée</span>{/if}
						</span>
					</li>
				{/each}
			</ol>
		{:else}
			<p class="text-ink-2">Pas encore révisée. Elle est due dans les deux sens.</p>
		{/if}
	</section>

	<!-- Sans JavaScript, le premier envoi demande confirmation en ligne. -->
	<form method="post" action="?/delete" class="flex flex-col gap-4 border-t border-line pt-6">
		{#if form?.confirmDelete}
			<Notice tone="danger" title="Supprimer cette carte ?">
				« {card.french} » ne reviendra plus en révision et disparaîtra de la liste. Son historique est
				conservé.
				{#snippet actions()}
					<Button type="submit" variant="danger" icon="trash" name="confirm" value="1"
						>Supprimer</Button
					>
					<Button href="/cards/{card.id}" variant="ghost">Annuler</Button>
				{/snippet}
			</Notice>
		{:else}
			<Button
				type="submit"
				variant="danger"
				icon="trash"
				class="self-start"
				onclick={(event) => {
					event.preventDefault();
					confirmDelete = true;
				}}
			>
				Supprimer la carte
			</Button>
		{/if}
	</form>
</div>

<Sheet
	bind:open={confirmDelete}
	title="Supprimer cette carte ?"
	description="« {card.french} » ne reviendra plus en révision et disparaîtra de la liste. Son historique est conservé."
>
	{#snippet actions()}
		<Button size="lg" onclick={() => (confirmDelete = false)}>Annuler</Button>
		<form method="post" action="?/delete" use:enhance={submitDelete} class="contents">
			<input type="hidden" name="confirm" value="1" />
			<Button type="submit" size="lg" variant="danger" icon="trash" loading={deleting}>
				Supprimer
			</Button>
		</form>
	{/snippet}
</Sheet>
