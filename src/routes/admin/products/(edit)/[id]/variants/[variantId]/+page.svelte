<script lang="ts">
	import { untrack } from 'svelte';
	import * as Form from '$shadcn/form';
	import { Input } from '$shadcn/input';
	import { Button } from '$shadcn/button';
	import { superForm } from 'sveltekit-superforms';
	import { toast } from 'svelte-sonner';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { RETRY_FRIENDLY_FORM } from '$lib/forms/superformOptions';
	import { updateVariantSchema } from '$lib/schema/products/variantSchema.js';
	import { goto } from '$app/navigation';

	let { data } = $props();

	const updateVariantForm = superForm(
		untrack(() => data.updateVariantForm),
		{
			validators: zodClient(updateVariantSchema),
			id: 'updateVariant',
			...RETRY_FRIENDLY_FORM
		}
	);
	const {
		form: updateVariantData,
		enhance: updateVariantEnhance,
		message: updateVariantMessage
	} = updateVariantForm;

	$effect(() => {
		if ($updateVariantMessage === 'Variante mise à jour avec succès') {
			toast.success($updateVariantMessage);
			setTimeout(() => goto(`/admin/products/${data.variant.productId}/variants`), 0);
		} else if ($updateVariantMessage) {
			toast.error($updateVariantMessage);
		}
	});
</script>

<div class="ccc">
	<div class="m-5 p-5 border rounded-lg w-[80vw] max-w-[600px]">
		<h1 class="text-2xl font-bold mb-6">Modifier la variante</h1>

		<form method="POST" action="?/updateVariant" use:updateVariantEnhance class="space-y-4">
			<input type="hidden" name="id" value={data.variant.id} />

			<Form.Field name="label" form={updateVariantForm}>
				<Form.Control>
					<Form.Label>Étiquette</Form.Label>
					<Input name="label" type="text" bind:value={$updateVariantData.label} />
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field name="sku" form={updateVariantForm}>
				<Form.Control>
					<Form.Label>SKU (optionnel)</Form.Label>
					<Input name="sku" type="text" bind:value={$updateVariantData.sku} />
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field name="price" form={updateVariantForm}>
				<Form.Control>
					<Form.Label>Prix (€, laisser 0 pour utiliser le prix du produit)</Form.Label>
					<Input
						name="price"
						type="number"
						step="0.01"
						min="0"
						bind:value={$updateVariantData.price}
					/>
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field name="stock" form={updateVariantForm}>
				<Form.Control>
					<Form.Label>Stock</Form.Label>
					<Input
						name="stock"
						type="number"
						step="1"
						min="0"
						bind:value={$updateVariantData.stock}
					/>
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Button type="submit">Enregistrer</Button>
		</form>
	</div>
</div>
