<script lang="ts">
	import {
		activityWeeks,
		formatActivityDate,
		formatMonth,
		type ActivityCell,
		type ActivityDay
	} from '#lib/format/activity.js';
	import type { ResolvedPathname } from '$app/types';
	import { plural } from '#lib/format/labels.js';
	import Button from '#lib/ui/Button.svelte';

	// L'historique : une case par jour, une colonne par semaine (du lundi au dimanche), teintée
	// par le nombre d'actions du jour (cartes ajoutées et révisions). Encre neutre, comme les
	// vélocités : c'est le passé, le teal reste à ce qui est dû. Même grille sur tous les
	// écrans, en cases de taille fixe : quand la période ne tient pas, elle défile, calée à droite
	// sur la semaine en cours. Les jours à venir de cette semaine sont en contour seul.
	type Props = {
		/** Jours consécutifs, du plus ancien (un lundi) à aujourd'hui. */
		days: ActivityDay[];
		/** Période couverte, après « Activité ». */
		period?: string;
		/** Cases de 10 px (`md`) ou 14 px (`lg`, page des statistiques). */
		size?: 'md' | 'lg';
		/** Lien vers la page des statistiques, sous la grille. */
		moreHref?: ResolvedPathname;
	};

	let { days, period = 'sur l’année', size = 'md', moreHref }: Props = $props();

	const weeks = $derived(activityWeeks(days));

	/**
	 * Libellé du mois au-dessus d'une semaine : le mois qui y commence, ou, sur la première
	 * colonne, celui de son lundi si aucun mois ne commence juste après.
	 */
	function monthLabel(index: number): string | null {
		const week = weeks[index];
		if (!week) return null;
		if (week.month) return week.month;
		if (index !== 0 || weeks.slice(1, 3).some((w) => w.month)) return null;
		const [monday] = week.days;
		return monday ? formatMonth(monday.date) : null;
	}

	const total = $derived(
		days.reduce(
			(sum, day) => ({ added: sum.added + day.added, reviewed: sum.reviewed + day.reviewed }),
			{ added: 0, reviewed: 0 }
		)
	);

	const fills = ['bg-line', 'bg-ink/20', 'bg-ink/40', 'bg-ink/65', 'bg-ink/90'];
	const weekdays = ['lun.', '', 'mer.', '', 'ven.', '', ''];

	function describe(cell: ActivityCell): string {
		return `${formatActivityDate(cell.date)} : ${plural(cell.added, 'carte ajoutée', 'cartes ajoutées')}, ${plural(cell.reviewed, 'révision')}`;
	}

	// Les cases sont des boutons sans action : toucher ou focaliser une case affiche son
	// détail. Une seule case dans l'ordre de tabulation (aujourd'hui par défaut) ; les flèches
	// déplacent le focus de jour en jour (haut, bas) ou de semaine en semaine (gauche, droite).
	const cells: (HTMLElement | undefined)[] = [];
	let focusIndex = $state(-1);
	const tabIndex = $derived(focusIndex >= 0 ? focusIndex : days.length - 1);

	/**
	 * Case survolée ou focalisée, et sa position dans le cadre. La bulle vit hors de la zone
	 * qui défile, sinon celle-ci la couperait au-dessus de la première ligne.
	 */
	let tip = $state<{ cell: ActivityCell; x: number; y: number } | null>(null);
	let frame = $state<HTMLElement>();
	let frameWidth = $state(0);
	let tipWidth = $state(0);
	const tipLeft = $derived(
		tip ? Math.min(Math.max(tip.x, tipWidth / 2), Math.max(frameWidth - tipWidth / 2, 0)) : 0
	);

	function show(cell: ActivityCell, target: HTMLElement) {
		if (!frame) return;
		const box = target.getBoundingClientRect();
		const origin = frame.getBoundingClientRect();
		tip = { cell, x: box.left + box.width / 2 - origin.left, y: box.top - origin.top };
	}

	function move(event: KeyboardEvent, index: number) {
		const step = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }[event.key];
		if (step === undefined) return;
		event.preventDefault();
		// Les jours à venir ne se focalisent pas.
		cells[index + step]?.focus();
	}
</script>

<section
	aria-labelledby="activity-title"
	class="flex flex-col gap-3"
	style:--cell={size === 'lg' ? '14px' : '10px'}
