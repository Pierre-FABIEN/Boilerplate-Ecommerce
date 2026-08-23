import { getAllContactSubmissions } from '$lib/prisma/contact/contact';
import type { PageServerLoad } from './$types';

/** CONTACT-PLUGIN : liste admin. Gardes = module admin. */

export const load = (async () => {
	const contactSubmissions = await getAllContactSubmissions();

	return {
		contactSubmissions
	};
}) satisfies PageServerLoad; 