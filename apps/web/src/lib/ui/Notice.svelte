<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon, { type IconName } from './Icon.svelte';

	type Props = {
		tone?: 'info' | 'warn' | 'danger';
		title?: string;
		icon?: IconName;
		children?: Snippet;
		actions?: Snippet;
	};

	let { tone = 'info', title, icon, children, actions }: Props = $props();

	const tones = {
		info: { box: 'bg-surface', icon: 'text-ink-2', fallback: 'info' },
		warn: { box: 'bg-warn-soft', icon: 'text-warn', fallback: 'alert' },
		danger: { box: 'bg-danger-soft', icon: 'text-danger', fallback: 'alert' }
	} as const;

	const t = $derived(tones[tone]);
</script>

<div
	class="flex gap-3 rounded-xl px-3.5 py-3 text-sm text-ink {t.box}"
	role={tone === 'info' ? 'status' : 'alert'}
>
	<Icon name={icon ?? t.fallback} size={18} class="mt-px {t.icon}" />
	<div class="flex min-w-0 flex-1 flex-col gap-1">
		{#if title}<p class="font-semibold">{title}</p>{/if}
		{#if children}<div class="text-ink-2">{@render children()}</div>{/if}
		{#if actions}<div class="mt-1.5 flex flex-wrap gap-2">{@render actions()}</div>{/if}
	</div>
</div>
