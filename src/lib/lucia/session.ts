// -----------------------------------------------------------------------------
// Cycle de vie des sessions.
//
// Le token est généré côté serveur, stocké tel quel dans un cookie `httpOnly`
// et sert d'identifiant de ligne. Durée de vie : 30 jours, prolongée
// automatiquement dès qu'il reste moins de 15 jours (session « glissante »).
//
// `twoFactorVerified` est porté par la session, pas par le compte : chaque
// nouvelle connexion doit revalider la 2FA.
// -----------------------------------------------------------------------------

import type { RequestEvent } from '@sveltejs/kit';
import { generateSecureToken, isValidId } from './ids';
import type { User } from './user';
import { findUserByGoogleId, createUserWithGoogleOAuth } from '$lib/prisma/user/user';
import {
	createSessionInDB,
	deleteSession,
	deleteSessionById,
	deleteSessionsByUserId,
	findSessionById,
	updateSessionExpiry,
	verifyTwoFactorForSession
} from '$lib/prisma/session/sessions';
import { auth } from '.';
import { invalidateCache } from '$lib/server/cache';
import type { SessionDeviceContext } from './deviceContext';

export interface SessionFlags {
	twoFactorVerified: boolean;
}

/** Cache court de l'identité résolue par requête (voir `$lib/lucia/hooks.ts`). */
export const SESSION_IDENTITY_CACHE_TTL_SECONDS = 8;
export function sessionIdentityCacheKey(sessionId: string): string {
	return `session-identity:${sessionId}`;
}

export interface Session extends SessionFlags {
	id: string;
	expiresAt: Date;
	userId: string;
	oauthProvider: string | null;
	fresh?: boolean;
}

type SessionValidationResult = { session: Session; user: User } | { session: null; user: null };

export function generateSessionToken(): string {
	return generateSecureToken();
}

export async function createSession(
	token: string,
	userId: string,
	flags: SessionFlags,
	oauthProvider?: string | null,
	device?: SessionDeviceContext
): Promise<Session> {
	if (!isValidId(userId)) {
		throw new Error('Invalid user ID format');
	}

	const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

	try {
		const session = await createSessionInDB({
			id: token,
			userId,
			expiresAt,
			twoFactorVerified: flags.twoFactorVerified,
			oauthProvider: oauthProvider ?? null,
			userAgent: device?.userAgent ?? null,
			ipAddress: device?.ipAddress ?? null,
			city: device?.city ?? null,
			country: device?.country ?? null
		});

		return {
			...session,
			oauthProvider: session.oauthProvider
		};
	} catch (error) {
		console.error('Erreur lors de la création de la session :', error);
		throw new Error('Erreur lors de la création de la session.');
	}
}

// Valide le token de session
export async function validateSessionToken(token: string): Promise<SessionValidationResult> {
	try {
		const result = await findSessionById(token);

		if (!result) {
			return { session: null, user: null };
		}

		// Vérifie l'expiration de la session
		if (Date.now() >= result.expiresAt.getTime()) {
			await deleteSessionById(token);
			return { session: null, user: null };
		}

		// Prolonge la session si elle est proche de l'expiration
		if (Date.now() >= result.expiresAt.getTime() - 1000 * 60 * 60 * 24 * 15) {
			const newExpiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);
			await updateSessionExpiry(token, newExpiresAt);
			result.expiresAt = newExpiresAt;
		}

		const session: Session = {
			id: result.id,
			userId: result.userId,
			expiresAt: result.expiresAt,
			twoFactorVerified: result.twoFactorVerified,
			oauthProvider: result.oauthProvider
			// fresh: result.fresh // Retiré, car fresh vient de Lucia, pas de Prisma
		};

		const user: User = {
			id: result.user.id,
			email: result.user.email,
			username: result.user.username,
			emailVerified: result.user.emailVerified,
			registered2FA: result.user.totpKey !== null,
			googleId: result.user.googleId,
			name: result.user.name,
			picture: result.user.picture,
			role: result.user.role,
			isMfaEnabled: result.user.isMfaEnabled,
			totpKey: result.user.totpKey ? result.user.totpKey.toString() : null
		};

		return { session, user };
	} catch (error: unknown) {
		if (error instanceof Error) {
			console.error('Erreur lors de la validation de la session :', error);
			return { session: null, user: null };
		} else {
			console.error('Erreur inconnue lors de la validation de la session :', error);
			return { session: null, user: null };
		}
	}
}

