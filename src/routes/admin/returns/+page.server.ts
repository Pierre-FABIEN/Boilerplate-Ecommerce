import type { Actions, PageServerLoad } from './$types';
import { fail } from '@sveltejs/kit';
import { assertAdmin, requireAdmin } from '$lib/admin/guards';
import {
	getAllReturnRequests,
	getReturnRequestById,
	markReturnApproved,
	markReturnCredited,
	markReturnRejected
} from '$lib/prisma/returns/returns';
import { createGiftCard } from '$lib/prisma/giftCards/giftCards';
import { stripe } from '$lib/server/stripe';
import { createSendcloudReturnLabel } from '$lib/sendcloud/returnLabel';
import { log } from '$lib/server/log';
import { sendMail } from '$lib/server/smtp-mail';
import { getStoreFeatureFlags } from '$lib/server/storeSettings';
import { buildCreditNoteView } from '$lib/server/creditNote/view';
import { sendCreditNoteEmail } from '$lib/server/creditNote/email';
import { getInvoiceCompany } from '$lib/server/invoice/company';
import { withLock } from '$lib/server/lock';

/**
 * Gestion admin des demandes de retour (`ReturnRequest`).
 *
 * COMMERCE-PLUGIN : approuver déclenche soit un remboursement Stripe intégral
 * et automatique (voir clarification produit) — `Transaction.stripePaymentId`
 * est l'id de la Checkout Session, pas du PaymentIntent : il faut d'abord la
 * relire (`sessions.retrieve` avec `expand: ['payment_intent']`) avant de
 * pouvoir appeler `stripe.refunds.create` — soit, alternative choisie par
 * l'admin (`?/creditStore`), un crédit compte : `GiftCard` émise pour le
 * montant intégral de la transaction, envoyée par e-mail, aucun appel
 * Stripe. N'apparaît que si `giftCardsEnabled` est actif (le crédit s'appuie
 * sur ce module).
 *
 * Dans les deux cas, un avoir PDF (`$lib/server/creditNote/`) est généré et
 * envoyé par e-mail — best-effort, un échec ne doit jamais annuler le
 * remboursement/crédit déjà acquis.
 */
export const load: PageServerLoad = async ({ locals, url }) => {
	assertAdmin(locals);

	const { items, total, page, perPage } = await getAllReturnRequests({
		page: Number(url.searchParams.get('page')) || undefined,
		perPage: Number(url.searchParams.get('perPage')) || undefined
	});
	const { giftCardsEnabled } = await getStoreFeatureFlags();

	return {
		returnRequests: items.map((item) => ({
			...item,
			createdAt: item.createdAt.toISOString()
		})),
		total,
		page,
		perPage,
		giftCardsEnabled
	};
};

