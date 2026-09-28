<script lang="ts">
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import * as Form from '$shadcn/form';
	import { Input } from '$shadcn/input';
	import { Button } from '$shadcn/button';
	import Checkbox from '$shadcn/checkbox/checkbox.svelte';
	import { Label } from '$shadcn/label';
	import * as Select from '$shadcn/select';
	import Table from '$components/Table.svelte';
	import type { TableAction, TableColumn, TableItem } from '$components/Table.svelte';
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { RETRY_FRIENDLY_FORM } from '$lib/forms/superformOptions';
	import { updateTaxonomySchema } from '$lib/schema/taxonomies/taxonomySchema';
	import { deleteTaxonomyValueSchema } from '$lib/schema/taxonomies/taxonomyValueSchema';
	import { toast } from 'svelte-sonner';
	import Pencil from 'lucide-svelte/icons/pencil';
	import Trash from 'lucide-svelte/icons/trash';

	let { data } = $props();
	let id = $derived(page.params.id);

	const updateTaxonomy = superForm(
		untrack(() => data.IupdateTaxonomySchema),
		{
			validators: zodClient(updateTaxonomySchema),
			id: 'updateTaxonomy',
			...RETRY_FRIENDLY_FORM
		}
	);

	const {
		form: updateTaxonomyData,
		enhance: updateTaxonomyEnhance,
		message: updateTaxonomyMessage
	} = updateTaxonomy;

	const typeLabels: Record<string, string> = {
		TEXT: 'Texte',
		COLOR: 'Couleur',
		NUMBER: 'Nombre',
		BOOLEAN: 'Oui / Non',
		DATE: 'Date'
	};

	let typeValue = $derived($updateTaxonomyData.type as keyof typeof typeLabels);

	function setTypeValue(value: keyof typeof typeLabels) {
		$updateTaxonomyData.type = value as typeof $updateTaxonomyData.type;
	}

	$effect(() => {
		if ($updateTaxonomyMessage === 'Taxonomy updated successfully') {
			toast.success('Taxonomie mise à jour');
		}
	});

	const deleteTaxonomyValue = superForm(
		untrack(() => data.IdeleteTaxonomyValueSchema),
		{
			validators: zodClient(deleteTaxonomyValueSchema),
			id: 'deleteTaxonomyValue',
			...RETRY_FRIENDLY_FORM
		}
	);

	const { enhance: deleteTaxonomyValueEnhance, message: deleteTaxonomyValueMessage } =
		deleteTaxonomyValue;

	$effect(() => {
		if ($deleteTaxonomyValueMessage) {
			toast.success($deleteTaxonomyValueMessage);
		}
	});

	let values = $derived(data.taxonomy.values ?? []);

	let valuesData = $derived(
		values.map((v: (typeof values)[number]) => ({
			...v,
			label: v.label || v.value,
			parentName: values.find((p: (typeof values)[number]) => p.id === v.parentId)?.value ?? '—'
		}))
	);

	const valueColumns: TableColumn[] = [
		{ key: 'value', label: 'Valeur' },
		{ key: 'label', label: 'Libellé' },
		{ key: 'parentName', label: 'Parent' },
		{ key: 'code', label: 'Code' }
	];

	const valueActions: TableAction[] = [
		{
			type: 'link',
			name: 'edit',
			url: (item: TableItem) => `/admin/products/taxonomies/${id}/values/${item.id}`,
			icon: Pencil
		},
		{
			type: 'form',
			name: 'delete',
			url: '?/deleteTaxonomyValue',
			enhanceAction: deleteTaxonomyValueEnhance,
			icon: Trash
		}
	];
</script>

<div class="ccc">
	<div class="m-5 p-5 border w-[420px]">
		<form method="POST" action="?/updateTaxonomy" use:updateTaxonomyEnhance class="space-y-4">
			<div class="ccs mt-5">
				<div class="w-[100%]">
					<Form.Field name="name" form={updateTaxonomy}>
						<Form.Control>
							<Form.Label>Nom</Form.Label>
							<Input name="name" type="text" bind:value={$updateTaxonomyData.name} />
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				</div>
				<div class="w-[100%]">
					<Form.Field name="slug" form={updateTaxonomy}>
						<Form.Control>
							<Form.Label>Slug</Form.Label>
							<Input name="slug" type="text" bind:value={$updateTaxonomyData.slug} />
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				</div>
				<div class="w-[100%]">
					<Form.Field name="type" form={updateTaxonomy}>
						<Form.Control>
							<Form.Label>Type de valeur</Form.Label>
							<input type="hidden" name="type" value={typeValue} />
							<Select.Root
								type="single"
								value={typeValue}
								onValueChange={(v) => setTypeValue(v as keyof typeof typeLabels)}
							>
								<Select.Trigger class="w-full">
									<span>{typeLabels[typeValue] ?? typeValue}</span>
								</Select.Trigger>
								<Select.Content>
									{#each Object.entries(typeLabels) as [value, label] (value)}
										<Select.Item {value}>{label}</Select.Item>
									{/each}
								</Select.Content>
							</Select.Root>
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				</div>

				{#if typeValue === 'NUMBER'}
					<div class="w-[100%] flex gap-2">
						<Form.Field name="numberMin" form={updateTaxonomy}>
							<Form.Control>
								<Form.Label>Min</Form.Label>
								<Input name="numberMin" type="number" bind:value={$updateTaxonomyData.numberMin} />
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>
						<Form.Field name="numberMax" form={updateTaxonomy}>
							<Form.Control>
								<Form.Label>Max</Form.Label>
								<Input name="numberMax" type="number" bind:value={$updateTaxonomyData.numberMax} />
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>
						<Form.Field name="numberUnit" form={updateTaxonomy}>
							<Form.Control>
								<Form.Label>Unité</Form.Label>
								<Input name="numberUnit" type="text" bind:value={$updateTaxonomyData.numberUnit} />
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>
					</div>
				{/if}

				<div class="w-[100%] flex items-center space-x-2">
					<Checkbox id="multiple" bind:checked={$updateTaxonomyData.multiple} name="multiple" />
					<Label for="multiple">Sélection multiple sur un produit</Label>
				</div>
			</div>
			<input type="hidden" name="id" value={id} />
			<Button type="submit">Save changes</Button>
		</form>
	</div>
</div>

<div class="ccc w-[100%]">
	<Table
		name="Valeurs"
		columns={valueColumns}
		data={valuesData}
		actions={valueActions}
		addLink={`/admin/products/taxonomies/${id}/values/create`}
	/>
</div>
