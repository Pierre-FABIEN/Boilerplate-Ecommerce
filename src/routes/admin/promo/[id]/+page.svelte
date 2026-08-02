<script lang="ts">
	import * as Form from '$shadcn/form';
	import { Input } from '$shadcn/input';
	import { Button } from '$shadcn/button';
	import { Checkbox } from '$shadcn/checkbox/index.js';
	import { Label } from '$shadcn/label/index.js';
	import { superForm } from 'sveltekit-superforms';
	import { toast } from 'svelte-sonner';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { updatePromoSchema } from '$lib/schema/promo/promoSchema.js';
	import { goto } from '$app/navigation';

	let { data } = $props();

	const updatePromo = superForm(data.updatePromoForm, {
		validators: zodClient(updatePromoSchema),
		id: 'updatePromo'
	});

	const {
		form: updatePromoData,
		enhance: updatePromoEnhance,
		message: updatePromoMessage
	} = updatePromo;

	$effect(() => {
		if ($updatePromoMessage === 'Code promo mis à jour avec succès') {
			toast.success($updatePromoMessage);
			setTimeout(() => goto('/admin/promo/'), 1000);
		} else if ($updatePromoMessage) {
			toast.error($updatePromoMessage);
		}
	});
</script>

<div class="ccc">
	<div class="m-5 p-5 border rounded-lg w-[80vw] max-w-[600px]">
		<h1 class="text-2xl font-bold mb-6">Modifier le code promo</h1>

		<form method="POST" action="?/updatePromo" use:updatePromoEnhance class="space-y-4">
			<input type="hidden" name="id" value={$updatePromoData.id} />

			<Form.Field name="code" form={updatePromo}>
				<Form.Control>
					<Form.Label>Code</Form.Label>
					<Input name="code" type="text" bind:value={$updatePromoData.code} />
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field name="type" form={updatePromo}>
				<Form.Control>
					<Form.Label>Type de remise</Form.Label>
					<select
						name="type"
						bind:value={$updatePromoData.type}
						class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
					>
						<option value="PERCENTAGE">Pourcentage (%)</option>
						<option value="FIXED">Montant fixe (€)</option>
					</select>
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field name="value" form={updatePromo}>
				<Form.Control>
					<Form.Label>
						Valeur {$updatePromoData.type === 'PERCENTAGE' ? '(en %)' : '(en €)'}
					</Form.Label>
					<Input name="value" type="number" step="0.01" min="0" bind:value={$updatePromoData.value} />
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field name="minAmount" form={updatePromo}>
				<Form.Control>
					<Form.Label>Montant minimum de commande (€, optionnel)</Form.Label>
					<Input
						name="minAmount"
						type="number"
						step="0.01"
						min="0"
						bind:value={$updatePromoData.minAmount}
					/>
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field name="usageLimit" form={updatePromo}>
				<Form.Control>
					<Form.Label>Limite d'utilisation (optionnel, vide = illimité)</Form.Label>
					<Input
						name="usageLimit"
						type="number"
						step="1"
						min="0"
						bind:value={$updatePromoData.usageLimit}
					/>
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field name="expiresAt" form={updatePromo}>
				<Form.Control>
					<Form.Label>Date d'expiration (optionnel)</Form.Label>
					<Input name="expiresAt" type="date" bind:value={$updatePromoData.expiresAt} />
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field name="active" form={updatePromo} class="rcc">
				<Form.Control>
					<div class="flex items-center space-x-2">
						<Checkbox name="active" bind:checked={$updatePromoData.active as boolean | undefined} />
						<Label for="active" class="text-sm font-medium leading-none">Code actif</Label>
					</div>
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Button type="submit">Enregistrer les modifications</Button>
		</form>
	</div>
</div>