// Invalide une session spécifique
export async function invalidateSession(sessionId: string): Promise<void> {
	try {
		await deleteSession(sessionId);
	} catch (error: unknown) {
		if (error instanceof Error) {
			console.warn("Erreur lors de l'invalidation de la session :", error.message);
		} else {
			console.warn("Erreur inconnue lors de l'invalidation de la session :", error);
		}
	}
	// Best-effort : même si la suppression DB a échoué, ne pas laisser une
	// identité mise en cache survivre à une déconnexion explicite.
	await invalidateCache(sessionIdentityCacheKey(sessionId));
}

// Invalide toutes les sessions d'un utilisateur
export async function invalidateUserSessions(userId: string): Promise<void> {
	if (!isValidId(userId)) {
		throw new Error('Invalid user ID format');
	}

	try {
		await deleteSessionsByUserId(userId);
	} catch (error: unknown) {
		if (error instanceof Error) {
			console.warn("Erreur lors de l'invalidation des sessions de l'utilisateur :", error.message);
		} else {
			console.warn(
				"Erreur inconnue lors de l'invalidation des sessions de l'utilisateur : ",
				error
			);
		}
	}
}

// Définit le cookie du token de session
export function setSessionTokenCookie(event: RequestEvent, token: string, expiresAt: Date): void {
	event.cookies.set(
		auth.sessionCookieName, // ✅ même nom que Lucia
		token,
		{
			httpOnly: true,
			path: '/',
			secure: import.meta.env.PROD,
			sameSite: 'lax',
			expires: expiresAt
		}
	);
}
// Supprime le cookie du token de session
export function deleteSessionTokenCookie(event: RequestEvent): void {
	event.cookies.set(
		auth.sessionCookieName, // ✅
		'',
		{
			httpOnly: true,
			path: '/',
			secure: import.meta.env.PROD,
			sameSite: 'lax',
			maxAge: -1
		}
	);
}

// Marque la session comme vérifiée pour la 2FA
export async function setSessionAs2FAVerified(sessionId: string): Promise<void> {
	await verifyTwoFactorForSession(sessionId);
	// Sans ça, une identité mise en cache juste avant la validation 2FA
	// renverrait `twoFactorVerified: false` pendant toute la durée du TTL,
	// rebasculant l'utilisateur sur /auth/2fa juste après l'avoir validée.
	await invalidateCache(sessionIdentityCacheKey(sessionId));
}

// Gestion des sessions OAuth pour Google
export async function handleGoogleOAuth(
	event: RequestEvent,
	googleId: string,
	email: string,
	name: string,
	picture: string
): Promise<SessionValidationResult> {
	const rawUser =
		(await findUserByGoogleId(googleId)) ??
		(await createUserWithGoogleOAuth(googleId, email, name, picture));

	const user: User = {
		id: rawUser.id,
		email: rawUser.email,
		username: rawUser.username,
		emailVerified: rawUser.emailVerified,
		registered2FA: rawUser.totpKey !== null,
		googleId: rawUser.googleId,
		name: rawUser.name,
		picture: rawUser.picture,
		role: rawUser.role,
		isMfaEnabled: rawUser.isMfaEnabled,
		totpKey: rawUser.totpKey ? rawUser.totpKey.toString() : null
	};

	const token = generateSessionToken();
	const session = await createSession(token, user.id, { twoFactorVerified: false }, 'google');
	setSessionTokenCookie(event, token, session.expiresAt);

	return { session, user };
}
