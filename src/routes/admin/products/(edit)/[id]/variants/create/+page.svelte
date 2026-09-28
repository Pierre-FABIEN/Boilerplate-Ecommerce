<script lang="ts">
	import { untrack } from 'svelte';
	import * as Form from '$shadcn/form';
	import { Input } from '$shadcn/input';
	import { Button } from '$shadcn/button';
	import { superForm } from 'sveltekit-superforms';
	import { toast } from 'svelte-sonner';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { RETRY_FRIENDLY_FORM } from '$lib/forms/superformOptions';
	import { createVariantSchema } from '$lib/schema/products/variantSchema.js';
	import { goto } from '$app/navigation';

	let { data } = $props();

	const createVariantForm = superForm(
		untrack(() => data.createVariantForm),
		{
			validators: zodClient(createVariantSchema),
			id: 'createVariant',
			...RETRY_FRIENDLY_FORM
		}
	);
	const {
		form: createVariantData,
		enhance: createVariantEnhance,
		message: createVariantMessage
	} = createVariantForm;

	$effect(() => {
		if ($createVariantMessage === 'Variante créée avec succès') {
			toast.success($createVariantMessage);
			setTimeout(() => goto(`/admin/products/${data.product.id}/variants`), 0);
		} else if ($createVariantMessage) {
			toast.error($createVariantMessage);
		}
	});
</script>

<div class="ccc">
	<div class="m-5 p-5 border rounded-lg w-[80vw] max-w-[600px]">
		<h1 class="text-2xl font-bold mb-6">Nouvelle variante — {data.product.name}</h1>

		<form method="POST" action="?/createVariant" use:createVariantEnhance class="space-y-4">
			<Form.Field name="label" form={createVariantForm}>
				<Form.Control>
					<Form.Label>Étiquette</Form.Label>
					<Input
						name="label"
						type="text"
						placeholder="ex : Taille 54"
						bind:value={$createVariantData.label}
					/>
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field name="sku" form={createVariantForm}>
				<Form.Control>
					<Form.Label>SKU (optionnel)</Form.Label>
					<Input name="sku" type="text" bind:value={$createVariantData.sku} />
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field name="price" form={createVariantForm}>
				<Form.Control>
					<Form.Label>Prix (€, laisser 0 pour utiliser le prix du produit)</Form.Label>
					<Input
						name="price"
						type="number"
						step="0.01"
						min="0"
						bind:value={$createVariantData.price}
					/>
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field name="stock" form={createVariantForm}>
				<Form.Control>
					<Form.Label>Stock</Form.Label>
					<Input
						name="stock"
						type="number"
						step="1"
						min="0"
						bind:value={$createVariantData.stock}
					/>
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Button type="submit">Créer la variante</Button>
		</form>
	</div>
</div>
