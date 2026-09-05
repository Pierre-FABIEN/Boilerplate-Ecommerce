import { Client, Receiver } from '@upstash/qstash';
import { runPostPaymentJob } from './jobs/post-payment';

/**
 * Queue Upstash QStash — HTTP, sans process persistant, cohérente avec le
 * déploiement serverless Vercel et avec Upstash Redis déjà en place.
 *
 * QStash doit rappeler une URL publique (jamais `localhost`) : `APP_URL` est
 * explicite, ou à défaut `VERCEL_URL` (fourni automatiquement par Vercel).
 * Sans l'un des deux, ou sans `QSTASH_TOKEN`, on retombe sur l'exécution
 * directe du job — comportement synchrone actuel, sans configuration
 * supplémentaire requise en local.
 */

function resolveAppUrl(): string | null {
	if (process.env.APP_URL) {
		return process.env.APP_URL.replace(/\/$/, '');
	}
	if (process.env.VERCEL_URL) {
		return `https://${process.env.VERCEL_URL}`;
	}
	return null;
}

export function isQStashConfigured(): boolean {
	return Boolean(process.env.QSTASH_TOKEN) && resolveAppUrl() !== null;
}

const globalForQStash = globalThis as unknown as { qstashClient?: Client };

function getClient(): Client {
	if (!globalForQStash.qstashClient) {
		globalForQStash.qstashClient = new Client({ token: process.env.QSTASH_TOKEN! });
	}
	return globalForQStash.qstashClient;
}

export function getQStashReceiver(): Receiver {
	return new Receiver({
		currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
		nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY
	});
}

/**
 * Enfile le travail post-paiement (facture + Sendcloud) pour la transaction
 * donnée. Sans QStash configuré, exécute le job directement — mêmes effets,
 * juste synchrones, comme avant l'introduction de la queue.
 */
export async function enqueuePostPaymentJob(transactionId: string): Promise<void> {
	if (!isQStashConfigured()) {
		await runPostPaymentJob(transactionId);
		return;
	}

	await getClient().publishJSON({
		url: `${resolveAppUrl()}/api/jobs/post-payment`,
		body: { transactionId }
	});
}
