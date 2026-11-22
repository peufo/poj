<script lang="ts">
	import {
		activityWeeks,
		formatActivityDate,
		formatMonth,
		type ActivityCell,
		type ActivityDay
	} from '#lib/format/activity.js';
	import { plural } from '#lib/format/labels.js';

	// L'historique : une case par jour, une colonne par semaine (du lundi au dimanche), teintée
	// par le nombre d'actions du jour (cartes ajoutées et révisions). Encre neutre, comme les
	// vélocités : c'est le passé, le teal reste à ce qui est dû. L'année écoulée quand la place
	// le permet ; au téléphone, le dernier mois, en cases plus grandes et numérotées.
	type Props = {
		/** Jours consécutifs, du plus ancien (un lundi) à aujourd'hui. */
		days: ActivityDay[];
	};

	let { days }: Props = $props();

	/** Semaines montrées au téléphone : le mois écoulé, semaine en cours comprise. */
	const MONTH_WEEKS = 5;

	const weeks = $derived(activityWeeks(days));
	/** Première semaine de la vue « mois ». */
	const monthStart = $derived(Math.max(0, weeks.length - MONTH_WEEKS));

	/**
	 * Libellé du mois au-dessus d'une semaine : le mois qui y commence, ou, sur la première
	 * colonne d'une vue, celui de son lundi si aucun mois ne commence juste après.
	 */
	function monthLabel(index: number, first: number): string | null {
		const week = weeks[index];
		if (!week) return null;
		if (week.month) return week.month;
		if (index !== first || weeks.slice(index + 1, index + 3).some((w) => w.month)) return null;
		const [monday] = week.days;
		return monday ? formatMonth(monday.date) : null;
	}

	function totals(cells: (ActivityCell | null)[]) {
		let added = 0;
		let reviewed = 0;
		for (const cell of cells) {
			added += cell?.added ?? 0;
			reviewed += cell?.reviewed ?? 0;
		}
		return { added, reviewed };
	}

	const year = $derived(totals(weeks.flatMap((week) => week.days)));
	const month = $derived(totals(weeks.slice(monthStart).flatMap((week) => week.days)));
	const summary = ({ added, reviewed }: { added: number; reviewed: number }) =>
		`${plural(reviewed, 'révision')}, ${plural(added, 'carte ajoutée', 'cartes ajoutées')}`;

	const fills = ['bg-line', 'bg-ink/20', 'bg-ink/40', 'bg-ink/65', 'bg-ink/90'];
	/** Encre du numéro du jour (vue « mois »), lisible sur chaque teinte. */
	const inks = ['text-ink-3', 'text-ink-2', 'text-ink', 'text-canvas', 'text-canvas'];
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

	/** Case survolée ou focalisée, et sa position dans la grille. */
	let tip = $state<{ cell: ActivityCell; x: number; y: number } | null>(null);
	let gridWidth = $state(0);
	let tipWidth = $state(0);
	const tipLeft = $derived(
		tip ? Math.min(Math.max(tip.x, tipWidth / 2), Math.max(gridWidth - tipWidth / 2, 0)) : 0
	);

	function show(cell: ActivityCell, target: HTMLElement) {
		tip = {
			cell,
			x: target.offsetLeft + target.offsetWidth / 2,
			y: target.offsetTop
		};
	}

	function move(event: KeyboardEvent, index: number) {
		const step = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }[event.key];
		if (step === undefined) return;
		event.preventDefault();
		const next = cells[index + step];
		// Les jours à venir et les semaines masquées (vue « mois ») ne se focalisent pas.
		if (!next || next.offsetParent === null) return;
		next.focus();
	}
</script>

<section
	aria-labelledby="activity-title"
	class="@container flex flex-col gap-3 rounded-2xl bg-surface p-4 md:p-5"
>
	<div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
		<h2 id="activity-title" class="text-sm font-semibold">
			Activité <span class="font-normal text-ink-3 @max-lg:hidden">sur un an</span>
			<span class="font-normal text-ink-3 @lg:hidden"> sur un mois </span>
		</h2>
		<p class="text-xs text-ink-2 tabular-nums">
			<span class="@max-lg:hidden">{summary(year)}</span><span class="@lg:hidden">
				{summary(month)}
			</span>
		</p>
	</div>

	<div
		role="group"
		aria-label="Activité jour par jour"
		class="activity relative grid gap-[3px]"
		bind:clientWidth={gridWidth}
		onpointerleave={() => {
			if (!cells.some((cell) => cell === document.activeElement)) tip = null;
		}}
	>
		<!-- Colonne des jours de la semaine. -->
		<span aria-hidden="true"></span>
		{#each weekdays as weekday, i (i)}
			<span aria-hidden="true" class="self-center pr-1 text-[10px] leading-none text-ink-3">
				{weekday}
			</span>
		{/each}

		{#each weeks as week, w (w)}
			{@const hidden = w < monthStart ? '@max-lg:hidden' : ''}
			{@const label = monthLabel(w, 0)}
			{@const monthViewLabel = monthLabel(w, monthStart)}
			<span
				aria-hidden="true"
				class="h-4 overflow-visible text-[10px] whitespace-nowrap text-ink-3 {hidden}"
			>
				<span class="@max-lg:hidden">{label}</span><span class="@lg:hidden">{monthViewLabel}</span>
			</span>
			{#each week.days as cell, d (d)}
				{@const index = w * 7 + d}
				{#if cell}
					<button
						type="button"
						bind:this={cells[index]}
						aria-label={describe(cell)}
						tabindex={index === tabIndex ? 0 : -1}
						class="grid aspect-square w-full place-items-center rounded-[3px] text-[10px] leading-none tabular-nums outline-offset-1 focus-visible:outline-2 focus-visible:outline-focus {fills[
							cell.level
						]} {inks[cell.level]} {hidden}"
						onpointerenter={(e) => show(cell, e.currentTarget)}
						onfocus={(e) => {
							focusIndex = index;
							show(cell, e.currentTarget);
						}}
						onblur={() => (tip = null)}
						onkeydown={(e) => move(e, index)}
					>
						<span aria-hidden="true" class="@lg:hidden">{Number(cell.date.slice(8))}</span>
					</button>
				{:else}
					<span aria-hidden="true" class={hidden}></span>
				{/if}
			{/each}
		{/each}

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

	<div class="flex items-center justify-end gap-1.5 text-xs text-ink-3" aria-hidden="true">
		<span>Moins</span>
		{#each fills as fill (fill)}
			<span class="size-2.5 rounded-[2px] {fill}"></span>
		{/each}
		<span>Plus</span>
	</div>
</section>

<style>
	/* En colonnes : le libellé du mois puis les sept jours, semaine après semaine. Une
	   semaine masquée ne garde pas sa colonne. Au téléphone, des cases de 2 rem au plus. */
	.activity {
		grid-auto-flow: column;
		grid-template-rows: auto repeat(7, auto);
		grid-template-columns: auto;
		grid-auto-columns: minmax(0, 2rem);
		justify-content: start;
	}
</style>
