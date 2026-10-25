<script lang="ts" generics="T extends string">
	import Icon, { type IconName } from './Icon.svelte';

	type Option = { value: T; label: string; icon?: IconName };
	type Props = {
		options: Option[];
		value: T;
		label: string;
		/** Masque les libellés et ne garde que les icônes (le libellé reste lu). */
		iconOnly?: boolean;
		size?: 'sm' | 'md';
		onchange?: (value: T) => void;
	};

	let {
		options,
		value = $bindable(),
		label,
		iconOnly = false,
		size = 'md',
		onchange
	}: Props = $props();

	function select(next: T) {
		value = next;
		onchange?.(next);
	}
</script>

<div
	role="group"
	aria-label={label}
	class="inline-flex shrink-0 rounded-lg bg-surface p-0.5 ring-1 ring-inset ring-line"
>
	{#each options as option (option.value)}
		{@const active = option.value === value}
		<button
			type="button"
			aria-pressed={active}
			aria-label={iconOnly ? option.label : undefined}
			title={iconOnly ? option.label : undefined}
			onclick={() => select(option.value)}
			class={[
				'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-[background-color,color,box-shadow] duration-150',
				size === 'sm' ? 'h-7 px-2 text-xs' : 'h-8 px-3 text-sm',
				active ? 'bg-raised text-ink shadow-raised' : 'text-ink-3 hover:text-ink'
			]}
		>
			{#if option.icon}<Icon name={option.icon} size={size === 'sm' ? 14 : 16} />{/if}
			{#if !iconOnly}{option.label}{/if}
		</button>
	{/each}
</div>
