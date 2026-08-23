<script lang="ts">
	/* ------------------------------------------------------------------
	   IMPORTS
	------------------------------------------------------------------ */
	import SmoothScrollBar from './../smoothScrollBar/SmoothScrollBar.svelte';
	import '@fontsource-variable/open-sans';
	import '@fontsource-variable/raleway';

	import {
		cart,
		removeFromCart,
		updateCartItemQuantity,
		resetCart
	} from '$lib/store/Data/cartStore';
	import { Badge } from '$shadcn/badge';
	import Button from '$shadcn/button/button.svelte';
	import * as Sheet from '$shadcn/sheet/index.js';
	import { Trash, ShoppingCart } from 'lucide-svelte';
	import Input from '../shadcn/ui/input/input.svelte';
	import { enhance, type SubmitFunction } from '$app/forms';

	/*  👉 le store 'mode'  */
	import { mode as modeStore } from 'mode-watcher';

	/* ------------------------------------------------------------------
	   FONCTIONS UTILITAIRES
	------------------------------------------------------------------ */
	// Fonction pour calculer le prix des projets sur-mesure
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

	/* ------------------------------------------------------------------
	   PROPS & ÉTAT
	------------------------------------------------------------------ */
	let { data } = $props();

	let user = $derived(data.user ?? null);
	let sidebarOpen = $state(false);

	/*  Valeur dérivée et réactive du store mode  */
	let currentMode = $derived(modeStore); // ✅ pas de $

	/*  true si aucune personnalisation dans le panier  */
	let isNativeOrder = $derived(
		$cart.items.every((i) => !i.custom || (Array.isArray(i.custom) && i.custom.length === 0))
	);

	/*  Options de quantité (simplifiées) */
	let quantityOptions = $state([24, 48, 72]);

	/*  Options de quantité pour les articles personnalisés */
	let customQuantityOptions = $state([
		{ label: 'Offre Essentielle', value: 576 },
		{ label: 'Offre Studio', value: 720 },
		{ label: 'Offre Agence', value: 1440 },
		{ label: 'Offre Premium', value: 2880 },
		{ label: 'Offre Entreprise', value: 8640 }
	]);

	// Calculer le total des quantités pour les commandes non-personnalisées
	let totalNonCustomQuantity = $derived(
		$cart.items
			.filter(item => !item.custom || (Array.isArray(item.custom) && item.custom.length === 0))
			.reduce((acc, item) => acc + item.quantity, 0)
	);

	// Fonction pour vérifier si on peut ajouter une quantité
	function canAddQuantity(newQuantity: number, currentQuantity: number, isCustom: boolean): boolean {
		if (isCustom) return true; // Pas de limite pour les personnalisées
		
		const otherItemsQuantity = totalNonCustomQuantity - currentQuantity;
		return (otherItemsQuantity + newQuantity) <= 72;
	}

	/* ------------------------------------------------------------------
	   ACTIONS
	------------------------------------------------------------------ */
	function handleRemoveFromCart(id: string, customId?: string) {
		removeFromCart(id, customId);
	}

	function changeQuantity(id: string, qte: number, customId?: string) {
		updateCartItemQuantity(id, qte, customId);
	}

	/**
	 * Déconnexion depuis le panier.
	 *
	 * AUTH-PLUGIN : POST vers l'action `?/signout` de `/auth` (formulaire, pas
	 * `fetch`) pour que la protection CSRF de SvelteKit laisse passer la requête.
	 * Le panier local est vidé avant la redirection vers `/auth/login`.
	 */
	const enhanceSignOut: SubmitFunction = () => {
		return async ({ update }) => {
			resetCart();
			sidebarOpen = false;
			await update();
		};
	};
</script>

