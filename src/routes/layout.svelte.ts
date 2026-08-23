import { writable } from 'svelte/store';
import SmoothScrollBarStore from '$lib/store/SmoothScrollBarStore';

export const isClient = writable(false);

export function initializeLayoutState() {
	isClient.set(true);

	SmoothScrollBarStore.update((state) => {
		if (state.smoothScroll) {
			state.smoothScroll.scrollTo(0, 0, 500);
		} else {
			window.scrollTo(0, 0);
		}
		return state;
	});
}
