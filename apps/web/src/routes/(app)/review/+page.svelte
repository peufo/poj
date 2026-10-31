<script lang="ts">
	import { fly, fade } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import FormIssues from '#lib/components/form/FormIssues.svelte';
	import FormSuccess from '#lib/components/form/FormSuccess.svelte';
	import SubmitButton from '#lib/components/form/SubmitButton.svelte';
	import RatingBar from '#lib/components/RatingBar.svelte';
	import RatingPill from '#lib/components/RatingPill.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Kbd from '#lib/ui/Kbd.svelte';
	import Sheet from '#lib/ui/Sheet.svelte';
	import { describeDue, formatInterval } from '#lib/format/due.js';
	import { directionFaces, directionLabel } from '#lib/format/decks.js';
	import {
		formatWeekday,
		isSameDay,
		plural,
		ratingLabels,
		type Rating
	} from '#lib/format/labels.js';
	import { amend, answer, hint } from './review.remote';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const current = $derived(data.current);
	const last = $derived(data.last);
	// Chaque présentation d'une révision est distincte (une carte ratée revient).
	const key = $derived(current ? `${current.id}:${current.version}` : null);

	// svelte-ignore state_referenced_locally
	let revealedFor: string | null = $state(data.revealed ? key : null);
	const revealed = $derived(key !== null && revealedFor === key);
	const hintShown = $derived(current?.hintUsed ?? false);

	let answered = $state(0);
	let amending = $state(false);

	const endsWithPunctuation = (text: string) => /[.?!…]$/.test(text);
	// Paramètres de la session, gardés par les liens (les formulaires gardent ceux de la page).
	const deckQuery = $derived(data.session ? `deck=${data.session.id}&` : '');
	const query = $derived(`${deckQuery}${data.ahead ? 'ahead=1&' : ''}`);
	const cardsHref = $derived(data.session ? `/cards?deck=${data.session.id}` : '/cards');
	// Faces présentée et attendue : leur langue (attribut `lang`), `null` pour un sujet.
	const sides = $derived(current && directionFaces(current.direction, current.deck));

	const intervalsFrom = (preview: Record<Rating, Date>, from: Date) =>
		Object.fromEntries(
			Object.entries(preview).map(([rating, due]) => [
				rating,
				formatInterval(due.getTime() - from.getTime())
			])
		) as Record<Rating, string>;

	const intervals = $derived(current && intervalsFrom(current.preview, data.now));
	const lastIntervals = $derived(last && intervalsFrom(last.preview, last.reviewedAt));

	let hintElement: HTMLFormElement | undefined = $state();
	let answerElement: HTMLFormElement | undefined = $state();

	// Un seul envoi à la fois (raccourcis clavier compris : celui-ci est déjà compté).
	const hintEnhanced = hint.enhance(async ({ submit }) => {
		if (hint.pending > 1) return;
		await submit();
	});

	const answerEnhanced = answer.enhance(async ({ submit }) => {
		if (answer.pending > 1) return;
		if ((await submit()) && !answer.result?.replayed) answered += 1;
	});

	const amendEnhanced = amend.enhance(async ({ submit }) => {
		if (await submit()) amending = false;
	});

	function rate(rating: Rating) {
		const button = answerElement?.querySelector<HTMLButtonElement>(
			`button[type="submit"][value="${rating}"]`
		);
		if (button && !button.disabled) answerElement?.requestSubmit(button);
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
			hintElement?.requestSubmit();
		} else if (revealed && ['1', '2', '3', '4'].includes(event.key)) {
			rate((['again', 'hard', 'good', 'easy'] as const)[Number(event.key) - 1]);
		}
	}
</script>

<svelte:window {onkeydown} />
<svelte:head><title>Réviser{data.session ? ` ${data.session.name}` : ''} · Poj</title></svelte:head>

<div
	class="mx-auto flex min-h-[calc(100dvh-var(--chrome-top,0px))] w-full max-w-xl flex-col px-4 md:px-8"
