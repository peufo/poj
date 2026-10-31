<script lang="ts">
	import Button from '#lib/ui/Button.svelte';

	let { label, value }: { label: string; value: string } = $props();

	const id = $props.id();

	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	async function copy() {
		try {
			await navigator.clipboard.writeText(value);
		} catch {
			return; // Sans presse-papiers, la valeur reste sélectionnable dans le champ.
		}
		copied = true;
		clearTimeout(timer);
		timer = setTimeout(() => (copied = false), 2000);
	}
</script>

<label for={id} class="text-sm font-medium text-ink-2">{label}</label>
<div class="flex items-center gap-2">
	<input
		{id}
		readonly
		{value}
		onfocus={(e) => e.currentTarget.select()}
		class="h-11 min-w-0 flex-1 rounded-lg bg-inset px-3 font-mono text-sm text-ink"
	/>
	<Button variant="primary" icon={copied ? 'check' : undefined} onclick={copy}>
		{copied ? 'Copié' : 'Copier'}
	</Button>
</div>
