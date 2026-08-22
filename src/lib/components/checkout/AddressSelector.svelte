<script lang="ts">
	import * as Popover from '$shadcn/popover/index.js';
	import * as Command from '$shadcn/command/index.js';
	import Button from '$shadcn/button/button.svelte';
	import { MapPin, Check, ChevronsUpDown } from 'lucide-svelte';
	import { tick } from 'svelte';

	interface Props {
		addresses: any[];
		selectedAddressId?: string;
		onAddressSelect: (addressId: string) => void;
	}

	let { addresses, selectedAddressId, onAddressSelect } = $props();

	let addressOpen = $state(false);
	let addressTriggerRef = $state<HTMLButtonElement>(null!);

	// Adresse sélectionnée formatée pour le bouton
	const addressLabel = $derived(
		selectedAddressId
			? (() => {
					const address = addresses.find((a: any) => a.id === selectedAddressId);
					return address
						? `${address.first_name} ${address.last_name} — ${address.street}, ${address.city}`
						: 'Sélectionnez une adresse…';
				})()
			: 'Sélectionnez une adresse…'
	);

	/** Ferme le popover et restaure le focus (accessibilité) */
	function closeAddressPopover() {
		addressOpen = false;
		tick().then(() => addressTriggerRef?.focus());
	}

	function handleAddressSelect(addressId: string) {
		onAddressSelect(addressId);
		closeAddressPopover();
	}
</script>

<div class="rounded-lg border bg-card text-card-foreground shadow-sm">
	<div class="p-6 flex flex-col space-y-1.5">
		<h3 class="text-2xl font-semibold leading-none tracking-tight flex items-center gap-2">
			<MapPin class="w-5 h-5" />
			Adresse de livraison
		</h3>
	</div>
	<div class="p-6 pt-0">
		<div class="space-y-4">
			{#if addresses?.length > 0}
				<Popover.Root bind:open={addressOpen}>
					<Popover.Trigger bind:ref={addressTriggerRef}>
						{#snippet child({ props })}
							<Button
								variant="outline"
								class="w-full justify-between"
								{...props}
								role="combobox"
								aria-expanded={addressOpen}
								aria-controls="address-combobox"
							>
								{addressLabel}
								<ChevronsUpDown class="opacity-50" />
							</Button>
						{/snippet}
					</Popover.Trigger>

					<Popover.Content class="w-[340px] p-0" id="address-combobox">
						<Command.Root>
							<Command.Input placeholder="Rechercher…" />

							<Command.List>
								<Command.Empty>Aucun résultat.</Command.Empty>

								<Command.Group value="addresses">
									{#each addresses as address (address.id)}
										<Command.Item
											value={`${address.first_name} ${address.last_name} ${address.street} ${address.city} ${address.country}`}
											onSelect={() => handleAddressSelect(address.id)}
											class="flex flex-col items-start px-2 py-1.5 gap-0.5"
										>
											<Check
												class={`address-${selectedAddressId === address.id ? 'selected' : 'unselected'} ${true ? 'shrink-0' : ''}`}
											/>

											<span class="text-sm">
												{address.first_name} {address.last_name}
											</span>
											<span class="text-xs text-muted-foreground">
												{address.street}, {address.city} {address.zip}, {address.country}
											</span>
										</Command.Item>
									{/each}
								</Command.Group>
							</Command.List>
						</Command.Root>
					</Popover.Content>
				</Popover.Root>
			{:else}
				<p class="text-muted-foreground">Aucune adresse renseignée.</p>
			{/if}

			<!-- AUTH-PLUGIN ▼ la gestion des adresses vit dans l'espace compte
			     (`/auth/settings/address`). Sans authentification, proposer un
			     formulaire d'adresse directement dans le tunnel de commande. -->
			<Button variant="outline" class="w-full">
				<a
					data-sveltekit-preload-data
					href="/auth/settings/address"
					class="flex items-center gap-2"
				>
					<MapPin class="w-4 h-4" />
					Créer une adresse
				</a>
			</Button>
			<!-- AUTH-PLUGIN ▲ -->
		</div>
	</div>
</div>
