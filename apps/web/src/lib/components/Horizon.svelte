<script lang="ts">
	import { formatWeekday, plural } from '#lib/format/labels.js';

	// Les révisions dues sur les prochains jours, une barre par jour civil.
	// Le premier jour inclut le retard. Toucher un jour le sélectionne (filtre de la liste).
	type Day = { date: Date; count: number };
	type Props = {
		days: Day[];
		selected?: number | null;
		onselect?: (index: number | null) => void;
	};

	let { days, selected = $bindable(null), onselect }: Props = $props();

	let hovered: number | null = $state(null);

	const max = $derived(Math.max(1, ...days.map((d) => d.count)));
	const total = $derived(days.reduce((sum, d) => sum + d.count, 0));
	const focus = $derived(hovered ?? selected);
	const initial = (date: Date) =>
		new Intl.DateTimeFormat('fr-FR', { weekday: 'narrow' }).format(date);

	function toggle(index: number) {
		selected = selected === index ? null : index;
		onselect?.(selected);
	}

	function dayName(index: number) {
		if (index === 0) return "Aujourd'hui";
		if (index === 1) return 'Demain';
		const label = formatWeekday(days[index].date);
		return label.charAt(0).toUpperCase() + label.slice(1);
	}
</script>

<section class="flex flex-col gap-3" aria-label="Révisions à venir">
	<p class="flex items-baseline justify-between gap-3 text-sm" aria-live="polite">
		{#if focus !== null}
			<span class="font-medium text-ink">{dayName(focus)}</span>
			<span class="text-ink-2 tabular-nums">{plural(days[focus].count, 'révision')}</span>
		{:else}
			<span class="font-medium text-ink">{days.length} prochains jours</span>
			<span class="text-ink-2 tabular-nums">{plural(total, 'révision')}</span>
		{/if}
	</p>

	<div
		class="grid h-24 items-end gap-1 md:h-28"
		style="grid-template-columns: repeat({days.length}, minmax(0, 1fr))"
	>
		{#each days as day, i (day.date.getTime())}
			{@const active = selected === i}
			<button
				type="button"
				aria-pressed={active}
				aria-label="{dayName(i)} : {plural(day.count, 'révision')}"
				onclick={() => toggle(i)}
				onpointerenter={() => (hovered = i)}
				onpointerleave={() => (hovered = null)}
				onfocus={() => (hovered = i)}
				onblur={() => (hovered = null)}
				class="group flex h-full flex-col items-center justify-end gap-1.5 rounded-md pt-1 focus-visible:outline-offset-0"
			>
				<span class="flex w-full flex-1 items-end justify-center px-0.5">
					<span
						class={[
							'w-full max-w-5 rounded-[3px] transition-[background-color,height] duration-200 ease-out',
							day.count === 0
								? 'h-0.5 bg-line-strong'
								: active || i === 0
									? 'bg-accent'
									: selected !== null
										? 'bg-accent/30 group-hover:bg-accent/55'
										: 'bg-accent/45 group-hover:bg-accent/70'
						]}
						style={day.count ? `height: ${Math.max(14, (day.count / max) * 100)}%` : undefined}
					></span>
				</span>
				<span
					class={[
						'flex size-6 items-center justify-center rounded-full text-xs tabular-nums',
						active
							? 'bg-accent font-semibold text-on-accent'
							: i === 0
								? 'font-semibold text-accent-text'
								: 'text-ink-3'
					]}
					aria-hidden="true"
				>
					{i === 0 ? day.date.getDate() : initial(day.date)}
				</span>
			</button>
		{/each}
	</div>
</section>
