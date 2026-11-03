import Stripe from 'stripe';
import { STRIPE_SECRET_KEY } from '$app/env/private';

// `new Stripe(...)` est différé au premier accès réel : SvelteKit 3 importe
// chaque module serveur du graphe de routes pendant la phase « Analysing
// routes » du build (analyse statique du prerendering), y compris ceux dont
// la route n'a pas besoin de Stripe à cette requête-ci — une instanciation au
// chargement du module ferait donc planter tout le build dès que la clé est
// absente (CI avec des secrets factices, par exemple). Un `Proxy` laisse les
// 6 sites d'appel (`import { stripe } from '#lib/server/stripe'` puis
// `stripe.customers.create(...)`, etc.) inchangés.
let client: Stripe | undefined;

function getClient(): Stripe {
	if (!client) {
		client = new Stripe(STRIPE_SECRET_KEY, {
			apiVersion: '2025-08-27.basil'
		});
	}
	return client;
}

export const stripe = new Proxy({} as Stripe, {
	get(_target, property, receiver) {
		return Reflect.get(getClient(), property, receiver);
	}
});