>
	<!-- Barre de session -->
	<div class="flex h-14 shrink-0 items-center justify-between gap-3">
		<Button href={cardsHref} variant="ghost" size="sm" icon="x" class="-ml-2.5">Quitter</Button>
		{#if data.session}
			<!-- Session d'un seul deck (son bouton « Réviser »). -->
			<p class="min-w-0 flex-1 truncate text-center text-sm font-medium text-ink-2">
				{data.session.name}
			</p>
		{/if}
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
						{directionLabel(current.direction, current.deck)}
						{#if current.isNew}
							<span class="rounded-sm bg-accent-soft px-1.5 text-xs font-semibold text-accent-text"
								>nouvelle</span
							>
						{/if}
					</p>

					<div class="flex flex-1 flex-col justify-center gap-5 py-6">
						<p class="text-3xl font-semibold tracking-tight md:text-4xl" lang={sides?.from.lang}>
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
									lang={sides?.to.lang}
								>
									{current.expected}
								</p>
							</div>
						{/if}
					</div>

					{#if !revealed && current.context && !hintShown}
						<form {...hintEnhanced} bind:this={hintElement} class="self-start">
							<input {...hint.fields.reviewId.as('hidden', current.id)} />
							<FormIssues issues={hint.fields.allIssues()} />
							<SubmitButton remote={hint} variant="ghost" icon="hint" size="sm" class="-ml-2">
								Voir le contexte <Kbd>H</Kbd>
							</SubmitButton>
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

			<FormIssues tone="warn" issues={answer.fields.allIssues()} />

			{#if revealed && intervals}
				<form {...answerEnhanced} bind:this={answerElement}>
					<input {...answer.fields.reviewId.as('hidden', current.id)} />
					<input {...answer.fields.version.as('hidden', current.version)} />
					<RatingBar
						{intervals}
						hintUsed={hintShown}
						name={answer.fields.rating.as('submit', 'good').name}
						disabled={answer.pending > 0}
					/>
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
						<!-- Pas de date pour une échéance du jour : « dans 4 min » suffit. -->
						Prochaine révision {describeDue(next.due, data.now)
							.long}{#if !isSameDay(next.due, data.now)},
							{formatWeekday(next.due)}{/if}&nbsp;:
						<span class="text-ink" lang={directionFaces(next.direction, next.deck).from.lang}
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
					<Button href="/review?{query}ahead=1" variant="primary" size="lg" icon="clock"
						>Réviser en avance</Button
					>
				{/if}
				<Button size="lg" href={cardsHref}>Voir les cartes</Button>
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
			<Button
				size="sm"
				variant="ghost"
				icon="undo"
				class="-mr-2.5 shrink-0"
				onclick={() => (amending = true)}
			>
				Corriger <Kbd>Z</Kbd>
			</Button>
		</div>
		{#if amend.result}
			<FormSuccess>
				{amend.result.unchanged
					? `Note inchangée : c’était déjà ${ratingLabels[last.rating]}.`
					: `Note corrigée : ${ratingLabels[last.rating]}.`}
			</FormSuccess>
		{/if}
	{/if}
{/snippet}

{#if last && lastIntervals}
	<Sheet
		bind:open={amending}
		title="Corriger la dernière note"
		description="« {last.prompt} » : la nouvelle note remplace la précédente. Possible pendant une heure."
	>
		<form {...amendEnhanced} class="flex flex-col gap-4">
			<input {...amend.fields.reviewId.as('hidden', last.reviewId)} />
			<RatingBar
				intervals={lastIntervals}
				hintUsed={last.hintUsed}
				selected={last.rating}
				shortcuts={false}
				name={amend.fields.rating.as('submit', 'good').name}
				disabled={amend.pending > 0}
			/>
			<FormIssues tone="warn" issues={amend.fields.allIssues()} />
		</form>
	</Sheet>
{/if}
