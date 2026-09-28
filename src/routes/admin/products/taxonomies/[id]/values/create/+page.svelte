<script lang="ts">
	import { untrack } from 'svelte';
	import * as Form from '$shadcn/form';
	import { Input } from '$shadcn/input';
	import { Textarea } from '$shadcn/textarea';
	import { Button } from '$shadcn/button';
	import * as Select from '$shadcn/select';
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { RETRY_FRIENDLY_FORM } from '$lib/forms/superformOptions';
	import { createTaxonomyValueSchema } from '$lib/schema/taxonomies/taxonomyValueSchema';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';

	let { data } = $props();

	const createTaxonomyValue = superForm(
		untrack(() => data.IcreateTaxonomyValueSchema),
		{
			validators: zodClient(createTaxonomyValueSchema),
			id: 'createTaxonomyValue',
			...RETRY_FRIENDLY_FORM
		}
	);

	const {
		form: createTaxonomyValueData,
		enhance: createTaxonomyValueEnhance,
		message: createTaxonomyValueMessage
	} = createTaxonomyValue;

	// bits-ui Select n'accepte pas la chaîne vide — 'none' représente « pas de parent ».
	let parentSelectValue: string = $state('none');

	function setParentSelectValue(value: string) {
		parentSelectValue = value;
		$createTaxonomyValueData.parentId = value === 'none' ? '' : value;
	}

	$effect(() => {
		if ($createTaxonomyValueMessage === 'Taxonomy value created successfully') {
			toast.success('Valeur créée');
			setTimeout(() => goto(`/admin/products/taxonomies/${data.taxonomy.id}`), 0);
		}
	});
</script>

<div class="ccc">
	<div class="m-5 p-5 border w-[420px]">
		<form
			method="POST"
			action="?/createTaxonomyValue"
			use:createTaxonomyValueEnhance
			class="space-y-4"
		>
			<div class="ccs mt-5">
				<div class="w-[100%]">
					<Form.Field name="value" form={createTaxonomyValue}>
						<Form.Control>
							<Form.Label>Valeur</Form.Label>
							<Input name="value" type="text" bind:value={$createTaxonomyValueData.value} />
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				</div>
				<div class="w-[100%]">
					<Form.Field name="label" form={createTaxonomyValue}>
						<Form.Control>
							<Form.Label>Libellé affiché (facultatif)</Form.Label>
							<Input name="label" type="text" bind:value={$createTaxonomyValueData.label} />
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				</div>

				{#if data.taxonomy.type === 'COLOR'}
					<div class="w-[100%]">
						<Form.Field name="code" form={createTaxonomyValue}>
							<Form.Control>
								<Form.Label>Couleur</Form.Label>
								<Input
									name="code"
									type="color"
									bind:value={$createTaxonomyValueData.code}
									class="w-16 h-10 p-0 border border-gray-300 rounded"
								/>
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>
					</div>
				{:else}
					<div class="w-[100%]">
						<Form.Field name="code" form={createTaxonomyValue}>
							<Form.Control>
								<Form.Label>Code (facultatif)</Form.Label>
								<Input name="code" type="text" bind:value={$createTaxonomyValueData.code} />
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>
					</div>
				{/if}

				<div class="w-[100%]">
					<Form.Field name="description" form={createTaxonomyValue}>
						<Form.Control>
							<Form.Label>Description (facultatif)</Form.Label>
							<Textarea name="description" bind:value={$createTaxonomyValueData.description} />
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				</div>

				<div class="w-[100%]">
					<Form.Field name="image" form={createTaxonomyValue}>
						<Form.Control>
							<Form.Label>Image (URL, facultatif)</Form.Label>
							<Input name="image" type="text" bind:value={$createTaxonomyValueData.image} />
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				</div>

				{#if data.taxonomy.values.length > 0}
					<div class="w-[100%]">
						<Form.Field name="parentId" form={createTaxonomyValue}>
							<Form.Control>
								<Form.Label>Valeur parente (facultatif)</Form.Label>
								<input type="hidden" name="parentId" value={$createTaxonomyValueData.parentId} />
								<Select.Root
									type="single"
									value={parentSelectValue}
									onValueChange={(v) => setParentSelectValue(v)}
								>
									<Select.Trigger class="w-full">
										<span>
											{data.taxonomy.values.find((v) => v.id === parentSelectValue)?.value ??
												'Aucune'}
										</span>
									</Select.Trigger>
									<Select.Content>
										<Select.Item value="none">Aucune</Select.Item>
										{#each data.taxonomy.values as v (v.id)}
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
			<input type="hidden" name="taxonomyId" value={data.taxonomy.id} />
			<Button type="submit">Save changes</Button>
		</form>
	</div>
</div>
