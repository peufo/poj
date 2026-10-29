<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import AppShell from '#lib/components/AppShell.svelte';
	import RatingBar from '#lib/components/RatingBar.svelte';
	import RatingPill from '#lib/components/RatingPill.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Kbd from '#lib/ui/Kbd.svelte';
	import Sheet from '#lib/ui/Sheet.svelte';
	import LabStates from '#lib/lab/LabStates.svelte';
	import { describeDue } from '#lib/format/due.js';
	import { directionFaces, directionLabel } from '#lib/format/decks.js';
	import { formatWeekday, plural, type Rating } from '#lib/format/labels.js';
	import {
		LAB_DECK,
		LAB_NOW as now,
		allReviews,
		cards,
		dueNow,
		type SampleCard,
		type SampleReview
	} from '#lib/lab/fixtures.js';

	type Item = { card: SampleCard; review: SampleReview };
	type Answer = { item: Item; rating: Rating; hintUsed: boolean };
	type Mode = 'session' | 'empty';

	// Ordre : les plus en retard d'abord ; le sens inverse d'une carte déjà vue est mis de côté.
	function buildQueue(ahead: boolean): Item[] {
		const pool = allReviews
			.filter(({ review }) => (ahead ? review.due > now : review.due <= now))
			.sort((a, b) => a.review.due.getTime() - b.review.due.getTime());
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- ensemble local, non réactif
		const seen = new Set<string>();
		return pool
			.filter(({ card }) => (seen.has(card.id) ? false : (seen.add(card.id), true)))
			.slice(0, ahead ? 8 : undefined);
	}

	let mode: Mode = $state('session');
	let ahead = $state(false);
	let queue: Item[] = $state(buildQueue(false));
	let index = $state(0);
	let revealed = $state(false);
	let hintShown = $state(false);
	let last: Answer | null = $state(null);
	let answered = $state(0);
	let amending = $state(false);

	const current = $derived(mode === 'session' ? queue[index] : undefined);
	const remaining = $derived(Math.max(0, queue.length - index));
	const upcoming = allReviews
		.filter(({ review }) => review.due > now)
		.sort((a, b) => a.review.due.getTime() - b.review.due.getTime());
	const next = upcoming[0];
	const prompt = $derived(
		current && (current.review.direction === 'a_to_b' ? current.card.sideA : current.card.sideB)
	);
	const answer = $derived(
		current && (current.review.direction === 'a_to_b' ? current.card.sideB : current.card.sideA)
	);
	const sides = $derived(current && directionFaces(current.review.direction, LAB_DECK));

	function start(withAhead: boolean) {
		ahead = withAhead;
		queue = buildQueue(withAhead);
		index = 0;
		mode = 'session';
		reset();
	}

	function reset() {
		revealed = false;
		hintShown = false;
	}

	function rate(rating: Rating) {
		if (!current) return;
		last = { item: current, rating, hintUsed: hintShown };
		answered += 1;
		index += 1;
		reset();
		if (index >= queue.length) mode = 'empty';
	}

	function setMode(next: Mode) {
		if (next === 'session') start(false);
		else {
			mode = 'empty';
			queue = [];
		}
	}

	function onkeydown(event: KeyboardEvent) {
		if (amending || event.metaKey || event.ctrlKey || event.altKey) return;
		const target = event.target as HTMLElement;
		if (target.closest('input, textarea, [role="group"] button:focus')) return;
		if (!current) return;
		if (!revealed && (event.key === ' ' || event.key === 'Enter')) {
			event.preventDefault();
			revealed = true;
		} else if (!revealed && event.key.toLowerCase() === 'h' && current.card.context) {
			hintShown = true;
		} else if (revealed && ['1', '2', '3', '4'].includes(event.key)) {
			const rating = (['again', 'hard', 'good', 'easy'] as const)[Number(event.key) - 1];
			if (!(hintShown && (rating === 'good' || rating === 'easy'))) rate(rating);
		} else if (event.key.toLowerCase() === 'z' && last) {
			amending = true;
		}
	}

	const intervalOf = (a: Answer) => a.item.review.intervals[a.rating];
</script>

<svelte:window {onkeydown} />
<svelte:head><title>Réviser · Poj</title></svelte:head>

