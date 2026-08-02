<script lang="ts">
	import * as Form from '$shadcn/form';
	import { Input } from '$shadcn/input';
	import { Button } from '$shadcn/button';
	import { Checkbox } from '$shadcn/checkbox/index.js';
	import { Label } from '$shadcn/label/index.js';
	import { superForm } from 'sveltekit-superforms';
	import { toast } from 'svelte-sonner';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { createPromoSchema } from '$lib/schema/promo/promoSchema.js';
	import { goto } from '$app/navigation';

	let { data } = $props();

	const createPromo = superForm(data?.createPromoForm ?? {}, {
		validators: zodClient(createPromoSchema),
		id: 'createPromo'
	});

	const {
		form: createPromoData,
		enhance: createPromoEnhance,
		message: createPromoMessage
	} = createPromo;

	// Un nouveau code promo est actif par défaut
	if ($createPromoData.active === undefined) {
		$createPromoData.active = true;
	}

	$effect(() => {
		if ($createPromoMessage === 'Code promo créé avec succès') {
			toast.success($createPromoMessage);
			setTimeout(() => goto('/admin/promo/'), 0);
		} else if ($createPromoMessage) {
			toast.error($createPromoMessage);
		}
	});
</script>

<div class="ccc">
	<div class="m-5 p-5 border rounded-lg w-[80vw] max-w-[600px]">
		<h1 class="text-2xl font-bold mb-6">Créer un code promo</h1>

		<form method="POST" action="?/createPromo" use:createPromoEnhance class="space-y-4">
			<Form.Field name="code" form={createPromo}>
				<Form.Control>
					<Form.Label>Code</Form.Label>
					<Input name="code" type="text" placeholder="ex: BIENVENUE10" bind:value={$createPromoData.code} />
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field name="type" form={createPromo}>
				<Form.Control>
					<Form.Label>Type de remise</Form.Label>
					<select
						name="type"
						bind:value={$createPromoData.type}
						class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
					>
						<option value="PERCENTAGE">Pourcentage (%)</option>
						<option value="FIXED">Montant fixe (€)</option>
					</select>
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field name="value" form={createPromo}>
				<Form.Control>
					<Form.Label>
						Valeur {$createPromoData.type === 'PERCENTAGE' ? '(en %)' : '(en €)'}
					</Form.Label>
					<Input name="value" type="number" step="0.01" min="0" bind:value={$createPromoData.value} />
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field name="minAmount" form={createPromo}>
				<Form.Control>
					<Form.Label>Montant minimum de commande (€, optionnel)</Form.Label>
					<Input
						name="minAmount"
						type="number"
						step="0.01"
						min="0"
						bind:value={$createPromoData.minAmount}
					/>
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field name="usageLimit" form={createPromo}>
				<Form.Control>
					<Form.Label>Limite d'utilisation (optionnel, vide = illimité)</Form.Label>
					<Input
						name="usageLimit"
						type="number"
						step="1"
						min="0"
						bind:value={$createPromoData.usageLimit}
					/>
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field name="expiresAt" form={createPromo}>
				<Form.Control>
					<Form.Label>Date d'expiration (optionnel)</Form.Label>
					<Input name="expiresAt" type="date" bind:value={$createPromoData.expiresAt} />
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field name="active" form={createPromo} class="rcc">
				<Form.Control>
					<div class="flex items-center space-x-2">
						<Checkbox name="active" bind:checked={$createPromoData.active as boolean | undefined} />
						<Label for="active" class="text-sm font-medium leading-none">Code actif</Label>
					</div>
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Button type="submit">Créer le code promo</Button>
		</form>
	</div>
</div>
