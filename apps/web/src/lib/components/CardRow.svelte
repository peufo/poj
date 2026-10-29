<script lang="ts">
	import DueChip from './DueChip.svelte';
	import { faces, type DeckFaces } from '#lib/format/decks.js';
	import type { Direction } from '#lib/format/labels.js';

	type ReviewSummary = { direction: Direction; due: Date; isNew: boolean };
	type Props = {
		href: string;
		sideA: string;
		sideB: string;
		deck: DeckFaces;
		reviews: ReviewSummary[];
		now: Date;
	};

	let { href, sideA, sideB, deck, reviews, now }: Props = $props();
	const face = $derived(faces(deck));
</script>

<li class="group/row">
	<a
		{href}
		class="-mx-2 flex items-center gap-3 rounded-lg px-2 transition-colors duration-150 hover:bg-hover focus-visible:outline-offset-0 md:-mx-3 md:px-3"
	>
		<div
			class="flex min-w-0 flex-1 items-center gap-3 border-b border-line py-3 group-last/row:border-transparent"
		>
			<div class="flex min-w-0 flex-1 flex-col gap-0.5">
				<p class="line-clamp-2 text-ink" lang={face.a.lang}>{sideA}</p>
				<p class="line-clamp-2 text-[0.9375rem] text-ink-2" lang={face.b.lang}>{sideB}</p>
			</div>
			<div class="flex shrink-0 flex-col items-end gap-1">
				{#each reviews as review (review.direction)}
					<DueChip {...review} {deck} {now} />
				{/each}
			</div>
		</div>
	</a>
</li>
