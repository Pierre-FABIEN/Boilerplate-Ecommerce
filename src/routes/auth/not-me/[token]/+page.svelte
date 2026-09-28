<script lang="ts">
	import * as Card from '$shadcn/card';
	import { Button } from '$shadcn/button';
	import { enhance } from '$app/forms';
	import { toast } from 'svelte-sonner';
	import { ShieldAlert, ShieldCheck } from 'lucide-svelte';

	let { data, form } = $props();

	let confirmed = $state(false);

	$effect(() => {
		if (form?.message) {
			toast.error(form.message);
		}
	});
</script>

<svelte:head>
	<title>Ce n'était pas moi</title>
</svelte:head>

<div class="mx-auto max-w-[480px] px-6 pt-16 pb-12">
	<Card.Root>
		{#if confirmed}
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					<ShieldCheck class="w-5 h-5 text-primary" />
					Session déconnectée
				</Card.Title>
				<Card.Description>
					C'est fait. Par précaution, pensez aussi à
					<a href="/auth/forgot-password" class="underline">changer votre mot de passe</a>.
				</Card.Description>
			</Card.Header>
		{:else if !data.valid}
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					<ShieldAlert class="w-5 h-5 text-muted-foreground" />
					Lien invalide ou expiré
				</Card.Title>
				<Card.Description>
					Ce lien a déjà été utilisé, ou date de plus de 7 jours. Si vous pensez que votre compte
					est compromis, connectez-vous et changez votre mot de passe depuis
					<a href="/auth/settings" class="underline">vos paramètres</a>.
				</Card.Description>
			</Card.Header>
		{:else}
			<Card.Header>
				<Card.Title class="flex items-center gap-2">
					<ShieldAlert class="w-5 h-5 text-destructive" />
					Déconnecter cette session ?
				</Card.Title>
				<Card.Description>
					{#if data.device}
						Appareil : {data.device}{data.location ? ` · ${data.location}` : ''}.
					{/if}
					Cette session sera immédiatement déconnectée. Aucune connexion n'est nécessaire pour confirmer.
				</Card.Description>
			</Card.Header>
			<Card.Footer>
				<form
					method="POST"
					action="?/confirm"
					use:enhance={() => {
						return async ({ update, result }) => {
							if (result.type === 'failure') {
								// Recharge le jeton (peut avoir expiré entre-temps) pour
								// afficher « lien invalide » plutôt qu'un message générique.
								await update();
								toast.error(String(result.data?.message ?? 'Échec'));
							} else if (result.type === 'success') {
								// Jamais `update()` ici : le jeton vient d'être consommé, un
								// rechargement de `data` le verrait "invalide" et écraserait
								// l'état de succès qu'on affiche nous-mêmes (`confirmed`).
								confirmed = true;
							}
						};
					}}
					class="w-full"
				>
					<Button type="submit" variant="destructive" class="w-full">
						Oui, déconnecter cette session
					</Button>
				</form>
			</Card.Footer>
		{/if}
	</Card.Root>
</div>
