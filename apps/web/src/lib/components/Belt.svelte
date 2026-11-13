<script lang="ts">
	import { untrack } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import { cubicIn, cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import type { TransitionConfig } from 'svelte/transition';
	import Button from '#lib/ui/Button.svelte';
	import {
		BELT_HEIGHT,
		BELT_MARGIN,
		BELT_STOPS,
		DEFAULT_STOP,
		MINUTE,
		arrivals,
		beltPosition,
		cardsByStop,
		forecastPath,
		formatRate,
		layoutMarks,
		layoutPile,
		markPaths,
		nearestStop,
		parseSeenBelt,
		pilePath,
		pileSlot,
		rateAt,
		rememberBelt,
		serializeSeenBelt,
		stopAt,
		type BeltCard,
		type ForecastMark,
		type MarkSize,
		type SeenBelt
	} from '#lib/format/belt.js';
	import { plural } from '#lib/format/labels.js';

	// Le tapis : chaque carte en route est une marque, posée à sa prochaine présentation sur un
	// axe logarithmique, de dix minutes (à gauche, avec tout ce qui vient avant) à deux ans, et
	// teintée par la maîtrise du sens présenté. Au bout, sous le rouleau, la boîte des prêtes.
	// Toucher ou survoler le tapis place une ligne sur un cran, avec le nombre de cartes à
	// présenter d'ici là. En tiretés, l'estimation des révisions par jour le long de l'axe : une
	// forme, sans échelle, dont la ligne donne la valeur.
	// Une carte qui devient prête, page ouverte ou depuis le dernier état vu, tombe du bout du
	// tapis dans la boîte : pendant sa chute, elle n'est ni sur le tapis ni dans la boîte.
	type Props = {
		/** Cartes neuves en attente. */
		stock: number;
		/** Cartes présentables au chargement, par identifiant. */
		ready: string[];
		/** Cartes en route au chargement. */
		tokens: BeltCard[];
		/** Révisions estimées par jour le long de l'axe. */
		forecast: ForecastMark[];
		/** Heure du chargement. */
		now: Date;
		reviewHref: string;
	};

	let { stock, ready, tokens, forecast, now, reviewHref }: Props = $props();

	const fills = ['fill-level-0', 'fill-level-1', 'fill-level-2', 'fill-level-3'];
	/** Marques d'une boîte : trois colonnes de 7 px, sur sa hauteur utile. */
	const PILE_WIDTH = 20;
	const PILE_HEIGHT = 44;
	/** Marge intérieure de la boîte, sous et à gauche de sa pile (`pb-1.5`, `pl-1.5`), en px. */
	const BOX_INSET = 6;
	const FALL_MS = 220;
	/** Le dernier état vu du tapis, dans ce navigateur. */
	const SEEN_KEY = 'poj:belt-seen';

	/** Une carte qui tombe : sa place dans la boîte, et l'écart depuis le bout du tapis. */
	interface Fall {
		id: string;
		x: number;
		y: number;
		dx: number;
		dy: number;
		size: MarkSize;
		delay: number;
	}

	let width = $state(0);
	let readoutWidth = $state(0);
	/** Cran où se trouve la ligne, `null` sans ligne. */
	let stop: number | null = $state(null);
	let tape: HTMLDivElement | undefined = $state();

	let readyBox: HTMLElement | undefined;
	let falling: Fall[] = $state([]);
	/** Sans stockage, le dernier état vu ne dure que le temps de la page. */
	let memory: SeenBelt = new Map();

	// L'heure du tapis, celle du serveur : celle du chargement, puis la suite à l'horloge du
	// navigateur, à chaque échéance et au moins chaque minute.
	const skew = untrack(() => now.getTime()) - Date.now();
	let clock = $derived(now.getTime());
	const byDue = $derived(tokens.toSorted((a, b) => a.dueAt - b.dueAt));
	/** Nombre de cartes en route arrivées au bout du tapis depuis le chargement. */
	const arrived = $derived.by(() => {
		const index = byDue.findIndex((token) => token.dueAt > clock);
		return index < 0 ? byDue.length : index;
	});
	const onBelt = $derived(byDue.slice(arrived));
	const readyNow = $derived([...ready, ...byDue.slice(0, arrived).map((token) => token.id)]);
	const inBox = $derived(Math.max(0, readyNow.length - falling.length));
	const marks = $derived(
		onBelt.map(({ dueAt, level }) => ({ position: beltPosition(dueAt - clock), level }))
	);

	$effect(() => {
		const next = Math.min(clock + MINUTE, onBelt[0]?.dueAt ?? Infinity);
		const timer = setTimeout(
			() => (clock = Math.max(clock, Date.now() + skew)),
			Math.max(0, next - Date.now() - skew)
		);
		return () => clearTimeout(timer);
	});

	// Les cartes vues sur le tapis au dernier état vu et prêtes depuis tombent dans la boîte.
	$effect(() => {
		const cards = readyNow;
		const belt = onBelt;
		untrack(() => {
			const seen = loadSeen() ?? memory;
			drop(arrivals(seen, cards));
			memory = rememberBelt(seen, cards, belt, clock);
			saveSeen(memory);
		});
	});

	function loadSeen(): SeenBelt | null {
		try {
			return parseSeenBelt(localStorage.getItem(SEEN_KEY));
		} catch {
			return null;
		}
	}

	function saveSeen(seen: SeenBelt) {
		try {
			localStorage.setItem(SEEN_KEY, serializeSeenBelt(seen));
		} catch {
			// Sans stockage, seule la chute en direct reste.
		}
	}

	/** Lance la chute de `ids`, du bout du tapis vers les places suivantes de la boîte. */
	function drop(ids: string[]) {
		const fresh = ids.filter((id) => !falling.some((f) => f.id === id));
		if (fresh.length === 0 || prefersReducedMotion.current || !tape || !readyBox) return;
		const origin = tape.getBoundingClientRect();
		const box = readyBox.getBoundingClientRect();
		const pile = layoutPile(readyNow.length, PILE_WIDTH, PILE_HEIGHT);
		const left = box.left - origin.left + BOX_INSET;
		const top = box.bottom - origin.top - BOX_INSET - PILE_HEIGHT;
		const first = readyNow.length - fresh.length;
		const stagger = Math.min(60, 600 / fresh.length);
		fresh.forEach((id, k) => {
			const slot = pileSlot(pile, Math.min(first + k, pile.marks - 1), PILE_HEIGHT);
			const x = left + slot.x;
			const y = top + slot.y;
			falling.push({
				id,
				x,
				y,
				dx: BELT_MARGIN - x,
				dy: BELT_HEIGHT - pile.size.height - y,
				size: pile.size,
				delay: k * stagger
			});
		});
	}

	/** La chute : la carte glisse du rouleau, puis tombe de plus en plus vite. */
	function fall(_node: Element, { dx, dy, delay }: Fall): TransitionConfig {
		return {
			delay,
			duration: FALL_MS,
			css: (t) => `transform: translate(${dx * (1 - cubicOut(t))}px, ${dy * (1 - cubicIn(t))}px)`
		};
	}

	const asReadyBox: Attachment<HTMLElement> = (node) => {
		readyBox = node;
		return () => (readyBox = undefined);
	};

	const span = $derived(Math.max(0, width - BELT_MARGIN));
	const xOf = (position: number) => Math.round(BELT_MARGIN + position * span) + 0.5;
	const paths = $derived(
		span > 0 ? markPaths(layoutMarks(marks, span), BELT_MARGIN, BELT_HEIGHT) : null
	);
	const curve = $derived(
		span > 0 ? forecastPath(forecast, BELT_MARGIN, span, BELT_HEIGHT - 3, BELT_HEIGHT - 8) : ''
	);
	/** Cartes à présenter d'ici chaque cran, prêtes comprises. */
	const counts = $derived(
		cardsByStop(
			marks.map((mark) => mark.position),
			readyNow.length
		)
	);

	/** Lecture d'un cran : où il est, combien de cartes d'ici là, et le rythme estimé à ce moment. */
	function readingAt(index: number) {
		const { position, label } = stopAt(index);
		const cards = counts[index] ?? readyNow.length;
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
		{#if falling.length > 0}
			<svg
				width="1"
				height="1"
				class="pointer-events-none absolute top-0 left-0 overflow-visible"
				aria-hidden="true"
			>
				{#each falling as f (f.id)}
					<rect
						x={f.x}
						y={f.y}
						width={f.size.width}
						height={f.size.height}
						class="fill-accent"
						data-falling={f.id}
						in:fall|global={f}
						onintroend={() => (falling = falling.filter((other) => other.id !== f.id))}
					/>
				{/each}
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
		{@render box(inBox, 'prête', 'prêtes', inBox > 0 ? 'ready' : 'empty')}
		{#if stock > 0}{@render box(stock, 'neuve', 'neuves', 'waiting')}{/if}
		<Button href={reviewHref} variant="primary" class="ml-auto">Réviser</Button>
	</div>
</section>

<!-- Une boîte sous le tapis : ses cartes en marques (pleines, ou creuses si en attente), et leur nombre.
     Les prêtes se rangent comme une fois toutes arrivées : une carte qui tombe vise sa place. -->
{#snippet box(count: number, one: string, many: string, kind: 'ready' | 'empty' | 'waiting')}
	{@const layout = layoutPile(
		kind === 'waiting' ? count : readyNow.length,
		PILE_WIDTH,
		PILE_HEIGHT
	)}
	{@const pile = { ...layout, marks: Math.min(count, layout.marks) }}
	{@const outline = kind === 'waiting' && pile.size.width >= 4}
	<p
		{@attach kind === 'waiting' ? null : asReadyBox}
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
