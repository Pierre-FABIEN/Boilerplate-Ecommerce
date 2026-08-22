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

export interface SessionFlags {
	twoFactorVerified: boolean;
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
	oauthProvider?: string | null
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
			oauthProvider: oauthProvider ?? null
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
			totpKey: result.user.totpKey
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
}

// Gestion des sessions OAuth pour Google
export async function handleGoogleOAuth(
	event: RequestEvent,
	googleId: string,
	email: string,
	name: string,
	picture: string
): Promise<SessionValidationResult> {
	let user = await findUserByGoogleId(googleId);

	if (!user) {
		const createdUser: any = await createUserWithGoogleOAuth(googleId, email, name, picture);
		user = {
			id: createdUser.id,
			email: createdUser.email,
			username: createdUser.username,
			emailVerified: createdUser.emailVerified,
			registered2FA: createdUser.totpKey !== null,
			googleId: createdUser.googleId,
			name: createdUser.name,
			picture: createdUser.picture,
			role: createdUser.role,
			isMfaEnabled: createdUser.isMfaEnabled,
			totpKey: createdUser.totpKey
		};
	}

	if (user === null) {
		console.error("L'objet utilisateur est null après le traitement OAuth Google.");
		throw new Error("Échec de la récupération ou de la création de l'utilisateur après OAuth.");
	}

	const token = generateSessionToken();
	const session = await createSession(token, user.id, { twoFactorVerified: false }, 'google');
	setSessionTokenCookie(event, token, session.expiresAt);

	return { session, user };
}
