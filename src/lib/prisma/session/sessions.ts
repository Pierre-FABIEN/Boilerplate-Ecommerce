import { prisma } from '$lib/server';

export const createSessionInDB = async (data: {
	id: string;
	userId: string;
	expiresAt: Date;
	twoFactorVerified: boolean;
	oauthProvider?: string | null;
	userAgent?: string | null;
	ipAddress?: string | null;
	city?: string | null;
	country?: string | null;
}) => {
	return await prisma.session.create({
		data
	});
};

export const findSessionById = async (token: string) => {
	return await prisma.session.findUnique({
		where: { id: token },
		include: { user: true }
	});
};

export const deleteSessionById = async (token: string) => {
	return await prisma.session.delete({
		where: { id: token }
	});
};

export const updateSessionExpiry = async (token: string, newExpiresAt: Date) => {
	return await prisma.session.update({
		where: { id: token },
		data: { expiresAt: newExpiresAt }
	});
};

export const deleteSession = async (sessionId: string) => {
	return await prisma.session.delete({
		where: { id: sessionId }
	});
};

export const deleteSessionsByUserId = async (userId: string) => {
	return await prisma.session.deleteMany({
		where: { userId }
	});
};

export const verifyTwoFactorForSession = async (sessionId: string) => {
	const updatedSession = await prisma.session.update({
		where: { id: sessionId },
		data: { twoFactorVerified: true }
	});
	// console.log('[prisma/session] Session mise à jour pour 2FA:', updatedSession);
	return updatedSession;
};

export const resetTwoFactorVerificationForUser = async (userId: string) => {
	return await prisma.session.updateMany({
		where: { userId },
		data: { twoFactorVerified: false }
	});
};

/** Sessions d'un compte, les plus récemment actives d'abord — voir /auth/settings/sessions. */
export const findSessionsForUser = async (userId: string) => {
	return await prisma.session.findMany({
		where: { userId },
		orderBy: { lastActiveAt: 'desc' }
	});
};

/**
 * Supprime une session précise, mais seulement si elle appartient bien à
 * `userId` — `id`+`userId` dans le même `where` rend la vérification de
 * propriété atomique avec la suppression (pas de fenêtre entre un contrôle
 * séparé et l'action, pas d'IDOR possible en devinant l'id d'une session).
 * Renvoie `count: 0` si la session n'existe pas ou appartient à quelqu'un
 * d'autre — l'appelant ne doit jamais distinguer les deux (pas d'oracle).
 */
export const deleteSessionForUser = async (userId: string, sessionId: string) => {
	return await prisma.session.deleteMany({
		where: { id: sessionId, userId }
	});
};

/** Toutes les sessions d'un compte sauf celle en cours — bouton « déconnecter les autres ». */
export const deleteOtherSessionsForUser = async (userId: string, currentSessionId: string) => {
	return await prisma.session.deleteMany({
		where: { userId, id: { not: currentSessionId } }
	});
};

/**
 * Marque une session comme active à l'instant présent — appelée depuis
 * `$lib/lucia/hooks.ts`, jamais bloquante pour la requête (best-effort,
 * voir l'appelant). Déjà bornée à ~1 écriture toutes les 8s par visiteur par
 * le cache d'identité Redis (`SESSION_IDENTITY_CACHE_TTL_SECONDS`) : pas
 * besoin d'un seuil de fraîcheur supplémentaire ici.
 */
export const touchSessionActivity = async (sessionId: string) => {
	return await prisma.session.update({
		where: { id: sessionId },
		data: { lastActiveAt: new Date() }
	});
};
