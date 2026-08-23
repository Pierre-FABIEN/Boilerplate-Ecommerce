<!-- src/routes/dashboard/users/[id]/+page.svelte -->
<script lang="ts">
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { updateUserAndAddressSchema } from '$lib/schema/addresses/updateUserAndAddressSchema.js';
	// Importation des composants nécessaires de Shadcn
	import * as Form from '$shadcn/form';
	import * as DropdownMenu from '$shadcn/dropdown-menu';
	import * as Select from '$shadcn/select';
	import { Input } from '$shadcn/input';
	import { Card } from '$shadcn/card';
	import ScrollArea from '$shadcn/scroll-area/scroll-area.svelte';
	import { Button } from '$shadcn/button';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';

	let { data } = $props();

	const updateUserAndAddresses = superForm(data.IupdateUserAndAddressSchema, {
		validators: zodClient(updateUserAndAddressSchema),
		id: 'updateUserAndAddresses',
		dataType: 'json',
		onResult: (data) => {
			if (data.result.data.form.message === 'User and addresses updated successfully') {
				toast.success(data.result.data.form.message);
				setTimeout(() => goto('/admin/users'), 0);
			}
		}
	});

	const { form, enhance, message } = updateUserAndAddresses;

	let addressSuggestions: any[] = $state([]);

	let selectedAddressIndex: number | null = $state(null);
	let timeoutId: ReturnType<typeof setTimeout>;

	async function fetchAddressSuggestions(query: string) {
		if (query.length < 3) {
			addressSuggestions = [];
			return;
		}

		try {
			const response = await fetch(`/api/open-cage-data?q=${encodeURIComponent(query)}`);
			const { suggestions } = await response.json();

			if (Array.isArray(suggestions) && suggestions.length > 0) {
				addressSuggestions = suggestions;
			} else {
				addressSuggestions = []; // Aucun résultat
			}
		} catch (error) {
			console.error('Error fetching address suggestions:', error);
			addressSuggestions = [];
		}
	}

	function selectSuggestion(suggestion: any, index: number) {
		// Conversion en objet standard
		const components = JSON.parse(JSON.stringify(suggestion.components));

		// Mises à jour ciblant l'adresse à la position "index"
		$form.addresses[index].street_number = components.house_number || '';
		$form.addresses[index].street = components.road || '';
		$form.addresses[index].city = components.city || components.town || components.village || '';
		$form.addresses[index].county = components.county || '';
		$form.addresses[index].state = components.state || '';
		$form.addresses[index].state_code = components.state_code || '';
		$form.addresses[index].zip = components.postcode || '';
		$form.addresses[index].country = components.country || '';
		$form.addresses[index].country_code = components.country_code || '';
		$form.addresses[index].stateLetter = components['ISO_3166-1_alpha-2'] || '';
		$form.addresses[index].ISO_3166_1_alpha_3 = components['ISO_3166-1_alpha-3'] || '';

		// Réinitialiser les suggestions
		addressSuggestions = [];
	}

	function handleInput(event: Event) {
		const input = event.target as HTMLInputElement;
		clearTimeout(timeoutId);

		timeoutId = setTimeout(() => {
			fetchAddressSuggestions(input.value);
		}, 1000);
	}

	const roleOptions = ['ADMIN', 'CLIENT'];

</script>

