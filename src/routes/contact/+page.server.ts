/**
 * CONTACT-PLUGIN : formulaire public. Les messages vont dans `ContactSubmission`.
 * Pas d'email transactionnel : la preuve est la ligne en base. Le limiteur
 * (`contactFormLimiter`) compte les envois valides, 5 par IP et par minute.
 */
import { fail, type Actions } from '@sveltejs/kit';
import { message, superValidate } from 'sveltekit-superforms';
import { zod } from 'sveltekit-superforms/adapters';

import type { PageServerLoad } from './$types';
import { contactSchema } from '$lib/schema/contact/contactSchema';
import { createContactSubmission } from '$lib/prisma/contact/contact';
import { contactFormLimiter, getClientIP } from '$lib/server/rate-limiter';

export const load = (async () => {
	const form = await superValidate(zod(contactSchema));
	return { form };
}) satisfies PageServerLoad;

export const actions: Actions = {
	send: async (event) => {
		const form = await superValidate(event.request, zod(contactSchema));
		if (!form.valid) {
			return fail(400, { form });
		}

		const ip = getClientIP(event);
		if (!contactFormLimiter.consume(ip, 1)) {
			return fail(429, { message: 'Too many requests' });
		}

		try {
			await createContactSubmission({
				name: form.data.name,
				email: form.data.email,
				subject: form.data.subject,
				message: form.data.message
			});
			return message(form, 'Message envoyé');
		} catch (error) {
			console.error('Error creating contact submission:', error);
			return fail(500, { form, message: "Impossible d'envoyer le message." });
		}
	}
};