<AppShell current="review" base="/lab" dueCount={dueNow.length} cardCount={cards.length} focus>
	<div
		class="mx-auto flex min-h-[calc(100dvh-var(--chrome-top,0px))] w-full max-w-xl flex-col px-4 md:px-8"
	>
		<!-- Barre de session -->
		<div class="flex h-14 shrink-0 items-center justify-between gap-3">
			<Button href="/lab/cards" variant="ghost" size="sm" icon="x" class="-ml-2.5">Quitter</Button>
			{#if current}
				<p class="text-sm text-ink-2 tabular-nums" aria-live="polite">
					{plural(remaining, 'restante')}{#if ahead}<span class="text-ink-3">
							· en avance</span
						>{/if}
				</p>
			{/if}
		</div>

		<LabStates
			bind:value={mode}
			onchange={setMode}
			options={[
				{ value: 'session', label: 'Session' },
				{ value: 'empty', label: 'Rien à réviser' }
			]}
		/>

		{#if current}
			<!-- La carte -->
			<div class="flex flex-1 flex-col justify-center py-6">
				{#key `${current.card.id}-${current.review.direction}`}
					<article
						in:fly={{ y: 10, duration: 220, easing: cubicOut }}
						class="flex min-h-72 flex-col rounded-2xl bg-raised p-5 shadow-raised ring-1 ring-line md:p-7"
						aria-label="Carte à réviser"
					>
						<p class="flex items-center gap-1.5 text-sm font-medium text-ink-3">
							{directionLabel(current.review.direction, LAB_DECK)}
							{#if current.review.isNew}
								<span
									class="rounded-sm bg-accent-soft px-1.5 text-xs font-semibold text-accent-text"
									>nouvelle</span
								>
							{/if}
						</p>

						<div class="flex flex-1 flex-col justify-center gap-5 py-6">
							<p class="text-3xl font-semibold tracking-tight md:text-4xl" lang={sides?.from.lang}>
								{prompt}
							</p>

							{#if hintShown || revealed}
								{#if current.card.context}
									<p
										in:fade={{ duration: 160 }}
										class="flex max-w-[60ch] gap-2 text-[0.9375rem] text-ink-2"
									>
										<Icon name="hint" size={17} class="mt-0.5 text-ink-3" />
										{current.card.context}
									</p>
								{/if}
							{/if}

							{#if revealed}
								<div
									in:fly={{ y: 6, duration: 200, easing: cubicOut }}
									class="flex flex-col gap-1 border-t border-line pt-5"
								>
									<p class="text-sm text-ink-3">Réponse</p>
									<p
										class="text-3xl font-semibold tracking-tight text-accent-text md:text-4xl"
										lang={sides?.to.lang}
									>
										{answer}
									</p>
								</div>
							{/if}
						</div>

						{#if !revealed && current.card.context && !hintShown}
							<Button
								variant="ghost"
								icon="hint"
								size="sm"
								class="-ml-2 self-start"
								onclick={() => (hintShown = true)}
							>
								Voir le contexte <Kbd>H</Kbd>
							</Button>
						{:else if hintShown}
							<p class="text-sm text-hard">Contexte vu : Hard au mieux pour cette réponse.</p>
						{/if}
					</article>
				{/key}
			</div>

			<!-- Zone du pouce -->
			<div
				class="sticky bottom-0 -mx-4 flex flex-col gap-3 bg-canvas px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] md:static md:mx-0 md:px-0 md:pb-8"
			>
				{#if last}
					<div
						class="flex min-h-9 items-center justify-between gap-3 text-sm"
						in:fade={{ duration: 160 }}
					>
						<p class="flex min-w-0 items-center gap-2 text-ink-2">
							<RatingPill rating={last.rating} />
							<span class="truncate">
								{last.item.review.direction === 'a_to_b'
									? last.item.card.sideA
									: last.item.card.sideB}
								· revient dans {intervalOf(last)}
							</span>
						</p>
						<Button
							size="sm"
							variant="ghost"
							icon="undo"
							class="-mr-2.5"
							onclick={() => (amending = true)}
						>
							Corriger <Kbd>Z</Kbd>
						</Button>
					</div>
				{/if}

				{#if revealed}
					<RatingBar intervals={current.review.intervals} hintUsed={hintShown} onrate={rate} />
				{:else}
					<Button variant="primary" size="lg" block onclick={() => (revealed = true)}>
						Afficher la réponse <Kbd>Espace</Kbd>
					</Button>
				{/if}
			</div>
		{:else}
			<!-- Rien à réviser (WEB-8) -->
			<div class="flex flex-1 flex-col justify-center gap-6 py-10" in:fade={{ duration: 200 }}>
				<div class="flex flex-col gap-2">
					{#if answered > 0}
						<p class="text-sm font-medium text-good">
							{plural(answered, 'réponse')} enregistrée{answered > 1 ? 's' : ''}
						</p>
					{/if}
					<h1 class="text-2xl font-bold tracking-tight">Rien à réviser</h1>
					<p class="max-w-[50ch] text-ink-2">
						Prochaine révision {describeDue(next.review.due, now).long},
						{formatWeekday(next.review.due)} :
						<span class="text-ink" lang={directionFaces(next.review.direction, LAB_DECK).from.lang}
							>{next.review.direction === 'a_to_b' ? next.card.sideA : next.card.sideB}</span
						>.
					</p>
				</div>
				<div class="flex flex-col gap-2 sm:flex-row">
					<Button variant="primary" size="lg" icon="clock" onclick={() => start(true)}
						>Réviser en avance</Button
					>
					<Button size="lg" href="/lab/cards">Voir les cartes</Button>
				</div>
				<p class="text-sm text-ink-3">
					Une révision anticipée fait peu progresser une carte, mais ne fausse rien.
				</p>
			</div>
		{/if}
	</div>
</AppShell>

{#if last}
	<Sheet
		bind:open={amending}
		title="Corriger la dernière note"
		description="« {last.item.review.direction === 'a_to_b'
			? last.item.card.sideA
			: last.item.card
					.sideB} » : la nouvelle note remplace la précédente. Possible pendant une heure."
	>
		<RatingBar
			intervals={last.item.review.intervals}
			hintUsed={last.hintUsed}
			selected={last.rating}
			shortcuts={false}
			onrate={(rating) => {
				if (last) last = { ...last, rating };
				amending = false;
			}}
		/>
	</Sheet>
{/if}
