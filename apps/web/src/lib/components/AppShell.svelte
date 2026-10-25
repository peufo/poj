<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon, { type IconName } from '#lib/ui/Icon.svelte';
	import Wordmark from './Wordmark.svelte';

	// Cadre de l'application : barre latérale sur grand écran, barre d'onglets au pouce
	// sur téléphone. En révision (`focus`), la navigation s'efface.
	type Section = 'review' | 'cards' | 'new';
	type Props = {
		current?: Section;
		dueCount?: number;
		cardCount?: number;
		/** Préfixe des liens (« /lab » pour les maquettes). */
		base?: string;
		user?: { email: string };
		focus?: boolean;
		children: Snippet;
	};

	let { current, dueCount, cardCount, base = '', user, focus = false, children }: Props = $props();

	const items = $derived<
		{ id: Section; label: string; short: string; icon: IconName; href: string; count?: number }[]
	>([
		{
			id: 'review',
			label: 'Réviser',
			short: 'Réviser',
			icon: 'review',
			href: `${base}/review`,
			count: dueCount
		},
		{
			id: 'cards',
			label: 'Cartes',
			short: 'Cartes',
			icon: 'cards',
			href: `${base}/cards`,
			count: cardCount
		},
		{
			id: 'new',
			label: 'Nouvelle carte',
			short: 'Nouvelle',
			icon: 'plus',
			href: `${base}/cards/new`
		}
	]);
</script>

<div class="min-h-[calc(100dvh-var(--chrome-top,0px))] md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
	<!-- Barre latérale (≥ md) -->
	<aside
		class="sticky top-(--chrome-top,0px) hidden h-[calc(100dvh-var(--chrome-top,0px))] flex-col gap-6 border-r border-line bg-surface px-3 py-4 md:flex"
	>
		<a href="{base}/cards" class="self-start rounded-md px-2 py-1"><Wordmark /></a>
		<nav aria-label="Navigation principale">
			<ul class="flex flex-col gap-0.5">
				{#each items as item (item.id)}
					{@const active = current === item.id}
					<li>
						<a
							href={item.href}
							aria-current={active ? 'page' : undefined}
							class={[
								'flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors duration-150',
								active ? 'bg-hover text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink'
							]}
						>
							<Icon name={item.icon} size={17} class={active ? 'text-accent-text' : 'text-ink-3'} />
							<span class="flex-1">{item.label}</span>
							{#if item.count !== undefined}
								<span
									class={[
										'text-xs tabular-nums',
										item.id === 'review' && item.count > 0
											? 'rounded-full bg-accent px-1.5 py-px font-semibold text-on-accent'
											: 'text-ink-3'
									]}>{item.count}</span
								>
							{/if}
						</a>
					</li>
				{/each}
			</ul>
		</nav>
		{#if user}
			<form
				method="post"
				action="/logout"
				class="mt-auto flex flex-col gap-1 border-t border-line pt-3"
			>
				<span class="truncate px-2.5 text-xs text-ink-3">{user.email}</span>
				<button
					class="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink"
				>
					<Icon name="logout" size={17} class="text-ink-3" />Déconnexion
				</button>
			</form>
		{/if}
	</aside>

	<div
		class="flex min-w-0 flex-col {focus
			? ''
			: 'pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0'}"
	>
		{@render children()}
	</div>

	<!-- Barre d'onglets (< md) -->
	{#if !focus}
		<nav
			aria-label="Navigation principale"
			class="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 md:hidden"
		>
			<ul class="mx-auto grid h-16 max-w-md grid-cols-3">
				{#each items as item (item.id)}
					{@const active = current === item.id}
					<li>
						<a
							href={item.href}
							aria-current={active ? 'page' : undefined}
							class={[
								'flex h-full flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium transition-colors duration-150',
								active ? 'text-accent-text' : 'text-ink-3 hover:text-ink'
							]}
						>
							<span class="relative">
								<Icon name={item.icon} size={22} />
								{#if item.id === 'review' && item.count}
									<span
										class="absolute -top-1.5 left-[calc(100%-0.5rem)] min-w-[1.125rem] rounded-full bg-accent px-1 text-center text-[0.6875rem] leading-[1.125rem] font-semibold text-on-accent tabular-nums ring-2 ring-canvas"
										>{item.count}<span class="sr-only"> dues</span></span
									>
								{/if}
							</span>
							{item.short}
						</a>
					</li>
				{/each}
			</ul>
		</nav>
	{/if}
</div>
