<script lang="ts">
	// COMMERCE-PLUGIN : UI du tunnel. SENDCLOUD = carte / options. PROMO = champ code.
	import maplibregl from 'maplibre-gl';

	import * as Card from '$shadcn/card/index.js';
	import { loadStripe } from '@stripe/stripe-js';
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import SmoothScrollBar from '$lib/components/smoothScrollBar/SmoothScrollBar.svelte';
	import AddressSelector from '$lib/components/checkout/AddressSelector.svelte';
	import ShippingOptions from '$lib/components/checkout/ShippingOptions.svelte';
	import ServicePointMap from '$lib/components/checkout/ServicePointMap.svelte';
	import CartSummary from '$lib/components/checkout/CartSummary.svelte';
	import PromoCodeInput from '$lib/components/checkout/PromoCodeInput.svelte'; // PROMO-PLUGIN
	import {
		CreditCard
	} from 'lucide-svelte';
	import Button from '$shadcn/button/button.svelte';
	import { OrderSchema } from '$lib/schema/order/order.js';
	import { toast } from 'svelte-sonner';
	import {
		cart as cartStore,
		removeFromCart,
		setShippingCostHT,
		updateCartItemQuantity
	} from '$lib/store/Data/cartStore';
	import SEO from '$lib/components/SEO.svelte';
	
	let { data } = $props();

	// Options de quantité pour les articles non-personnalisés
	let quantityOptions = $state([24, 48, 72]);

	// Options de quantité pour les articles personnalisés
	let customQuantityOptions = $state([
		{ label: '24 packs de 24 canettes (576 unités)', value: 576 },
		{ label: '1/4 de palette : 30 packs (720 unités)', value: 720 },
		{ label: '1/2 palette : 60 packs (1 440 unités)', value: 1440 },
		{ label: '1 palette : 120 packs (2 880 unités)', value: 2880 },
		{ label: '3 palettes : 360 packs (8 640 unités)', value: 8640 }
	]);

	// Calculer le total des quantités pour les commandes non-personnalisées
	let totalNonCustomQuantity = $derived(
		$cartStore.items
			.filter(item => !item.custom || (Array.isArray(item.custom) && item.custom.length === 0))
			.reduce((acc, item) => acc + item.quantity, 0)
	);

	// Fonction pour vérifier si on peut ajouter une quantité
	function canAddQuantity(newQuantity: number, currentQuantity: number, isCustom: boolean): boolean {
		if (isCustom) return true; // Pas de limite pour les personnalisées
		
		const otherItemsQuantity = totalNonCustomQuantity - currentQuantity;
		return (otherItemsQuantity + newQuantity) <= 72;
	}

	// Fonction pour calculer le prix des canettes personnalisées
	function getCustomCanPrice(quantity: number): number {
		switch (quantity) {
			case 576:
				return 1.60;
			case 720:
				return 1.40;
			case 1440:
				return 0.99;
			case 2880:
				return 0.79;
			case 8640:
				return 0.69;
			default:
				return 1.60;
		}
	}

	// Runes Svelte 5
	let stripe = $state(null);
	let selectedAddressId = $state<string | undefined>(undefined);

	// Plus de cartValue local, on utilise $cartStore directement.
	let shippingOptions = $state<any[]>([]);
	let selectedShippingOption = $state<string | null>(null);
	let shippingCost = $state<number>(0);

	let servicePoints = $state<any[]>([]);
	let isLoadingServicePoints = $state(false); // ✅ Nouvel état de chargement

	let zoom = $state(12);
	let centerCoordinates = $state<[number, number]>([2.3522, 48.8566]);
	let selectedPoint = $state<any>(null);
	let showMap = $state(false);

	// Code promo
	let promoCode = $state('');
	let discountAmount = $state(0);

	// Total TTC des produits (hors frais de port) — base de calcul de la remise
	let productTotalTTC = $derived($cartStore.subtotal + $cartStore.tax);

	let totalTTC = $derived(
		Math.max(0, $cartStore.subtotal + $cartStore.tax + shippingCost - discountAmount)
	);

	function resetPromo() {
		promoCode = '';
		discountAmount = 0;
	}

	function handlePromoApplied(code: string, discount: number) {
		promoCode = code;
		discountAmount = discount;
	}

	// Détecter si la commande contient des canettes personnalisées
	let hasCustomItems = $derived($cartStore.items.some(item => item.custom?.length > 0));
	
	// Si la commande contient des personnalisations, on désactive la livraison
	$effect(() => {
		if (hasCustomItems) {
			shippingOptions = [];
			selectedShippingOption = 'no_shipping';
			shippingCost = 0;
			showMap = false;
			selectedPoint = null;
		}
	});

	// Surveiller les changements du panier pour recharger les options de livraison
	$effect(() => {
		if (selectedAddressId && !hasCustomItems && $cartStore.items.length > 0) {
			// Recharger les options de livraison quand le panier change
			fetchSendcloudShippingOptions();
		}
	});

	// Offset pour la popup (optionnel, reprenant l'exemple maplibre)
	let offset = $state(24);
	let offsets: maplibregl.Offset = $derived({
		top: [0, offset],
		bottom: [0, -offset],
		left: [offset + 12, 0],
		right: [-offset - 12, 0],
		center: [0, 0],
		'top-left': [offset, offset],
		'top-right': [-offset, offset],
		'bottom-left': [offset, -offset],
		'bottom-right': [-offset, -offset]
	});

	// superForm
	let createPayment = superForm(data.IOrderSchema, {
		validators: zodClient(OrderSchema),
		id: 'createPayment',
		resetForm: true
	});

	const { form: createPaymentData, enhance: createPaymentEnhance } = createPayment;

	/**
	 * Effect: whenever we "read" servicePoints, if it's non-empty,
	 * we recenter the map on the first point. This replaces onMount usage.
	 */
	$effect(() => {
		if (servicePoints.length > 0) {
			centerCoordinates = [servicePoints[0].longitude, servicePoints[0].latitude];
		}
	});

	$effect(() => {
		if (selectedPoint) {
			$createPaymentData.servicePointId = selectedPoint.id.toString();
			$createPaymentData.servicePointPostNumber = selectedPoint.extra_data?.shop_ref || '';
			$createPaymentData.servicePointLatitude = selectedPoint.latitude;
			$createPaymentData.servicePointLongitude = selectedPoint.longitude;
			$createPaymentData.servicePointType = selectedPoint.shop_type || null;
			$createPaymentData.servicePointExtraRefCab = selectedPoint.extra_data?.ref_cab || '';
			$createPaymentData.servicePointExtraShopRef = selectedPoint.extra_data?.shop_ref || '';
		} else {
			// Réinitialisation si aucun point sélectionné
			$createPaymentData.servicePointId = '';
			$createPaymentData.servicePointPostNumber = '';
			$createPaymentData.servicePointLatitude = '';
			$createPaymentData.servicePointLongitude = '';
			$createPaymentData.servicePointType = null;
			$createPaymentData.servicePointExtraRefCab = '';
			$createPaymentData.servicePointExtraShopRef = '';
		}
	});

	/**
	 * Called when the user clicks a marker. We set our local selectedPoint,
	 * then call onSelect(point). This is a callback-prop approach
	 * instead of an event dispatcher.
	 */
	function handleMarkerClick(point: any) {
		// Plus besoin de validation, l'API filtre déjà les points relais compatibles
		selectedPoint = point;
	}

	$effect(() => {
		(async () => {
			stripe = await loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
		})();
	});

	// Helper function to get selected address
	function getSelectedAddress() {
		return data.addresses?.find((a) => a.id === selectedAddressId);
	}

	// Helper function to reset shipping state
	function resetShippingState() {
		selectedShippingOption = null;
		shippingCost = 0;
		shippingOptions = [];
		showMap = false;
		selectedPoint = null;
		servicePoints = [];
	}

	function selectAddress(addressId: string) {
		selectedAddressId = addressId;

		resetShippingState();

		// Ne pas récupérer les options de livraison si la commande contient des personnalisations
		if (!hasCustomItems) {
			fetchSendcloudShippingOptions();
		}
	}

	// Calcul dynamique du poids, directement depuis $cartStore
	function computeTotalWeight() {
		return $cartStore.items.reduce((acc, item) => {
			const baseWeight = item.quantity * 0.125;
			const customExtra = (item.custom?.length ?? 0) > 0 ? 0.666 : 0;
			return acc + baseWeight + customExtra;
		}, 0);
	}

	function computeTotalQuantity() {
		return $cartStore.items.reduce((acc, item) => acc + item.quantity, 0);
	}

	async function fetchSendcloudShippingOptions() {
		const selectedAddress = getSelectedAddress();
		if (!selectedAddress) {
			toast.error('Veuillez sélectionner une adresse.');
			return;
		}
		if (!$cartStore.items.length) {
			toast.error('Votre panier est vide.');
			return;
		}

		try {
			// Calculer le poids et la quantité totaux
			const totalWeight = computeTotalWeight();
			const totalQuantity = computeTotalQuantity();

			// Préparer la requête pour Sendcloud
			const requestBody = {
				from_country_code: 'FR',                        // Expéditeur (toujours France)
				to_country_code: selectedAddress.stateLetter,    // ex: 'FR'
				from_postal_code: '31620',                      // Code postal expéditeur
				to_postal_code: selectedAddress.zip,             // ex: '31500'
				weight: {
					value: totalWeight,                          // Poids en kg (ex: 9.0)
					unit: 'kilogram'                             // Unité attendue par Sendcloud
				},
				prefer_service_point: false,                     // Préférence point relais
				max_options: 10                                  // Nombre max d'options
			};

	

			const res = await fetch('/api/sendcloud/shipping-options', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(requestBody)
			});

			if (!res.ok) {
				throw new Error('Erreur lors de la récupération des options.');
			}

			const result = await res.json();
			
			shippingOptions = result.data || [];

			if (!shippingOptions.length) {
				toast.error("Aucune option de livraison n'a été trouvée.");
			}
		} catch (err) {
			console.error('❌ Erreur API Sendcloud:', err);
			toast.error('Impossible de récupérer les options de livraison.');
		}
	}

	// Stocker le code du transporteur de l'option sélectionnée
	let selectedCarrierCode = '';

	function chooseShippingOption(chosenOption: any) {

		selectedShippingOption = chosenOption.id; // Nouvelle structure : option.id au lieu de option.code

		const costHT = parseFloat(chosenOption.price || 0);
		setShippingCostHT(costHT);

		if (chosenOption?.price) {
			shippingCost = parseFloat(chosenOption.price);
		} else {
			shippingCost = 0;
		}

		const carrierCode = chosenOption?.carrierCode; // Nouvelle structure : option.carrierCode
		// Vérifier si c'est un point relais
		const isServicePoint = chosenOption?.type === 'service_point'; // Nouvelle structure : option.type

		// ✅ TOUJOURS réinitialiser le point relais sélectionné lors du changement d'option
		selectedPoint = null;

		if (isServicePoint && carrierCode) {
			// Stocker le code du transporteur pour validation
			selectedCarrierCode = carrierCode;
			// On affiche la carte et on récupère les points relais
			showMap = true;
			// ✅ Vider la liste des points relais avant de récupérer les nouveaux
			servicePoints = [];
			fetchServicePoints(carrierCode);
		} else {
			// Si ce n'est pas un point relais, on masque la carte et on reset les données du point
			showMap = false;
			selectedPoint = null;
			selectedCarrierCode = '';
			// ✅ Vider aussi la liste des points relais
			servicePoints = [];
		}
	}

	async function fetchServicePoints(carrierCode: string) {
		const selectedAddress = getSelectedAddress();
		if (!selectedAddress) {
			toast.error('Veuillez sélectionner une adresse.');
			return;
		}

		try {
			isLoadingServicePoints = true; // ✅ Début du chargement
			
			const res = await fetch('/api/sendcloud/service-points', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					to_country_code: selectedAddress.stateLetter, // ex: "FR"
					to_postal_code: selectedAddress.zip, // Code postal
					radius: 5000, // 20 km en mètres
					carriers: carrierCode // ex: "colisprive"
				})
			});

			if (!res.ok) {
				throw new Error('Erreur de récupération des points relais');
			}
			const data = await res.json();

			// Stocker les points relais reçus
			servicePoints = data;
			//console.log('✅ Points relais reçus:', servicePoints);

			if (!servicePoints.length) {
				toast.error('Aucun point relais trouvé pour ce transporteur.');
			}
		} catch (err) {
			console.error('❌ Erreur fetchServicePoints :', err);
			toast.error('Impossible de récupérer les points relais.');
		} finally {
			isLoadingServicePoints = false; // ✅ Fin du chargement
		}
	}

	function handleRemoveFromCart(productId: string) {
		removeFromCart(productId);

		// Le montant du panier a changé : on invalide le code promo appliqué
		resetPromo();

		// Une fois le store mis à jour, on vérifie si le panier n'est pas vide
		if ($cartStore.items.length === 0) {
			// Pas de recalcul, on vide juste les infos
			resetShippingState();
		} else {
			// Relance la requête pour mettre à jour les tarifs et options
			fetchSendcloudShippingOptions();
		}
	}

	function changeQuantity(productId: string, quantity: number, customId?: string) {
		console.log('🔄 changeQuantity appelée:', { productId, quantity, customId });
		console.log('📦 Avant mise à jour - Store:', $cartStore.items);
		
		updateCartItemQuantity(productId, quantity, customId);

		// Le montant du panier a changé : on invalide le code promo appliqué
		resetPromo();

		console.log('📦 Après mise à jour - Store:', $cartStore.items);
		console.log('💰 Nouveau sous-total:', $cartStore.subtotal);
		console.log('🧾 Nouvelle TVA:', $cartStore.tax);
		
		// Recharger les options de livraison après changement de quantité
		if (selectedAddressId && !hasCustomItems) {
			resetShippingState();
			fetchSendcloudShippingOptions();
		}
	}



	function handleCheckout(event: Event) {
		// Empêche le comportement par défaut de la soumission
		event.preventDefault();

		if (!selectedAddressId) {
			toast.error('Veuillez choisir une adresse.');
			return;
		}
		// Pour les commandes personnalisées, on accepte 'no_shipping' comme option valide
		if (!selectedShippingOption && !hasCustomItems) {
			toast.error('Veuillez choisir un mode de livraison.');
			return;
		}

		// Vérification si un point relais est requis
		if (showMap && !selectedPoint && !hasCustomItems) {
			toast.error('Veuillez sélectionner un point relais.');
			return;
		}

		// Mise à jour des données du superform
		$createPaymentData.shippingCost = shippingCost.toString();
		$createPaymentData.shippingOption = selectedShippingOption || undefined;
		$createPaymentData.promoCode = promoCode || undefined;
		$createPaymentData.discountAmount = discountAmount ? discountAmount.toString() : '0';

		// Si tout est OK, on peut procéder au checkout
		// Le formulaire sera soumis automatiquement par l'action du serveur
		console.log('✅ Validation OK, soumission du formulaire...');
	}

	// permet de récupérer l'id de la commande en cours
	$effect(() => {
		if (data.pendingOrder) {
			$createPaymentData.orderId = data.pendingOrder.id;
		}
		if (selectedAddressId) {
			$createPaymentData.addressId = selectedAddressId;
		}
	});


