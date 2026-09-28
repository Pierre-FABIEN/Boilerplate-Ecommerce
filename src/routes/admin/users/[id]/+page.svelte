<!-- src/routes/dashboard/users/[id]/+page.svelte -->
<script lang="ts">
	import { untrack } from 'svelte';
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { updateUserAndAddressSchema } from '$lib/schema/addresses/updateUserAndAddressSchema.js';
	// Importation des composants nécessaires de Shadcn
	import * as Form from '$shadcn/form';
	import * as DropdownMenu from '$shadcn/dropdown-menu';
	import { Input } from '$shadcn/input';
	import { Button } from '$shadcn/button';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';
	import AddressAutocomplete from '$lib/components/addresses/AddressAutocomplete.svelte';
	import type { AddressSuggestion } from '$lib/addresses/types';

	let { data } = $props();

	const updateUserAndAddresses = superForm(
		untrack(() => data.IupdateUserAndAddressSchema),
		{
			validators: zodClient(updateUserAndAddressSchema),
			id: 'updateUserAndAddresses',
			dataType: 'json',
			onResult: (event) => {
				if (
					event.result.type === 'success' &&
					event.result.data?.form.message === 'User and addresses updated successfully'
				) {
					toast.success(event.result.data.form.message);
					setTimeout(() => goto('/admin/users'), 0);
				}
			}
		}
	);

	const { form, enhance } = updateUserAndAddresses;

	function handleAddressSelect(suggestion: AddressSuggestion, index: number) {
		$form.addresses[index].street_number = suggestion.street_number;
		$form.addresses[index].street = suggestion.street;
		$form.addresses[index].city = suggestion.city;
		$form.addresses[index].county = suggestion.county;
		$form.addresses[index].state = suggestion.state;
		$form.addresses[index].state_code = suggestion.state_code;
		$form.addresses[index].zip = suggestion.zip;
		$form.addresses[index].country = suggestion.country;
		$form.addresses[index].country_code = suggestion.country_code;
		$form.addresses[index].stateLetter = suggestion.stateLetter;
		$form.addresses[index].ISO_3166_1_alpha_3 = suggestion.ISO_3166_1_alpha_3;
	}

	const roleOptions = ['ADMIN', 'CLIENT'] as const;
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
							{#each roleOptions as option (option)}
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
				{#each $form.addresses as address, index (address.id)}
					<div class="address-form rounded border m-5 p-5 min-w-[500px]">
						<div class="mb-4">
							<AddressAutocomplete
								id={`address-search-${index}`}
								name={`address_search_${index}`}
								onSelect={(suggestion) => handleAddressSelect(suggestion, index)}
							/>
						</div>
						<!-- Prénom -->
						<Form.Field name="addresses[{index}].first_name" form={updateUserAndAddresses}>
							<Form.Control>
								<Form.Label>Prénom</Form.Label>
								<Input name="first_name" type="text" bind:value={address.first_name} />
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>

						<!-- Nom -->
						<Form.Field name="addresses[{index}].last_name" form={updateUserAndAddresses}>
							<Form.Control>
								<Form.Label>Nom</Form.Label>
								<Input name="last_name" type="text" bind:value={address.last_name} />
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>

						<!-- Téléphone -->
						<Form.Field name="addresses[{index}].phone" form={updateUserAndAddresses}>
							<Form.Control>
								<Form.Label>Téléphone</Form.Label>
								<Input name="phone" type="tel" bind:value={address.phone} />
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>

						<!-- Entreprise -->
						<Form.Field name="addresses[{index}].company" form={updateUserAndAddresses}>
							<Form.Control>
								<Form.Label>Entreprise</Form.Label>
								<Input name="company" type="text" bind:value={address.company} />
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>

						<!-- Numéro de rue -->
						<Form.Field name="addresses[{index}].street_number" form={updateUserAndAddresses}>
							<Form.Control>
								<Form.Label>Numéro</Form.Label>
								<Input name="street_number" type="text" bind:value={address.street_number} />
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>

						<!-- Rue -->
						<Form.Field name="addresses[{index}].street" form={updateUserAndAddresses}>
							<Form.Control>
								<Form.Label>Rue</Form.Label>
								<Input name="street" type="text" bind:value={address.street} />
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>

						<!-- Ville -->
						<Form.Field name="addresses[{index}].city" form={updateUserAndAddresses}>
							<Form.Control>
								<Form.Label>Ville</Form.Label>
								<Input name="city" type="text" bind:value={address.city} />
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>

						<!-- Code postal -->
						<Form.Field name="addresses[{index}].zip" form={updateUserAndAddresses}>
							<Form.Control>
								<Form.Label>Code Postal</Form.Label>
								<Input name="zip" type="text" bind:value={address.zip} />
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>

						<!-- Pays -->
						<Form.Field name="addresses[{index}].country" form={updateUserAndAddresses}>
							<Form.Control>
								<Form.Label>Pays</Form.Label>
								<Input name="country" type="text" bind:value={address.country} />
							</Form.Control>
							<Form.FieldErrors />
						</Form.Field>

						<input type="hidden" name="id" bind:value={address.id} />
						{#each Object.keys(address) as key (key)}
							<input type="hidden" name={key} value={address[key as keyof typeof address] ?? ''} />
						{/each}

						<input type="hidden" name={`addresses[${index}].id`} bind:value={address.id} />
					</div>
				{/each}
			</div>
			<Button type="submit">Save changes</Button>
		</form>

		<div class="mt-8">
			<h2 class="text-xl font-bold mb-2">Sessions actives</h2>
			<p class="text-sm text-muted-foreground mb-4">
				Lecture seule — la déconnexion à distance d'un compte se fait par « Supprimer le compte » ou
				en attendant l'expiration naturelle de la session.
			</p>
			{#if data.sessions.length === 0}
				<p class="text-sm text-muted-foreground">Aucune session active.</p>
			{:else}
				<table class="w-full text-sm border-collapse">
					<thead>
						<tr class="border-b text-left">
							<th class="py-2 pr-4">Appareil</th>
							<th class="py-2 pr-4">Localisation</th>
							<th class="py-2 pr-4">IP</th>
							<th class="py-2 pr-4">Dernière activité</th>
							<th class="py-2">Ouverte le</th>
						</tr>
					</thead>
					<tbody>
						{#each data.sessions as session (session.id)}
							<tr class="border-b">
									<td class="py-2 pr-4">
										{#if session.device}
											{session.device}
										{:else}
											<span class="text-muted-foreground italic"
												>Non disponible (session pré-existante)</span
											>
										{/if}
									</td>
								<td class="py-2 pr-4">
									{[session.city, session.country].filter(Boolean).join(', ') || '—'}
								</td>
								<td class="py-2 pr-4">{session.ipAddress ?? '—'}</td>
								<td class="py-2 pr-4">{new Date(session.lastActiveAt).toLocaleString('fr-FR')}</td>
								<td class="py-2">{new Date(session.createdAt).toLocaleString('fr-FR')}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>
	</div>
</div>
