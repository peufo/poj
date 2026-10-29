<script lang="ts">
	import Icon from '#lib/ui/Icon.svelte';
	import { describeDue } from '#lib/format/due.js';
	import { directionFaces, directionLabel, type DeckFaces } from '#lib/format/decks.js';
	import type { Direction } from '#lib/format/labels.js';

	// Échéance d'un sens : la face à produire (sa langue), puis le délai.
	type Props = { direction: Direction; deck: DeckFaces; due: Date; now: Date; isNew?: boolean };

	let { direction, deck, due, now, isNew = false }: Props = $props();

	const label = $derived(describeDue(due, now, { isNew }));
	const dir = $derived({
		long: directionLabel(direction, deck),
		target: directionFaces(direction, deck).to.short
	});

	const tones = {
		due: 'bg-accent-soft text-accent-text',
		new: 'bg-accent-soft text-accent-text',
		today: 'bg-surface text-ink',
		later: 'bg-surface text-ink-2'
	};
</script>

<span
	class="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-xs font-medium whitespace-nowrap tabular-nums {tones[
		label.tone
	]}"
	title="{dir.long} : {label.long}"
>
	<span class="sr-only">{dir.long} :</span>
	<Icon name="arrow-right" size={12} class="opacity-70" />
	<span aria-hidden="true" class="font-semibold tracking-wide">{dir.target}</span>
	<span class="opacity-40" aria-hidden="true">·</span>
	<span><span class="sr-only">{label.long}</span><span aria-hidden="true">{label.short}</span></span
	>
</span>
