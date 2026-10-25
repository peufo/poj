<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { enhance, type SubmitFunction } from '$app/forms';
	import RatingBar from '#lib/components/RatingBar.svelte';
	import RatingPill from '#lib/components/RatingPill.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Kbd from '#lib/ui/Kbd.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import Sheet from '#lib/ui/Sheet.svelte';
	import { describeDue, formatInterval } from '#lib/format/due.js';
	import { directionLabels, formatWeekday, plural, type Rating } from '#lib/format/labels.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const current = $derived(data.current);
	const last = $derived(data.last);
	// Chaque présentation d'une révision est distincte (une carte ratée revient).
	const key = $derived(current ? `${current.id}:${current.version}` : null);

	// svelte-ignore state_referenced_locally
	let revealedFor: string | null = $state(data.revealed ? key : null);
	const revealed = $derived(key !== null && revealedFor === key);
	const hintShown = $derived(current?.hintUsed ?? false);

	let hinting = $state(false);
	let answering = $state(false);
	let answered = $state(0);
	let amending = $state(false);
	// Sans JavaScript, « Corriger » renvoie la page avec le choix de la note en ligne.
	const amendInline = $derived(Boolean(form && 'amendOpen' in form));

	const endsWithPunctuation = (text: string) => /[.?!…]$/.test(text);
	const query = $derived(data.ahead ? 'ahead=1&' : '');
	const promptLang = $derived(current?.direction === 'en_to_fr' ? 'en' : 'fr');

	const intervalsFrom = (preview: Record<Rating, Date>, from: Date) =>
		Object.fromEntries(
			Object.entries(preview).map(([rating, due]) => [
				rating,
				formatInterval(due.getTime() - from.getTime())
			])
		) as Record<Rating, string>;

	const intervals = $derived(current && intervalsFrom(current.preview, data.now));
	const lastIntervals = $derived(last && intervalsFrom(last.preview, last.reviewedAt));

	let hintForm: HTMLFormElement | undefined = $state();
	let answerForm: HTMLFormElement | undefined = $state();

	const submitHint: SubmitFunction = ({ cancel }) => {
		if (hinting) return cancel();
		hinting = true;
		return async ({ update }) => {
			await update();
			hinting = false;
		};
	};

	const submitAnswer: SubmitFunction = ({ cancel }) => {
		if (answering) return cancel();
		answering = true;
		return async ({ result, update }) => {
			await update();
			if (result.type === 'success' && !result.data?.answered?.replayed) answered += 1;
			answering = false;
		};
	};

	const submitAmend: SubmitFunction = () => {
		return async ({ result, update }) => {
			await update();
			if (result.type === 'success') amending = false;
		};
	};

	function rate(rating: Rating) {
		const button = answerForm?.querySelector<HTMLButtonElement>(
			`button[name="rating"][value="${rating}"]`
		);
		if (button && !button.disabled) answerForm?.requestSubmit(button);
	}

	function onkeydown(event: KeyboardEvent) {
		if (amending || event.metaKey || event.ctrlKey || event.altKey) return;
		const target = event.target as HTMLElement;
		if (target.closest('input, textarea, [role="group"] button:focus')) return;
		if (event.key.toLowerCase() === 'z' && last) {
			amending = true;
			return;
		}
		if (!current) return;
		if (!revealed && (event.key === ' ' || event.key === 'Enter')) {
			event.preventDefault();
			revealedFor = key;
		} else if (!revealed && event.key.toLowerCase() === 'h' && current.context && !hintShown) {
			hintForm?.requestSubmit();
		} else if (revealed && ['1', '2', '3', '4'].includes(event.key)) {
			rate((['again', 'hard', 'good', 'easy'] as const)[Number(event.key) - 1]);
		}
	}
</script>

<svelte:window {onkeydown} />
<svelte:head><title>Réviser · Poj</title></svelte:head>

<div
	class="mx-auto flex min-h-[calc(100dvh-var(--chrome-top,0px))] w-full max-w-xl flex-col px-4 md:px-8"
