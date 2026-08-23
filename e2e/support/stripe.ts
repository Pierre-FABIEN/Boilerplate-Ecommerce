/**
 * Fixture HTTP du webhook Stripe : signature HMAC, pas d'appel réseau.
 *
 * COMMERCE-PLUGIN : `stripe.webhooks.generateTestHeaderString` signe le même
 * corps que celui posté à `/api/webhooks`. Le secret est celui de `.env.test`.
 */
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_e2e');

export function stripeWebhookSecret(): string {
	return process.env.STRIPE_WEBHOOK_SECRET || 'whsec_e2e';
}

type CompletedSessionFields = {
	sessionId: string;
	orderId: string;
	email: string;
	amountCents?: number;
};

/** Corps brut d'un `checkout.session.completed`, prêt à être signé. */
export function checkoutSessionCompletedPayload(fields: CompletedSessionFields): string {
	const created = Math.floor(Date.now() / 1000);
	return JSON.stringify({
		id: `e2e-evt-${fields.sessionId}`,
		object: 'event',
		api_version: '2024-11-20.acacia',
		created,
		type: 'checkout.session.completed',
		data: {
			object: {
				id: fields.sessionId,
				object: 'checkout.session',
				amount_total: fields.amountCents ?? 1250,
				currency: 'eur',
				payment_status: 'paid',
				customer_details: {
					email: fields.email,
					name: 'E2e Tester',
					phone: null
				},
				metadata: { order_id: fields.orderId },
				created
			}
		}
	});
}

export function signStripePayload(payload: string, secret = stripeWebhookSecret()): string {
	return stripe.webhooks.generateTestHeaderString({ payload, secret });
}
