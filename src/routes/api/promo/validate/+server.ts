/**
 * PROMO-PLUGIN : validation JSON pour le checkout. Ouverte : le code est
 * relu au `?/checkout`, un `discountAmount` client n'est jamais crédité.
 */
import { json } from '@sveltejs/kit';
import { validatePromo } from '$lib/prisma/promo/promo';

export const POST = async ({ request }) => {
	try {
		const { code, productTotalTTC } = await request.json();
		const total = Number(productTotalTTC) || 0;

		const result = await validatePromo(code, total);

		return json({
			valid: result.valid,
			discountAmount: result.discountAmount,
			reason: result.reason ?? null,
			code: result.promo?.code ?? null
		});
	} catch (error) {
		console.error('Error validating promo code:', error);
		return json(
			{ valid: false, discountAmount: 0, reason: 'Erreur serveur', code: null },
			{ status: 500 }
		);
	}
};
