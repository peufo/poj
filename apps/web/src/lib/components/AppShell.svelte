<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon, { type IconName } from '#lib/ui/Icon.svelte';
	import Wordmark from './Wordmark.svelte';

	// Cadre de l'application : barre latérale sur grand écran, barre d'onglets au pouce
	// sur téléphone. En révision (`focus`), la navigation s'efface.
	//
	// La barre latérale liste chaque deck sous son nom ; la barre d'onglets garde un seul
	// onglet « Cartes », les decks s'y choisissent en haut de `/cards`.
	type Section = 'review' | 'cards' | 'new' | 'new-deck' | 'connect';
	type Props = {
		current?: Section;
		dueCount?: number;
		/** Decks de l'utilisateur, du plus ancien au plus récent. */
		decks?: { id: string; name: string; cardCount: number }[];
		/** Deck affiché (`?deck=`) ; avec un seul deck, c'est lui. */
		activeDeck?: string | null;
		user?: { email: string; isAdmin?: boolean };
		focus?: boolean;
		children: Snippet;
	};

	let {
		current,
		dueCount,
		decks = [],
		activeDeck = null,
		user,
		focus = false,
		children
	}: Props = $props();

	// Pied de la barre latérale : administration et déconnexion.
	const footerItem =
		'flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink';

	type Item = {
		key: string;
		label: string;
		short: string;
		icon: IconName;
		href: string;
		active: boolean;
		count?: number;
		/** Compteur mis en avant (révisions dues). */
		accent?: boolean;
	};

	const shownDeck = $derived(activeDeck ?? (decks.length === 1 ? decks[0].id : null));
	const deckQuery = $derived(shownDeck ? `?deck=${shownDeck}` : '');

	const review = $derived<Item>({
		key: 'review',
		label: 'Réviser',
		short: 'Réviser',
		icon: 'review',
		href: '/review',
		active: current === 'review',
		count: dueCount,
		accent: true
	});
	const newCard = $derived<Item>({
		key: 'new',
		label: 'Nouvelle carte',
		short: 'Nouvelle',
		icon: 'plus',
		// La carte ira dans le deck affiché.
		href: `/cards/new${deckQuery}`,
		active: current === 'new'
	});
	const connect = $derived<Item>({
		key: 'connect',
		label: 'Connecter Claude',
		short: 'Claude',
		icon: 'claude',
		href: '/connect',
		active: current === 'connect'
	});

	const sidebar = $derived<Item[]>([
		review,
		...decks.map((deck) => ({
			key: `deck-${deck.id}`,
			label: deck.name,
			short: deck.name,
			icon: 'cards' as const,
			href: `/cards?deck=${deck.id}`,
			active: current === 'cards' && shownDeck === deck.id,
			count: deck.cardCount
		})),
		newCard,
		{
			key: 'new-deck',
			label: 'Nouveau deck',
			short: 'Deck',
			icon: 'deck-plus',
			href: '/decks/new',
			active: current === 'new-deck'
		},
		connect
	]);

	const tabs = $derived<Item[]>([
		review,
		{
			key: 'cards',
			label: 'Cartes',
			short: 'Cartes',
			icon: 'cards',
			href: '/cards',
			active: current === 'cards'
		},
		newCard,
		connect
	]);
</script>

<div class="min-h-[calc(100dvh-var(--chrome-top,0px))] md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
	<!-- Barre latérale (≥ md) -->
	<aside
		class="sticky top-(--chrome-top,0px) hidden h-[calc(100dvh-var(--chrome-top,0px))] flex-col gap-6 border-r border-line bg-surface px-3 py-4 md:flex"
	>
		<a href="/cards" class="self-start rounded-md px-2 py-1"><Wordmark /></a>
		<nav aria-label="Navigation principale" class="min-h-0 overflow-y-auto">
			<ul class="flex flex-col gap-0.5">
				{#each sidebar as item (item.key)}
					<li>
						<a
							href={item.href}
							aria-current={item.active ? 'page' : undefined}
							class={[
								'flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors duration-150',
								item.active ? 'bg-hover text-ink' : 'text-ink-2 hover:bg-hover hover:text-ink'
							]}
						>
							<Icon
								name={item.icon}
								size={17}
								class={item.active ? 'text-accent-text' : 'text-ink-3'}
							/>
							<span class="min-w-0 flex-1 truncate">{item.label}</span>
							{#if item.count !== undefined}
								<span
									class={[
										'text-xs tabular-nums',
										item.accent && item.count > 0
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
				{#if user.isAdmin}
					<a href="/admin" class={footerItem}>
						<Icon name="user" size={17} class="text-ink-3" />Administration
					</a>
				{/if}
				<button class={footerItem}>
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
			<ul class="mx-auto grid h-16 max-w-md grid-cols-4">
				{#each tabs as item (item.key)}
					<li>
						<a
							href={item.href}
							aria-current={item.active ? 'page' : undefined}
							class={[
								'flex h-full flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium transition-colors duration-150',
								item.active ? 'text-accent-text' : 'text-ink-3 hover:text-ink'
							]}
						>
							<span class="relative">
								<Icon name={item.icon} size={22} />
								{#if item.accent && item.count}
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
