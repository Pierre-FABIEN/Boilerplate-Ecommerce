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

	import { setCart } from '$lib/store/Data/cartStore';
	import { startSync } from '$lib/store/Data/cartSync';
	import SmoothScrollBarStore from '$lib/store/SmoothScrollBarStore';

	let { children, data } = $props();
	let cartInitialized = $state(false);
	$effect(() => {
		const unsubscribe = page.subscribe((currentPage) => {
			initializeLayoutState(currentPage);
		});
		setupNavigationEffect();

		setFirstOpen(true);
		setRessourceToValide(true);

		// Hydratation du panier serveur pour un visiteur connecté.
		// AUTH-PLUGIN : dépend de `data.user` et de `data.pendingOrder`, ce dernier
		// n'étant pas exposé par défaut (voir `+layout.server.ts`). Sans
		// authentification, le panier reste purement client.
		if (data.user) {
			const items = data.pendingOrder;

			if (!cartInitialized && items) {
				setCart(items.id, items.userId, items.items, items.subtotal, items.tax, items.total);
				cartInitialized = true;
			}

			if (items) {
				startSync();
			}
		}

		return unsubscribe;
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
