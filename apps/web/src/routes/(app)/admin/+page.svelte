<script lang="ts">
	import { enhance } from '$app/forms';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import { formatDate } from '#lib/format/labels.js';
	import Button from '#lib/ui/Button.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import TextField from '#lib/ui/TextField.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let pending = $state(false);
	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout> | undefined;

	const invited = $derived(form && 'invited' in form ? form.invited : undefined);
	const failure = $derived(form && 'message' in form ? form : undefined);

	async function copy(link: string) {
		try {
			await navigator.clipboard.writeText(link);
		} catch {
			return; // Sans presse-papiers, le lien reste sélectionnable dans le champ.
		}
		copied = true;
		clearTimeout(timer);
		timer = setTimeout(() => (copied = false), 2000);
	}
</script>

<svelte:head><title>Administration · Poj</title></svelte:head>

<div class="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 pb-8 md:px-8">
	<PageHeader title="Administration" />

	<section class="flex flex-col gap-4">
		<div class="flex flex-col gap-1">
			<h2 class="text-lg font-semibold">Inviter un testeur</h2>
			<p class="text-sm text-ink-2">
				Le lien sert une seule fois et expire après 7 jours. Transmets-le toi-même : aucun email
				n’est envoyé.
			</p>
		</div>

		<form
			method="post"
			action="?/invite"
			class="flex flex-col gap-3"
			use:enhance={() => {
				pending = true;
				copied = false;
				return async ({ update }) => {
					await update();
					pending = false;
				};
			}}
		>
			<TextField
				label="Email du testeur"
				name="email"
				type="email"
				required
				autocomplete="off"
				value={failure?.email ?? ''}
			/>
			{#if failure}<Notice tone="danger">{failure.message}</Notice>{/if}
			<Button type="submit" variant="primary" loading={pending} class="self-start">
				Générer le lien
			</Button>
		</form>

		{#if invited}
			<div class="flex flex-col gap-2 rounded-2xl border border-line bg-raised p-5">
				<label for="invite-link" class="text-sm font-medium text-ink-2">
					Lien pour {invited.email}
				</label>
				<div class="flex items-center gap-2">
					<input
						id="invite-link"
						readonly
						value={invited.link}
						onfocus={(e) => e.currentTarget.select()}
						class="h-11 min-w-0 flex-1 rounded-lg bg-inset px-3 font-mono text-sm text-ink"
					/>
					<Button
						variant="primary"
						icon={copied ? 'check' : undefined}
						onclick={() => copy(invited.link)}
					>
						{copied ? 'Copié' : 'Copier'}
					</Button>
				</div>
				<p class="text-xs text-ink-3">
					Il ne sera plus affiché. Perdu ? Génère un nouveau lien : l’ancien sera révoqué.
				</p>
			</div>
		{/if}
	</section>

	<section class="flex flex-col gap-3">
		<h2 class="text-lg font-semibold">Invitations en attente</h2>
		{#if data.pending.length === 0}
			<p class="text-sm text-ink-3">Aucune invitation en attente.</p>
		{:else}
			<ul class="flex flex-col divide-y divide-line rounded-2xl border border-line bg-raised">
				{#each data.pending as invitation (invitation.id)}
					<li class="flex items-center gap-3 px-4 py-3">
						<div class="flex min-w-0 flex-1 flex-col">
							<span class="truncate font-medium">{invitation.email}</span>
							<span class="text-xs text-ink-3">
								Expire le {formatDate(invitation.expiresAt)}
							</span>
						</div>
						<form method="post" action="?/revoke" use:enhance>
							<input type="hidden" name="id" value={invitation.id} />
							<Button type="submit" size="sm" variant="danger">Révoquer</Button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section class="flex flex-col gap-3">
		<h2 class="text-lg font-semibold">Comptes</h2>
		<ul class="flex flex-col divide-y divide-line rounded-2xl border border-line bg-raised">
			{#each data.users as user (user.id)}
				<li class="flex items-center gap-3 px-4 py-3">
					<div class="flex min-w-0 flex-1 flex-col">
						<span class="truncate font-medium">{user.name}</span>
						<span class="truncate text-xs text-ink-3">{user.email}</span>
					</div>
					<span class="shrink-0 text-xs text-ink-3">
						{user.role === 'admin' ? 'Administrateur' : 'Testeur'} · depuis le {formatDate(
							user.createdAt
						)}
					</span>
				</li>
			{/each}
		</ul>
	</section>
</div>
