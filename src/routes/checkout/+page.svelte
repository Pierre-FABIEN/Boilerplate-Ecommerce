<script lang="ts">
	import { untrack } from 'svelte';
	// COMMERCE-PLUGIN : UI du tunnel. SENDCLOUD = carte / options. PROMO = champ code.
	import type { Offset } from 'maplibre-gl';

	import * as Card from '$shadcn/card/index.js';
	import { superForm } from 'sveltekit-superforms';
	import { zodClient } from 'sveltekit-superforms/adapters';
	import SmoothScrollBar from '$lib/components/smoothScrollBar/SmoothScrollBar.svelte';
	import AddressSelector from '$lib/components/checkout/AddressSelector.svelte';
	import ShippingOptions from '$lib/components/checkout/ShippingOptions.svelte';
	import ServicePointMap from '$lib/components/checkout/ServicePointMap.svelte';
	import CartSummary from '$lib/components/checkout/CartSummary.svelte';
	import PromoCodeInput from '$lib/components/checkout/PromoCodeInput.svelte'; // PROMO-PLUGIN
	import GiftCardInput from '$lib/components/checkout/GiftCardInput.svelte';
	import { CreditCard } from 'lucide-svelte';
	import Button from '$shadcn/button/button.svelte';
	import { Checkbox } from '$shadcn/checkbox/index.js';
	import { Label } from '$shadcn/label';
	import { OrderSchema } from '$lib/schema/order/order.js';
	import { toast } from 'svelte-sonner';
	import {
		cart as cartStore,
		removeFromCart,
		setShippingCostHT,
		updateCartItemQuantity
	} from '$lib/store/Data/cartStore';
	import SEO from '$lib/components/SEO.svelte';
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import { estimatePackage } from '$lib/commerce/packageEstimate';
	import type { ShippingOptionDTO, ServicePointDTO } from '$lib/sendcloud/checkoutTypes';

	let { data } = $props();

	// Calculer le total des quantités pour les commandes non-personnalisées
	let totalNonCustomQuantity = $derived(
		$cartStore.items
			.filter((item) => !item.custom || (Array.isArray(item.custom) && item.custom.length === 0))
			.reduce((acc, item) => acc + item.quantity, 0)
	);

	// Runes Svelte 5
	let selectedAddressId = $state<string | undefined>(undefined);
	// Facturation : par défaut identique à la livraison (cas le plus courant,
	// zéro clic supplémentaire) — décoché uniquement si l'utilisateur veut une
	// adresse de facturation différente.
	let billingSameAsShipping = $state(true);
	let selectedBillingAddressId = $state<string | undefined>(undefined);
	// CGV acceptées avant paiement — revalidé côté serveur dans l'action `checkout`.
	let cgvAccepted = $state(false);

	// Plus de cartValue local, on utilise $cartStore directement.
	let shippingOptions = $state<ShippingOptionDTO[]>([]);
	let selectedShippingOption = $state<string | null>(null);
	let shippingCost = $state<number>(0);

	let servicePoints = $state<ServicePointDTO[]>([]);
	let isLoadingServicePoints = $state(false); // ✅ Nouvel état de chargement

	let zoom = $state(12);
	let centerCoordinates = $state<[number, number]>([2.3522, 48.8566]);
	let selectedPoint = $state<ServicePointDTO | null>(null);
	let showMap = $state(false);

	// Code promo
	let promoCode = $state('');
	let discountAmount = $state(0);

	// Carte cadeau — se cumule avec le code promo, sur ce qu'il reste à payer
	// une fois la remise promo déduite (`giftCardMaxApplicable`).
	let giftCardCode = $state('');
	let giftCardAmount = $state(0);

	// Total TTC des produits (hors frais de port) — base de calcul de la remise
	let productTotalTTC = $derived($cartStore.subtotal + $cartStore.tax);

	// Parrainage : remise automatique sur la première commande d'un compte
	// parrainé, affichée ici pour info — le montant réel appliqué est
	// recalculé côté serveur (`?/checkout`), jamais lu depuis ce dérivé.
	let referralDiscountAmount = $derived(
		data.referralDiscountEligible
			? parseFloat((productTotalTTC * data.referralDiscountPercent).toFixed(2))
			: 0
	);

	// BUNDLE-PLUGIN : même principe, aperçu seulement — `computeBundleDiscount`
	// côté serveur fait foi au moment du paiement.
	let bundleDiscountAmount = $derived(
		data.bundleDiscountEligible
			? parseFloat((productTotalTTC * data.bundleDiscountPercent).toFixed(2))
			: 0
	);

	let giftCardMaxApplicable = $derived(
		Math.max(0, productTotalTTC - discountAmount - bundleDiscountAmount - referralDiscountAmount)
	);

	let totalTTC = $derived(
		Math.max(
			0,
			$cartStore.subtotal +
				$cartStore.tax +
				shippingCost -
				discountAmount -
				giftCardAmount -
				bundleDiscountAmount -
				referralDiscountAmount
		)
	);

	function resetGiftCard() {
		giftCardCode = '';
		giftCardAmount = 0;
	}

	function handleGiftCardApplied(code: string, amount: number) {
		giftCardCode = code;
		giftCardAmount = amount;
	}

	function resetPromo() {
		promoCode = '';
		discountAmount = 0;
		// Le plafond applicable à la carte cadeau vient de changer, la revalider
		// est plus sûr que de laisser un montant potentiellement trop élevé.
		resetGiftCard();
	}

	function handlePromoApplied(code: string, discount: number) {
		promoCode = code;
		discountAmount = discount;
		resetGiftCard();
	}

	// Détecter si la commande contient des projets sur-mesure
	let hasCustomItems = $derived($cartStore.items.some((item) => (item.custom?.length ?? 0) > 0));

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

	// Ne réagit qu'aux changements de longueur du panier (ajout/suppression d'article) ou
	// d'adresse — une modification de quantité sur un article existant ne change pas cette
	// longueur, d'où l'appel explicite dans changeQuantity(). selectAddress() et
	// handleRemoveFromCart() déclenchent aussi cet effet (adresse/longueur modifiée) en plus
	// de leur propre appel explicite ; le garde-fou de requestId dans
	// fetchSendcloudShippingOptions() évite qu'une réponse obsolète écrase la plus récente.
	$effect(() => {
		if (selectedAddressId && !hasCustomItems && $cartStore.items.length > 0) {
			fetchSendcloudShippingOptions();
		}
	});

	// Offset pour la popup (optionnel, reprenant l'exemple maplibre)
	let offset = $state(24);
	let offsets: Offset = $derived({
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
	let createPayment = superForm(
		untrack(() => data.IOrderSchema),
		{
			validators: zodClient(OrderSchema),
			id: 'createPayment',
			resetForm: false,
			onUpdated({ form }) {
				if (form.valid) return;
				const first = Object.values(form.errors)
					.flat()
					.find((message) => typeof message === 'string' && message.length > 0);
				if (first) toast.error(first);
			},
			onError({ result }) {
				toast.error(result.error.message || 'Le paiement n’a pas pu démarrer.');
			}
		}
	);

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
			$createPaymentData.servicePointLatitude = String(selectedPoint.latitude);
			$createPaymentData.servicePointLongitude = String(selectedPoint.longitude);
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
	function handleMarkerClick(point: ServicePointDTO) {
		// Plus besoin de validation, l'API filtre déjà les points relais compatibles
		selectedPoint = point;
	}

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

		// Ne pas récupérer les options de livraison si la commande contient des personnalisations.
		// (L'effet réactif ci-dessus refera aussi cet appel puisque selectedAddressId change ;
		// on le garde ici pour couvrir le cas où l'utilisateur reclique la même adresse, qui ne
		// déclenche pas l'effet faute de changement de valeur.)
		if (!hasCustomItems) {
			fetchSendcloudShippingOptions();
		}
	}

	function selectBillingAddress(addressId: string) {
		selectedBillingAddressId = addressId;
	}

	// Retour du formulaire de création d'adresse (voir AddressSelector) : on
	// sélectionne directement l'adresse tout juste créée, sans repasser par le
	// combobox. `target` indique si elle vient du sélecteur livraison ou facturation.
	$effect(() => {
		const addressIdFromUrl = page.url.searchParams.get('addressId');
		const targetFromUrl = page.url.searchParams.get('target');
		if (!addressIdFromUrl || !data.addresses?.some((a) => a.id === addressIdFromUrl)) return;

		if (targetFromUrl === 'billing') {
			if (!selectedBillingAddressId) {
				billingSameAsShipping = false;
				selectBillingAddress(addressIdFromUrl);
				toast.success('Adresse de facturation ajoutée avec succès');
				replaceState(page.url.pathname, {});
			}
		} else if (!selectedAddressId) {
			selectAddress(addressIdFromUrl);
			toast.success('Adresse ajoutée avec succès');
			replaceState(page.url.pathname, {});
		}
	});

	// Estimation du colis (poids + dimensions), depuis les poids/dimensions
	// réels des produits du panier quand ils sont renseignés — même logique
	// que la commande Sendcloud réelle créée après paiement (post-payment.ts).
	function computePackageEstimate() {
		return estimatePackage(
			$cartStore.items.map((item) => ({
				quantity: item.quantity,
				hasCustom: (item.custom?.length ?? 0) > 0,
				product: item.product
			}))
		);
	}

	// Incrémenté à chaque appel : permet à une réponse de vérifier qu'elle est toujours la
	// plus récente avant de mettre à jour l'état (cf. double déclenchement effet + appel direct).
	let shippingRequestId = 0;

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

		const requestId = ++shippingRequestId;

		try {
			// Calculer le colis
			const packageEstimate = computePackageEstimate();

			// Préparer la requête pour Sendcloud
			const requestBody = {
				from_country_code: 'FR', // Expéditeur (toujours France)
				to_country_code: selectedAddress.stateLetter, // ex: 'FR'
				from_postal_code: '31620', // Code postal expéditeur
				to_postal_code: selectedAddress.zip, // ex: '31500'
				weight: {
					value: packageEstimate.weightKg, // Poids en kg (ex: 9.0)
					unit: 'kilogram' // Unité attendue par Sendcloud
				},
				dimensions: {
					length: packageEstimate.lengthCm,
					width: packageEstimate.widthCm,
					height: packageEstimate.heightCm,
					unit: 'cm'
				},
				prefer_service_point: false // Préférence point relais
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

			// Une requête plus récente a déjà été lancée entre-temps : sa réponse a priorité.
			if (requestId !== shippingRequestId) return;

			shippingOptions = result.data || [];

			if (!shippingOptions.length) {
				toast.error("Aucune option de livraison n'a été trouvée.");
			}
		} catch (err) {
			// Idem : une requête plus récente en cours/résolue masque l'échec de celle-ci.
			if (requestId !== shippingRequestId) return;
			console.error('❌ Erreur API Sendcloud:', err);
			toast.error('Impossible de récupérer les options de livraison.');
		}
	}

	function chooseShippingOption(chosenOption: ShippingOptionDTO) {
		selectedShippingOption = chosenOption.id; // Nouvelle structure : option.id au lieu de option.code

		const costHT = chosenOption.price || 0;
		setShippingCostHT(costHT);

		if (chosenOption?.price) {
			shippingCost = chosenOption.price;
		} else {
			shippingCost = 0;
		}

		const carrierCode = chosenOption?.carrierCode; // Nouvelle structure : option.carrierCode
		// Vérifier si c'est un point relais
		const isServicePoint = chosenOption?.type === 'service_point'; // Nouvelle structure : option.type

		// ✅ TOUJOURS réinitialiser le point relais sélectionné lors du changement d'option
		selectedPoint = null;

		if (isServicePoint && carrierCode) {
			// On affiche la carte et on récupère les points relais
			showMap = true;
			// ✅ Vider la liste des points relais avant de récupérer les nouveaux
			servicePoints = [];
			fetchServicePoints(carrierCode);
		} else {
			// Si ce n'est pas un point relais, on masque la carte et on reset les données du point
			showMap = false;
			selectedPoint = null;
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
					// Pas de `radius` ici : le défaut de 20 km est posé côté endpoint
					// (`/api/sendcloud/service-points`) — une seule source de vérité,
					// l'ancienne valeur (5000, soit 5 km malgré son commentaire
					// « 20 km ») ne correspondait ni à l'une ni à l'autre.
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

	function handleRemoveFromCart(productId: string, customId?: string, variantId?: string) {
		removeFromCart(productId, customId, variantId);

		// Le montant du panier a changé : on invalide le code promo appliqué
		resetPromo();

		// Une fois le store mis à jour, on vérifie si le panier n'est pas vide
		if ($cartStore.items.length === 0) {
			// Pas de recalcul, on vide juste les infos
			resetShippingState();
		} else {
			// Le colis a changé (poids/dimensions) : l'option encore "sélectionnée" et son prix
			// sont périmés tant que l'utilisateur n'en a pas repris une dans la liste rafraîchie.
			// (L'effet réactif ci-dessus refera aussi cet appel puisque items.length change ; le
			// garde-fou de requestId dans fetchSendcloudShippingOptions évite tout conflit.)
			resetShippingState();
			fetchSendcloudShippingOptions();
		}
	}

	function changeQuantity(
		productId: string,
		quantity: number,
		customId?: string,
		variantId?: string
	) {
		console.log('🔄 changeQuantity appelée:', { productId, quantity, customId });
		console.log('📦 Avant mise à jour - Store:', $cartStore.items);

		updateCartItemQuantity(productId, quantity, customId, variantId);

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
		const pendingId = data.pendingOrder?.id;
		if (pendingId) $createPaymentData.orderId = pendingId;
		if (selectedAddressId) $createPaymentData.shippingAddressId = selectedAddressId;
		const billingId = billingSameAsShipping ? selectedAddressId : selectedBillingAddressId;
		if (billingId) $createPaymentData.billingAddressId = billingId;

		if (!selectedAddressId || !$createPaymentData.orderId) {
			event.preventDefault();
			toast.error('Veuillez choisir une adresse.');
			return;
		}
		if (!billingSameAsShipping && !selectedBillingAddressId) {
			event.preventDefault();
			toast.error('Veuillez choisir une adresse de facturation.');
			return;
		}
		if (!selectedShippingOption && !hasCustomItems) {
			event.preventDefault();
			toast.error('Veuillez choisir un mode de livraison.');
			return;
		}
		if (showMap && !selectedPoint && !hasCustomItems) {
			event.preventDefault();
			toast.error('Veuillez sélectionner un point relais.');
			return;
		}
		if (!cgvAccepted) {
			event.preventDefault();
			toast.error('Veuillez accepter les conditions générales de vente.');
			return;
		}

		$createPaymentData.shippingCost = shippingCost.toString();
		$createPaymentData.shippingOption = selectedShippingOption || undefined;
		$createPaymentData.promoCode = promoCode || undefined;
		$createPaymentData.discountAmount = discountAmount ? discountAmount.toString() : '0';
		$createPaymentData.giftCardCode = giftCardCode || undefined;
	}

	// permet de récupérer l'id de la commande en cours
	$effect(() => {
		if (data.pendingOrder) {
			$createPaymentData.orderId = data.pendingOrder.id;
		}
		if (selectedAddressId) {
			$createPaymentData.shippingAddressId = selectedAddressId;
		}
		const billingId = billingSameAsShipping ? selectedAddressId : selectedBillingAddressId;
		if (billingId) {
			$createPaymentData.billingAddressId = billingId;
		}
	});
</script>

<!-- Page transactionnelle, jamais de valeur SEO -->
<SEO pageKey="checkout" noindex nofollow />

<div class="min-h-screen w-[100vw]">
	<SmoothScrollBar>
		<div class="container mx-auto px-4 py-8 max-w-7xl">
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-8 pb-[100px]">
				<!-- Section Adresse -->
				<div class="space-y-6">
					<AddressSelector
						addresses={data?.addresses || []}
						{selectedAddressId}
						onAddressSelect={selectAddress}
					/>

					<div class="rounded-lg border bg-card text-card-foreground shadow-sm p-6 space-y-4">
						<label class="flex items-center gap-2 cursor-pointer select-none">
							<input type="checkbox" class="h-4 w-4" bind:checked={billingSameAsShipping} />
							<span class="text-sm font-medium"
								>Adresse de facturation identique à l'adresse de livraison</span
							>
						</label>

						{#if !billingSameAsShipping}
							<AddressSelector
								addresses={data?.addresses || []}
								selectedAddressId={selectedBillingAddressId}
								onAddressSelect={selectBillingAddress}
								title="Adresse de facturation"
								target="billing"
							/>
						{/if}
					</div>

					<ShippingOptions
						{shippingOptions}
						{selectedShippingOption}
						onShippingOptionSelect={chooseShippingOption}
						{hasCustomItems}
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
						{totalNonCustomQuantity}
						{discountAmount}
						{promoCode}
						vatRate={data.vatRate}
						onRemoveFromCart={handleRemoveFromCart}
						onChangeQuantity={changeQuantity}
					/>
					{#if $cartStore.items.length > 0 && referralDiscountAmount > 0}
						<div
							class="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
						>
							🎉 Remise de bienvenue parrainage appliquée automatiquement : -{referralDiscountAmount.toFixed(
								2
							)}€
						</div>
					{/if}
					{#if $cartStore.items.length > 0 && bundleDiscountAmount > 0}
						<div
							class="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
						>
							🎁 Remise « Souvent achetés ensemble » appliquée automatiquement : -{bundleDiscountAmount.toFixed(
								2
							)}€
						</div>
					{/if}
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
					{#if $cartStore.items.length > 0 && data.giftCardsEnabled}
						<GiftCardInput
							maxApplicable={giftCardMaxApplicable}
							appliedCode={giftCardCode}
							appliedAmount={giftCardAmount}
							onApplied={handleGiftCardApplied}
							onRemoved={resetGiftCard}
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
									<input
										type="hidden"
										name="shippingAddressId"
										bind:value={$createPaymentData.shippingAddressId}
									/>
									<input
										type="hidden"
										name="billingAddressId"
										bind:value={$createPaymentData.billingAddressId}
									/>
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
										name="giftCardCode"
										bind:value={$createPaymentData.giftCardCode}
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
									<input type="hidden" name="cgvAccepted" value={cgvAccepted ? 'on' : 'off'} />

									{#if data.deliveryEstimate}
										<p class="text-sm text-muted-foreground mb-4">
											Livraison estimée sous {data.deliveryEstimate.minDays}
											à {data.deliveryEstimate.maxDays} jours ouvrés après expédition.
										</p>
									{/if}

									<div class="flex items-start gap-2 mb-4">
										<Checkbox id="cgvAccepted" bind:checked={cgvAccepted} class="mt-0.5" />
										<Label for="cgvAccepted" class="font-normal text-sm">
											J'ai lu et j'accepte les <a href="/cgv" target="_blank" class="underline"
												>conditions générales de vente</a
											>.
										</Label>
									</div>

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
