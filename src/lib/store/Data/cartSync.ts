import { cart } from './cartStore';
import { get } from 'svelte/store';
import { storeItemsToGuest, writeGuestCart } from '$lib/commerce/guestCart';

let lastSynced = 0;
let isSyncing = false;
let authenticated = false;
let started = false;

const persistCart = async () => {
	const currentCart = get(cart);

	if (isSyncing) {
		return;
	}

	if (!authenticated) {
		if (lastSynced === 0) {
			lastSynced = currentCart.lastModified;
			return;
		}
		if (currentCart.lastModified > lastSynced) {
			writeGuestCart({ items: storeItemsToGuest(currentCart.items) });
			lastSynced = currentCart.lastModified;
		}
		return;
	}

	if (!currentCart.id) {
		return;
	}

	if (lastSynced === 0) {
		lastSynced = currentCart.lastModified;
		return;
	}

	if (currentCart.lastModified > lastSynced) {
		isSyncing = true;
		try {
			const response = await fetch('/api/save-cart', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ id: currentCart.id, items: currentCart.items })
			});

			if (!response.ok) {
				throw new Error('Failed to save cart');
			}

			lastSynced = currentCart.lastModified;
		} catch {
			// Le prochain changement de `lastModified` retentera.
		} finally {
			isSyncing = false;
		}
	}
};

/**
 * COMMERCE-PLUGIN : un seul abonnement. Anonyme → localStorage.
 * Connecté → `/api/save-cart`.
 */
export function startSync(options: { authenticated: boolean }) {
	authenticated = options.authenticated;
	if (started) {
		return;
	}
	started = true;
	cart.subscribe(() => {
		setTimeout(persistCart, 50);
	});
}

export function setCartSyncAuthenticated(value: boolean) {
	authenticated = value;
	lastSynced = 0;
}
