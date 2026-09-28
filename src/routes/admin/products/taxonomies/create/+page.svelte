<script lang="ts">
	import { untrack } from 'svelte';
	import * as Form from '$shadcn/form';
	import { Input } from '$shadcn/input';
	import { Button } from '$shadcn/button';
	import Checkbox from '$shadcn/checkbox/checkbox.svelte';
	import { Label } from '$shadcn/label';
	import * as Select from '$shadcn/select';
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { RETRY_FRIENDLY_FORM } from '$lib/forms/superformOptions';
	import { createTaxonomySchema } from '$lib/schema/taxonomies/taxonomySchema';
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';

	let { data } = $props();

	const createTaxonomy = superForm(
		untrack(() => data.IcreateTaxonomySchema),
		{
			validators: zodClient(createTaxonomySchema),
			id: 'createTaxonomy',
			...RETRY_FRIENDLY_FORM
		}
	);

	const {
		form: createTaxonomyData,
		enhance: createTaxonomyEnhance,
		message: createTaxonomyMessage
	} = createTaxonomy;

	const typeLabels: Record<string, string> = {
		TEXT: 'Texte',
		COLOR: 'Couleur',
		NUMBER: 'Nombre',
		BOOLEAN: 'Oui / Non',
		DATE: 'Date'
	};

	let typeValue = $derived($createTaxonomyData.type as keyof typeof typeLabels);

	function setTypeValue(value: keyof typeof typeLabels) {
		$createTaxonomyData.type = value as typeof $createTaxonomyData.type;
	}

	// Slug auto-dérivé du nom tant que l'utilisateur ne l'a pas modifié à la main.
	let slugTouched = $state(false);
	function slugify(value: string) {
		return value
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/(^-|-$)/g, '');
	}
	function onNameInput() {
		if (!slugTouched) $createTaxonomyData.slug = slugify($createTaxonomyData.name ?? '');
	}

	$effect(() => {
		if ($createTaxonomyMessage === 'Taxonomy created successfully') {
			toast.success('Taxonomie créée');
			setTimeout(() => goto('/admin/products'), 0);
		}
	});
</script>

<div class="ccc">
	<div class="m-5 p-5 border w-[420px]">
		<form method="POST" action="?/createTaxonomy" use:createTaxonomyEnhance class="space-y-4">
			<div class="ccs mt-5">
				<div class="w-[100%]">
					<Form.Field name="name" form={createTaxonomy}>
						<Form.Control>
							<Form.Label>Nom</Form.Label>
							<Input
								name="name"
								type="text"
								bind:value={$createTaxonomyData.name}
								oninput={onNameInput}
							/>
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				</div>
				<div class="w-[100%]">
					<Form.Field name="slug" form={createTaxonomy}>
						<Form.Control>
							<Form.Label>Slug (paramètre d'URL du filtre catalogue)</Form.Label>
							<Input
								name="slug"
								type="text"
								bind:value={$createTaxonomyData.slug}
								oninput={() => (slugTouched = true)}
							/>
						</Form.Control>
						<Form.FieldErrors />
					</Form.Field>
				</div>
				<div class="w-[100%]">
					<Form.Field name="type" form={createTaxonomy}>
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
						<Form.Field name="numberMin" form={createTaxonomy}>
							<Form.Control>
								<Form.Label>Min</Form.Label>
								<Input name="numberMin" type="number" bind:value={$createTaxonomyData.numberMin} />
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>
						<Form.Field name="numberMax" form={createTaxonomy}>
							<Form.Control>
								<Form.Label>Max</Form.Label>
								<Input name="numberMax" type="number" bind:value={$createTaxonomyData.numberMax} />
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>
						<Form.Field name="numberUnit" form={createTaxonomy}>
							<Form.Control>
								<Form.Label>Unité</Form.Label>
								<Input
									name="numberUnit"
									type="text"
									placeholder="cm"
									bind:value={$createTaxonomyData.numberUnit}
								/>
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>
					</div>
				{/if}

				<div class="w-[100%] flex items-center space-x-2">
					<Checkbox id="multiple" bind:checked={$createTaxonomyData.multiple} name="multiple" />
					<Label for="multiple">Sélection multiple sur un produit</Label>
				</div>
			</div>
			<Button type="submit">Save changes</Button>
		</form>
	</div>
</div>
