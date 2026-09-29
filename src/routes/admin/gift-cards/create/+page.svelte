<script lang="ts">
	import { untrack } from 'svelte';
	import * as Form from '$shadcn/form';
	import { Input } from '$shadcn/input';
	import { Textarea } from '$shadcn/textarea/index.js';
	import { Button } from '$shadcn/button';
	import { superForm } from 'sveltekit-superforms';
	import { toast } from 'svelte-sonner';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { createGiftCardSchema } from '$lib/schema/giftCards/giftCardSchema.js';

	let { data } = $props();

	const createGiftCardForm = superForm(
		untrack(() => data?.createGiftCardForm ?? {}),
		{
			validators: zodClient(createGiftCardSchema),
			id: 'createGiftCard'
		}
	);

	const {
		form: createGiftCardData,
		enhance: createGiftCardEnhance,
		message: createGiftCardMessage
	} = createGiftCardForm;

	// Le message de succès embarque le code généré (`Carte cadeau créée : GIFT-...`) :
	// on le garde affiché sur place plutôt que de rediriger tout de suite,
	// le temps que l'admin le copie/transmette au client.
	let createdCode = $state<string | null>(null);

	$effect(() => {
		if ($createGiftCardMessage?.startsWith('Carte cadeau créée : ')) {
			createdCode = $createGiftCardMessage.replace('Carte cadeau créée : ', '');
			toast.success('Carte cadeau créée');
		} else if ($createGiftCardMessage) {
			toast.error($createGiftCardMessage);
		}
	});
</script>

<div class="ccc">
	<div class="m-5 p-5 border rounded-lg w-[80vw] max-w-[600px]">
		<h1 class="text-2xl font-bold mb-6">Créer une carte cadeau</h1>

		{#if createdCode}
			<div class="rounded border border-green-600 bg-green-50 p-4 space-y-3">
				<p class="font-medium">Carte cadeau créée avec succès.</p>
				<p class="font-mono text-lg tracking-wide">{createdCode}</p>
				<p class="text-sm text-muted-foreground">
					Transmettez ce code au destinataire — il ne sera plus jamais affiché ailleurs qu'ici.
				</p>
				<div class="flex gap-2">
					<Button href="/admin/gift-cards">Retour à la liste</Button>
					<Button variant="outline" onclick={() => (createdCode = null)}
						>Créer une autre carte</Button
					>
				</div>
			</div>
		{:else}
			<form method="POST" action="?/createGiftCard" use:createGiftCardEnhance class="space-y-4">
				<Form.Field name="initialValue" form={createGiftCardForm}>
					<Form.Control>
						<Form.Label>Valeur (€)</Form.Label>
						<Input
							name="initialValue"
							type="number"
							step="0.01"
							min="0.01"
							bind:value={$createGiftCardData.initialValue}
						/>
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field name="recipientEmail" form={createGiftCardForm}>
					<Form.Control>
						<Form.Label>Email du destinataire (optionnel)</Form.Label>
						<Input
							name="recipientEmail"
							type="email"
							placeholder="client@example.com"
							bind:value={$createGiftCardData.recipientEmail}
						/>
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field name="note" form={createGiftCardForm}>
					<Form.Control>
						<Form.Label>Note interne (optionnel)</Form.Label>
						<Textarea
							name="note"
							placeholder="ex : geste commercial suite à la commande #1234"
							bind:value={$createGiftCardData.note}
						/>
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field name="expiresAt" form={createGiftCardForm}>
					<Form.Control>
						<Form.Label>Date d'expiration (optionnel)</Form.Label>
						<Input name="expiresAt" type="date" bind:value={$createGiftCardData.expiresAt} />
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Button type="submit">Créer la carte cadeau</Button>
			</form>
		{/if}
	</div>
</div>
