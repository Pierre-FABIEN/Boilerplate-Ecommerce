/** CONTACT-PLUGIN : schéma Zod du formulaire public. */
import { z } from 'zod';

export const contactSchema = z.object({
	name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères.'),
	email: z.string().email("L'email n'est pas valide."),
	subject: z.string().min(5, 'Le sujet doit contenir au moins 5 caractères.'),
	message: z.string().min(10, 'Le message doit contenir au moins 10 caractères.')
});
