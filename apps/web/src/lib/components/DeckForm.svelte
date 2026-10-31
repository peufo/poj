<script lang="ts">
	import { languageName, type DeckFormValues } from '#lib/format/decks.js';
	import { capitalize } from '#lib/format/labels.js';
	import { languageOption, languageOptions } from '#lib/format/languages.js';
	import Button from '#lib/ui/Button.svelte';
	import SelectField from '#lib/ui/SelectField.svelte';
	import TextField from '#lib/ui/TextField.svelte';
	import FormIssues from './form/FormIssues.svelte';
	import SubmitButton from './form/SubmitButton.svelte';
	import type { AnyRemoteForm } from './form/remote-form.js';

	// Formulaire de deck (création et modification), sur le remote form de la page
	// (`createDeck`, `saveDeck`).
	//
	// À la création, on choisit le type : une langue (langue connue, langue apprise) ou un
	// sujet (noms des deux faces). Les champs de l'autre type sont masqués par CSS, ce qui
	// marche aussi sans JavaScript ; le serveur ignore ceux du type non choisi. En
	// modification, le type et les langues sont figés.

	type Props = {
		/** Remote form du deck (schéma `newDeckSchema` ou `deckUpdateSchema`). */
		form: AnyRemoteForm;
		mode: 'create' | 'edit';
		values: DeckFormValues;
		/** Sans lien d'annulation (premier deck : il n'y a nulle part où revenir). */
		cancelHref?: string;
	};

	let { form, mode, values, cancelHref }: Props = $props();
	const fields = $derived(form.fields);

	// Les champs partent des valeurs reçues, puis vivent ici.
	// svelte-ignore state_referenced_locally
	let name = $state(values.name);
	// svelte-ignore state_referenced_locally
	let kind = $state(values.kind);
	// svelte-ignore state_referenced_locally
	let languageA = $state(values.languageA);
	// svelte-ignore state_referenced_locally
	let languageB = $state(values.languageB);
	// svelte-ignore state_referenced_locally
	let labelA = $state(values.labelA);
	// svelte-ignore state_referenced_locally
	let labelB = $state(values.labelB);
	// svelte-ignore state_referenced_locally
	let bothDirections = $state(values.bothDirections);
	/** Option des deux sens modifiée à la main : changer de type ne la change plus. */
	let directionsTouched = $state(false);

	/** Une langue : les deux sens par défaut ; un sujet : à sens unique par défaut. */
	function chooseKind(next: DeckFormValues['kind']) {
		kind = next;
		if (!directionsTouched) bothDirections = next === 'language';
	}

	/** Une face dans une phrase : « anglais », « « Pays » ». */
	const faceName = (language: string, label: string, fallback: string) =>
		kind === 'language'
			? language
				? languageName(language)
				: '…'
			: `« ${label.trim() || fallback} »`;
	const faceA = $derived(faceName(languageA, labelA, 'Question'));
	const faceB = $derived(faceName(languageB, labelB, 'Réponse'));
	const namePlaceholder = $derived(
		kind === 'subject'
			? 'Capitales'
			: languageA && languageB
				? `${capitalize(languageName(languageA))} → ${capitalize(languageName(languageB))}`
				: 'Français → Anglais'
	);

	const kinds = [
		{
			value: 'language',
			label: 'Langue',
			hint: 'Des expressions d’une langue à apprendre, avec un second avis DeepL.'
		},
		{
			value: 'subject',
			label: 'Sujet',
			hint: 'Tout le reste : une question, une réponse, sans traduction.'
		}
	] as const;
</script>

<form {...form} class="flex flex-col gap-6">
	<TextField
		label="Nom"
		field={fields.name}
		bind:value={name}
		required
		placeholder={namePlaceholder}
	/>

	{#if mode === 'create'}
		<fieldset class="flex flex-col gap-1.5">
			<legend class="flex min-h-8 items-center pb-2 text-sm font-medium text-ink">Type</legend>
			<div class="grid gap-2 sm:grid-cols-2">
				{#each kinds as option (option.value)}
					<label
						class="flex cursor-pointer items-start gap-3 rounded-xl border border-line-strong bg-inset p-3 transition-colors duration-150 hover:border-ink-3 has-checked:border-accent has-checked:bg-accent-soft"
					>
						<input
							type="radio"
							name={fields.kind.as('radio', option.value).name}
							value={option.value}
							checked={kind === option.value}
							onchange={() => chooseKind(option.value)}
							class="mt-0.5 size-4 shrink-0 accent-accent"
						/>
						<span class="flex flex-col gap-0.5">
							<span class="font-medium text-ink">{option.label}</span>
							<span class="text-sm text-ink-2">{option.hint}</span>
						</span>
					</label>
				{/each}
			</div>
		</fieldset>

		<div class="language-only grid gap-6 sm:grid-cols-2">
			<SelectField
				label="Langue connue"
				field={fields.languageA}
				bind:value={languageA}
				options={languageOptions}
				placeholder="Choisis une langue"
			/>
			<SelectField
				label="Langue apprise"
				field={fields.languageB}
				bind:value={languageB}
				options={languageOptions}
				placeholder="Choisis une langue"
			/>
		</div>
	{:else if kind === 'language'}
		<p class="text-sm text-ink-2">
			Langues : {languageOption(languageA)} → {languageOption(languageB)}. Le type et les langues
			d’un deck ne se modifient pas.
		</p>
	{/if}

	{#if mode === 'create' || kind === 'subject'}
		<div class="subject-only grid gap-6 sm:grid-cols-2">
			<TextField
				label="Première face"
				field={fields.labelA}
				bind:value={labelA}
				placeholder="Question"
				hint="Ce qui est montré, par exemple « Pays »."
			/>
			<TextField
				label="Seconde face"
				field={fields.labelB}
				bind:value={labelB}
				placeholder="Réponse"
				hint="Ce qu’il faut retrouver, par exemple « Capitale »."
			/>
		</div>
	{/if}

	<label class="flex cursor-pointer items-start gap-3">
		<input
			type="checkbox"
			name={fields.bothDirections.as('checkbox').name}
			bind:checked={bothDirections}
			onchange={() => (directionsTouched = true)}
			class="mt-0.5 size-4 shrink-0 accent-accent"
		/>
		<span class="flex flex-col gap-0.5">
			<span class="font-medium text-ink">Réviser dans les deux sens</span>
			<span class="text-sm text-ink-2">
				{capitalize(faceA)} → {faceB}, puis aussi {faceB} → {faceA}.
			</span>
		</span>
	</label>

	<FormIssues issues={fields.issues()} />

	<div
		class="sticky bottom-0 -mx-4 mt-2 flex gap-2 border-t border-line bg-canvas/90 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl md:static md:mx-0 md:justify-end md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none"
	>
		{#if cancelHref}
			<Button href={cancelHref} size="lg" variant="ghost" class="max-md:hidden">Annuler</Button>
		{/if}
		<SubmitButton remote={form} size="lg" variant="primary" block class="md:w-auto">
			{mode === 'create' ? 'Créer le deck' : 'Enregistrer les modifications'}
		</SubmitButton>
	</div>
</form>

<style>
	/* Champs du type choisi seulement, avec ou sans JavaScript. */
	form:has(input[name^='kind'][value='subject']:checked) .language-only,
	form:has(input[name^='kind'][value='language']:checked) .subject-only {
		display: none;
	}
</style>
