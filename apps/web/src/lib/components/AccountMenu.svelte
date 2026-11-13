<script lang="ts">
	import { logout } from '#lib/remote/logout.remote.js';
	import Button from '#lib/ui/Button.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import Sheet from '#lib/ui/Sheet.svelte';
	import SubmitButton from './form/SubmitButton.svelte';

	// Compte et déconnexion au téléphone, où la barre latérale n'existe pas : un bouton
	// d'en-tête qui ouvre une feuille, avec le lien vers les réglages. L'administrateur y
	// trouve aussi le lien vers `/admin` (hors de la barre d'onglets).
	type Props = { email: string; isAdmin?: boolean; class?: string };

	let { email, isAdmin = false, class: className = '' }: Props = $props();

	let open = $state(false);
	const signOut = logout.for('account-menu');
</script>

<button
	type="button"
	aria-label="Compte"
	aria-haspopup="dialog"
	onclick={() => (open = true)}
	class={[
		'-mr-2 flex size-10 items-center justify-center rounded-full text-ink-2 transition-colors duration-150 hover:bg-hover hover:text-ink',
		className
	]}
>
	<Icon name="user" size={22} />
</button>

<Sheet bind:open title="Compte" description="Connecté avec {email}.">
	<Button href="/settings" size="lg" icon="settings" block onclick={() => (open = false)}>
		Réglages
	</Button>
	{#if isAdmin}
		<Button href="/admin" size="lg" icon="user" block onclick={() => (open = false)}>
			Administration
		</Button>
	{/if}
	{#snippet actions()}
		<Button size="lg" onclick={() => (open = false)}>Annuler</Button>
		<form {...signOut} class="contents">
			<SubmitButton remote={signOut} size="lg" variant="primary" icon="logout">
				Se déconnecter
			</SubmitButton>
		</form>
	{/snippet}
</Sheet>
