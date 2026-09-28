<script lang="ts">
	import * as Card from '$shadcn/card';
	import { Button, buttonVariants } from '$shadcn/button';
	import * as AlertDialog from '$shadcn/alert-dialog/index.js';
	import { Monitor } from 'lucide-svelte';
	import { toast } from 'svelte-sonner';
	import { enhance } from '$app/forms';
	import { cn } from '$lib/components/shadcn/utils.js';

	let { data, form } = $props();

	$effect(() => {
		if (form?.message) {
			toast.error(form.message);
		}
	});

	let revokingId = $state<string | null>(null);

	// Une session ouverte avant l'ajout de ce suivi n'a jamais eu de User-Agent
	// capturé (colonne vide) — bannière explicite plutôt que de laisser chaque
	// ligne afficher silencieusement « Informations non disponibles » sans
	// contexte pour comprendre pourquoi.
	let hasLegacySession = $derived(data.sessions.some((s) => s.device === null));
</script>

<svelte:head>
	<title>Sessions actives</title>
</svelte:head>

<div class="mx-auto max-w-[720px] px-6 pt-10 pb-12">
	<p class="mb-6">
		<a href="/auth/settings" class="text-foreground">← Paramètres du compte</a>
	</p>

	<div class="mb-6 flex items-start justify-between gap-4">
		<div>
			<h1 class="text-2xl font-semibold">Sessions actives</h1>
			<p class="text-sm text-muted-foreground mt-1">
				Les appareils actuellement connectés à votre compte. Déconnectez ceux que vous ne
				reconnaissez pas.
			</p>
		</div>

		{#if data.sessions.length > 1}
			<AlertDialog.Root>
				<AlertDialog.Trigger class={cn(buttonVariants({ variant: 'outline' }), 'shrink-0')}>
					Déconnecter les autres
				</AlertDialog.Trigger>
				<AlertDialog.Content>
					<AlertDialog.Header>
						<AlertDialog.Title>Déconnecter toutes les autres sessions ?</AlertDialog.Title>
						<AlertDialog.Description>
							Chaque autre appareil connecté devra se reconnecter. La session actuelle n'est pas
							affectée.
						</AlertDialog.Description>
					</AlertDialog.Header>
					<form
						method="POST"
						action="?/revokeOthers"
						use:enhance={() => {
							return async ({ update, result }) => {
								await update();
								if (result.type === 'failure') {
									toast.error(String(result.data?.message ?? 'Échec'));
								} else if (result.type === 'success') {
									toast.success('Les autres sessions ont été déconnectées.');
								}
							};
						}}
					>
						<AlertDialog.Footer>
							<AlertDialog.Cancel>Annuler</AlertDialog.Cancel>
							<AlertDialog.Action type="submit">Déconnecter</AlertDialog.Action>
						</AlertDialog.Footer>
					</form>
				</AlertDialog.Content>
			</AlertDialog.Root>
		{/if}
	</div>

	{#if hasLegacySession}
		<p class="text-sm text-muted-foreground bg-muted rounded-md px-3 py-2 mb-4">
			Certaines sessions ont été ouvertes avant l'activation du suivi des appareils : leurs
			informations apparaîtront à la prochaine connexion depuis cet appareil.
		</p>
	{/if}

	<div class="space-y-3">
		{#each data.sessions as session (session.id)}
			<Card.Root>
				<Card.Content class="flex items-center justify-between gap-4 py-4">
					<div class="flex items-start gap-3">
						<Monitor class="w-5 h-5 mt-0.5 text-muted-foreground shrink-0" />
						<div>
							<p class="font-medium flex items-center gap-2">
								{#if session.device}
									{session.device}
								{:else}
									<span class="text-muted-foreground font-normal italic">
										Informations non disponibles
									</span>
								{/if}
								{#if session.isCurrent}
									<span
										class="text-xs rounded-full bg-primary/10 text-primary px-2 py-0.5 font-normal"
									>
										Session actuelle
									</span>
								{/if}
							</p>
							<p class="text-sm text-muted-foreground">
								{#if session.city || session.country}
									{[session.city, session.country].filter(Boolean).join(', ')} ·
								{:else if session.device}
									Localisation non disponible ·
								{/if}
								Dernière activité : {new Date(session.lastActiveAt).toLocaleString('fr-FR')}
							</p>
						</div>
					</div>

					{#if !session.isCurrent}
						<form
							method="POST"
							action="?/revoke"
							use:enhance={() => {
								revokingId = session.id;
								return async ({ update, result }) => {
									await update();
									revokingId = null;
									if (result.type === 'failure') {
										toast.error(String(result.data?.message ?? 'Échec'));
									}
								};
							}}
						>
							<input type="hidden" name="sessionId" value={session.id} />
							<Button
								type="submit"
								variant="outline"
								size="sm"
								disabled={revokingId === session.id}
							>
								Déconnecter
							</Button>
						</form>
					{/if}
				</Card.Content>
			</Card.Root>
		{/each}
	</div>
</div>
