<script lang="ts">
	import { onMount } from 'svelte';
	import PageHeader from '#lib/components/PageHeader.svelte';
	import FormIssues from '#lib/components/form/FormIssues.svelte';
	import FormSuccess from '#lib/components/form/FormSuccess.svelte';
	import SubmitButton from '#lib/components/form/SubmitButton.svelte';
	import { plural } from '#lib/format/labels.js';
	import { base64UrlToBytes } from '#lib/push.js';
	import Button from '#lib/ui/Button.svelte';
	import Notice from '#lib/ui/Notice.svelte';
	import { issueOf } from '#lib/ui/field.js';
	import { saveThreshold, subscribe, unsubscribe } from './settings.remote';
	import type { PageProps } from './$types';

	// Notifications de révision : l'abonnement est propre à l'appareil (permission du
	// navigateur, puis abonnement push), le seuil de cartes prêtes au compte.

	let { data }: PageProps = $props();

	/**
	 * État de l'appareil : `checking` avant de l'avoir lu, `unsupported` sans Web Push (iPhone
	 * hors écran d'accueil), `denied` si la permission est refusée, `on` s'il est abonné pour
	 * ce compte.
	 */
	type DeviceState = 'checking' | 'unsupported' | 'denied' | 'off' | 'on';

	let device = $state<DeviceState>('checking');
	let busy = $state(false);
	let failure = $state<string | null>(null);

	const threshold = saveThreshold.fields.threshold;
	const thresholdError = $derived(issueOf(threshold));

	async function currentSubscription() {
		const registration = await navigator.serviceWorker.getRegistration();
		return (await registration?.pushManager.getSubscription()) ?? null;
	}

	onMount(async () => {
		if (!data.notifications) return;
		if (!('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window)) {
			device = 'unsupported';
			return;
		}
		if (Notification.permission === 'denied') {
			device = 'denied';
			return;
		}
		const subscription = await currentSubscription();
		// Abonné sur ce navigateur, mais pour ce compte seulement s'il figure dans sa liste.
		device =
			subscription && data.notifications.endpoints.includes(subscription.endpoint) ? 'on' : 'off';
	});

	/** Abonne l'appareil ; un abonnement fait sous une autre clé VAPID est remplacé. */
	async function subscribeDevice(vapidPublicKey: string) {
		const registration = await navigator.serviceWorker.ready;
		const options = {
			userVisibleOnly: true,
			applicationServerKey: base64UrlToBytes(vapidPublicKey)
		};
		try {
			return await registration.pushManager.subscribe(options);
		} catch (cause) {
			const previous = await registration.pushManager.getSubscription();
			if (!previous) throw cause;
			await previous.unsubscribe();
			return registration.pushManager.subscribe(options);
		}
	}

	/** Lance un changement d'abonnement ; une erreur inattendue affiche `failed`. */
	async function run(action: () => Promise<void>, failed: string) {
		busy = true;
		failure = null;
		try {
			await action();
		} catch {
			failure = failed;
		} finally {
			busy = false;
		}
	}

	const enable = (vapidPublicKey: string) =>
		run(async () => {
			const permission = await Notification.requestPermission();
			if (permission !== 'granted') {
				device = permission === 'denied' ? 'denied' : 'off';
				return;
			}
			const subscription = await subscribeDevice(vapidPublicKey);
			const { refused } = await subscribe(subscription.toJSON());
			if (refused) {
				await subscription.unsubscribe();
				failure = refused;
				return;
			}
			device = 'on';
		}, 'L’activation a échoué. Réessaie dans un instant.');

	const disable = () =>
		run(async () => {
			const subscription = await currentSubscription();
			if (subscription) {
				await unsubscribe({ endpoint: subscription.endpoint });
				await subscription.unsubscribe();
			}
			device = 'off';
		}, 'La désactivation a échoué. Réessaie dans un instant.');
</script>

<svelte:head><title>Réglages · Poj</title></svelte:head>

<div class="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 pb-12 md:px-8">
	<PageHeader title="Réglages" />

	<section class="flex flex-col gap-4" aria-labelledby="notifications-title">
		<div class="flex flex-col gap-1">
			<h2 id="notifications-title" class="text-lg font-semibold text-ink">
				Notifications de révision
			</h2>
			<p class="text-sm text-ink-2">
				Poj te prévient quand assez de cartes sont prêtes : une notification quand elles atteignent
				ton seuil, puis plus rien tant qu’elles restent au-dessus.
			</p>
		</div>

		{#if !data.notifications}
			<Notice title="Notifications indisponibles">
				Ce serveur n’est pas configuré pour envoyer des notifications.
			</Notice>
		{:else}
			{@const { vapidPublicKey, threshold: bounds } = data.notifications}

			{#if device === 'unsupported'}
				<Notice title="Notifications indisponibles sur ce navigateur">
					Sur iPhone, ajoute Poj à l’écran d’accueil (Partager, puis « Sur l’écran d’accueil ») et
					ouvre-le depuis son icône.
				</Notice>
			{:else if device === 'denied'}
				<Notice tone="warn" title="Notifications bloquées">
					Autorise les notifications de Poj dans les réglages du navigateur, puis recharge la page.
				</Notice>
			{:else if device === 'on'}
				<div class="flex flex-wrap items-center justify-between gap-3">
					<p class="text-sm text-ink">Activées sur cet appareil.</p>
					<Button loading={busy} onclick={disable}>Désactiver</Button>
				</div>
			{:else if device === 'off'}
				<div class="flex flex-wrap items-center justify-between gap-3">
					<p class="text-sm text-ink-2">Désactivées sur cet appareil.</p>
					<Button
						variant="primary"
						icon="bell"
						loading={busy}
						onclick={() => enable(vapidPublicKey)}
					>
						Activer les notifications
					</Button>
				</div>
			{/if}

			{#if failure}
				<Notice tone="danger">{failure}</Notice>
			{/if}

			<form
				{...saveThreshold.enhance(async ({ submit }) => {
					// Garde la saisie, sans recharger la page : rien d'autre ne change.
					await submit().updates();
				})}
				class="flex flex-col gap-3"
			>
				<div class="flex flex-col gap-1.5">
					<label for="ready-threshold" class="text-sm font-medium text-ink"
						>Seuil de cartes prêtes</label
					>
					<input
						id="ready-threshold"
						name={threshold.as('number').name}
						type="number"
						inputmode="numeric"
						required
						min={bounds.min}
						max={bounds.max}
						value={threshold.value() ?? bounds.value}
						aria-invalid={thresholdError ? 'true' : undefined}
						aria-describedby="ready-threshold-help"
						class={[
							'h-10 w-20 rounded-lg border bg-inset px-3 text-base text-ink tabular-nums',
							'transition-[border-color,box-shadow] duration-150 ease-out',
							'focus:border-accent focus:ring-3 focus:ring-accent/20 focus:outline-none',
							thresholdError ? 'border-danger' : 'border-line-strong hover:border-ink-3'
						]}
					/>
					<p
						id="ready-threshold-help"
						class={['text-sm', thresholdError ? 'text-danger' : 'text-ink-2']}
					>
						{thresholdError ??
							'Vaut pour tous tes appareils. Sous ce nombre de cartes prêtes, rien n’est envoyé.'}
					</p>
				</div>

				<FormIssues issues={saveThreshold.fields.issues()} />

				{#if saveThreshold.result}
					<FormSuccess>
						Seuil enregistré : notification à partir de {plural(
							saveThreshold.result.threshold,
							'carte prête',
							'cartes prêtes'
						)}.
					</FormSuccess>
				{/if}

				<div>
					<SubmitButton remote={saveThreshold}>Enregistrer le seuil</SubmitButton>
				</div>
			</form>
		{/if}
	</section>
</div>
