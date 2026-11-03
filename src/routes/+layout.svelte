<script lang="ts">
	import Navigation from './../lib/components/Navigation.svelte';
	import Footer from '#lib/components/Footer.svelte';
	import CookieNotice from '#lib/components/CookieNotice.svelte';
	import '@fontsource-variable/open-sans';
	import '@fontsource-variable/raleway';
	import '../app.css';

	import { initializeLayoutState, isClient } from './layout.svelte';

	import { ModeWatcher } from 'mode-watcher';
	import Toaster from '#lib/components/shadcn/ui/sonner/sonner.svelte';

	import SmoothScrollBar from '#lib/components/smoothScrollBar/SmoothScrollBar.svelte';
	import Loader from '#lib/components/loader/Loader.svelte';
	import {
		bootstrapInitialLoad,
		firstLoadComplete,
		setDomLoaded
	} from '#lib/store/initialLoaderStore';
	import { afterNavigate } from '$app/navigation';

	import { resetCart, setCart, setVatRate } from '#lib/store/Data/cartStore';
	import { setCartSyncAuthenticated, startSync } from '#lib/store/Data/cartSync';
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
	} from '#lib/commerce/guestCart';
	import { toast } from 'svelte-sonner';
	import { untrack } from 'svelte';
	import SmoothScrollBarStore from '#lib/store/SmoothScrollBarStore';
	import type Scrollbar from 'smooth-scrollbar';

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
			parseFloat((cart.shippingCost * data.vatRate).toFixed(2))
		);
	}

	// Taux de TVA courant (`StoreSettings.vatRate`), propagé au store panier
	// client dès qu'il change — plus de constante figée à 5,5 % côté client.
	$effect(() => {
		setVatRate(data.vatRate);
	});

	afterNavigate(() => initializeLayoutState());

	$effect(() => bootstrapInitialLoad());

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
						const { subtotal, tax } = totalsFromItems(items, data.vatRate);
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

	$effect(() => {
		if (!contentRef) return;

		const observer = new ResizeObserver(() => {
			updateSmoothScroll();
		});
		observer.observe(contentRef);

		return () => observer.disconnect();
	});

	function updateSmoothScroll() {
		let scrollbarInstance: Scrollbar | null = null;
		SmoothScrollBarStore.update((state) => {
			scrollbarInstance = state.smoothScroll;
			return state;
		});

		(scrollbarInstance as Scrollbar | null)?.update();
	}

	$effect(() => {
		document.addEventListener('DOMContentLoaded', () => setDomLoaded(true));
	});
</script>

<svelte:head>
	<link rel="icon" href="/favicon.ico" />
	<meta name="viewport" content="width=device-width" />
	<link rel="manifest" href="/pwa/manifest.webmanifest" />
	<meta name="theme-color" content="#4285f4" />
</svelte:head>

{#if !$firstLoadComplete}
	<Loader />
{/if}
{#if $isClient}
	<div>
		<a
			href="#main-content"
			class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:rounded focus:bg-background focus:px-4 focus:py-2 focus:text-foreground focus:outline focus:outline-2 focus:outline-ring"
		>
			Aller au contenu
		</a>
		<ModeWatcher />
		<Navigation {data} />
		<div class="ccc relative m-0 h-screen w-screen max-w-none overflow-hidden p-0">
			<div class="absolute top-0 left-0 z-[1] h-screen w-screen overflow-hidden">
				<SmoothScrollBar>
					<main id="main-content" class="max-w-[100vw] overflow-hidden">
						<div class="ccc absolute z-[1] w-full pb-15" bind:this={contentRef}>
							{@render children()}
							<Footer companyName={data.companyName} />
						</div>
					</main>
				</SmoothScrollBar>
			</div>
		</div>
		<Toaster />
		<CookieNotice />
	</div>
{/if}
