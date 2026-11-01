<script lang="ts">
	import FormIssues from '#lib/components/form/FormIssues.svelte';
	import SubmitButton from '#lib/components/form/SubmitButton.svelte';
	import TextField from '#lib/ui/TextField.svelte';
	import { register } from './register.remote';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head><title>Créer le compte · Poj</title></svelte:head>

<div class="flex flex-col gap-1.5">
	<h1 class="text-2xl font-bold tracking-tight">Créer ton compte</h1>
	<p class="text-ink-2">
		Premier lancement : ce compte sera l’administrateur. L’inscription se fermera ensuite ; les
		testeurs arriveront par un lien d’invitation.
	</p>
</div>

<form {...register} class="flex flex-col gap-5">
	<TextField
		label="Nom"
		field={register.fields.name}
		required
		autocomplete="name"
		value={register.fields.name.value() ?? ''}
	/>
	<TextField
		label="Email"
		field={register.fields.email}
		type="email"
		required
		autocomplete="email"
		value={register.fields.email.value() ?? ''}
	/>
	<TextField
		label="Mot de passe"
		field={register.fields.password}
		type="password"
		required
		minlength={data.minPasswordLength}
		autocomplete="new-password"
		hint="{data.minPasswordLength} caractères au moins."
	/>
	<FormIssues issues={register.fields.issues()} />
	<SubmitButton remote={register} variant="primary" size="lg" block>Créer mon compte</SubmitButton>
</form>
