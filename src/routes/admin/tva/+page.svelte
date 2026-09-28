<script lang="ts">
	import { untrack } from 'svelte';
	import { Button } from '$shadcn/button';
	import { Input } from '$shadcn/input';
	import * as Form from '$shadcn/form';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { RETRY_FRIENDLY_FORM } from '$lib/forms/superformOptions';
	import { vatRateSchema } from '$lib/schema/settings/vatSchema';

	let { data } = $props();

	const vatForm = superForm(
		untrack(() => data.vatForm),
		{
			validators: zodClient(vatRateSchema),
			id: 'vatRate',
			...RETRY_FRIENDLY_FORM
		}
	);
	const { form: vatFormData, enhance: vatEnhance, message: vatMessage } = vatForm;

	$effect(() => {
		if ($vatMessage) toast.success($vatMessage);
	});
</script>

<svelte:head>
	<title>Taux de TVA — Admin</title>
</svelte:head>

<div class="px-6 space-y-6 max-w-sm">
	<div>
		<h1 class="text-2xl font-semibold">Taux de TVA</h1>
		<p class="text-sm text-muted-foreground">
			Appliqué à tout le catalogue (prix TTC, factures). Vérifiez le taux applicable à vos produits
			avant de le modifier — voir <code>CONFORMITE_ECOMMERCE.md</code>.
		</p>
	</div>

	<form method="POST" use:vatEnhance class="flex items-end gap-3">
		<Form.Field name="vatRatePercent" form={vatForm} class="flex-1">
			<Form.Control>
				<Form.Label>Taux (%)</Form.Label>
				<Input
					name="vatRatePercent"
					type="number"
					step="0.1"
					min="0"
					max="100"
					bind:value={$vatFormData.vatRatePercent}
				/>
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>
		<Button type="submit">Enregistrer</Button>
	</form>
</div>
