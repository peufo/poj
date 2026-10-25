<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from '#lib/ui/Icon.svelte';

	// En-tête d'écran : retour éventuel, grand titre (style iOS), actions à droite.
	// `compact` : une barre de navigation seule (retour et actions) ; le titre reste lu
	// mais n'est pas affiché, le contenu de l'écran tient lieu de titre.
	type Props = {
		title: string;
		/** Complément discret du titre (ex. le nombre de cartes). */
		count?: number;
		back?: { href: string; label: string };
		compact?: boolean;
		actions?: Snippet;
		children?: Snippet;
	};

	let { title, count, back, compact = false, actions, children }: Props = $props();
</script>

{#snippet backLink(link: { href: string; label: string })}
	<a
		href={link.href}
		class="-ml-1.5 inline-flex h-9 items-center gap-0.5 self-start rounded-md pr-2 text-[0.9375rem] font-medium text-accent-text hover:underline"
	>
		<Icon name="chevron-left" size={20} />{link.label}
	</a>
{/snippet}

{#if compact}
	<header class="flex min-h-11 items-center justify-between gap-3 pt-3 md:pt-8">
		{#if back}{@render backLink(back)}{/if}
		<h1 class="sr-only">{title}</h1>
		{#if actions}<div class="flex shrink-0 items-center gap-2">{@render actions()}</div>{/if}
	</header>
{:else}
	<header class="flex flex-col gap-1 pt-3 md:pt-8">
		{#if back}{@render backLink(back)}{/if}
		<div class="flex min-h-11 items-center justify-between gap-3 {back ? '' : 'pt-6 md:pt-0'}">
			<h1 class="text-2xl font-bold tracking-tight">
				{title}
				{#if count !== undefined}<span class="ml-1 font-semibold text-ink-3 tabular-nums"
						>{count}</span
					>{/if}
			</h1>
			{#if actions}<div class="flex shrink-0 items-center gap-2">{@render actions()}</div>{/if}
		</div>
		{@render children?.()}
	</header>
{/if}
