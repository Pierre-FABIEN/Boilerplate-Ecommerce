<script lang="ts">
	import { untrack } from 'svelte';
	import { Button } from '$shadcn/button';
	import { Input } from '$shadcn/input';
	import * as Form from '$shadcn/form';
	import { toast } from 'svelte-sonner';
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { RETRY_FRIENDLY_FORM } from '$lib/forms/superformOptions';
	import { deliveryEstimateSchema } from '$lib/schema/settings/deliverySchema';

	let { data } = $props();

	const deliveryForm = superForm(
		untrack(() => data.deliveryForm),
		{
			validators: zodClient(deliveryEstimateSchema),
			id: 'deliveryEstimate',
			...RETRY_FRIENDLY_FORM
		}
	);
	const {
		form: deliveryFormData,
		enhance: deliveryEnhance,
		message: deliveryMessage
	} = deliveryForm;

	$effect(() => {
		if ($deliveryMessage) toast.success($deliveryMessage);
	});
</script>

<svelte:head>
	<title>Délai de livraison — Admin</title>
</svelte:head>

<div class="px-6 space-y-6 max-w-sm">
	<div>
		<h1 class="text-2xl font-semibold">Délai de livraison annoncé</h1>
		<p class="text-sm text-muted-foreground">
			Affiché au client avant validation de commande (Code conso. art. L216-1). Laissez les deux
			champs vides pour ne rien afficher — voir <code>CONFORMITE_ECOMMERCE.md</code>.
		</p>
	</div>

	<form method="POST" use:deliveryEnhance class="flex items-end gap-3">
		<Form.Field name="minDays" form={deliveryForm} class="flex-1">
			<Form.Control>
				<Form.Label>Min (jours)</Form.Label>
				<Input
					name="minDays"
					type="number"
					min="1"
					max="60"
					bind:value={$deliveryFormData.minDays}
				/>
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>
		<Form.Field name="maxDays" form={deliveryForm} class="flex-1">
			<Form.Control>
				<Form.Label>Max (jours)</Form.Label>
				<Input
					name="maxDays"
					type="number"
					min="1"
					max="60"
					bind:value={$deliveryFormData.maxDays}
				/>
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>
		<Button type="submit">Enregistrer</Button>
	</form>
</div>
