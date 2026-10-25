<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import SegmentedControl from '#lib/ui/SegmentedControl.svelte';
	import Wordmark from '#lib/components/Wordmark.svelte';
	import {
		applyTheme,
		releaseTheme,
		restoreTheme,
		theme,
		type ThemePreference
	} from '#lib/lab/theme.svelte.js';

	let { children } = $props();

	const links = [
		{ href: '/lab', label: 'Matériel' },
		{ href: '/lab/cards', label: 'Cartes' },
		{ href: '/lab/cards/tenir-le-coup', label: 'Détail' },
		{ href: '/lab/cards/new', label: 'Création' },
		{ href: '/lab/review', label: 'Révision' }
	];

	const themes: { value: ThemePreference; label: string; icon: 'monitor' | 'sun' | 'moon' }[] = [
		{ value: 'system', label: 'Thème du système', icon: 'monitor' },
		{ value: 'light', label: 'Thème clair', icon: 'sun' },
		{ value: 'dark', label: 'Thème sombre', icon: 'moon' }
	];

	const isActive = (href: string) => {
		const path = page.url.pathname;
		if (href === '/lab') return path === '/lab';
		if (href === '/lab/cards') return path === '/lab/cards';
		return path.startsWith(href);
	};

	let nav: HTMLElement | undefined = $state();

	// Au téléphone, la liste défile : garder la maquette courante visible.
	$effect(() => {
		void page.url.pathname;
		nav
			?.querySelector('[aria-current="page"]')
			?.scrollIntoView({ inline: 'center', block: 'nearest' });
	});

	onMount(() => {
		restoreTheme();
		return releaseTheme;
	});
</script>

<svelte:head><title>Poj · lab</title></svelte:head>

<div style="--chrome-top: 2.75rem">
	<header
		class="sticky top-0 z-30 flex h-11 items-center gap-3 border-b border-line bg-surface/90 pr-2 pl-3 backdrop-blur-xl"
	>
		<a href="/lab" class="flex shrink-0 items-center gap-1.5 rounded-md">
			<Wordmark size={18} />
			<span class="rounded-sm bg-hover px-1 text-[0.6875rem] font-semibold text-ink-2">lab</span>
		</a>
		<nav
			bind:this={nav}
			aria-label="Maquettes"
			class="min-w-0 flex-1 [scrollbar-width:none] overflow-x-auto [mask-image:linear-gradient(to_right,transparent,black_10px,black_calc(100%-20px),transparent)] px-1"
		>
			<ul class="flex gap-0.5">
				{#each links as link (link.href)}
					<li>
						<a
							href={link.href}
							aria-current={isActive(link.href) ? 'page' : undefined}
							class="flex h-7 items-center rounded-md px-2 text-sm font-medium whitespace-nowrap transition-colors duration-150 {isActive(
								link.href
							)
								? 'bg-hover text-ink'
								: 'text-ink-3 hover:text-ink'}">{link.label}</a
						>
					</li>
				{/each}
			</ul>
		</nav>
		<SegmentedControl
			label="Thème"
			options={themes}
			value={theme.preference}
			iconOnly
			size="sm"
			onchange={applyTheme}
		/>
	</header>

	{@render children()}
</div>
