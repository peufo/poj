<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '#lib/ui/Button.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import TextField from '#lib/ui/TextField.svelte';
	import type { ActionData } from './$types';

	let { form }: { form: ActionData } = $props();
	let pending = $state(false);
</script>

<svelte:head><title>Connexion · Poj</title></svelte:head>

<div class="flex flex-col gap-1.5">
	<h1 class="text-2xl font-bold tracking-tight">Connexion</h1>
	<p class="text-ink-2">Tes cartes t’attendent.</p>
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
		autocomplete="current-password"
	/>
	{#if form?.message}<Notice tone="danger">{form.message}</Notice>{/if}
	<Button type="submit" variant="primary" size="lg" block loading={pending}>Se connecter</Button>
</form>
