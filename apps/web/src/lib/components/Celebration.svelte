<script lang="ts" module>
	/** Clé de stockage : le jour (minuit, ISO) dont la journée complète a déjà été célébrée. */
	export const CELEBRATED_KEY = 'poj.celebrated';
</script>

<script lang="ts">
	import { fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import Icon from '#lib/ui/Icon.svelte';

	// Moment bref quand la journée Poj devient complète (ajout et révision) : un message qui
	// flotte quelques secondes en haut de l'écran, une seule fois par jour et par navigateur.
	// Rien côté serveur, rien sans JavaScript. Sans animation si le mouvement est réduit.
	type Props = {
		/** Minuit (Europe/Zurich) qui commence le jour en cours. */
		date: Date;
		/** La journée est complète. */
		full: boolean;
	};

	let { date, full }: Props = $props();

	/** Durée d'affichage. */
	const SHOWN_MS = 4000;

	let shown = $state(false);
	let still = $state(false);

	// Une chaîne : recharger les données (nouvel objet `Date`, même jour) ne relance rien.
	const day = $derived(full ? date.toISOString() : null);

	function seen(value: string): boolean {
		try {
			if (localStorage.getItem(CELEBRATED_KEY) === value) return true;
			localStorage.setItem(CELEBRATED_KEY, value);
		} catch {
			// Stockage indisponible (navigation privée…) : la célébration peut revenir.
		}
		return false;
	}

	$effect(() => {
		if (!day || seen(day)) return;
		still = matchMedia('(prefers-reduced-motion: reduce)').matches;
		shown = true;
		const timer = setTimeout(() => (shown = false), SHOWN_MS);
		return () => {
			clearTimeout(timer);
			shown = false;
		};
	});
</script>

<div
	role="status"
	class="pointer-events-none fixed inset-x-0 top-[calc(var(--chrome-top,0px)+0.75rem)] z-30 flex justify-center px-4"
>
	{#if shown}
		<p
			transition:fly={{ y: -12, duration: still ? 0 : 220, easing: cubicOut }}
			class="flex items-center gap-2 rounded-xl border border-line bg-raised px-4 py-2.5 text-sm font-medium text-ink shadow-overlay"
		>
			<span class="flex size-6 items-center justify-center rounded-full bg-accent text-on-accent">
				<Icon name="check" size={14} />
			</span>
			Journée complète : cartes ajoutées et révisions à jour
		</p>
	{/if}
</div>
