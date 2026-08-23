import { derived, writable } from 'svelte/store';

export type LoadingStates = {
	firstOpen: boolean;
	domLoaded: boolean;
	ressourceToValide: boolean;
};

/**
 * Portes du splash initial. `firstLoadComplete` est dérivé : il passe à true
 * uniquement quand les trois portes sont ouvertes. On ne le force plus à la
 * main (c’est ce qui laissait l’écran bloqué quand le loader était commenté).
 *
 * - firstOpen : le shell client est monté
 * - domLoaded : document prêt (DOMContentLoaded / complete)
 * - ressourceToValide : polices prêtes (avec timeout de sécurité)
 */
export const loadingStates = writable<LoadingStates>({
	firstOpen: false,
	domLoaded: false,
	ressourceToValide: false
});

export const firstLoadComplete = derived(
	loadingStates,
	($states) => $states.firstOpen && $states.domLoaded && $states.ressourceToValide
);

export function setFirstOpen(value: boolean) {
	loadingStates.update((states) => ({ ...states, firstOpen: value }));
}

export function setDomLoaded(value: boolean) {
	loadingStates.update((states) => ({ ...states, domLoaded: value }));
}

export function setRessourceToValide(value: boolean) {
	loadingStates.update((states) => ({ ...states, ressourceToValide: value }));
}

const LOAD_TIMEOUT_MS = 2500;
const MIN_SPLASH_MS = 400;

/**
 * Ouvre les portes depuis le layout (pas depuis le splash).
 * Ainsi le chargement se termine même si le Loader n’est pas monté,
 * et un timeout évite un écran bloqué si `document.fonts` ne résout jamais.
 */
export function bootstrapInitialLoad(): () => void {
	setFirstOpen(true);

	if (typeof document === 'undefined') {
		return () => {};
	}

	if (document.readyState === 'complete' || document.readyState === 'interactive') {
		setDomLoaded(true);
	} else {
		document.addEventListener('DOMContentLoaded', () => setDomLoaded(true), { once: true });
	}

	let cancelled = false;
	const startedAt = Date.now();

	const finishResources = () => {
		if (cancelled) return;
		const remaining = Math.max(0, MIN_SPLASH_MS - (Date.now() - startedAt));
		setTimeout(() => {
			if (!cancelled) setRessourceToValide(true);
		}, remaining);
	};

	const timeout = setTimeout(finishResources, LOAD_TIMEOUT_MS);
	const fontsReady = document.fonts?.ready ?? Promise.resolve();

	Promise.resolve(fontsReady).finally(() => {
		clearTimeout(timeout);
		finishResources();
	});

	return () => {
		cancelled = true;
		clearTimeout(timeout);
	};
}
