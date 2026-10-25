<script lang="ts">
	import { goto } from '$app/navigation';
	import AppShell from '#lib/components/AppShell.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import CardForm, { type Duplicate, type Suggestion } from '#lib/components/CardForm.svelte';
	import LabStates from '#lib/lab/LabStates.svelte';
	import { cards, dueNow, fakeDeepL, normalize } from '#lib/lab/fixtures.js';

	type State = 'empty' | 'filled' | 'duplicate' | 'deepl-down';

	let labState: State = $state('empty');
	let french = $state('');
	let english = $state('');
	let context = $state('');
	let suggestion: Suggestion = $state({ status: 'idle' });
	let duplicate: Duplicate | null = $state(null);
	let saving = $state(false);
	let errors: { french?: string; english?: string } = $state({});

	function show(next: State) {
		suggestion = { status: 'idle' };
		duplicate = null;
		errors = {};
		if (next === 'empty') [french, english, context] = ['', '', ''];
		if (next === 'filled' || next === 'deepl-down')
			[french, english, context] = ['un bouchon', '', "À la radio, sur l'autoroute du retour."];
		if (next === 'duplicate') {
			[french, english, context] = ['tenir bon', 'to hang in there', 'Ma sœur, avant son examen.'];
			duplicate = findDuplicate(english);
		}
	}

	function findDuplicate(text: string): Duplicate | null {
		const match = cards.find((c) => normalize(c.english) === normalize(text));
		return match
			? {
					href: `/lab/cards/${match.id}`,
					french: match.french,
					english: match.english,
					context: match.context
				}
			: null;
	}

	function translate() {
		suggestion = { status: 'loading' };
		setTimeout(() => {
			suggestion =
				labState === 'deepl-down'
					? {
							status: 'error',
							message:
								'DeepL ne répond pas (quota du mois atteint). Tu peux enregistrer sans suggestion.'
						}
					: { status: 'ready', text: fakeDeepL(french, context) };
		}, 700);
	}

	function submit(event: SubmitEvent) {
		event.preventDefault();
		errors = {
			french: french.trim() ? undefined : 'Le français est obligatoire.',
			english: english.trim() ? undefined : "L'anglais est obligatoire."
		};
		if (errors.french || errors.english) return;

		const confirmed = (event.submitter as HTMLButtonElement | null)?.name === 'confirm';
		if (!confirmed) {
			duplicate = findDuplicate(english);
			if (duplicate) return;
		}
		saving = true;
		setTimeout(() => goto('/lab/cards'), 600);
	}
</script>

<svelte:head><title>Nouvelle carte · Poj</title></svelte:head>

<AppShell current="new" base="/lab" dueCount={dueNow.length} cardCount={cards.length} focus>
	<div class="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 md:px-8">
		<PageHeader title="Nouvelle carte" back={{ href: '/lab/cards', label: 'Cartes' }} />

		<LabStates
			bind:value={labState}
			onchange={show}
			options={[
				{ value: 'empty', label: 'Vide' },
				{ value: 'filled', label: 'Saisie' },
				{ value: 'duplicate', label: 'Doublon' },
				{ value: 'deepl-down', label: 'DeepL en panne' }
			]}
		/>

		<CardForm
			mode="create"
			bind:french
			bind:english
			bind:context
			{suggestion}
			{duplicate}
			{saving}
			{errors}
			cancelHref="/lab/cards"
			ontranslate={translate}
			onsubmit={submit}
		/>
	</div>
</AppShell>