>
	<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
		<h2 id="activity-title" class="text-sm font-semibold">
			Activité <span class="font-normal text-ink-3">{period}</span>
		</h2>
		<p class="text-xs text-ink-2 tabular-nums">
			{plural(total.reviewed, 'révision')}, {plural(
				total.added,
				'carte ajoutée',
				'cartes ajoutées'
			)}
		</p>
	</div>

	<div
		bind:this={frame}
		bind:clientWidth={frameWidth}
		role="presentation"
		class="relative flex"
		onpointerleave={() => {
			if (!cells.some((cell) => cell === document.activeElement)) tip = null;
		}}
	>
		<!-- Jours de la semaine, hors de la zone qui défile : toujours visibles. -->
		<div aria-hidden="true" class="activity-rows grid shrink-0 pr-1.5">
			<span></span>
			{#each weekdays as weekday, i (i)}
				<span class="flex items-center text-[10px] leading-none text-ink-3">{weekday}</span>
			{/each}
		</div>

		<!-- `rtl` : la zone s'ouvre calée à droite, sur la semaine en cours, sans script. -->
		<div dir="rtl" class="min-w-0 overflow-x-auto pb-2.5" onscroll={() => (tip = null)}>
			<div
				dir="ltr"
				role="group"
				aria-label="Activité jour par jour"
				class="activity-rows activity grid w-max"
			>
				{#each weeks as week, w (w)}
					<span
						aria-hidden="true"
						class="overflow-visible text-[10px] leading-4 whitespace-nowrap text-ink-3"
					>
						{monthLabel(w)}
					</span>
					{#each week.days as cell, d (d)}
						{@const index = w * 7 + d}
						{#if cell}
							<button
								type="button"
								bind:this={cells[index]}
								aria-label={describe(cell)}
								tabindex={index === tabIndex ? 0 : -1}
								class="block rounded-[2px] outline-offset-1 focus-visible:outline-2 focus-visible:outline-focus {fills[
									cell.level
								]}"
								onpointerenter={(e) => show(cell, e.currentTarget)}
								onfocus={(e) => {
									focusIndex = index;
									show(cell, e.currentTarget);
								}}
								onblur={() => (tip = null)}
								onkeydown={(e) => move(e, index)}
							></button>
						{:else}
							<!-- Jour à venir de la semaine en cours. -->
							<span aria-hidden="true" class="rounded-[2px] border border-line"></span>
						{/if}
					{/each}
				{/each}
			</div>
		</div>

		{#if tip}
			<div
				aria-hidden="true"
				bind:clientWidth={tipWidth}
				class="pointer-events-none absolute z-10 w-max -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-raised px-2.5 py-1.5 text-xs whitespace-nowrap shadow-overlay"
				style:left="{tipLeft}px"
				style:top="{tip.y - 6}px"
			>
				<p class="font-semibold">{formatActivityDate(tip.cell.date)}</p>
				<p class="text-ink-2 tabular-nums">
					{plural(tip.cell.reviewed, 'révision')} · {plural(
						tip.cell.added,
						'carte ajoutée',
						'cartes ajoutées'
					)}
				</p>
			</div>
		{/if}
	</div>

	<div class="flex flex-wrap items-center justify-between gap-2">
		{#if moreHref}
			<Button href={moreHref} variant="ghost" size="sm" trailingIcon="arrow-right" class="-ml-2.5">
				Statistiques
			</Button>
		{/if}
		<div class="ml-auto flex items-center gap-1.5 text-xs text-ink-3" aria-hidden="true">
			<span>Moins</span>
			{#each fills as fill (fill)}
				<span class="size-2.5 rounded-[2px] {fill}"></span>
			{/each}
			<span>Plus</span>
		</div>
	</div>
</section>

<style>
	/* Mêmes lignes pour les jours de la semaine et la grille : le libellé du mois, puis les
	   sept jours, en cases de taille fixe. */
	.activity-rows {
		grid-template-rows: 1rem repeat(7, var(--cell));
		row-gap: 3px;
	}

	/* Semaine après semaine, en colonnes. */
	.activity {
		grid-auto-flow: column;
		grid-auto-columns: var(--cell);
		column-gap: 3px;
	}
</style>
