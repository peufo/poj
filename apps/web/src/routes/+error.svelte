<script lang="ts">
	import { page } from '$app/state';
	import AuthShell from '#lib/components/AuthShell.svelte';
	import ErrorState from '#lib/components/ErrorState.svelte';
</script>

<!-- Hors du cadre de l'application (route inconnue) : mise en page de la connexion. -->
<AuthShell>
	<ErrorState status={page.status} message={page.error?.message} />
</AuthShell>
