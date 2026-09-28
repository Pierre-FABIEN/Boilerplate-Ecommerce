<script lang="ts">
	import { untrack } from 'svelte';
	import * as Form from '$shadcn/form';
	import { Button } from '$shadcn/button';
	import { Input } from '$shadcn/input';
	import { toast } from 'svelte-sonner';
	import AddressAutocomplete from '$lib/components/addresses/AddressAutocomplete.svelte';
	import type { AddressSuggestion } from '$lib/addresses/types';

	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { RETRY_FRIENDLY_FORM } from '$lib/forms/superformOptions';

	import { goto } from '$app/navigation';
	import { updateAddressSchema } from '$lib/schema/addresses/addressSchema.js';

	let { data } = $props();

	//console.log(data);

	const updateAddress = superForm(
		untrack(() => data.IupdateAddressSchema),
		{
			validators: zodClient(updateAddressSchema),
			id: 'updateAddress',
			...RETRY_FRIENDLY_FORM
		}
	);

	const {
		form: updateAddressData,
		enhance: updateAddressEnhance,
		message: updateAddressMessage
	} = updateAddress;

	$effect(() => {
		$updateAddressData.id = data.IupdateAddressSchema?.data.id;
	});

	function handleAddressSelect(suggestion: AddressSuggestion) {
		$updateAddressData.street_number = suggestion.street_number;
		$updateAddressData.street = suggestion.street;
		$updateAddressData.city = suggestion.city;
		$updateAddressData.county = suggestion.county;
		$updateAddressData.state = suggestion.state;
		$updateAddressData.state_code = suggestion.state_code;
		$updateAddressData.zip = suggestion.zip;
		$updateAddressData.country = suggestion.country;
		$updateAddressData.country_code = suggestion.country_code;
		$updateAddressData.stateLetter = suggestion.stateLetter;
		$updateAddressData.ISO_3166_1_alpha_3 = suggestion.ISO_3166_1_alpha_3;
	}

	$effect(() => {
		//console.log($updateAddressMessage);

		if ($updateAddressMessage === 'Address updated successfully') {
			toast.success($updateAddressMessage);
			setTimeout(() => goto('/auth/settings/address'), 0);
		}
	});
</script>

<div class="w-[100vw] h-[100%] mx-auto px-4 py-6 space-y-6 ccc my-10">
	<h1 class="text-4xl font-s text-[#fe3d00]">Update the address</h1>

	<div class="mb-6">
		<AddressAutocomplete onSelect={handleAddressSelect} />
	</div>

	<form method="POST" action="?/updateAddress" use:updateAddressEnhance>
		<!-- Prénom -->
		<Form.Field name="first_name" form={updateAddress}>
			<Form.Control>
				<Form.Label>Prénom</Form.Label>
				<Input name="first_name" type="text" bind:value={$updateAddressData.first_name} />
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>

		<!-- Nom -->
		<Form.Field name="last_name" form={updateAddress}>
			<Form.Control>
				<Form.Label>Nom</Form.Label>
				<Input name="last_name" type="text" bind:value={$updateAddressData.last_name} />
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>

		<!-- Téléphone -->
		<Form.Field name="phone" form={updateAddress}>
			<Form.Control>
				<Form.Label>Téléphone</Form.Label>
				<Input name="phone" type="tel" bind:value={$updateAddressData.phone} />
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>

		<!-- Entreprise -->
		<Form.Field name="company" form={updateAddress}>
			<Form.Control>
				<Form.Label>Entreprise</Form.Label>
				<Input name="company" type="text" bind:value={$updateAddressData.company} />
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>

		<!-- Numéro de rue -->
		<Form.Field name="street_number" form={updateAddress}>
			<Form.Control>
				<Form.Label>Numéro</Form.Label>
				<Input name="street_number" type="text" bind:value={$updateAddressData.street_number} />
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>

		<!-- Rue -->
		<Form.Field name="street" form={updateAddress}>
			<Form.Control>
				<Form.Label>Rue</Form.Label>
				<Input name="street" type="text" bind:value={$updateAddressData.street} />
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>

		<!-- Ville -->
		<Form.Field name="city" form={updateAddress}>
			<Form.Control>
				<Form.Label>Ville</Form.Label>
				<Input name="city" type="text" bind:value={$updateAddressData.city} />
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>

		<!-- Code postal -->
		<Form.Field name="zip" form={updateAddress}>
			<Form.Control>
				<Form.Label>Code Postal</Form.Label>
				<Input name="zip" type="text" bind:value={$updateAddressData.zip} />
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>

		<!-- Pays -->
		<Form.Field name="country" form={updateAddress}>
			<Form.Control>
				<Form.Label>Pays</Form.Label>
				<Input name="country" type="text" bind:value={$updateAddressData.country} />
			</Form.Control>
			<Form.FieldErrors />
		</Form.Field>

		<input type="hidden" name="id" bind:value={$updateAddressData.id} />
		{#each Object.keys($updateAddressData) as key (key)}
			<input
				type="hidden"
				name={key}
				value={$updateAddressData[key as keyof typeof $updateAddressData] ?? ''}
			/>
		{/each}
		<div class="mt-6">
			<Button type="submit">update address</Button>
		</div>
	</form>
</div>
