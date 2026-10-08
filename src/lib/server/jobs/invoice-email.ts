import { prisma } from '$lib/server';
import { withLock } from '$lib/server/lock';
import { sendInvoiceEmail } from '$lib/server/invoice/email';
import { log } from '$lib/server/log';
import { withDuration, incrementMetric } from '$lib/server/metrics';
import { RefillingTokenBucket } from '$lib/server/rate-limit';
import { reportIfRepeated } from '$lib/server/alerting';
import { mapTransaction } from '$lib/prisma/transaction/mapTransaction';

/**
 * Débit volontairement conservateur envers le fournisseur SMTP (Brevo) :
 * 1 e-mail/s en soutenu, rafale de 5 — à ajuster selon le plan souscrit (voir
 * docs/commerce/README.md). Bucket global (une seule clé `'global'`), pas par
 * transaction : c'est le débit d'envoi total qui doit rester sous la limite
 * du fournisseur, pas un quota par commande.
 */
const smtpSendBucket = new RefillingTokenBucket<string>(5, 1, 'smtp-send');

/**
 * Envoi de la facture, sorti du job Sendcloud (`post-payment.ts`) : un pic de
 * commandes ne doit pas coupler l'envoi SMTP (ses propres limites de débit,
 * voir `$lib/server/invoice/email.ts`) à la disponibilité de Sendcloud, ni
 * l'inverse — chacun a son propre retry QStash indépendant.
 */
export async function runInvoiceEmailJob(transactionId: string): Promise<void> {
	await withDuration('job.invoice-email', () =>
		withLock(`invoice-email:${transactionId}`, 60, async () => {
			const rawTransaction = await prisma.transaction.findUnique({ where: { id: transactionId } });
			const transaction = rawTransaction ? mapTransaction(rawTransaction) : rawTransaction;
			if (!transaction) {
				log(
					'ERROR',
					'invoice-email',
					`Transaction introuvable pour le job facture: ${transactionId}`
				);
				return;
			}

			if (transaction.status !== 'paid') {
				log(
					'WARN',
					'invoice-email',
					'Statut de paiement non "paid", envoi de facture ignoré. Statut:',
					transaction.status
				);
				return;
			}

			// Rejet plutôt qu'attente bloquante : un pic de commandes ne doit
			// jamais faire traîner ce job, QStash retente déjà avec son propre
			// backoff (voir `/api/jobs/invoice-email`).
			if (!(await smtpSendBucket.consume('global', 1))) {
				await incrementMetric('smtp.throttled');
				await reportIfRepeated('smtp-throttled', {
					threshold: 30,
					windowSeconds: 300,
					message: 'Débit SMTP saturé de façon prolongée (30+ rejets en 5 min)'
				});
				throw new Error(
					`Débit SMTP atteint, nouvel essai via QStash pour la transaction ${transactionId}`
				);
			}

			await sendInvoiceEmail(transaction);
			log('INFO', 'invoice-email', 'Facture envoyée', { transactionId });
		})
	);
}
