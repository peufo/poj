<script lang="ts">
	import FormIssues from '#lib/components/form/FormIssues.svelte';
	import SubmitButton from '#lib/components/form/SubmitButton.svelte';
	import TextField from '#lib/ui/TextField.svelte';
	import { login } from './login.remote';
</script>

<svelte:head><title>Connexion · Poj</title></svelte:head>

<div class="flex flex-col gap-1.5">
	<h1 class="text-2xl font-bold tracking-tight">Connexion</h1>
	<p class="text-ink-2">Tes cartes t’attendent.</p>
</div>

<form {...login} class="flex flex-col gap-5">
	<TextField
		label="Email"
		field={login.fields.email}
		type="email"
		required
		autocomplete="email"
		value={login.fields.email.value() ?? ''}
	/>
	<TextField
		label="Mot de passe"
		field={login.fields.password}
		type="password"
		required
		autocomplete="current-password"
	/>
	<FormIssues issues={login.fields.issues()} />
	<SubmitButton remote={login} variant="primary" size="lg" block>Se connecter</SubmitButton>
</form>
