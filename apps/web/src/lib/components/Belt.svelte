<script lang="ts">
	import Button from '#lib/ui/Button.svelte';
	import {
		BELT_HEIGHT,
		BELT_MARGIN,
		BELT_STOPS,
		DEFAULT_STOP,
		cardsByStop,
		forecastPath,
		formatRate,
		layoutMarks,
		layoutPile,
		markPaths,
		nearestStop,
		pilePath,
		rateAt,
		stopAt,
		type ForecastMark,
		type MarkToken
	} from '#lib/format/belt.js';
	import { plural } from '#lib/format/labels.js';

	// Le tapis : chaque carte en route est une marque, posée à sa prochaine présentation sur un
	// axe logarithmique, de maintenant (à gauche) à deux ans, et teintée par la maîtrise du sens
	// présenté. Au bout, sous le rouleau, la boîte des prêtes. Toucher ou survoler le
	// tapis place une ligne sur un cran, avec le nombre de cartes à présenter d'ici là. En
	// tiretés, l'estimation des révisions par jour le long de l'axe : une forme, sans échelle,
	// dont la ligne donne la valeur.
	type Props = {
		/** Cartes neuves en attente. */
		stock: number;
		/** Cartes présentables maintenant. */
		due: number;
		tokens: MarkToken[];
		/** Révisions estimées par jour le long de l'axe. */
		forecast: ForecastMark[];
		reviewHref: string;
	};

	let { stock, due, tokens, forecast, reviewHref }: Props = $props();

	const fills = ['fill-level-0', 'fill-level-1', 'fill-level-2', 'fill-level-3'];
	/** Marques d'une boîte : trois colonnes de 7 px, sur sa hauteur utile. */
	const PILE_WIDTH = 20;
	const PILE_HEIGHT = 44;

	let width = $state(0);
	let readoutWidth = $state(0);
	/** Cran où se trouve la ligne, `null` sans ligne. */
	let stop: number | null = $state(null);
	let tape: HTMLDivElement | undefined = $state();

	const span = $derived(Math.max(0, width - BELT_MARGIN));
	const xOf = (position: number) => Math.round(BELT_MARGIN + position * span) + 0.5;
	const paths = $derived(
		span > 0 ? markPaths(layoutMarks(tokens, span), BELT_MARGIN, BELT_HEIGHT) : null
	);
	const curve = $derived(
		span > 0 ? forecastPath(forecast, BELT_MARGIN, span, BELT_HEIGHT - 3, BELT_HEIGHT - 8) : ''
	);
	/** Cartes à présenter d'ici chaque cran, prêtes comprises. */
	const counts = $derived(
		cardsByStop(
			tokens.map((token) => token.position),
			due
		)
	);

	/** Lecture d'un cran : où il est, combien de cartes d'ici là, et le rythme estimé à ce moment. */
	function readingAt(index: number) {
		const { position, label } = stopAt(index);
		const cards = counts[index] ?? due;
		const rate = formatRate(rateAt(forecast, position));
		const text = `${plural(cards, 'carte')} d'ici ${label}, environ ${rate} révisions par jour à ce moment, estimation`;
		return { label, cards, rate, x: xOf(position), text };
	}

	const reading = $derived(stop === null ? null : readingAt(stop));
	// Le curseur clavier annonce un cran même sans ligne affichée.
	const valueText = $derived((reading ?? readingAt(DEFAULT_STOP)).text);

	function stopUnder(event: PointerEvent): number | null {
		if (!tape || span === 0) return null;
		const left = tape.getBoundingClientRect().left + BELT_MARGIN;
		return nearestStop((event.clientX - left) / span);
	}

	// Au toucher, la ligne reste jusqu'à un toucher hors du tapis.
	function dismiss(event: PointerEvent) {
		if (stop !== null && event.target instanceof Node && !tape?.contains(event.target)) {
			stop = null;
		}
	}
</script>

<svelte:window onpointerdown={dismiss} />

<section
	aria-label="Tapis des révisions"
	class="flex flex-col gap-1 rounded-2xl bg-surface p-4 pt-3"
