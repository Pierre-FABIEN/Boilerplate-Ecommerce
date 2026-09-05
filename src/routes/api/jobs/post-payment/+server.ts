import { json } from '@sveltejs/kit';
import { getQStashReceiver } from '$lib/server/qstash';
import { runPostPaymentJob } from '$lib/server/jobs/post-payment';

/**
 * Appelé par QStash (`$lib/server/qstash.ts` → `enqueuePostPaymentJob`),
 * jamais directement par un client. La signature est vérifiée avant tout
 * traitement : sans ça, n'importe qui pourrait déclencher le job en POSTant
 * ici.
 *
 * Une erreur non attrapée par `runPostPaymentJob` remonte en 500, ce qui fait
 * retenter QStash selon sa politique par défaut.
 */
export async function POST({ request }) {
	const body = await request.text();
	const signature = request.headers.get('upstash-signature');

	if (!signature) {
		return json({ error: 'Signature manquante' }, { status: 401 });
	}

	try {
		await getQStashReceiver().verify({ signature, body, url: request.url });
	} catch (error) {
		console.error('⚠️ Signature QStash invalide.', error);
		return json({ error: 'Signature invalide' }, { status: 401 });
	}

	const { transactionId } = JSON.parse(body) as { transactionId?: string };
	if (!transactionId) {
		return json({ error: 'transactionId manquant' }, { status: 400 });
	}

	await runPostPaymentJob(transactionId);
	return json({ received: true }, { status: 200 });
}