</script>

<!-- SEO pour la page checkout -->
<SEO pageKey="checkout" />

<div class="min-h-screen w-[100vw]">
	<SmoothScrollBar>
		<div class="container mx-auto px-4 py-8 max-w-7xl">
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-8 pb-[100px]">
				<!-- Section Adresse -->
				<div class="space-y-6">
					<AddressSelector
						addresses={data?.addresses || []}
						selectedAddressId={selectedAddressId}
						onAddressSelect={selectAddress}
					/>

					
					<ShippingOptions
						shippingOptions={shippingOptions}
						selectedShippingOption={selectedShippingOption}
						onShippingOptionSelect={chooseShippingOption}
						hasCustomItems={hasCustomItems}
					/>
				</div>

				<!-- Colonne de droite - Panier et Paiement -->
				<div class="space-y-6">
					<ServicePointMap
						{showMap}
						{isLoadingServicePoints}
						{servicePoints}
						{selectedPoint}
										{zoom}
						{centerCoordinates}
						{offsets}
						onMarkerClick={handleMarkerClick}
					/>
					<CartSummary
						items={$cartStore.items}
						subtotal={$cartStore.subtotal}
						tax={$cartStore.tax}
						{hasCustomItems}
						{shippingCost}
						{selectedShippingOption}
						{quantityOptions}
						{customQuantityOptions}
						{totalNonCustomQuantity}
						{canAddQuantity}
						{getCustomCanPrice}
						{discountAmount}
						{promoCode}
						onRemoveFromCart={handleRemoveFromCart}
						onChangeQuantity={changeQuantity}
					/>
					{#if $cartStore.items.length > 0}
						<!-- PROMO-PLUGIN -->
						<PromoCodeInput
							{productTotalTTC}
							appliedCode={promoCode}
							{discountAmount}
							onApplied={handlePromoApplied}
							onRemoved={resetPromo}
						/>
					{/if}
					<!-- Formulaire de paiement -->
					{#if $cartStore.items.length > 0}
						<Card.Root>
							<div class="p-6">
								<form
									method="POST"
									action="?/checkout"
									use:createPaymentEnhance
									onsubmit={handleCheckout}
								>
									<input type="hidden" name="orderId" bind:value={$createPaymentData.orderId} />
									<input type="hidden" name="addressId" bind:value={$createPaymentData.addressId} />
									<input
										type="hidden"
										name="shippingOption"
										bind:value={$createPaymentData.shippingOption}
									/>
									<input
										type="hidden"
										name="shippingCost"
										bind:value={$createPaymentData.shippingCost}
									/>

									<input type="hidden" name="promoCode" bind:value={$createPaymentData.promoCode} />
									<input
										type="hidden"
										name="discountAmount"
										bind:value={$createPaymentData.discountAmount}
									/>

									<input
										type="hidden"
										name="servicePointId"
										bind:value={$createPaymentData.servicePointId}
									/>
									<input
										type="hidden"
										name="servicePointPostNumber"
										bind:value={$createPaymentData.servicePointPostNumber}
									/>
									<input
										type="hidden"
										name="servicePointLatitude"
										bind:value={$createPaymentData.servicePointLatitude}
									/>
									<input
										type="hidden"
										name="servicePointLongitude"
										bind:value={$createPaymentData.servicePointLongitude}
									/>
									<input
										type="hidden"
										name="servicePointType"
										bind:value={$createPaymentData.servicePointType}
									/>
									<input
										type="hidden"
										name="servicePointExtraRefCab"
										bind:value={$createPaymentData.servicePointExtraRefCab}
									/>
									<input
										type="hidden"
										name="servicePointExtraShopRef"
										bind:value={$createPaymentData.servicePointExtraShopRef}
									/>

									<Button type="submit" class="w-full" size="lg">
										<CreditCard class="w-4 h-4 mr-2" />
										Payer {totalTTC.toFixed(2)}€
									</Button>
								</form>
							</div>
						</Card.Root>
					{/if}
				</div>
			</div>
		</div>
	</SmoothScrollBar>
</div>
