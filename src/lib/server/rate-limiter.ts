import { RefillingTokenBucket } from '$lib/server/rate-limit';
import type { RequestEvent } from '@sveltejs/kit';

/**
 * Extrait l'adresse IP du client à partir de la requête.
 * Prend en compte le header `x-forwarded-for` pour les déploiements derrière un proxy.
 *
 * @param event L'événement de la requête SvelteKit.
 * @returns L'adresse IP du client.
 */
export function getClientIP(event: RequestEvent): string {
	const xff = event.request.headers.get('x-forwarded-for');
	if (xff && typeof xff === 'string') {
		return xff.split(',')[0].trim();
	}
	try {
		return event.getClientAddress();
	} catch {
		// Peut échouer dans certains environnements (ex: pré-rendu)
		return '127.0.0.1';
	}
}

/**
 * Limiteur de débit pour le formulaire de contact.
 *
 * Paramètres :
 * - `refillAmount`: 5 (jetons par intervalle)
 * - `refillInterval`: 60000 (1 minute)
 *
 * Permet 5 soumissions par minute par adresse IP.
 */
export const contactFormLimiter = new RefillingTokenBucket<string>(
	5, // Capacité : 5 requêtes
	5 / 60 // Taux : 5 requêtes par 60 secondes
);
