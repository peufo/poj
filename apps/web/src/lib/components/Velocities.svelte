<script lang="ts">
	// Le passé résumé en deux chiffres : l'effort récent et la mémoire durable. Encre neutre,
	// comme la maîtrise : le teal reste à ce qui est dû.
	type Props = {
		/** Réponses par jour, en moyenne sur `windowDays`. */
		repsPerDay: number;
		matureCards: number;
		windowDays: number;
		/** Stabilité, en jours, à partir de laquelle une carte est mûre. */
		matureDays: number;
		/** La page n'affiche qu'un deck : le préciser, car les chiffres portent sur tous. */
		allDecks?: boolean;
	};

	let { repsPerDay, matureCards, windowDays, matureDays, allDecks = false }: Props = $props();

	const decimal = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
	// Arrondi avant l'accord : 1,96 s'affiche « 2 répétitions ».
	const reps = $derived(Math.round(repsPerDay * 10) / 10);
</script>

<section aria-label="Vélocités" class="flex flex-col gap-3 rounded-2xl bg-surface p-4 md:p-5">
	<div class="grid grid-cols-2 gap-4">
		<div>
			<p class="text-lg font-semibold tabular-nums">{decimal.format(reps)}</p>
			<p class="text-sm text-ink-2">{reps >= 2 ? 'répétitions' : 'répétition'} par jour</p>
			<p class="text-xs text-ink-3">moyenne sur {windowDays} jours</p>
		</div>
		<div>
			<p class="text-lg font-semibold tabular-nums">{matureCards}</p>
			<p class="text-sm text-ink-2">{matureCards > 1 ? 'cartes mûres' : 'carte mûre'}</p>
			<p class="text-xs text-ink-3">retenues pour {matureDays} jours ou plus</p>
		</div>
	</div>
	{#if allDecks}
		<p class="text-xs text-ink-3">Tous les decks</p>
	{/if}
</section>
