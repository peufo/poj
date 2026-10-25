<script lang="ts">
	import { ratingLabels, type Rating } from '#lib/format/labels.js';

	let { rating }: { rating: Rating } = $props();

	const styles: Record<Rating, string> = {
		again: 'bg-again-soft text-again',
		hard: 'bg-hard-soft text-hard',
		good: 'bg-good-soft text-good',
		easy: 'bg-easy-soft text-easy'
	};
</script>

<span class="inline-flex h-6 items-center rounded-md px-2 text-xs font-semibold {styles[rating]}">
	{ratingLabels[rating]}
</span>
