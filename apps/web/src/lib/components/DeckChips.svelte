<script lang="ts">
	import Icon from '#lib/ui/Icon.svelte';

	// Decks en puces, au téléphone où la barre latérale n'existe pas : « Tous » (à partir
	// de deux decks), chaque deck, puis « Nouveau deck ». Défile à l'horizontale.
	type Props = {
		decks: { id: string; name: string }[];
		/** Deck affiché, `null` pour tous les decks. */
		active: string | null;
		class?: string;
	};

	let { decks, active, class: className = '' }: Props = $props();

	const chip =
		'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium whitespace-nowrap transition-colors duration-150';
	const chipState = (on: boolean) =>
		on ? 'bg-accent-soft text-accent-text' : 'bg-surface text-ink-2 hover:text-ink';
</script>

<nav aria-label="Decks" class={className}>
	<ul class="-mx-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4">
		{#if decks.length > 1}
			<li>
				<a
					href="/cards"
					aria-current={active === null ? 'page' : undefined}
					class={[chip, chipState(active === null)]}>Tous</a
				>
			</li>
		{/if}
		{#each decks as deck (deck.id)}
			<li>
				<a
					href="/cards?deck={deck.id}"
					aria-current={active === deck.id ? 'page' : undefined}
					class={[chip, chipState(active === deck.id)]}>{deck.name}</a
				>
			</li>
		{/each}
		<li>
			<a href="/decks/new" class={[chip, chipState(false)]}>
				<Icon name="plus" size={15} />Nouveau deck
			</a>
		</li>
	</ul>
</nav>
