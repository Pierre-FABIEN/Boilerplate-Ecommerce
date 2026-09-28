/**
 * Jeton à usage unique du lien « Ce n'était pas moi » — voir le commentaire
 * du modèle `SessionRevokeToken` dans `schema.prisma` pour la raison d'être
 * (jamais le `Session.id` lui-même dans un e-mail).
 */
import { prisma } from '$lib/server';
import { generateSecureToken } from '$lib/lucia/ids';

const TTL_DAYS = 7;

export async function createSessionRevokeToken(userId: string, sessionId: string) {
	const token = generateSecureToken();
	await prisma.sessionRevokeToken.create({
		data: {
			id: token,
			userId,
			sessionId,
			expiresAt: new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000)
		}
	});
	return token;
}

/**
 * Lecture sans consommation, pour la page de confirmation (`load`) — jamais
 * de suppression ici : un simple chargement de page (y compris par un
 * scanner de liens automatique dans un client mail) ne doit jamais révoquer
 * quoi que ce soit. Seule `consumeSessionRevokeToken`, appelée depuis
 * l'action `?/confirm` (un clic humain réel), le fait.
 */
export async function peekSessionRevokeToken(
	token: string
): Promise<{ userId: string; sessionId: string } | null> {
	const row = await prisma.sessionRevokeToken.findUnique({ where: { id: token } });
	if (!row || row.expiresAt.getTime() < Date.now()) {
		return null;
	}
	return { userId: row.userId, sessionId: row.sessionId };
}

/**
 * Consomme le jeton (le supprime dans le même mouvement que la lecture —
 * `delete` échoue proprement si la ligne n'existe déjà plus, un double clic
 * ou une réutilisation ne peut donc jamais revoquer deux fois). Renvoie
 * `null` si le jeton est inconnu ou expiré, sans jamais distinguer les deux
 * côté appelant (même logique anti-oracle que `deleteSessionForUser`) — un
 * jeton expiré ne doit pas se distinguer d'un jeton qui n'a jamais existé.
 */
export async function consumeSessionRevokeToken(
	token: string
): Promise<{ userId: string; sessionId: string } | null> {
	let row;
	try {
		row = await prisma.sessionRevokeToken.delete({ where: { id: token } });
	} catch {
		return null;
	}

	if (row.expiresAt.getTime() < Date.now()) {
		return null;
	}

	return { userId: row.userId, sessionId: row.sessionId };
}
