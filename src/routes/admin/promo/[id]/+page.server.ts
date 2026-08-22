import type { PageServerLoad, Actions } from './$types';
import { error } from '@sveltejs/kit';
import { superValidate, fail, message } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';

import { updatePromoSchema } from '$lib/schema/promo/promoSchema';
import { getPromoCodeById, updatePromoCode, getPromoCodeByCode } from '$lib/prisma/promo/promo';
import { requireAdmin } from '$lib/admin/guards';

export const load: PageServerLoad = async ({ params }) => {
	const promo = await getPromoCodeById(params.id);

	if (!promo) {
		throw error(404, 'Code promo introuvable');
	}

	const initialData = {
		id: promo.id,
		code: promo.code,
		type: promo.type,
		value: promo.value,
		minAmount: promo.minAmount ?? undefined,
		usageLimit: promo.usageLimit ?? undefined,
		expiresAt: promo.expiresAt ? promo.expiresAt.toISOString().slice(0, 10) : undefined,
		active: promo.active
	};

	const updatePromoForm = await superValidate(initialData, zod(updatePromoSchema));

	return { updatePromoForm };
};

export const actions: Actions = {
	updatePromo: async ({ request, locals }) => {
		requireAdmin(locals);
		const formData = await request.formData();
		const form = await superValidate(formData, zod(updatePromoSchema));

		if (!form.valid) {
			return fail(400, { form });
		}

		try {
			// Empêcher un doublon de code sur un autre enregistrement
			const existing = await getPromoCodeByCode(form.data.code);
			if (existing && existing.id !== form.data.id) {
				return message(form, 'Un autre code promo utilise déjà ce code', { status: 400 });
			}

			await updatePromoCode(form.data.id, {
				code: form.data.code,
				type: form.data.type,
				value: form.data.value,
				minAmount: form.data.minAmount,
				usageLimit: form.data.usageLimit,
				expiresAt: form.data.expiresAt,
				active: form.data.active
			});

			return message(form, 'Code promo mis à jour avec succès');
		} catch (error) {
			console.error('Error updating promo code:', error);
			return fail(500, { message: 'Échec de la mise à jour du code promo' });
		}
	}
};
