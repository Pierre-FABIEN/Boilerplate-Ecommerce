<script lang="ts">
	import Navigation from './../lib/components/Navigation.svelte';
	import '@fontsource-variable/open-sans';
	import '@fontsource-variable/raleway';
	import '../app.css';

	import { initializeLayoutState, setupNavigationEffect, isClient } from './layout.svelte';

	import { ModeWatcher } from 'mode-watcher';
	import Toaster from '$lib/components/shadcn/ui/sonner/sonner.svelte';

	import SmoothScrollBar from '$lib/components/smoothScrollBar/SmoothScrollBar.svelte';
	import {
		firstLoadComplete,
		setFirstOpen,
		setRessourceToValide
	} from '$lib/store/initialLoaderStore';
	import { page } from '$app/stores';

	import { resetCart, setCart } from '$lib/store/Data/cartStore';
	import { setCartSyncAuthenticated, startSync } from '$lib/store/Data/cartSync';
	import {
		clearGuestCart,
		guestToMergeLines,
		guestToStoreItems,
		mergeItems,
		publicItemsToMergeLines,
		readGuestCart,
		serverOrderToStore,
		toSaveCartItems,
		totalsFromItems
	} from '$lib/commerce/guestCart';
	import { toast } from 'svelte-sonner';
	import { untrack } from 'svelte';
	import SmoothScrollBarStore from '$lib/store/SmoothScrollBarStore';

	let { children, data } = $props();

	/** Dernière identité pour laquelle le panier a été hydraté (`guest` ou user id). */
	let hydratedFor: string | null = null;
	let hydratingCart = false;

	function applyStoreCart(cart: {
		id: string;
		userId: string;
		items: Parameters<typeof setCart>[2];
		subtotal: number;
		tax: number;
		shippingCost: number;
	}) {
		setCart(
			cart.id,
			cart.userId,
			cart.items,
			cart.subtotal,
			cart.tax,
			cart.shippingCost,
			parseFloat((cart.shippingCost * 0.055).toFixed(2))
		);
	}

	$effect(() => {
		const unsubscribe = page.subscribe((currentPage) => {
			initializeLayoutState(currentPage);
		});
		setupNavigationEffect();

		setFirstOpen(true);
		setRessourceToValide(true);

		return unsubscribe;
	});

	// COMMERCE-PLUGIN : invité = localStorage ; compte = Order PENDING.
	// AUTH-PLUGIN : la fusion part dès que `data.user` apparaît (signup / login).
	$effect(() => {
		const userId = data.user?.id ?? null;
		const pending = untrack(() => data.pendingOrder);
		const sessionKey = userId ?? 'guest';
		let cancelled = false;

		(async () => {
			if (hydratedFor === sessionKey) {
				startSync({ authenticated: Boolean(userId) });
				setCartSyncAuthenticated(Boolean(userId));
				return;
			}
			if (hydratingCart) return;
			hydratingCart = true;

			try {
				if (!userId) {
					if (hydratedFor && hydratedFor !== 'guest') {
						resetCart();
						clearGuestCart();
					}
					const guest = readGuestCart();
					if (guest.items.length) {
						const items = guestToStoreItems(guest);
						const { subtotal, tax } = totalsFromItems(items);
						applyStoreCart({
							id: '',
							userId: '',
							items,
							subtotal,
							tax,
							shippingCost: 0
						});
					}
					startSync({ authenticated: false });
					setCartSyncAuthenticated(false);
					hydratedFor = 'guest';
					return;
				}

				const guest = readGuestCart();
				if (guest.items.length && pending) {
					const merged = mergeItems(
						publicItemsToMergeLines(pending.items),
						guestToMergeLines(guest)
					);
					try {
						const response = await fetch('/api/save-cart', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({
								id: pending.id,
								items: toSaveCartItems(merged)
							})
						});
						if (cancelled) return;
						if (!response.ok) {
							toast.error('Impossible d’enregistrer le panier sur le compte.');
							applyStoreCart(pending);
						} else {
							const order = await response.json();
							clearGuestCart();
							applyStoreCart(serverOrderToStore(order));
						}
					} catch {
						if (!cancelled) {
							toast.error('Impossible d’enregistrer le panier sur le compte.');
							applyStoreCart(pending);
						}
					}
				} else if (pending) {
					applyStoreCart(pending);
				}

				if (cancelled) return;
				startSync({ authenticated: true });
				setCartSyncAuthenticated(true);
				hydratedFor = sessionKey;
			} finally {
				hydratingCart = false;
			}
		})();

		return () => {
			cancelled = true;
		};
	});

	let contentRef: HTMLElement | null = $state(null);
	let contentHeight = $state(0);

	$effect(() => {
		if (!contentRef) return;

		const observer = new ResizeObserver(() => {
			if (contentRef) {
				contentHeight = contentRef.clientHeight;
			}

			updateSmoothScroll();
		});
		observer.observe(contentRef);

		return () => observer.disconnect();
	});

	function updateSmoothScroll() {
		let scrollbarInstance;
		SmoothScrollBarStore.update((state) => {
			scrollbarInstance = state.smoothScroll;
			return state;
		});

		if (scrollbarInstance) {
			scrollbarInstance.update();
		}
	}
</script>

<svelte:head>
	<link rel="icon" href="/favicon.png" />
	<meta name="viewport" content="width=device-width" />
	<link rel="manifest" href="/pwa/manifest.webmanifest" />
	<meta name="theme-color" content="#4285f4" />
</svelte:head>

{#if !$firstLoadComplete}
	<!-- <Loader /> -->
{/if}
{#if $isClient}
	<div class="wappper">
		<ModeWatcher />
		<Navigation {data} />
		<div class="container ccc">
			<div class="wrapperScroll">
				<SmoothScrollBar>
					<main class="mainLayout">
						<div class="content ccc" bind:this={contentRef}>
							{@render children()}
						</div>
					</main>
				</SmoothScrollBar>
			</div>
		</div>
		<Toaster />
	</div>
{/if}

<style lang="scss">
	.container {
		width: 100vw;
		height: 100vh;
		padding: 0;
		margin: 0;
		max-width: none;
		overflow: hidden;
		position: relative;
	}

	.mainLayout {
		max-width: 100vw;
		overflow: hidden;
	}

	.wrapperScroll {
		width: 100vw;
		height: 100vh;
		overflow: hidden;
		position: absolute;
		top: 0;
		left: 0;
		z-index: 1;
	}

	.canva {
		position: absolute;
		width: 100vw;
		height: 100vh;
		z-index: 1;
	}

	.content {
		position: absolute;
		z-index: 1;
	}
</style>