<div class="min-h-screen min-w-[100vw] absolute">
	<div class="container mx-auto p-4">
		<h1 class="text-2xl font-bold mb-4">Update User and Addresses</h1>
		<form method="POST" action="?/updateUserAndAddresses" use:enhance class="space-y-4">
			<Form.Field name="role" form={updateUserAndAddresses}>
				<Form.Control>
					<Form.Label>Role</Form.Label>
					<DropdownMenu.Root>
						<DropdownMenu.Trigger>
							<Button variant="outline">
								{$form.role ? $form.role : 'Select Role'}
							</Button>
						</DropdownMenu.Trigger>
						<DropdownMenu.Content class="w-56">
							<DropdownMenu.Label>Role</DropdownMenu.Label>
							<DropdownMenu.Separator />
							{#each roleOptions as option}
								<DropdownMenu.Item onclick={() => ($form.role = option)}>
									{option}
								</DropdownMenu.Item>
							{/each}
						</DropdownMenu.Content>
					</DropdownMenu.Root>
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field name="isMfaEnabled" form={updateUserAndAddresses}>
				<Form.Control>
					<Form.Label>2FA Activé</Form.Label>
					<input type="checkbox" bind:checked={$form.isMfaEnabled} />
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<Form.Field name="passwordHash" form={updateUserAndAddresses} class="w-[300px]">
				<Form.Control>
					<Form.Label
						>Mot de passe:<br />
						<span style="color: red"
							>Attention, il faut minimum 8 caractères, majuscule, minuscule, chiffre et caractère
							special, exemple: Password0</span
						>
					</Form.Label>
					<Input type="password" bind:value={$form.passwordHash} />
				</Form.Control>
				<Form.FieldErrors />
			</Form.Field>

			<div class="rts">
				{#each $form.addresses as address, index}
					<div class="address-form rounded border m-5 p-5 min-w-[500px]">
						{#if addressSuggestions.length > 0}
							<h2 class="text-xl font-semibold mb-4">Suggestions d'adresse</h2>
							<div class="space-y-4">
								<ScrollArea class="h-[200px]">
									{#each addressSuggestions as suggestion}
										<Card
											class="border border-gray-300 shadow-md hover:shadow-lg transition-shadow p-1"
										>
											<div class="rcb">
												{suggestion.formatted}
												<Button
													class="cursor-pointer"
													onclick={() => selectSuggestion(suggestion, index)}
													onkeydown={(event) =>
														event.code === 'Enter' && selectSuggestion(suggestion, index)}
												>
													Selectionner
												</Button>
											</div>
										</Card>
									{/each}
								</ScrollArea>
							</div>
						{/if}
						<!-- Prénom -->
						<Form.Field name="first_name" form={updateUserAndAddresses}>
							<Form.Control>
								<Form.Label>Prénom</Form.Label>
								<Input name="first_name" type="text" bind:value={address.first_name} />
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>

						<!-- Nom -->
						<Form.Field name="last_name" form={updateUserAndAddresses}>
							<Form.Control>
								<Form.Label>Nom</Form.Label>
								<Input name="last_name" type="text" bind:value={address.last_name} />
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>

						<!-- Téléphone -->
						<Form.Field name="phone" form={updateUserAndAddresses}>
							<Form.Control>
								<Form.Label>Téléphone</Form.Label>
								<Input name="phone" type="tel" bind:value={address.phone} />
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>

						<!-- Entreprise -->
						<Form.Field name="company" form={updateUserAndAddresses}>
							<Form.Control>
								<Form.Label>Entreprise</Form.Label>
								<Input name="company" type="text" bind:value={address.company} />
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>

						<!-- Numéro de rue -->
						<Form.Field name="street_number" form={updateUserAndAddresses}>
							<Form.Control>
								<Form.Label>Numéro</Form.Label>
								<Input name="street_number" type="text" bind:value={address.street_number} />
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>

						<!-- Rue -->
						<Form.Field name="street" form={updateUserAndAddresses}>
							<Form.Control>
								<Form.Label>Rue</Form.Label>
								<Input
									name="street"
									type="text"
									oninput={handleInput}
									bind:value={address.street}
								/>
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>

						<!-- Ville -->
						<Form.Field name="city" form={updateUserAndAddresses}>
							<Form.Control>
								<Form.Label>Ville</Form.Label>
								<Input name="city" type="text" bind:value={address.city} />
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>

						<!-- Code postal -->
						<Form.Field name="zip" form={updateUserAndAddresses}>
							<Form.Control>
								<Form.Label>Code Postal</Form.Label>
								<Input name="zip" type="text" bind:value={address.zip} />
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>

						<!-- Pays -->
						<Form.Field name="country" form={updateUserAndAddresses}>
							<Form.Control>
								<Form.Label>Pays</Form.Label>
								<Input name="country" type="text" bind:value={address.country} />
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>

						<Form.Field name="type" form={updateUserAndAddresses}>
							<Form.Control>
								<Form.Label>Type d'adresse</Form.Label>
								<Select.Root bind:value={address.type} type="single">
									<Select.Trigger class="w-full">
										<span>{address.type || 'Sélectionner un type'}</span>
										<!-- 👈 Affiche la valeur sélectionnée -->
									</Select.Trigger>
									<Select.Content>
										<Select.Item value="SHIPPING">Livraison</Select.Item>
										<Select.Item value="BILLING">Facturation</Select.Item>
									</Select.Content>
								</Select.Root>
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>

						<input type="hidden" name="id" bind:value={address.id} />
						{#each Object.keys(address) as key}
							<input type="hidden" name={key} value={address[key] ?? ''} />
						{/each}

						<input type="hidden" name={`addresses[${index}].id`} bind:value={address.id} />
					</div>
				{/each}
			</div>
			<Button type="submit">Save changes</Button>
		</form>
	</div>
</div>
