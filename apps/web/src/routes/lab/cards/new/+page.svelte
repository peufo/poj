<script lang="ts">
	import { goto } from '$app/navigation';
	import AppShell from '#lib/components/AppShell.svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import CardForm, { type Duplicate, type Suggestion } from '#lib/components/CardForm.svelte';
	import LabStates from '#lib/lab/LabStates.svelte';
	import { LAB_DECK, cards, dueNow, fakeDeepL, normalize } from '#lib/lab/fixtures.js';

	type State = 'empty' | 'filled' | 'duplicate' | 'deepl-down';

	let labState: State = $state('empty');
	let sideA = $state('');
	let sideB = $state('');
	let context = $state('');
	let suggestion: Suggestion = $state({ status: 'idle' });
	let duplicate: Duplicate | null = $state(null);
	let saving = $state(false);
	let errors: { sideA?: string; sideB?: string } = $state({});

	function show(next: State) {
		suggestion = { status: 'idle' };
		duplicate = null;
		errors = {};
		if (next === 'empty') [sideA, sideB, context] = ['', '', ''];
		if (next === 'filled' || next === 'deepl-down')
			[sideA, sideB, context] = ['un bouchon', '', "À la radio, sur l'autoroute du retour."];
		if (next === 'duplicate') {
			[sideA, sideB, context] = ['tenir bon', 'to hang in there', 'Ma sœur, avant son examen.'];
			duplicate = findDuplicate(sideB);
		}
	}

	function findDuplicate(text: string): Duplicate | null {
		const match = cards.find((c) => normalize(c.sideB) === normalize(text));
		return match
			? {
					href: `/lab/cards/${match.id}`,
					sideA: match.sideA,
					sideB: match.sideB,
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
					: { status: 'ready', text: fakeDeepL(sideA, context) };
		}, 700);
	}

	function submit(event: SubmitEvent) {
		event.preventDefault();
		errors = {
			sideA: sideA.trim() ? undefined : 'Le français est obligatoire.',
			sideB: sideB.trim() ? undefined : "L'anglais est obligatoire."
		};
		if (errors.sideA || errors.sideB) return;

		const confirmed = (event.submitter as HTMLButtonElement | null)?.name === 'confirm';
		if (!confirmed) {
			duplicate = findDuplicate(sideB);
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
			deck={LAB_DECK}
			bind:sideA
			bind:sideB
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
