<script lang="ts">
	import { enhance, type SubmitFunction } from '$app/forms';
	import Button from '#lib/ui/Button.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import { formatWeekday, plural } from '#lib/format/labels.js';

	// La journée Poj réunit deux objectifs : ajouter des cartes et réviser celles qui étaient
	// dues à l'ouverture du jour. Progression du jour, série de journées complètes, record et
	// calendrier d'accomplissement, une colonne par semaine (du lundi au dimanche), la dernière
	// étant la semaine en cours. Gratification sobre : encre neutre, l'accent seulement pour
	// aujourd'hui.
	type Day = {
		date: Date;
		add: { count: number; goal: number; reached: boolean };
		review: { due: number; answered: number; reviews: number; reached: boolean; done: boolean };
		level: 'full' | 'partial' | 'none';
	};
	type Props = {
		progress: { goal: number; today: Day; streak: number; best: number; days: Day[] };
		bounds: { min: number; max: number };
		/** Retour de l'action `?/goal` en cas de saisie refusée. */
		error?: string;
		value?: string;
	};

	let { progress, bounds, error, value }: Props = $props();

	const weekdays = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

	let open = $state(false);
	let saving = $state(false);

	// La période commence un lundi et finit aujourd'hui ; la fin de la semaine reste vide.
	const cells = $derived<(Day | null)[]>([
		...progress.days,
		...Array.from({ length: (7 - (progress.days.length % 7)) % 7 }, () => null)
	]);
	const weeks = $derived(cells.length / 7);
	const fullDays = $derived(progress.days.filter((d) => d.level === 'full').length);
	const today = $derived(progress.today);
	const levels = { full: 'bg-level-3', partial: 'bg-level-1', none: 'bg-line' } as const;

	const addText = ({ add }: Day) =>
		`${add.count}/${add.goal} ${add.count > 1 ? 'cartes ajoutées' : 'carte ajoutée'}`;

	/** Révision du jour : à jour sur les cartes dues, plafond de révisions, ou rien de dû. */
	function reviewText({ review }: Day): string {
		if (review.reached && review.answered < review.due) return `${review.reviews} révisions faites`;
		if (review.due === 0 && !review.reached) return 'aucune carte due';
		return `${review.answered}/${review.due} ${review.due > 1 ? 'cartes' : 'carte'} à jour`;
	}

	// Les deux objectifs du jour, cochés quand ils sont remplis.
	const goals = $derived([
		{ done: today.add.reached, text: addText(today) },
		{ done: today.review.done, text: reviewText(today) }
	]);

	/** Une case claire nomme l'objectif qui manque. */
	function describe(day: Day): string {
		const base = `${formatWeekday(day.date)} : ${addText(day)}, ${reviewText(day)}`;
		if (day.level === 'full') return `${base}. Journée complète`;
		if (day.level === 'partial')
			return `${base}. Il manque ${day.add.reached ? 'la révision' : "l'ajout"}`;
		return base;
	}

	const submit: SubmitFunction = () => {
		saving = true;
		return async ({ result, update }) => {
			await update({ reset: false });
			saving = false;
			if (result.type === 'success') open = false;
		};
	};
</script>

<section
	aria-label="Objectif quotidien"
	class="flex flex-col gap-4 rounded-2xl bg-surface p-4 md:p-5"
>
	<div class="flex items-start justify-between gap-4">
		<div class="flex min-w-0 flex-col gap-1">
			<p class="text-lg font-semibold">
				{today.level === 'full' ? 'Journée complète' : "Aujourd'hui"}
			</p>
			<ul class="flex flex-col gap-0.5 text-sm text-ink-2">
				{#each goals as goal, i (i)}
					<li class="flex items-center gap-1.5">
						{#if goal.done}
							<Icon name="check" size={16} class="text-accent-text" />
							<span class="sr-only">Fait :</span>
						{:else}
							<span class="flex size-4 items-center justify-center" aria-hidden="true">
								<span class="size-1.5 rounded-full bg-ink-3"></span>
							</span>
						{/if}
						<span class="tabular-nums">{goal.text}</span>
					</li>
				{/each}
			</ul>
		</div>
		<div class="text-right">
			<p class="text-lg font-semibold tabular-nums">{progress.streak}</p>
			<p class="text-sm text-ink-2">{progress.streak > 1 ? 'jours' : 'jour'} de série</p>
			<p class="text-xs text-ink-3 tabular-nums">Record : {progress.best}</p>
		</div>
	</div>

	<div class="flex flex-col gap-2">
		<div
			role="img"
			aria-label="{plural(
				fullDays,
				'journée complète',
				'journées complètes'
			)} sur les {weeks} dernières semaines"
			class="grid grid-flow-col gap-1 self-start"
			style="grid-template-rows: repeat(7, 1rem); grid-template-columns: 1rem repeat({weeks}, 1rem)"
		>
			{#each weekdays as initial, i (i)}
				<span class="text-center text-[0.625rem] leading-4 text-ink-3" aria-hidden="true">
					{i % 2 === 0 ? initial : ''}
				</span>
			{/each}
			{#each cells as day, i (i)}
				{#if day}
					<span
						title={describe(day)}
						class={[
							'rounded-[3px]',
							levels[day.level],
							day === today && 'ring-2 ring-accent ring-offset-1 ring-offset-surface'
						]}
					></span>
				{:else}
					<span></span>
				{/if}
			{/each}
		</div>
		<p class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3" aria-hidden="true">
			<span class="flex items-center gap-1.5">
				<span class="size-2.5 rounded-[2px] bg-level-3"></span>Ajout et révision
			</span>
			<span class="flex items-center gap-1.5">
				<span class="size-2.5 rounded-[2px] bg-level-1"></span>L'un des deux
			</span>
		</p>
	</div>

	<!-- Ouvert aussi sans JavaScript quand la saisie a été refusée. -->
	<details
		open={open || !!error}
		ontoggle={(event) => (open = event.currentTarget.open)}
		class="group border-t border-line pt-3"
	>
		<summary
			class="flex cursor-pointer list-none items-center gap-1 text-sm text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden"
		>
			<Icon
				name="chevron-right"
				size={16}
				class="text-ink-3 transition-transform duration-150 ease-out group-open:rotate-90"
			/>
			Objectif : {plural(progress.goal, 'carte')} par jour
		</summary>
		<form method="post" action="?/goal" use:enhance={submit} class="mt-3 flex flex-col gap-1.5">
			<label for="daily-goal" class="text-sm font-medium text-ink">Cartes à ajouter par jour</label>
			<div class="flex items-center gap-2">
				<input
					id="daily-goal"
					name="goal"
					type="number"
					inputmode="numeric"
					required
					min={bounds.min}
					max={bounds.max}
					value={value ?? progress.goal}
					aria-invalid={error ? 'true' : undefined}
					aria-describedby="daily-goal-help"
					class={[
						'h-10 w-20 rounded-lg border bg-inset px-3 text-base text-ink tabular-nums',
						'transition-[border-color,box-shadow] duration-150 ease-out',
						'focus:border-accent focus:ring-3 focus:ring-accent/20 focus:outline-none',
						error ? 'border-danger' : 'border-line-strong hover:border-ink-3'
					]}
				/>
				<Button type="submit" variant="primary" loading={saving}>Enregistrer</Button>
			</div>
			<p id="daily-goal-help" class={['text-sm', error ? 'text-danger' : 'text-ink-3']}>
				{error ?? "S'applique dès aujourd'hui ; les jours passés gardent leur objectif."}
			</p>
		</form>
	</details>
</section>
