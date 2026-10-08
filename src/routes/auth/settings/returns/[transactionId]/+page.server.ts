import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { prisma } from '$lib/server';
import { getStoreFeatureFlags } from '$lib/server/storeSettings';
import { createReturnRequest, getReturnRequestByTransactionId } from '$lib/prisma/returns/returns';

/**
 * Demande de retour sur une transaction payée.
 *
 * COMMERCE-PLUGIN / AUTH-PLUGIN : module activable — 404 si désactivé. Une
 * transaction ne peut avoir qu'une seule demande (`ReturnRequest.transactionId`
 * unique) : si elle existe déjà, cette page affiche son statut au lieu du
 * formulaire de demande.
 */
export const load = (async ({ locals, params }) => {
	const userId = locals.user?.id;
	if (!userId) {
		redirect(302, '/auth/login');
	}

	const { returnsEnabled } = await getStoreFeatureFlags();
	if (!returnsEnabled) {
		error(404, 'Page introuvable');
	}

	const transaction = await prisma.transaction.findUnique({
		where: { id: params.transactionId },
		select: {
			id: true,
			userId: true,
			status: true,
			invoiceNumber: true,
			amount: true,
			shippingOption: true,
			createdAt: true,
			shippingStatusUpdatedAt: true
		}
	});
	if (!transaction || transaction.userId !== userId) {
		error(404, 'Facture introuvable');
	}
	if (transaction.status !== 'paid') {
		error(400, "Cette commande ne peut pas faire l'objet d'un retour");
	}

	const returnRequest = await getReturnRequestByTransactionId(transaction.id);

	// Commande sur-mesure (gravure...) : exclue par la loi du droit de
	// rétractation (Code conso. L221-28, 3°, biens confectionnés selon les
	// spécifications du consommateur) — l'option n'est même pas proposée.
	const withdrawalEligible = transaction.shippingOption !== 'no_shipping';

	// Estimation informative seulement (aucune date de livraison réelle
	// tracée aujourd'hui, voir RESTE_A_FAIRE.md) : dernier statut
	// transporteur connu si disponible, sinon date de paiement — jamais
	// utilisée pour bloquer une demande. Le délai légal court à partir de la
	// réception réelle, systématiquement postérieure à cette estimation.
	const estimatedShippedAt = transaction.shippingStatusUpdatedAt ?? transaction.createdAt;
	const estimatedWithdrawalDeadline = new Date(
		estimatedShippedAt.getTime() + 14 * 24 * 60 * 60 * 1000
	);

	return {
		transaction,
		returnRequest,
		withdrawalEligible,
		estimatedShippedAt,
		estimatedWithdrawalDeadline
	};
}) satisfies PageServerLoad;

export const actions: Actions = {
	request: async ({ request, locals, params }) => {
		const userId = locals.user?.id;
		if (!userId) {
			return fail(401, { message: 'Non connecté' });
		}

		const { returnsEnabled } = await getStoreFeatureFlags();
		if (!returnsEnabled) {
			return fail(404, { message: 'Module désactivé' });
		}

		const transaction = await prisma.transaction.findUnique({
			where: { id: params.transactionId },
			select: { id: true, userId: true, status: true, shippingOption: true }
		});
		if (!transaction || transaction.userId !== userId || transaction.status !== 'paid') {
			return fail(404, { message: 'Facture introuvable' });
		}

		const existing = await getReturnRequestByTransactionId(transaction.id);
		if (existing) {
			return fail(400, { message: 'Une demande existe déjà pour cette commande' });
		}

		const formData = await request.formData();
		const rawKind = formData.get('kind');
		const kind = rawKind === 'WITHDRAWAL' ? 'WITHDRAWAL' : 'WARRANTY';

		// Jamais fait confiance à l'affichage client seul : une commande
		// sur-mesure reste exclue de la rétractation même si le champ caché
		// était manipulé côté client (Code conso. L221-28, 3°).
		if (kind === 'WITHDRAWAL' && transaction.shippingOption === 'no_shipping') {
			return fail(400, {
				message: 'Cette commande sur-mesure ne peut pas faire l’objet d’une rétractation légale'
			});
		}

		const reason = String(formData.get('reason') ?? '').trim();
		// La rétractation légale n'exige aucun motif (Code conso. L221-18 s.) ;
		// le retour SAV en a toujours besoin pour être instruit par l'admin.
		if (kind === 'WARRANTY' && !reason) {
			return fail(400, { message: 'Merci de préciser le motif du retour' });
		}

		await createReturnRequest({
			transactionId: transaction.id,
			userId,
			kind,
			reason: reason || (kind === 'WITHDRAWAL' ? 'Rétractation légale (sans motif)' : '')
		});

		return { success: true };
	}
};
