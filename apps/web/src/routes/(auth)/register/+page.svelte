<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '#lib/ui/Button.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import TextField from '#lib/ui/TextField.svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let pending = $state(false);
</script>

<svelte:head><title>Créer le compte · Poj</title></svelte:head>

<div class="flex flex-col gap-1.5">
	<h1 class="text-2xl font-bold tracking-tight">Créer ton compte</h1>
	<p class="text-ink-2">
		Premier lancement : ce compte sera l’administrateur. L’inscription se fermera ensuite ; les
		testeurs arriveront par un lien d’invitation.
	</p>
</div>

<form
	method="post"
	class="flex flex-col gap-5"
	use:enhance={() => {
		pending = true;
		return async ({ update }) => {
			await update();
			pending = false;
		};
	}}
>
	<TextField label="Nom" name="name" required autocomplete="name" value={form?.name ?? ''} />
	<TextField
		label="Email"
		name="email"
		type="email"
		required
		autocomplete="email"
		value={form?.email ?? ''}
	/>
	<TextField
		label="Mot de passe"
		name="password"
		type="password"
		required
		minlength={8}
		autocomplete="new-password"
		hint="8 caractères au moins."
	/>
	{#if form?.message}<Notice tone="danger">{form.message}</Notice>{/if}
	<Button type="submit" variant="primary" size="lg" block loading={pending}>Créer mon compte</Button
	>
</form>