<!-- ----------------------------------------------------------------- -->
<!--  BOUTON PANIER                                                   -->
<!-- ----------------------------------------------------------------- -->
<div class="ccc relative h-[50px] w-[50px] rounded-[10px] border border-white bg-white/20">
	<div class="absolute z-50 ccc">
		<Sheet.Root bind:open={sidebarOpen}>
			<Sheet.Trigger>
				<button
					class="m-5 ccc"
					class:text-black={currentMode.current === 'light'}
					class:text-white={currentMode.current === 'dark'}
				>
					<ShoppingCart class="w-8 h-8 absolute right-0 top-0 stroke-current transition-colors" />
					<Badge class="bulletCart font-bold absolute z-10 left-0 bottom-0">
						{$cart?.items?.length ?? 0}
					</Badge>
				</button>
			</Sheet.Trigger>

			<!-- ----------------------------------------------------------------- -->
			<!--  CONTENU DU TIROIR                                                -->
			<!-- ----------------------------------------------------------------- -->
			<Sheet.Content class="p-0 min-w-fit">
				<SmoothScrollBar>
					<div class="p-4">
						<h2 class="text-2xl font-bold mb-4">Votre panier</h2>

						{#if isNativeOrder}
							<p class="mb-4">
								Pour les commandes non-custom, les quantités sont fixées à 3 packs de 24 maximum.
							</p>
						{/if}

						{#if $cart && $cart.items && $cart.items.length > 0}
							<div class="max-h-[500px] overflow-y-auto">
								{#each $cart.items as item (item.id)}
									<div
										class="p-4 border rounded-lg shadow-sm flex justify-between items-center mb-2"
									>
										<img
											src={(item.custom && Array.isArray(item.custom) && item.custom.length > 0 && item.custom[0].image) ||
												(Array.isArray(item.product.images)
													? item.product.images[0]
													: item.product.images) ||
												''}
											alt={item.product.name}
											class="w-20 h-20 object-cover mr-5"
										/>

										<div class="flex-1 mx-4">
											<h3 class="text-lg font-semibold">
												{item.product.name}
												{#if item.custom && Array.isArray(item.custom) && item.custom.length > 0}
													<span class="text-sm font-normal text-gray-500">Custom</span>
												{/if}
											</h3>
											<p class="text-gray-600">
												{#if item.custom && Array.isArray(item.custom) && item.custom.length > 0}
													{getCustomCanPrice(item.quantity).toFixed(2)}€ l'unité
												{:else}
													{item.product.price.toFixed(2)}€
												{/if}
											</p>

											{#if item.custom && Array.isArray(item.custom) && item.custom.length > 0}
												<!-- Custom items: Use predefined quantity options -->
												<div class="flex gap-2 flex-wrap">
													{#each customQuantityOptions as option}
														<button
															class="px-3 py-1 border rounded text-sm {item.quantity === option.value ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 dark:border-gray-600'}"
															onclick={() => changeQuantity(item.product.id, option.value, item.custom?.[0]?.id)}
														>
															{option.value}
														</button>
													{/each}
												</div>
											{:else}
												<!-- Non-custom items: Use buttons with quantity limit -->
												<div class="flex gap-2">
													{#each quantityOptions as option}
														<button
															class="px-3 py-1 border rounded text-sm {item.quantity === option ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 dark:border-gray-600'} {!canAddQuantity(option, item.quantity, false) ? 'opacity-50 cursor-not-allowed' : ''}"
															onclick={() => canAddQuantity(option, item.quantity, false) && changeQuantity(item.product.id, option)}
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
										</div>
										<div class="flex flex-col items-end">
											<p class="text-lg font-semibold">
												{#if item.custom && Array.isArray(item.custom) && item.custom.length > 0}
													{(getCustomCanPrice(item.quantity) * item.quantity).toFixed(2)}€
												{:else}
													{(item.price * item.quantity).toFixed(2)}€
												{/if}
											</p>
											<button
												onclick={() => handleRemoveFromCart(item.product.id, item.custom?.[0]?.id)}
												class="text-red-600 hover:text-red-800"
											>
												<Trash />
											</button>
										</div>
									</div>
								{/each}
							</div>

							<!-- ---------- RÉCAPITULATIF ---------------------------- -->
							<div class="mt-4 border-t pt-4 space-y-2">
								<div class="flex justify-between">
									<span>Subtotal :</span>
									<span>{($cart.subtotal ?? 0).toFixed(2)} €</span>
								</div>
								<div class="flex justify-between">
									<span>TVA (5,5 %) :</span>
									<span>{($cart.tax ?? 0).toFixed(2)} €</span>
								</div>
								<div class="flex justify-between font-semibold text-xl">
									<span>Total :</span>
									<span>{isFinite($cart.total) ? $cart.total.toFixed(2) : '0.00'} €</span>
								</div>
							</div>
						{:else}
							<p>Votre panier est vide.</p>
						{/if}

						<!-- ---------- ACTIONS UTILISATEUR ------------------------ -->
						<!--
							AUTH-PLUGIN ▼ bloc compte : lien paramètres, accès admin, déconnexion,
							et invitation à se connecter avant paiement.
							Sans authentification, ne conserver que le bouton « Checkout ».
						-->
						{#if user}
							<div class="ccc">
								<!-- COMMERCE-PLUGIN -->
								<Button class="w-full m-2" href="/checkout" onclick={() => (sidebarOpen = false)}>
									Checkout
								</Button>
								<Button
									class="w-full m-2"
									href="/auth/settings"
									onclick={() => (sidebarOpen = false)}
								>
									Mes paramètres
								</Button>

								<!-- ADMIN-PLUGIN ▼ lien vers le back-office, visible aux seuls administrateurs. -->
								{#if user.role === 'ADMIN'}
									<Button class="w-full m-2" href="/admin" onclick={() => (sidebarOpen = false)}>
										Dashboard
									</Button>
								{/if}
								<!-- ADMIN-PLUGIN ▲ -->

								<form method="POST" action="/auth?/signout" use:enhance={enhanceSignOut}>
									<Button type="submit" class="w-full m-2" variant="destructive">
										Se déconnecter
									</Button>
								</form>
							</div>
						{:else}
							<div class="text-center mt-4">
								<p class="mb-2">
									Veuillez vous
									<a
										href="/auth/login"
										onclick={() => (sidebarOpen = false)}
										class="text-blue-500 underline">connecter</a
									>
									ou
									<a
										href="/auth/signup"
										onclick={() => (sidebarOpen = false)}
										class="text-blue-500 underline">vous inscrire</a
									>
									pour finaliser votre commande.
								</p>
							</div>
						{/if}
						<!-- AUTH-PLUGIN ▲ -->
					</div>
				</SmoothScrollBar>
			</Sheet.Content>
		</Sheet.Root>
	</div>
</div>
