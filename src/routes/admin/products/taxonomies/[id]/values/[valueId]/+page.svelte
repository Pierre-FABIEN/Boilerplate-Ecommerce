<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import * as Form from '$shadcn/form';
	import { Input } from '$shadcn/input';
	import { Textarea } from '$shadcn/textarea';
	import { Button } from '$shadcn/button';
	import * as Select from '$shadcn/select';
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { RETRY_FRIENDLY_FORM } from '$lib/forms/superformOptions';
	import { updateTaxonomyValueSchema } from '$lib/schema/taxonomies/taxonomyValueSchema';
	import { toast } from 'svelte-sonner';

	let { data } = $props();
	let valueId = $derived(page.params.valueId);

	const updateTaxonomyValue = superForm(
		untrack(() => data.IupdateTaxonomyValueSchema),
		{
			validators: zodClient(updateTaxonomyValueSchema),
			id: 'updateTaxonomyValue',
			...RETRY_FRIENDLY_FORM
		}
	);

	const {
		form: updateTaxonomyValueData,
		enhance: updateTaxonomyValueEnhance,
		message: updateTaxonomyValueMessage
	} = updateTaxonomyValue;

	let parentSelectValue: string = $state(
		untrack(() => data.IupdateTaxonomyValueSchema.data.parentId || 'none')
	);

	function setParentSelectValue(value: string) {
		parentSelectValue = value;
		$updateTaxonomyValueData.parentId = value === 'none' ? '' : value;
	}

	$effect(() => {
		if ($updateTaxonomyValueMessage === 'Taxonomy value updated successfully') {
			toast.success('Valeur mise à jour');
		}
	});
</script>

<div class="ccc">
	<div class="m-5 p-5 border w-[420px]">
		<form
			method="POST"
			action="?/updateTaxonomyValue"
			use:updateTaxonomyValueEnhance
			class="space-y-4"
		>
			<div class="ccs mt-5">
				<div class="w-[100%]">
					<Form.Field name="value" form={updateTaxonomyValue}>
						<Form.Control>
							<Form.Label>Valeur</Form.Label>
							<Input name="value" type="text" bind:value={$updateTaxonomyValueData.value} />
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				</div>
				<div class="w-[100%]">
					<Form.Field name="label" form={updateTaxonomyValue}>
						<Form.Control>
							<Form.Label>Libellé affiché (facultatif)</Form.Label>
							<Input name="label" type="text" bind:value={$updateTaxonomyValueData.label} />
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				</div>

				{#if data.taxonomy.type === 'COLOR'}
					<div class="w-[100%]">
						<Form.Field name="code" form={updateTaxonomyValue}>
							<Form.Control>
								<Form.Label>Couleur</Form.Label>
								<Input
									name="code"
									type="color"
									bind:value={$updateTaxonomyValueData.code}
									class="w-16 h-10 p-0 border border-gray-300 rounded"
								/>
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>
					</div>
				{:else}
					<div class="w-[100%]">
						<Form.Field name="code" form={updateTaxonomyValue}>
							<Form.Control>
								<Form.Label>Code (facultatif)</Form.Label>
								<Input name="code" type="text" bind:value={$updateTaxonomyValueData.code} />
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>
					</div>
				{/if}

				<div class="w-[100%]">
					<Form.Field name="description" form={updateTaxonomyValue}>
						<Form.Control>
							<Form.Label>Description (facultatif)</Form.Label>
							<Textarea name="description" bind:value={$updateTaxonomyValueData.description} />
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				</div>

				<div class="w-[100%]">
					<Form.Field name="image" form={updateTaxonomyValue}>
						<Form.Control>
							<Form.Label>Image (URL, facultatif)</Form.Label>
							<Input name="image" type="text" bind:value={$updateTaxonomyValueData.image} />
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				</div>

				{#if data.availableParents.length > 0}
					<div class="w-[100%]">
						<Form.Field name="parentId" form={updateTaxonomyValue}>
							<Form.Control>
								<Form.Label>Valeur parente (facultatif)</Form.Label>
								<input type="hidden" name="parentId" value={$updateTaxonomyValueData.parentId} />
								<Select.Root
									type="single"
									value={parentSelectValue}
									onValueChange={(v) => setParentSelectValue(v)}
								>
									<Select.Trigger class="w-full">
										<span>
											{data.availableParents.find((v) => v.id === parentSelectValue)?.value ??
												'Aucune'}
										</span>
									</Select.Trigger>
									<Select.Content>
										<Select.Item value="none">Aucune</Select.Item>
										{#each data.availableParents as v (v.id)}
											<Select.Item value={v.id}>{v.value}</Select.Item>
										{/each}
									</Select.Content>
								</Select.Root>
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>
					</div>
				{/if}
			</div>
			<input type="hidden" name="id" value={valueId} />
			<Button type="submit">Save changes</Button>
		</form>
	</div>
</div>
