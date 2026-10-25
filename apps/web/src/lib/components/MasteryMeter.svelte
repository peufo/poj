<script lang="ts">
	import { masteryLabels, type MasteryLevel } from '#lib/format/mastery.js';

	type Props = { level: MasteryLevel; showLabel?: boolean };

	let { level, showLabel = true }: Props = $props();

	const fills = ['bg-level-0', 'bg-level-1', 'bg-level-2', 'bg-level-3'];
</script>

<span class="inline-flex items-center gap-2" title="Maîtrise : {masteryLabels[level]}">
	<span class="flex gap-0.5" aria-hidden="true">
		{#each [1, 2, 3] as step (step)}
			<span class="h-1.5 w-3.5 rounded-full {level >= step ? fills[level] : 'bg-line-strong'}"
			></span>
		{/each}
	</span>
	{#if showLabel}
		<span class="text-sm text-ink-2">{masteryLabels[level]}</span>
	{:else}
		<span class="sr-only">Maîtrise : {masteryLabels[level]}</span>
	{/if}
</span>
