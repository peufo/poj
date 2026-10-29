<script lang="ts">
	import { enhance } from '$app/forms';
	import Button from '#lib/ui/Button.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import TextField from '#lib/ui/TextField.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let pending = $state(false);
</script>

<svelte:head>
	<title>Invitation · Poj</title>
	<meta name="referrer" content="no-referrer" />
</svelte:head>

<div class="flex flex-col gap-1.5">
	<h1 class="text-2xl font-bold tracking-tight">Bienvenue sur Poj</h1>
	{#if data.email}
		<p class="text-ink-2">
			Ton compte sera créé pour <span class="font-medium text-ink">{data.email}</span>. Choisis ton
			nom et ton mot de passe.
		</p>
	{/if}
</div>

{#if data.unavailable}
	<Notice tone="danger">{data.unavailable}</Notice>
	<Button href="/login" size="lg" block>Aller à la connexion</Button>
{:else}
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
		<!-- Pour les gestionnaires de mots de passe : l'identifiant du compte. -->
		<input type="hidden" name="username" autocomplete="username" value={data.email} />
		<TextField label="Nom" name="name" required autocomplete="name" value={form?.name ?? ''} />
		<TextField
			label="Mot de passe"
			name="password"
			type="password"
			required
			minlength={data.minPasswordLength}
			autocomplete="new-password"
			hint="{data.minPasswordLength} caractères au moins."
		/>
		{#if form?.message}<Notice tone="danger">{form.message}</Notice>{/if}
		<Button type="submit" variant="primary" size="lg" block loading={pending}>
			Créer mon compte
		</Button>
	</form>
{/if}
