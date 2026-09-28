<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { filesFieldProxy, superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { RETRY_FRIENDLY_FORM } from '$lib/forms/superformOptions';

	import * as Form from '$shadcn/form';
	import { Label } from '$shadcn/label';
	import { Input } from '$shadcn/input';
	import { Button } from '$shadcn/button';
	import { Textarea } from '$shadcn/textarea';

	import { updateProductSchema } from '$lib/schema/products/productSchema.js';
	import { toast } from 'svelte-sonner';
	import TaxonomyValuePicker from '$components/TaxonomyValuePicker.svelte';

	let { data } = $props();

	//console.log(data);

	const updateProduct = superForm(
		untrack(() => data.IupdateProductSchema),
		{
			validators: zodClient(updateProductSchema),
			id: 'updateProduct',
			resetForm: false,
			...RETRY_FRIENDLY_FORM
		}
	);

	const {
		form: updateProductData,
		enhance: updateProductEnhance,
		message: updateProductMessage
	} = updateProduct;

	let DataPrice: number = $state(untrack(() => data.IupdateProductSchema.data.price));
	let DataStock: number = $state(untrack(() => data.IupdateProductSchema.data.stock));
	// `0` = pas de prix barré : champ vide, sinon `min="0.01"` du <input> bloque
	// la sauvegarde de tout produit sans prix barré (0 n'est pas >= 0.01).
	let DataCompareAtPrice: string = $state(
		untrack(() =>
			data.IupdateProductSchema.data.compareAtPrice
				? String(data.IupdateProductSchema.data.compareAtPrice)
				: ''
		)
	);
	let existingImages = $state(untrack(() => data.IupdateProductSchema.data.existingImages));

	let DataWeight: string = $state(
		untrack(() =>
			data.IupdateProductSchema.data.weight ? String(data.IupdateProductSchema.data.weight) : ''
		)
	);
	let DataLength: string = $state(
		untrack(() =>
			data.IupdateProductSchema.data.length ? String(data.IupdateProductSchema.data.length) : ''
		)
	);
	let DataWidth: string = $state(
		untrack(() =>
			data.IupdateProductSchema.data.width ? String(data.IupdateProductSchema.data.width) : ''
		)
	);
	let DataHeight: string = $state(
		untrack(() =>
			data.IupdateProductSchema.data.height ? String(data.IupdateProductSchema.data.height) : ''
		)
	);

	let selectedTaxonomyValueIds: string[] = $state(
		untrack(() => data.IupdateProductSchema.data.taxonomyValueIds ?? [])
	);

	const files = filesFieldProxy(updateProduct, 'images');
	const { values } = files;

	$effect(() => {
		$updateProductData.price = Number(DataPrice);
		$updateProductData.stock = Number(DataStock);
		$updateProductData.compareAtPrice = DataCompareAtPrice === '' ? 0 : Number(DataCompareAtPrice);
		$updateProductData.weight = DataWeight === '' ? undefined : Number(DataWeight);
		$updateProductData.length = DataLength === '' ? undefined : Number(DataLength);
		$updateProductData.width = DataWidth === '' ? undefined : Number(DataWidth);
		$updateProductData.height = DataHeight === '' ? undefined : Number(DataHeight);
	});

	$effect(() => {
		$updateProductData.taxonomyValueIds = selectedTaxonomyValueIds;
	});

	$effect(() => {
		if ($updateProductMessage === 'Product updated successfully') {
			$updateProductData.existingImages = data.IupdateProductSchema.data.existingImages;
			goto('/admin/products/');
			toast.success($updateProductMessage);
		}
	});
</script>

<div class="ccc w-[100%]">
	<div class="m-5 p-5 border rounded w-[100%]">
		<form
			method="POST"
			enctype="multipart/form-data"
			action="?/updateProduct"
			use:updateProductEnhance
			class="space-y-4"
		>
			<div class="rtb">
				<div class="ccc" style="width: calc(100% - 320px);">
					<div class="w-[100%]">
						<Form.Field name="name" form={updateProduct}>
							<Form.Control>
								<Form.Label>Name</Form.Label>
								<Input name="name" type="text" bind:value={$updateProductData.name} />
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>
					</div>

					<div class="w-[100%]">
						<Form.Field name="price" form={updateProduct}>
							<Form.Control>
								<Form.Label>Price</Form.Label>
								<Input name="price" type="number" bind:value={DataPrice} step="0.01" min="0.01" />
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>
					</div>
					<div class="w-[100%]">
						<Form.Field name="stock" form={updateProduct}>
							<Form.Control>
								<Form.Label>Stock</Form.Label>
								<Input name="stock" type="number" bind:value={DataStock} />
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>
					</div>
					<div class="w-[100%]">
						<Form.Field name="description" form={updateProduct}>
							<Form.Control>
								<Form.Label>Description</Form.Label>
								<Textarea name="description" bind:value={$updateProductData.description} />
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>
					</div>

					<div class="w-[100%]">
						<Form.Field name="colorProduct" form={updateProduct}>
							<Form.Control>
								<Form.Label>Color</Form.Label>
								<Input
									name="colorProduct"
									type="color"
									bind:value={$updateProductData.colorProduct}
									class="w-16 h-10 p-0 border border-gray-300 rounded"
								/>
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>
					</div>

					<div class="w-[100%]">
						<Form.Field name="sku" form={updateProduct}>
							<Form.Control>
								<Form.Label>Référence (SKU)</Form.Label>
								<Input name="sku" type="text" bind:value={$updateProductData.sku} />
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>
					</div>

					<div class="w-[100%]">
						<Form.Field name="compareAtPrice" form={updateProduct}>
							<Form.Control>
								<Form.Label>Prix barré (facultatif)</Form.Label>
								<Input
									name="compareAtPrice"
									type="number"
									bind:value={DataCompareAtPrice}
									step="0.01"
									min="0.01"
								/>
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>
					</div>

					<div class="w-[100%]">
						<Label>Poids et dimensions du colis (facultatif)</Label>
						<div class="rtb" style="gap: 0.5rem;">
							<Form.Field name="weight" form={updateProduct}>
								<Form.Control>
									<Form.Label>Poids (kg)</Form.Label>
									<Input
										name="weight"
										type="number"
										bind:value={DataWeight}
										step="0.001"
										min="0.001"
									/>
								</Form.Control>
								<Form.FieldErrors />
							</Form.Field>
							<Form.Field name="length" form={updateProduct}>
								<Form.Control>
									<Form.Label>Longueur (cm)</Form.Label>
									<Input name="length" type="number" bind:value={DataLength} step="0.1" min="0.1" />
								</Form.Control>
								<Form.FieldErrors />
							</Form.Field>
							<Form.Field name="width" form={updateProduct}>
								<Form.Control>
									<Form.Label>Largeur (cm)</Form.Label>
									<Input name="width" type="number" bind:value={DataWidth} step="0.1" min="0.1" />
								</Form.Control>
								<Form.FieldErrors />
							</Form.Field>
							<Form.Field name="height" form={updateProduct}>
								<Form.Control>
									<Form.Label>Hauteur (cm)</Form.Label>
									<Input name="height" type="number" bind:value={DataHeight} step="0.1" min="0.1" />
								</Form.Control>
								<Form.FieldErrors />
							</Form.Field>
						</div>
					</div>

					{#if data.flashSaleEnabled}
						<div class="w-[100%]">
							<Form.Field name="flashSaleEndsAt" form={updateProduct}>
								<Form.Control>
									<Form.Label>Fin de vente flash (facultatif)</Form.Label>
									<Input
										name="flashSaleEndsAt"
										type="datetime-local"
										bind:value={$updateProductData.flashSaleEndsAt}
									/>
								</Form.Control>
								<Form.FieldErrors />
							</Form.Field>
						</div>
					{/if}

					<TaxonomyValuePicker
						taxonomies={data.taxonomies}
						bind:selectedIds={selectedTaxonomyValueIds}
					/>
				</div>
				<div class="ccc w-[300px]">
					<div class="p-4 pb-0 flex flex-row space-x-4 ccc">
						<div
							class="ccc w-[300px] h-[300px] flex items-center justify-center border-2 border-dashed border-gray-300 rounded-lg relative"
						>
							<input
								multiple
								bind:files={$values}
								name="images"
								accept="image/png, image/jpeg"
								type="file"
								class="absolute opacity-0 w-full h-full cursor-pointer z-10"
							/>

							<div class="text-center pointer-events-none">
								<svg
									class="mx-auto h-12 w-12 text-gray-400"
									stroke="currentColor"
									fill="none"
									viewBox="0 0 48 48"
									aria-hidden="true"
								>
									<path
										d="M28 8H20v12H8v8h12v12h8V28h12v-8H28V8z"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									></path>
								</svg>
								<div class="mt-2 text-sm text-gray-600">
									<label
										class="relative cursor-pointer rounded-md font-medium text-indigo-600 hover:text-indigo-500"
										for="file-input"
									>
										<span>Upload a file</span>
									</label>
								</div>
								<p class="text-xs text-gray-500">PNG, JPG up to 1MB</p>
							</div>
						</div>
						<div class="mt-3 flex flex-wrap gap-2 flex-1 w-[300px] rts">
							{#each $values as image (image.name + image.lastModified)}
								<div class="relative w-[65px] h-[65px]">
									<img
										src={URL.createObjectURL(image)}
										alt=""
										class="w-full h-full object-cover rounded"
									/>
								</div>
							{/each}
						</div>
					</div>
					<div class="mt-3 flex flex-wrap gap-2 flex-1 w-[300px] rts">
						<p class="text-sm">Ces images seront suppirmées à la suite d'une modification :</p>
						{#each ($updateProductData.existingImages as string[] | undefined) ?? [] as imageUrl (imageUrl)}
							<div class="relative w-[65px] h-[65px]">
								<img src={String(imageUrl)} alt="" class="w-full h-full object-cover rounded" />
							</div>
						{/each}
					</div>

					<Form.Field name="images" form={updateProduct}>
						<Form.FieldErrors />
					</Form.Field>
				</div>
			</div>

			<input type="hidden" name="_id" bind:value={$updateProductData._id} />
			<input
				type="hidden"
				name="taxonomyValueIds"
				bind:value={$updateProductData.taxonomyValueIds}
			/>
			<input type="hidden" name="existingImages" value={JSON.stringify(existingImages)} />

			<Button type="submit">Save changes</Button>
		</form>

		<a
			href={`/admin/products/${$updateProductData._id}/variants`}
			class="mt-4 inline-block text-sm text-primary underline"
		>
			Gérer les variantes (tailles, couleurs...)
		</a>
	</div>
</div>
