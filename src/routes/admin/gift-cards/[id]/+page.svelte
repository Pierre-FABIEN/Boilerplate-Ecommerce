<script lang="ts">
	import { untrack } from 'svelte';
	import * as Form from '$shadcn/form';
	import * as Card from '$shadcn/card';
	import { Input } from '$shadcn/input';
	import { Textarea } from '$shadcn/textarea/index.js';
	import { Button } from '$shadcn/button';
	import { Checkbox } from '$shadcn/checkbox/index.js';
	import { Label } from '$shadcn/label/index.js';
	import { superForm } from 'sveltekit-superforms';
	import { toast } from 'svelte-sonner';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { RETRY_FRIENDLY_FORM } from '$lib/forms/superformOptions';
	import {
		updateGiftCardSchema,
		adjustGiftCardBalanceSchema
	} from '$lib/schema/giftCards/giftCardSchema.js';

	let { data } = $props();

	const updateGiftCardForm = superForm(
		untrack(() => data.updateGiftCardForm),
		{
			validators: zodClient(updateGiftCardSchema),
			id: 'updateGiftCard',
			...RETRY_FRIENDLY_FORM
		}
	);
	const {
		form: updateGiftCardData,
		enhance: updateGiftCardEnhance,
		message: updateGiftCardMessage
	} = updateGiftCardForm;

	const adjustBalanceForm = superForm(
		untrack(() => data.adjustBalanceForm),
		{
			validators: zodClient(adjustGiftCardBalanceSchema),
			id: 'adjustBalance',
			...RETRY_FRIENDLY_FORM
		}
	);
	const {
		form: adjustBalanceData,
		enhance: adjustBalanceEnhance,
		message: adjustBalanceMessage
	} = adjustBalanceForm;

	$effect(() => {
		if ($updateGiftCardMessage) toast.success($updateGiftCardMessage);
	});
	$effect(() => {
		if ($adjustBalanceMessage) toast.success($adjustBalanceMessage);
	});
</script>

<div class="ccc">
	<div class="m-5 p-5 border rounded-lg w-[80vw] max-w-[600px] space-y-6">
		<div>
			<h1 class="text-2xl font-bold">Carte cadeau {data.giftCard.code}</h1>
			<p class="text-sm text-muted-foreground">
				Valeur initiale : {data.giftCard.initialValue.toFixed(2)}€ — Solde restant : {data.giftCard.balance.toFixed(
					2
				)}€
			</p>
		</div>

		<form method="POST" action="?/updateGiftCard" use:updateGiftCardEnhance class="space-y-4">
			<input type="hidden" name="id" value={data.giftCard.id} />

			<Form.Field name="recipientEmail" form={updateGiftCardForm}>
				<Form.Control>
					<Form.Label>Email du destinataire (optionnel)</Form.Label>
					<Input
						name="recipientEmail"
						type="email"
						bind:value={$updateGiftCardData.recipientEmail}
					/>
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field name="note" form={updateGiftCardForm}>
				<Form.Control>
					<Form.Label>Note interne (optionnel)</Form.Label>
					<Textarea name="note" bind:value={$updateGiftCardData.note} />
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field name="expiresAt" form={updateGiftCardForm}>
				<Form.Control>
					<Form.Label>Date d'expiration (optionnel)</Form.Label>
					<Input name="expiresAt" type="date" bind:value={$updateGiftCardData.expiresAt} />
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field name="active" form={updateGiftCardForm} class="rcc">
				<Form.Control>
					<div class="flex items-center space-x-2">
						<Checkbox
							id="active"
							name="active"
							bind:checked={$updateGiftCardData.active as boolean | undefined}
						/>
						<Label for="active" class="text-sm font-medium leading-none">Carte active</Label>
					</div>
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Button type="submit">Enregistrer</Button>
		</form>

		<Card.Root>
			<Card.Header>
				<Card.Title>Ajuster le solde</Card.Title>
				<Card.Description>
					Geste SAV (remboursement partiel, correction) — modifie directement le solde restant, sans
					passer par une utilisation en caisse.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<form
					method="POST"
					action="?/adjustBalance"
					use:adjustBalanceEnhance
					class="flex items-end gap-3"
				>
					<input type="hidden" name="id" value={data.giftCard.id} />
					<Form.Field name="balance" form={adjustBalanceForm} class="flex-grow">
						<Form.Control>
							<Form.Label>Nouveau solde (€)</Form.Label>
							<Input
								name="balance"
								type="number"
								step="0.01"
								min="0"
								bind:value={$adjustBalanceData.balance}
							/>
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
					<Button type="submit" variant="outline">Ajuster</Button>
				</form>
			</Card.Content>
		</Card.Root>
	</div>
</div>
