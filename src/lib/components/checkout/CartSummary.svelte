<script lang="ts">
	import { untrack } from 'svelte';
	import * as Card from '$shadcn/card/index.js';
	import { ShoppingCart, Trash } from 'lucide-svelte';
	import { optimizedImageUrl } from '$lib/utils/cloudinaryUrl';
	import QuantityInput from '$lib/components/QuantityInput.svelte';
	import { getCustomCanPrice, type OrderItem } from '$lib/store/Data/cartStore';

	interface Props {
		items: OrderItem[];
		subtotal: number;
		tax: number;
		hasCustomItems: boolean;
		shippingCost: number;
		selectedShippingOption: string | null;
		totalNonCustomQuantity: number;
		onRemoveFromCart: (productId: string, customId?: string, variantId?: string) => void;
		onChangeQuantity: (
			productId: string,
			quantity: number,
			customId?: string,
			variantId?: string
		) => void;
		discountAmount?: number;
		promoCode?: string;
		vatRate?: number;
	}

	let {
		items,
		subtotal,
		tax,
		hasCustomItems,
		shippingCost,
		selectedShippingOption,
		totalNonCustomQuantity,
		onRemoveFromCart,
		onChangeQuantity,
		discountAmount = 0,
		promoCode = '',
		vatRate = 0.055
	}: Props = $props();

	// §3.1 de l'audit : le libellé suivait le vrai taux configuré côté calcul
	// (`tax`) mais restait figé au texte "5,5%".
	let vatRatePercent = $derived(vatRate * 100);

	// Borne haute du champ libre : stock dispo, et pour le non-custom, le
	// reliquat sous le plafond global de 72 unités (pas de plafond en custom).
	function maxQuantityFor(item: OrderItem, isCustom: boolean): number {
		const stockLimit = item.variant?.stock ?? item.product.stock;
		if (isCustom) return stockLimit;

		const otherItemsQuantity = totalNonCustomQuantity - item.quantity;
		return Math.max(0, Math.min(stockLimit, 72 - otherItemsQuantity));
	}

	// État local pour forcer le re-rendu
	let localItems = $state(untrack(() => items));
	let localSubtotal = $state(untrack(() => subtotal));
	let localTax = $state(untrack(() => tax));

	// Calculer le total TTC (remise déduite)
	let totalTTC = $derived(Math.max(0, localSubtotal + localTax + shippingCost - discountAmount));

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
		<h3 class="text-2xl font-semibold leading-none tracking-tight flex items-center gap-2">
			<ShoppingCart class="w-5 h-5" />
			Votre panier
		</h3>
	</div>
	<div class="p-6 pt-0">
		{#if localItems.length > 0}
			<div class="space-y-4">
				{#each localItems as item (item.id + '-' + item.quantity)}
					{@const isCustomItem = Boolean((item.custom?.length ?? 0) > 0)}
					<div class="flex gap-4 p-4 rounded-lg border bg-background">
						<img
							src={optimizedImageUrl(
								((item.custom?.length ?? 0) > 0 && item.custom?.[0]?.image) ||
									(Array.isArray(item.product.images)
										? item.product.images[0]
										: item.product.images) ||
									'',
								100
							)}
							alt={item.product.name}
							class="w-24 h-24 object-cover rounded-md"
						/>
						<div class="flex-1 space-y-2">
							<div class="flex justify-between">
								<h3 class="font-medium">
									{item.product.name}
									{#if item.variant}
										<span class="text-sm font-normal text-muted-foreground"
											>— {item.variant.label}</span
										>
									{/if}
								</h3>
								<button
									onclick={() =>
										onRemoveFromCart(item.product.id, item.custom?.[0]?.id, item.variant?.id)}
									aria-label="Retirer {item.product.name} du panier"
									class="text-destructive hover:text-destructive/80"
								>
									<Trash class="w-4 h-4" />
								</button>
							</div>
							<p class="text-sm text-muted-foreground">
								{#if (item.custom?.length ?? 0) > 0}
									{getCustomCanPrice(item.quantity).toFixed(2)}€ l'unité
								{:else}
									{(item.variant?.price ?? item.product.price).toFixed(2)}€ l'unité
								{/if}
							</p>

							<QuantityInput
								value={item.quantity}
								max={maxQuantityFor(item, isCustomItem)}
								onCommit={(v) =>
									onChangeQuantity(item.product.id, v, item.custom?.[0]?.id, item.variant?.id)}
							/>
							{#if !isCustomItem && totalNonCustomQuantity > 72}
								<p class="text-xs text-red-500 mt-1">
									Limite de 72 unités atteinte pour les commandes non-personnalisées
								</p>
							{/if}

							<p class="text-right font-medium">
								{#if (item.custom?.length ?? 0) > 0}
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
					<span>TVA ({vatRatePercent.toLocaleString('fr-FR')}%)</span>
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
