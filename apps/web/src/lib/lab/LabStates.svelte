<script lang="ts" generics="T extends string">
	import SegmentedControl from '#lib/ui/SegmentedControl.svelte';

	// Sélecteur d'état d'une maquette. Volontairement hors du langage produit (cadre pointillé).
	type Props = { options: { value: T; label: string }[]; value: T; onchange?: (value: T) => void };

	let { options, value = $bindable(), onchange }: Props = $props();
</script>

<div
	class="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-dashed border-line-strong px-3 py-2"
>
	<span class="text-xs font-medium text-ink-3">État de la maquette</span>
	<SegmentedControl label="État de la maquette" {options} bind:value size="sm" {onchange} />
</div>