>
	<div class="relative h-5" aria-hidden="true">
		{#if reading}
			<p
				bind:clientWidth={readoutWidth}
				class="absolute top-0 text-sm font-medium whitespace-nowrap text-ink tabular-nums"
				style:left="{Math.max(0, Math.min(width - readoutWidth, reading.x - readoutWidth / 2))}px"
			>
				<span class="font-semibold text-accent-text">{plural(reading.cards, 'carte')}</span>
				d'ici {reading.label}
				<span class="font-normal text-ink-2">· ≈ {reading.rate}/j</span>
			</p>
		{:else if curve}
			<p class="absolute top-0 right-0 flex items-center gap-1.5 text-xs leading-5 text-ink-3">
				<svg width="16" height="4" aria-hidden="true">
					<line
						x1="0"
						x2="16"
						y1="2"
						y2="2"
						class="stroke-ink-2"
						stroke-width="1.5"
						stroke-dasharray="4 3"
					/>
				</svg>
				≈ révisions par jour
			</p>
		{/if}
	</div>

	<div
		bind:this={tape}
		bind:clientWidth={width}
		class="relative cursor-crosshair touch-pan-y rounded-md has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-focus"
		style:height="{BELT_HEIGHT + 24}px"
		onpointerdown={(event) => (stop = stopUnder(event))}
		onpointermove={(event) => {
			if (event.pointerType === 'mouse' || event.buttons) stop = stopUnder(event);
		}}
		onpointerleave={(event) => {
			if (event.pointerType === 'mouse') stop = null;
		}}
		role="presentation"
	>
		{#if paths}
			<svg
				{width}
				height={BELT_HEIGHT + 8}
				class="absolute top-0 left-0 overflow-visible"
				aria-hidden="true"
			>
				{#each paths as d, level (level)}
					{#if d}<path {d} class={fills[level]} />{/if}
				{/each}
				{#if reading}
					<rect
						x={reading.x}
						y={-2}
						width={Math.max(0, width - reading.x)}
						height={BELT_HEIGHT + 2}
						class="fill-surface"
						opacity="0.68"
					/>
				{/if}
				{#if curve}
					<path
						d={curve}
						class="fill-none stroke-surface"
						stroke-width="4"
						stroke-linejoin="round"
						opacity="0.85"
					/>
					<path
						d={curve}
						class="fill-none stroke-ink-2"
						stroke-width="1.5"
						stroke-dasharray="4 3"
						stroke-linejoin="round"
					/>
				{/if}
				<line
					x1={BELT_MARGIN}
					x2={width}
					y1={BELT_HEIGHT + 0.5}
					y2={BELT_HEIGHT + 0.5}
					class="stroke-line-strong"
				/>
				<circle cx={BELT_MARGIN} cy={BELT_HEIGHT + 0.5} r="2.5" class="fill-surface stroke-ink-3" />
				{#each BELT_STOPS as { delayMs, position, major } (delayMs)}
					<line
						x1={xOf(position)}
						x2={xOf(position)}
						y1={BELT_HEIGHT}
						y2={BELT_HEIGHT + (major ? 6 : 3)}
						class={major ? 'stroke-ink-3' : 'stroke-line-strong'}
					/>
				{/each}
				{#if reading}
					<line
						x1={reading.x}
						x2={reading.x}
						y1={-2}
						y2={BELT_HEIGHT + 8}
						class="stroke-accent-text"
						stroke-width="1.5"
					/>
				{/if}
			</svg>
		{/if}
		<div
			class="pointer-events-none absolute inset-x-0 h-4 text-[0.6875rem] leading-4 text-ink-3 tabular-nums"
			style:top="{BELT_HEIGHT + 8}px"
			aria-hidden="true"
		>
			{#each BELT_STOPS.filter((s) => s.major) as { delayMs, position, label } (delayMs)}
				<span
					class="absolute -translate-x-1/2 whitespace-nowrap"
					style:left="calc({BELT_MARGIN}px + (100% - {BELT_MARGIN}px) * {position})">{label}</span
				>
			{/each}
		</div>
		<input
			type="range"
			min="0"
			max={BELT_STOPS.length - 1}
			step="1"
			value={stop ?? DEFAULT_STOP}
			aria-label="Cartes à réviser d'ici une date"
			aria-valuetext={valueText}
			oninput={(event) => (stop = event.currentTarget.valueAsNumber)}
			onfocus={() => (stop ??= DEFAULT_STOP)}
			onblur={() => (stop = null)}
			class="sr-only"
		/>
	</div>

	<div class="flex items-end gap-1.5">
		{@render box(due, 'prête', 'prêtes', due > 0 ? 'ready' : 'empty')}
		{#if stock > 0}{@render box(stock, 'neuve', 'neuves', 'waiting')}{/if}
		<Button href={reviewHref} variant="primary" class="ml-auto">Réviser</Button>
	</div>
</section>

<!-- Une boîte sous le tapis : ses cartes en marques (pleines, ou creuses si en attente), et leur nombre. -->
{#snippet box(count: number, one: string, many: string, kind: 'ready' | 'empty' | 'waiting')}
	{@const pile = layoutPile(count, PILE_WIDTH, PILE_HEIGHT)}
	{@const outline = kind === 'waiting' && pile.size.width >= 4}
	<p
		class={[
			'flex h-14 items-end gap-1.5 pr-2 pb-1.5 pl-1.5',
			kind === 'ready' && 'rounded-b-lg bg-accent-soft text-accent-text',
			kind === 'empty' && 'rounded-b-lg border border-t-0 border-line-strong text-ink-3',
			kind === 'waiting' && 'rounded-lg bg-hover text-ink-2'
		]}
	>
		{#if count > 0}
			<svg width={PILE_WIDTH} height={PILE_HEIGHT} aria-hidden="true">
				<path
					d={pilePath(pile, PILE_HEIGHT, { outline })}
					class={kind === 'ready'
						? 'fill-accent'
						: outline
							? 'fill-none stroke-level-1'
							: 'fill-level-1'}
				/>
			</svg>
		{/if}
		<span class="flex flex-col self-center">
			<span class="text-[0.9375rem] leading-5 font-semibold tabular-nums">{count}</span>
			<span class="text-[0.6875rem] leading-4">{count > 1 ? many : one}</span>
		</span>
	</p>
{/snippet}
