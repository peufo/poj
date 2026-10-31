<script lang="ts">
	import type { RemoteFormIssue } from '$app/server';
	import Notice from '#lib/ui/Notice.svelte';

	// Erreur globale d'un formulaire : `invalid('…')` côté serveur (`form.fields.issues()`),
	// ou les erreurs des champs qui n'ont pas de place à eux (`form.fields.allIssues()`).
	type Props = {
		issues: RemoteFormIssue[] | undefined;
		tone?: 'warn' | 'danger';
	};

	let { issues, tone = 'danger' }: Props = $props();

	const messages = $derived([...new Set((issues ?? []).map((issue) => issue.message))]);
</script>

{#if messages.length > 0}
	<Notice {tone}>
		{#each messages as message (message)}<span class="block">{message}</span>{/each}
	</Notice>
{/if}
