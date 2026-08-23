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
 * CONTACT-PLUGIN : 5 envois valides d'affilée par IP, puis 1 jeton toutes
 * les 60 s. Le quota n'est consommé que si Zod a accepté le formulaire.
 */
export const contactFormLimiter = new RefillingTokenBucket<string>(5, 60);
