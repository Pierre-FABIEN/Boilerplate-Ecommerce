import { cart, type CartState } from './cartStore';
import { get } from 'svelte/store';
import { toast } from 'svelte-sonner';
import { storeItemsToGuest, writeGuestCart } from '$lib/commerce/guestCart';

// Diffuse le panier synchronisé aux autres onglets du même navigateur/origine,
// pour qu'ils adoptent le dernier état au lieu d'écraser plus tard avec une
// copie locale périmée (cf. lastSynced plus bas pour éviter les boucles).
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('cart-sync') : null;

// Anti-rebond entre deux tentatives de synchronisation après un changement du panier.
const SYNC_DEBOUNCE_MS = 50;
// Backoff après un échec réseau : on retente sans attendre un nouveau
// changement du panier, sinon le panier resterait désynchronisé du serveur
// indéfiniment tant que l'utilisateur n'y retouche pas.
const SYNC_RETRY_BASE_MS = 1000;
const SYNC_RETRY_MAX_MS = 30000;

let lastSynced = 0;
let isSyncing = false;
let authenticated = false;
let started = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = SYNC_RETRY_BASE_MS;
// Un changement est arrivé pendant un fetch en cours : à relancer juste après,
// sinon ce dernier état ne serait jamais synchronisé (silencieusement perdu).
let retryPending = false;

/**
 * Applique le panier reçu d'un autre onglet. On ignore tout ce qui n'est pas
 * strictement plus récent que l'état local (l'onglet courant peut avoir sa
 * propre modification pas encore synchronisée, plus fraîche).
 */
function applyRemoteCart(remote: CartState) {
	if (remote.lastModified <= get(cart).lastModified) {
		return;
	}
	// Déjà synchronisé par l'onglet émetteur : pas la peine de le renvoyer.
	lastSynced = remote.lastModified;
	cart.set(remote);
}

const persistCart = async () => {
	const currentCart = get(cart);

	console.error(
		`[diag persistCart] authenticated=${authenticated} id="${currentCart.id}" items=${currentCart.items.length} lastModified=${currentCart.lastModified} lastSynced=${lastSynced}`
	);

	if (isSyncing) {
		retryPending = true;
		return;
	}

	if (!authenticated) {
		if (currentCart.lastModified > lastSynced) {
			writeGuestCart({ items: storeItemsToGuest(currentCart.items) });
			lastSynced = currentCart.lastModified;
			channel?.postMessage(currentCart);
		}
		return;
	}

	// Connecté mais panier pas encore chargé/créé côté serveur : rien à sauvegarder.
	if (!currentCart.id || currentCart.lastModified <= lastSynced) {
		return;
	}

	isSyncing = true;
	try {
		const response = await fetch('/api/save-cart', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			// Survit à une fermeture d'onglet pendant que la requête est en vol.
			keepalive: true,
			body: JSON.stringify({ id: currentCart.id, items: currentCart.items })
		});

		if (!response.ok) {
			if (response.status < 500) {
				// Erreur permanente (requête invalide, panier introuvable...) :
				// retenter ne changera rien, on abandonne cet état au lieu de
				// boucler indéfiniment, mais on prévient l'utilisateur.
				toast.error("Impossible d'enregistrer votre panier.");
				lastSynced = currentCart.lastModified;
				retryDelay = SYNC_RETRY_BASE_MS;
				return;
			}
			throw new Error('Failed to save cart');
		}

		lastSynced = currentCart.lastModified;
		retryDelay = SYNC_RETRY_BASE_MS;
		channel?.postMessage(currentCart);
	} catch {
		if (retryTimer) clearTimeout(retryTimer);
		retryTimer = setTimeout(() => {
			retryTimer = null;
			persistCart();
		}, retryDelay);
		retryDelay = Math.min(retryDelay * 2, SYNC_RETRY_MAX_MS);
		retryPending = false; // le retryTimer relira de toute façon l'état le plus récent
	} finally {
		isSyncing = false;
		if (retryPending) {
			retryPending = false;
			persistCart();
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
	// Référence de départ : tout ce qui existe déjà est considéré comme déjà
	// synchronisé, seuls les changements à venir doivent être envoyés.
	lastSynced = get(cart).lastModified;
	if (channel) {
		channel.onmessage = (event: MessageEvent<CartState>) => applyRemoteCart(event.data);
	}
	cart.subscribe(() => {
		// Vrai debounce : chaque changement annule le timer précédent au lieu
		// d'en empiler un nouveau (sinon N changements rapprochés déclenchent
		// N appels à `persistCart`).
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			debounceTimer = null;
			persistCart();
		}, SYNC_DEBOUNCE_MS);
	});
	// Fermeture/masquage de l'onglet : on force l'envoi immédiat pour ne pas
	// perdre un changement encore en attente de debounce ou de retry.
	window.addEventListener('pagehide', () => {
		if (debounceTimer) {
			clearTimeout(debounceTimer);
			debounceTimer = null;
		}
		if (retryTimer) {
			clearTimeout(retryTimer);
			retryTimer = null;
		}
		persistCart();
	});
}

/**
 * Bascule le mode de synchro (ex : connexion en cours de session) et refixe
 * la référence sur l'état courant, pour ne pas renvoyer immédiatement
 * l'état pré-connexion vers la nouvelle cible.
 */
export function setCartSyncAuthenticated(value: boolean) {
	authenticated = value;
	lastSynced = get(cart).lastModified;
}
