/**
 * Persistance du panier.
 *
 * COMMERCE-PLUGIN : authentifié, propriétaire de la commande PENDING, prix
 * relus depuis le catalogue. Sans ça, n'importe qui qui connaît un `orderId`
 * réécrit le panier d'un autre compte.
 */
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { saveCartForUser } from '$lib/commerce/cart';
import { CartForbiddenError, UnknownProductError } from '$lib/commerce/errors';

export const POST: RequestHandler = async ({ request, locals }) => {
	const userId = locals.user?.id;
	if (!userId) {
		error(401, 'Unauthorized');
	}

	try {
		const body = await request.json();
		const orderId = body?.id as string | undefined;
		const items = Array.isArray(body?.items) ? body.items : null;

		if (!orderId || !items) {
			return json({ error: 'Order ID is missing' }, { status: 400 });
		}

		const updatedOrder = await saveCartForUser(userId, orderId, items);
		return json(updatedOrder);
	} catch (err) {
		if (err instanceof CartForbiddenError) {
			error(403, err.message);
		}
		if (err instanceof UnknownProductError) {
			return json({ error: err.message }, { status: 400 });
		}
		console.error('Error updating order:', err);
		return json({ error: 'Failed to update order items' }, { status: 500 });
	}
};