>
	<!-- Barre de session -->
	<div class="flex h-14 shrink-0 items-center justify-between gap-3">
		<Button href="/cards" variant="ghost" size="sm" icon="x" class="-ml-2.5">Quitter</Button>
		{#if current}
			<p class="text-sm text-ink-2 tabular-nums" aria-live="polite">
				{#if data.ahead}<span class="text-ink-3">En avance</span>{:else}{plural(
						data.remaining,
						'restante'
					)}{/if}
			</p>
		{/if}
	</div>

	{#if current}
		<!-- La carte -->
		<div class="flex flex-1 flex-col justify-center py-6">
			{#key key}
				<article
					in:fly={{ y: 10, duration: 220, easing: cubicOut }}
					class="flex min-h-72 flex-col rounded-2xl bg-raised p-5 shadow-raised ring-1 ring-line md:p-7"
					aria-label="Carte à réviser"
				>
					<p class="flex items-center gap-1.5 text-sm font-medium text-ink-3">
						{directionLabels[current.direction].long}
						{#if current.isNew}
							<span class="rounded-sm bg-accent-soft px-1.5 text-xs font-semibold text-accent-text"
								>nouvelle</span
							>
						{/if}
					</p>

					<div class="flex flex-1 flex-col justify-center gap-5 py-6">
						<p class="text-3xl font-semibold tracking-tight md:text-4xl" lang={promptLang}>
							{current.prompt}
						</p>

						{#if (hintShown || revealed) && current.context}
							<p
								in:fade={{ duration: 160 }}
								class="flex max-w-[60ch] gap-2 text-[0.9375rem] text-ink-2"
							>
								<Icon name="hint" size={17} class="mt-0.5 shrink-0 text-ink-3" />
								{current.context}
							</p>
						{/if}

						{#if revealed}
							<div
								in:fly={{ y: 6, duration: 200, easing: cubicOut }}
								class="flex flex-col gap-1 border-t border-line pt-5"
							>
								<p class="text-sm text-ink-3">Réponse</p>
								<p
									class="text-3xl font-semibold tracking-tight text-accent-text md:text-4xl"
									lang={promptLang === 'fr' ? 'en' : 'fr'}
								>
									{current.expected}
								</p>
							</div>
						{/if}
					</div>

					{#if !revealed && current.context && !hintShown}
						<form
							method="post"
							action="?{query}/hint"
							bind:this={hintForm}
							use:enhance={submitHint}
							class="self-start"
						>
							<input type="hidden" name="reviewId" value={current.id} />
							<Button
								type="submit"
								variant="ghost"
								icon="hint"
								size="sm"
								class="-ml-2"
								loading={hinting}
							>
								Voir le contexte <Kbd>H</Kbd>
							</Button>
						</form>
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
			{@render lastAnswer()}

			{#if form && 'answerError' in form && form.answerError}
				<Notice tone="warn">{form.answerError}</Notice>
			{/if}

			{#if revealed && intervals}
				<form
					method="post"
					action="?{query}/answer"
					bind:this={answerForm}
					use:enhance={submitAnswer}
				>
					<input type="hidden" name="reviewId" value={current.id} />
					<input type="hidden" name="version" value={current.version} />
					<RatingBar {intervals} hintUsed={hintShown} name="rating" />
				</form>
			{:else}
				<!-- Sans JavaScript, la réponse s'affiche par un rechargement (`?reveal=1`). -->
				<form
					method="get"
					onsubmit={(event) => {
						event.preventDefault();
						revealedFor = key;
					}}
				>
					{#if data.ahead}<input type="hidden" name="ahead" value="1" />{/if}
					<input type="hidden" name="reveal" value="1" />
					<Button type="submit" variant="primary" size="lg" block>
						Afficher la réponse <Kbd>Espace</Kbd>
					</Button>
				</form>
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
				{#if data.upcoming}
					{@const next = data.upcoming}
					<p class="max-w-[50ch] text-ink-2">
						Prochaine révision {describeDue(next.due, data.now).long},
						{formatWeekday(next.due)} :
						<span class="text-ink" lang={next.direction === 'en_to_fr' ? 'en' : 'fr'}
							>{next.prompt}</span
						>{endsWithPunctuation(next.prompt) ? '' : '.'}
					</p>
				{:else}
					<p class="max-w-[50ch] text-ink-2">
						{data.ahead
							? 'Plus aucune révision à avancer pour le moment.'
							: 'Aucune révision à venir : crée une carte pour commencer.'}
					</p>
				{/if}
			</div>
			<div class="flex flex-col gap-2 sm:flex-row">
				{#if data.upcoming}
					<Button href="/review?ahead=1" variant="primary" size="lg" icon="clock"
						>Réviser en avance</Button
					>
					<Button size="lg" href="/cards">Voir les cartes</Button>
				{:else}
					<Button size="lg" href="/cards">Voir les cartes</Button>
				{/if}
			</div>
			{#if data.upcoming}
				<p class="text-sm text-ink-3">
					Une révision anticipée fait peu progresser une carte, mais ne fausse rien.
				</p>
			{/if}
			{#if last}<div class="border-t border-line pt-4">{@render lastAnswer()}</div>{/if}
		</div>
	{/if}
</div>

{#snippet lastAnswer()}
	{#if last && lastIntervals}
		<div
			class="flex min-h-9 items-center justify-between gap-3 text-sm"
			in:fade={{ duration: 160 }}
		>
			<p class="flex min-w-0 items-center gap-2 text-ink-2">
				<RatingPill rating={last.rating} />
				<span class="truncate">
					{last.prompt} · revient dans {formatInterval(
						last.due.getTime() - last.reviewedAt.getTime()
					)}
				</span>
			</p>
			<!-- Sans JavaScript, le premier envoi ouvre le choix de la note. -->
			<form method="post" action="?{query}/amend" class="shrink-0">
				<input type="hidden" name="reviewId" value={last.reviewId} />
				<Button
					type="submit"
					size="sm"
					variant="ghost"
					icon="undo"
					class="-mr-2.5"
					onclick={(event) => {
						event.preventDefault();
						amending = true;
					}}
				>
					Corriger <Kbd>Z</Kbd>
				</Button>
			</form>
		</div>
		{#if amendInline}
			<div class="flex flex-col gap-2 rounded-xl bg-surface p-3">
				<p class="text-sm font-medium">Nouvelle note pour « {last.prompt} »</p>
				{@render amendForm()}
			</div>
		{/if}
	{/if}
{/snippet}

{#snippet amendForm()}
	{#if last && lastIntervals}
		<form
			method="post"
			action="?{query}/amend"
			use:enhance={submitAmend}
			class="flex flex-col gap-4"
		>
			<input type="hidden" name="reviewId" value={last.reviewId} />
			<RatingBar
				intervals={lastIntervals}
				hintUsed={last.hintUsed}
				selected={last.rating}
				shortcuts={false}
				name="rating"
			/>
			{#if form && 'amendError' in form && form.amendError}
				<Notice tone="warn">{form.amendError}</Notice>
			{/if}
		</form>
	{/if}
{/snippet}

{#if last && lastIntervals}
	<Sheet
		bind:open={amending}
		title="Corriger la dernière note"
		description="« {last.prompt} » : la nouvelle note remplace la précédente. Possible pendant une heure."
	>
		{@render amendForm()}
	</Sheet>
{/if}