export const actions: Actions = {
	approve: async ({ request, locals }) => {
		requireAdmin(locals);
		const formData = await request.formData();
		const id = String(formData.get('id') ?? '');

		// Un double-clic (ou deux admins) ne doit pas rembourser deux fois : le
		// contrôle de statut et l'écriture qui en sort sont dans la même section
		// critique, pas deux lectures/écritures isolées (§1.3 de l'audit).
		const result = await withLock(`return:${id}`, 30, async () => {
			const returnRequest = await getReturnRequestById(id);
			if (!returnRequest) {
				return fail(404, { message: 'Demande introuvable' });
			}
			if (returnRequest.status !== 'REQUESTED') {
				return fail(400, { message: 'Cette demande a déjà été traitée' });
			}

			try {
				const session = await stripe.checkout.sessions.retrieve(
					returnRequest.transaction.stripePaymentId,
					{ expand: ['payment_intent'] }
				);
				const paymentIntentId =
					typeof session.payment_intent === 'string'
						? session.payment_intent
						: session.payment_intent?.id;

				if (!paymentIntentId) {
					return fail(500, { message: 'Paiement Stripe introuvable pour cette transaction' });
				}

				const refund = await stripe.refunds.create({
					payment_intent: paymentIntentId,
					amount: Math.round(returnRequest.transaction.amount * 100)
				});

				const updated = await markReturnApproved(id, refund.id);

				try {
					const creditNote = buildCreditNoteView(
						returnRequest.transaction,
						updated.creditNoteNumber!,
						'REFUND',
						await getInvoiceCompany()
					);
					await sendCreditNoteEmail(creditNote);
				} catch (creditNoteErr) {
					log('WARN', 'returns', 'Avoir non envoyé', {
						returnRequestId: id,
						error: creditNoteErr instanceof Error ? creditNoteErr.message : String(creditNoteErr)
					});
				}

				// Best-effort : le remboursement est déjà acquis, une étiquette de
				// retour qui échoue ne doit pas repasser la demande en échec.
				try {
					await createSendcloudReturnLabel(id, {
						shippingMethodId: returnRequest.transaction.shippingMethodId,
						package_weight: returnRequest.transaction.package_weight
					});
				} catch (labelErr) {
					log('WARN', 'returns', 'Étiquette de retour Sendcloud non générée', {
						returnRequestId: id,
						error: labelErr instanceof Error ? labelErr.message : String(labelErr)
					});
				}

				return { success: true };
			} catch (err) {
				console.error('Erreur remboursement Stripe:', err);
				return fail(500, { message: 'Échec du remboursement Stripe' });
			}
		});

		if (result === null) {
			return fail(409, { message: 'Cette demande est déjà en cours de traitement, réessayez.' });
		}
		return result;
	},

	creditStore: async ({ request, locals }) => {
		requireAdmin(locals);
		const formData = await request.formData();
		const id = String(formData.get('id') ?? '');

		const { giftCardsEnabled } = await getStoreFeatureFlags();
		if (!giftCardsEnabled) {
			return fail(400, {
				message: 'Le module cartes cadeaux doit être activé pour créditer un compte'
			});
		}

		// Même verrou que `approve` : sans lui, un double-clic créerait deux
		// `GiftCard` distinctes pour le même retour (§1.3 de l'audit).
		const result = await withLock(`return:${id}`, 30, async () => {
			const returnRequest = await getReturnRequestById(id);
			if (!returnRequest) {
				return fail(404, { message: 'Demande introuvable' });
			}
			if (returnRequest.status !== 'REQUESTED') {
				return fail(400, { message: 'Cette demande a déjà été traitée' });
			}

			const giftCard = await createGiftCard({
				initialValue: returnRequest.transaction.amount,
				recipientEmail: returnRequest.user.email,
				note: `Retour ${returnRequest.transaction.invoiceNumber ?? returnRequest.transactionId}`
			});

			const updated = await markReturnCredited(id, giftCard.id);

			await sendMail({
				to: returnRequest.user.email,
				subject: 'Votre retour a été crédité sur votre compte 🎁',
				text: `Bonjour, votre retour a été accepté et crédité sous forme d'avoir de ${giftCard.initialValue.toFixed(2)} € : utilisez le code ${giftCard.code} lors de votre prochaine commande.`,
				html: `<p>Bonjour,</p><p>Votre retour a été accepté et crédité sous forme d'avoir de <strong>${giftCard.initialValue.toFixed(2)} €</strong> : utilisez le code <strong>${giftCard.code}</strong> lors de votre prochaine commande.</p>`
			});

			try {
				const creditNote = buildCreditNoteView(
					returnRequest.transaction,
					updated.creditNoteNumber!,
					'STORE_CREDIT',
					await getInvoiceCompany()
				);
				await sendCreditNoteEmail(creditNote);
			} catch (creditNoteErr) {
				log('WARN', 'returns', 'Avoir non envoyé', {
					returnRequestId: id,
					error: creditNoteErr instanceof Error ? creditNoteErr.message : String(creditNoteErr)
				});
			}

			// Best-effort, comme pour l'approbation Stripe : le crédit est déjà
			// acquis, une étiquette de retour qui échoue ne doit pas le remettre en cause.
			try {
				await createSendcloudReturnLabel(id, {
					shippingMethodId: returnRequest.transaction.shippingMethodId,
					package_weight: returnRequest.transaction.package_weight
				});
			} catch (labelErr) {
				log('WARN', 'returns', 'Étiquette de retour Sendcloud non générée', {
					returnRequestId: id,
					error: labelErr instanceof Error ? labelErr.message : String(labelErr)
				});
			}

			return { success: true };
		});

		if (result === null) {
			return fail(409, { message: 'Cette demande est déjà en cours de traitement, réessayez.' });
		}
		return result;
	},

	reject: async ({ request, locals }) => {
		requireAdmin(locals);
		const formData = await request.formData();
		const id = String(formData.get('id') ?? '');

		const result = await withLock(`return:${id}`, 30, async () => {
			const returnRequest = await getReturnRequestById(id);
			if (!returnRequest) {
				return fail(404, { message: 'Demande introuvable' });
			}
			if (returnRequest.status !== 'REQUESTED') {
				return fail(400, { message: 'Cette demande a déjà été traitée' });
			}

			await markReturnRejected(id);
			return { success: true };
		});

		if (result === null) {
			return fail(409, { message: 'Cette demande est déjà en cours de traitement, réessayez.' });
		}
		return result;
	}
};
