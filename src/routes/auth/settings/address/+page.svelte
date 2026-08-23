<!-- File: AddressCards.svelte -->
<script lang="ts">
	/* ───────────────────────────── Imports ───────────────────────────── */
	import * as Card from '$shadcn/card/index.js';
	import { Button } from '$shadcn/button/index.js'; // Shadcn button
	import Plus from 'lucide-svelte/icons/plus';
	import Pencil from 'lucide-svelte/icons/pencil';
	import Trash from 'lucide-svelte/icons/trash';

	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import { deleteAddressSchema } from '$lib/schema/addresses/addressSchema.js';
	import { toast } from 'svelte-sonner';
	import { goto } from '$app/navigation';

	/* ───────────────────────────── Props ─────────────────────────────── */
	let { data } = $props(); // addresses from parent load()
	//console.log('[AddressPage] Data loaded:', data);

	/* ───────────────────────────── Forms ─────────────────────────────── */
	const deleteAddress = superForm(data?.IdeleteAddressSchema ?? {}, {
		validators: zodClient(deleteAddressSchema),
		id: 'deleteAddress'
	});

	const {
		form: deleteAddressData,
		enhance: deleteAddressEnhance,
		message: deleteAddressMessage
	} = deleteAddress;

	/* ───────────────────────────── Effects ───────────────────────────── */
	$effect(() => {
		if ($deleteAddressMessage) {
			//console.log(`[AddressPage] Form message: ${$deleteAddressMessage}`);
			toast($deleteAddressMessage);
		}
	});

	/* ───────────────────────────── Helpers ───────────────────────────── */
	function edit(id: string) {
		//console.log(`[AddressPage] Navigating to edit address ID: ${id}`);
		goto(`/auth/settings/address/${id}`);
	}
	function add() {
		//console.log('[AddressPage] Navigating to create new address.');
		goto('/auth/settings/address/create');
	}
</script>

<!-- ─────────────────────────── Layout ───────────────────────────── -->
<section class="w-[100vw] h-[100%] mx-auto px-4 py-6 space-y-6 ccc">
	<!-- Top bar: title + add button -->
	<div class="max-w-[300px]">
		<h2 class="text-xl font-semibold">Addresses</h2>
		<div class="flex items-center justify-between my-5">
			<Button
				variant="default"
				size="sm"
				class="inline-flex items-center gap-1 w-[100%]"
				onclick={add}
				aria-label="Add address"
			>
				<Plus size="16" /> Add
			</Button>
		</div>

		<!-- Card grid -->
		<div class="ccc">
			{#each data.address ?? [] as address (address.id)}
				<Card.Root class="flex flex-col h-full">
					<Card.Header class="pb-2">
						<Card.Title class="text-lg font-semibold">
							{address.first_name}
							{address.last_name}
						</Card.Title>
						<Card.Description class="text-sm text-muted-foreground">
							{address.company || `${address.street_number} ${address.street}`}
						</Card.Description>
					</Card.Header>

					<Card.Content class="flex-1 py-2 mb-5">
						<ul class="space-y-1 text-sm">
							<li><strong>Phone:</strong> {address.phone}</li>
							<li><strong>Street:</strong> {address.street_number} {address.street}</li>
							<li><strong>City:</strong> {address.zip} {address.city}</li>
							<li><strong>State:</strong> {address.state}</li>
							<li><strong>Country:</strong> {address.country}</li>
						</ul>
					</Card.Content>

					<Card.Footer class="rca w-[100%]">
						<button
							type="button"
							class="inline-flex items-center gap-1 text-primary hover:underline"
							aria-label="Edit address"
							onclick={() => edit(address.id)}
						>
							<Pencil size="16" />
						</button>

						<form
							method="POST"
							action="?/deleteAddress"
							use:deleteAddressEnhance
							class="inline-flex"
						>
							<input type="hidden" name="id" value={address.id} />
							<button
								type="submit"
								class="inline-flex items-center gap-1 text-destructive hover:underline"
								aria-label="Delete address"
								onclick={() => ($deleteAddressData.id = address.id)}
							>
								<Trash size="16" />
							</button>
						</form>
					</Card.Footer>
				</Card.Root>
			{/each}
		</div>
	</div>
</section>
