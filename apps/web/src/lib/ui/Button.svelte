<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import Icon, { type IconName } from './Icon.svelte';

	type Props = Omit<HTMLButtonAttributes, 'class'> & {
		variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
		size?: 'sm' | 'md' | 'lg';
		/** Rend un lien plutôt qu'un bouton. */
		href?: string;
		icon?: IconName;
		trailingIcon?: IconName;
		loading?: boolean;
		block?: boolean;
		class?: string;
		children?: Snippet;
	};

	let {
		variant = 'secondary',
		size = 'md',
		href,
		icon,
		trailingIcon,
		loading = false,
		block = false,
		disabled,
		type = 'button',
		class: className = '',
		children,
		...rest
	}: Props = $props();

	const sizes = {
		sm: 'h-8 gap-1.5 rounded-md px-2.5 text-sm',
		md: 'h-10 gap-2 rounded-lg px-3.5 text-[0.9375rem]',
		lg: 'h-12 gap-2 rounded-xl px-5 text-base'
	};

	const variants = {
		primary: 'bg-accent text-on-accent shadow-raised hover:bg-accent-hover',
		secondary: 'border border-line-strong bg-raised text-ink hover:bg-hover',
		ghost: 'text-ink-2 hover:bg-hover hover:text-ink',
		danger:
			'bg-danger-soft text-danger hover:bg-[color-mix(in_oklab,var(--color-danger-soft),var(--color-danger)_10%)]'
	};

	const iconSize = $derived(size === 'sm' ? 16 : 18);
	const classes = $derived(
		[
			'inline-flex shrink-0 items-center justify-center font-medium whitespace-nowrap select-none',
			'transition-[background-color,color,transform,filter] duration-150 ease-out active:scale-[0.98]',
			'aria-disabled:pointer-events-none aria-disabled:opacity-45',
			sizes[size],
			variants[variant],
			block ? 'w-full' : '',
			className
		].join(' ')
	);
	const inert = $derived(Boolean(disabled) || loading);
</script>

{#snippet content()}
	{#if loading}
		<svg
			class="size-4 animate-spin"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			stroke-width="2.25"
			aria-hidden="true"
		>
			<path d="M12 3a9 9 0 1 0 9 9" stroke-linecap="round" />
		</svg>
	{:else if icon}
		<Icon name={icon} size={iconSize} />
	{/if}
	{@render children?.()}
	{#if trailingIcon}<Icon name={trailingIcon} size={iconSize} />{/if}
{/snippet}

{#if href && !inert}
	<a {href} class={classes}>{@render content()}</a>
{:else}
	<button
		{...rest}
		{type}
		class={classes}
		disabled={inert}
		aria-disabled={inert || undefined}
		aria-busy={loading || undefined}
	>
		{@render content()}
	</button>
{/if}
