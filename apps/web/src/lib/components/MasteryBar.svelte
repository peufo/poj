<script lang="ts">
	import { masteryLabels, type MasteryLevel } from '#lib/format/mastery.js';

	// Répartition des révisions (deux par carte) par niveau de maîtrise.
	type Props = { counts: Record<MasteryLevel, number> };

	let { counts }: Props = $props();

	const levels = [0, 1, 2, 3] as const;
	const total = $derived(levels.reduce<number>((sum, l) => sum + counts[l], 0));
	const fills = ['bg-level-0', 'bg-level-1', 'bg-level-2', 'bg-level-3'];
</script>

<figure class="flex flex-col gap-2.5">
	<figcaption class="sr-only">
		Maîtrise des {total} révisions : {levels
			.map((l) => `${masteryLabels[l]} ${counts[l]}`)
			.join(', ')}
	</figcaption>
	<div class="flex h-2 gap-0.5" aria-hidden="true">
		{#each levels as level (level)}
			{#if counts[level] > 0}
				<div class="h-full rounded-full {fills[level]}" style="flex-grow: {counts[level]}"></div>
			{/if}
		{/each}
	</div>
	<dl class="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-hidden="true">
		{#each levels as level (level)}
			<div class="flex items-center gap-1.5">
				<span class="size-2 rounded-full {fills[level]}"></span>
				<dt class="text-ink-2">{masteryLabels[level]}</dt>
				<dd class="font-medium text-ink tabular-nums">{counts[level]}</dd>
			</div>
		{/each}
	</dl>
</figure>
