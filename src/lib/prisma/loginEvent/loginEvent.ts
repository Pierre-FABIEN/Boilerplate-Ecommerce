/**
 * Historique des connexions (`LoginEvent`) — distinct des sessions actives
 * (`$lib/prisma/session/sessions.ts`) : une ligne par authentification
 * réelle, jamais par réémission de session (2FA, changement de mot de
 * passe), et jamais supprimée à l'expiration/révocation de la session
 * qu'elle documente. Voir le commentaire du modèle dans `schema.prisma`.
 */
import { prisma } from '$lib/server';
import type { SessionDeviceContext } from '$lib/lucia/deviceContext';

export type LoginMethod = 'password' | 'google' | 'password-reset' | 'signup';

/**
 * Enregistre une connexion et détermine si l'appareil est inédit pour ce
 * compte — comparaison sur `userAgent` exact contre tout l'historique
 * (jamais seulement les sessions encore actives, qui expirent ou sont
 * révoquées bien avant que « je n'ai pas vu ce téléphone depuis 3 mois »
 * cesse d'être une information utile).
 *
 * Un `userAgent` absent (`null`) ne déclenche jamais d'alerte : impossible
 * de savoir s'il s'agit d'un appareil déjà vu, mieux vaut ne rien affirmer
 * que se tromper dans un sens ou l'autre.
 *
 * `method: 'signup'` est enregistré comme les autres (historique complet)
 * mais n'est jamais marqué « nouvel appareil » : la toute première connexion
 * d'un compte tout juste créé n'a par définition rien à comparer, et n'a
 * rien d'une alerte de sécurité. Décidé ici, une fois, plutôt que délégué à
 * chaque appelant (`src/routes/auth/signup/+page.server.ts`,
 * `login/google/callback/+server.ts`) — un futur point d'appel qui oublierait
 * de l'exclure enverrait une alerte à la création du compte.
 */
export async function recordLoginEvent(
	userId: string,
	method: LoginMethod,
	device: SessionDeviceContext
): Promise<{ isNewDevice: boolean }> {
	const isNewDevice =
		method !== 'signup' && device.userAgent
			? (await prisma.loginEvent.findFirst({
					where: { userId, userAgent: device.userAgent },
					select: { id: true }
				})) === null
			: false;

	await prisma.loginEvent.create({
		data: {
			userId,
			method,
			userAgent: device.userAgent,
			ipAddress: device.ipAddress,
			city: device.city,
			country: device.country,
			isNewDevice
		}
	});

	return { isNewDevice };
}

/** Historique le plus récent d'abord, pour /auth/settings/sessions. */
export async function findRecentLoginEvents(userId: string, limit = 10) {
	return prisma.loginEvent.findMany({
		where: { userId },
		orderBy: { createdAt: 'desc' },
		take: limit
	});
}
