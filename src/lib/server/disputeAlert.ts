/**
 * Alerte admin sur un litige Stripe (`charge.dispute.created`/`.closed`,
 * webhook `/api/webhooks`) — jamais bloquant pour la réponse au webhook, un
 * échec d'envoi est seulement loggé. Toujours signalé à Sentry (visibilité
 * même sans `DISPUTE_ALERT_EMAIL` configuré), contrairement à
 * `reportIfRepeated` : un litige est rare et coûteux, chaque occurrence
 * mérite une alerte, pas seulement au-delà d'un seuil de répétition.
 */
import * as Sentry from '@sentry/sveltekit';
import { sendMail } from '$lib/server/smtp-mail';
import { log } from '$lib/server/log';
import { formatDisputeStatus } from '$lib/server/dispute';
import { formatMoney } from '$lib/utils/formatMoney';

type DisputeTransaction = {
	id: string;
	invoiceNumber: string | null;
	disputeStatus: string | null;
	disputeAmount: number | null;
	amount: number;
	currency: string;
};

export async function notifyDispute(
	transaction: DisputeTransaction,
	phase: 'created' | 'closed'
): Promise<void> {
	const reference = transaction.invoiceNumber ?? transaction.id;
	const statusLabel = formatDisputeStatus(transaction.disputeStatus ?? '');
	const amount = formatMoney(transaction.disputeAmount ?? transaction.amount, transaction.currency);
	const message =
		phase === 'created'
			? `Litige Stripe ouvert sur la transaction ${reference} (${amount}) — ${statusLabel}.`
			: `Litige Stripe clos sur la transaction ${reference} — ${statusLabel}.`;

	Sentry.captureMessage(message, {
		level: phase === 'created' ? 'error' : 'warning',
		tags: { alert: 'stripe-dispute', disputeStatus: transaction.disputeStatus ?? '' }
	});

	const recipient = process.env.DISPUTE_ALERT_EMAIL?.trim();
	if (!recipient) {
		log('WARN', 'dispute', 'DISPUTE_ALERT_EMAIL non configuré, alerte e-mail ignorée');
		return;
	}

	try {
		await sendMail({
			to: recipient,
			subject:
				phase === 'created'
					? `⚠️ Litige Stripe ouvert — ${reference}`
					: `Litige Stripe clos — ${reference}`,
			text: `${message}\n\nTransaction : ${transaction.id} (voir /admin/sales).`,
			html: `<p>${message}</p><p>Transaction <code>${transaction.id}</code> — voir <code>/admin/sales</code>.</p>`
		});
	} catch (err) {
		log('ERROR', 'dispute', 'Échec envoi alerte litige', {
			transactionId: transaction.id,
			error: err instanceof Error ? err.message : String(err)
		});
	}
}
