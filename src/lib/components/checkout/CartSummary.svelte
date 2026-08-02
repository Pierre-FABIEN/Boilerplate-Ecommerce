<script lang="ts">
	import * as Card from '$shadcn/card/index.js';
	import { ShoppingCart, Trash } from 'lucide-svelte';

	interface Props {
		items: any[];
		subtotal: number;
		tax: number;
		hasCustomItems: boolean;
		shippingCost: number;
		selectedShippingOption: string | null;
		quantityOptions: number[];
		customQuantityOptions: { label: string; value: number }[];
		totalNonCustomQuantity: number;
		canAddQuantity: (newQuantity: number, currentQuantity: number, isCustom: boolean) => boolean;
		getCustomCanPrice: (quantity: number) => number;
		onRemoveFromCart: (productId: string) => void;
		onChangeQuantity: (productId: string, quantity: number, customId?: string) => void;
		discountAmount?: number;
		promoCode?: string;
	}

	let { 
		items, 
		subtotal, 
		tax, 
		hasCustomItems, 
		shippingCost, 
		selectedShippingOption,
		quantityOptions,
		customQuantityOptions,
		totalNonCustomQuantity,
		canAddQuantity,
		getCustomCanPrice,
		onRemoveFromCart,
		onChangeQuantity,
		discountAmount = 0,
		promoCode = ''
	} = $props();

	// État local pour forcer le re-rendu
	let localItems = $state(items);
	let localSubtotal = $state(subtotal);
	let localTax = $state(tax);

	// Calculer le total TTC (remise déduite)
	let totalTTC = $derived(
		Math.max(0, localSubtotal + localTax + shippingCost - discountAmount)
	);

	// Mettre à jour l'état local quand les props changent
	$effect(() => {
		localItems = [...items]; // Créer une nouvelle référence
		localSubtotal = subtotal;
		localTax = tax;
	});

	// Fonction pour forcer la mise à jour
	function forceUpdate() {
		// Cette fonction force le re-rendu du composant
		localItems = [...items];
	}

	// Forcer la mise à jour immédiatement et après un délai
	$effect(() => {
		if (items.length > 0) {
			// Mise à jour immédiate
			forceUpdate();
			
			// Mise à jour après un délai pour s'assurer que le DOM est mis à jour
			setTimeout(() => {
				forceUpdate();
			}, 10);
		}
	});
</script>

<Card.Root>
	<div class="p-6 flex flex-col space-y-1.5">
		<h3
			class="text-2xl font-semibold leading-none tracking-tight flex items-center gap-2"
		>
			<ShoppingCart class="w-5 h-5" />
			Votre panier
		</h3>
	</div>
	<div class="p-6 pt-0">
		{#if localItems.length > 0}
			<div class="space-y-4">
				{#each localItems as item (item.id + '-' + item.quantity)}
					<div class="flex gap-4 p-4 rounded-lg border bg-background">
						<img
							src={(item.custom?.length > 0 && item.custom[0].image) ||
								(Array.isArray(item.product.images)
									? item.product.images[0]
									: item.product.images) ||
								''}
							alt={item.product.name}
							class="w-24 h-24 object-cover rounded-md"
						/>
						<div class="flex-1 space-y-2">
							<div class="flex justify-between">
								<h3 class="font-medium">{item.product.name}</h3>
								<button
									onclick={() => onRemoveFromCart(item.product.id)}
									class="text-destructive hover:text-destructive/80"
								>
									<Trash class="w-4 h-4" />
								</button>
							</div>
							<p class="text-sm text-muted-foreground">
								{#if item.custom?.length > 0}
									{getCustomCanPrice(item.quantity).toFixed(2)}€ l'unité
								{:else}
									{item.product.price.toFixed(2)}€ l'unité
								{/if}
							</p>

							{#if item.custom?.length > 0}
								<!-- Custom items: Use predefined quantity options -->
								<div class="flex gap-2 flex-wrap">
									{#each customQuantityOptions as option}
										<button
											class="px-3 py-1 border rounded text-sm {item.quantity === option.value ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 dark:border-gray-600'}"
											onclick={() => onChangeQuantity(item.product.id, option.value, item.custom[0]?.id)}
										>
											{option.value} {item.quantity === option.value ? '✓' : ''}
										</button>
									{/each}
								</div>
							{:else}
								<!-- Non-custom items: Use buttons with quantity limit -->
								<div class="flex gap-2">
									{#each quantityOptions as option}
										<button
											class="px-3 py-1 border rounded text-sm {item.quantity === option ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 dark:border-gray-600'} {!canAddQuantity(option, item.quantity, false) ? 'opacity-50 cursor-not-allowed' : ''}"
											onclick={() => canAddQuantity(option, item.quantity, false) && onChangeQuantity(item.product.id, option)}
											disabled={!canAddQuantity(option, item.quantity, false)}
										>
											{option}
										</button>
									{/each}
								</div>
								{#if totalNonCustomQuantity > 72}
									<p class="text-xs text-red-500 mt-1">Limite de 72 unités atteinte pour les commandes non-personnalisées</p>
								{/if}
							{/if}

							<p class="text-right font-medium">
								{#if item.custom?.length > 0}
									{(getCustomCanPrice(item.quantity) * item.quantity).toFixed(2)}€
								{:else}
									{(item.price * item.quantity).toFixed(2)}€
								{/if}
							</p>
						</div>
					</div>
				{/each}
			</div>

			<div class="mt-6 space-y-4 rounded-lg border p-4 bg-muted/50">
				<div class="flex justify-between text-sm">
					<span>Sous-total (HT)</span>
					<span>{localSubtotal.toFixed(2)}€</span>
				</div>
				<div class="flex justify-between text-sm">
					<span>Livraison</span>
					<span>
						{hasCustomItems 
							? 'Gratuit (commande personnalisée)'
							: shippingCost > 0
								? shippingCost.toFixed(2) + '€'
								: selectedShippingOption
									? 'En cours...'
									: 'Non sélectionné'}
					</span>
				</div>
				<div class="flex justify-between text-sm">
					<span>TVA (5,5%)</span>
					<span>{localTax.toFixed(2)}€</span>
				</div>
				{#if discountAmount > 0}
					<div class="flex justify-between text-sm text-green-600">
						<span>Remise {promoCode ? `(${promoCode})` : ''}</span>
						<span>-{discountAmount.toFixed(2)}€</span>
					</div>
				{/if}
				<div class="flex justify-between text-lg font-semibold pt-2 border-t">
					<span>Total TTC</span>
					<span>{totalTTC.toFixed(2)}€</span>
				</div>
			</div>
		{:else}
			<div class="text-center py-8">
				<ShoppingCart class="w-12 h-12 mx-auto text-muted-foreground mb-4" />
				<p class="text-muted-foreground">Votre panier est vide.</p>
			</div>
		{/if}
	</div>
</Card.Root>
