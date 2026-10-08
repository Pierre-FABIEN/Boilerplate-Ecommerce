/**
 * Historique des connexions (`LoginEvent`) — distinct des sessions actives
 * (`$lib/prisma/session/sessions.ts`) : une ligne par authentification
 * réelle, jamais par réémission de session (2FA, changement de mot de
 * passe), et jamais supprimée à l'expiration/révocation de la session
 * qu'elle documente. Voir le commentaire du modèle dans `schema.prisma`.
 */
import { prisma } from '$lib/server';
import type { SessionDeviceContext } from '$lib/lucia/deviceContext';
import { normalizeDeviceFingerprint } from '$lib/lucia/deviceLabel';

export type LoginMethod = 'password' | 'google' | 'password-reset' | 'signup';

/**
 * Enregistre une connexion et détermine si l'appareil est inédit pour ce
 * compte — comparaison sur une empreinte normalisée (OS + navigateur +
 * version majeure, `normalizeDeviceFingerprint()`) contre tout l'historique
 * (jamais seulement les sessions encore actives, qui expirent ou sont
 * révoquées bien avant que « je n'ai pas vu ce téléphone depuis 3 mois »
 * cesse d'être une information utile). Jamais une comparaison du
 * `User-Agent` brut : Chrome se met à jour toutes les ~4 semaines, ça
 * enverrait une alerte quasi mensuelle pour la propre machine de
 * l'utilisateur (RESTE_A_FAIRE.md § A.2.5).
 *
 * Un `userAgent` absent (`null`) ou non reconnu ne déclenche jamais
 * d'alerte : impossible de savoir s'il s'agit d'un appareil déjà vu, mieux
 * vaut ne rien affirmer que se tromper dans un sens ou l'autre.
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
	const fingerprint = normalizeDeviceFingerprint(device.userAgent);

	let isNewDevice = false;
	if (method !== 'signup' && fingerprint) {
		// Empreinte normalisée, donc impossible à comparer en SQL : on relit les
		// User-Agent distincts récents de ce compte et on normalise en mémoire.
		// Borné à 50 — au-delà, un appareil aussi ancien n'est plus pertinent
		// pour cette alerte.
		const recentAgents = await prisma.loginEvent.findMany({
			where: { userId, userAgent: { not: null } },
			select: { userAgent: true },
			distinct: ['userAgent'],
			orderBy: { createdAt: 'desc' },
			take: 50
		});
		isNewDevice = !recentAgents.some(
			(event) => normalizeDeviceFingerprint(event.userAgent) === fingerprint
		);
	}

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
