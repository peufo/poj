<script lang="ts">
	import FormIssues from '#lib/components/form/FormIssues.svelte';
	import SubmitButton from '#lib/components/form/SubmitButton.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import TextField from '#lib/ui/TextField.svelte';
	import { acceptInvitation } from './invite.remote';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
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
	<form {...acceptInvitation} class="flex flex-col gap-5">
		<!-- Pour les gestionnaires de mots de passe : l'identifiant du compte. Sans `name` : un
		     remote form refuse tout champ qui ne vient pas de `fields`. -->
		<input type="hidden" autocomplete="username" value={data.email} />
		<TextField
			label="Nom"
			field={acceptInvitation.fields.name}
			required
			autocomplete="name"
			value={acceptInvitation.fields.name.value() ?? ''}
		/>
		<TextField
			label="Mot de passe"
			field={acceptInvitation.fields.password}
			type="password"
			required
			minlength={data.minPasswordLength}
			autocomplete="new-password"
			hint="{data.minPasswordLength} caractères au moins."
		/>
		<FormIssues issues={acceptInvitation.fields.issues()} />
		<SubmitButton remote={acceptInvitation} variant="primary" size="lg" block>
			Créer mon compte
		</SubmitButton>
	</form>
{/if}
