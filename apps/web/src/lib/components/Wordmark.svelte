<script lang="ts">
	// La marque : deux cartes décalées (les deux sens d'une carte), puis « poj ».
	let { size = 22 }: { size?: number } = $props();
</script>

<span class="inline-flex items-center gap-2 text-ink">
	<svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" class="shrink-0">
		<rect
			x="9.5"
			y="3.5"
			width="18"
			height="20"
			rx="4"
			fill="none"
			stroke="currentColor"
			stroke-width="2.25"
			class="text-accent-text"
		/>
		<rect x="4" y="9" width="18" height="20" rx="4" class="fill-accent" />
	</svg>
	<span class="text-[1.0625rem] font-semibold tracking-tight">poj</span>
</span>
