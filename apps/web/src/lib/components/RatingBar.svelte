<script lang="ts">
	import Kbd from '#lib/ui/Kbd.svelte';
	import { ratingLabels, ratingMeanings, ratings, type Rating } from '#lib/format/labels.js';

	// Les quatre notes, au pouce. Après un indice, seules Again et Hard restent possibles.
	type Props = {
		/** Délai avant la prochaine révision, pour chaque note (« 10 min », « 4 j »). */
		intervals: Record<Rating, string>;
		hintUsed?: boolean;
		selected?: Rating | null;
		shortcuts?: boolean;
		onrate: (rating: Rating) => void;
	};

	let { intervals, hintUsed = false, selected = null, shortcuts = true, onrate }: Props = $props();

	const styles: Record<Rating, string> = {
		again: 'bg-again-soft text-again',
		hard: 'bg-hard-soft text-hard',
		good: 'bg-good-soft text-good',
		easy: 'bg-easy-soft text-easy'
	};

	const blocked = (rating: Rating) => hintUsed && (rating === 'good' || rating === 'easy');
</script>

<div class="grid grid-cols-4 gap-2" role="group" aria-label="Noter la réponse">
	{#each ratings as rating, i (rating)}
		{@const off = blocked(rating)}
		<button
			type="button"
			disabled={off}
			onclick={() => onrate(rating)}
			title={off ? 'Contexte vu : Hard au mieux' : ratingMeanings[rating]}
			aria-pressed={selected === rating}
			class={[
				'relative flex h-16 flex-col items-center justify-center gap-0.5 rounded-xl transition-[transform,filter,opacity,box-shadow] duration-150 ease-out',
				'hover:brightness-[1.04] active:scale-[0.97]',
				'disabled:cursor-not-allowed disabled:opacity-35 disabled:saturate-0',
				selected === rating ? 'ring-2 ring-current ring-inset' : '',
				styles[rating]
			]}
		>
			<span class="text-[0.9375rem] font-semibold">{ratingLabels[rating]}</span>
			<span class="text-xs text-ink-2 tabular-nums">
				{#if off}<span class="sr-only">indisponible après l'indice</span>—{:else}{intervals[
						rating
					]}{/if}
			</span>
			{#if shortcuts}
				<span class="absolute top-1.5 right-1.5"><Kbd>{i + 1}</Kbd></span>
			{/if}
		</button>
	{/each}
</div>
