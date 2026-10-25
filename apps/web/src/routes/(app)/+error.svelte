<script lang="ts">
	import { page } from '$app/state';
	import ErrorState from '#lib/components/ErrorState.svelte';
</script>

<!-- Dans le cadre de l'application : la navigation reste disponible. -->
<div class="mx-auto flex w-full max-w-3xl flex-col px-4 pt-12 pb-10 md:px-8 md:pt-16">
	<ErrorState status={page.status} message={page.error?.message} />
</div>
