// -----------------------------------------------------------------------------
// Opérations métier sur le compte utilisateur.
//
// Couche intermédiaire entre les routes et les accès Prisma
// (`$lib/prisma/user/user`) : c'est ici que les règles s'appliquent (hachage du
// mot de passe, chiffrement des secrets 2FA, validation des identifiants) afin
// qu'aucune route n'écrive un secret en clair par inadvertance.
//
// Le type `User` exporté ici est celui exposé dans `event.locals.user`.
// -----------------------------------------------------------------------------

import { hashPassword } from './password';
import { encryptString } from './encryption';
import { generateRandomRecoveryCode } from './utils';
import { isValidId } from './ids';
import { decryptToString, decrypt } from './encryption';
import { Role } from '@prisma/client';
import {
	createUserInDatabase,
	createUserWithGoogleOAuth,
	getUserByEmailPrisma,
	getUserByGoogleIdPrisma,
	getUserPasswordHashPrisma,
	getUserRecoveryAndGoogleId,
	getUserTotpKey,
	updateUserEmail,
	updateUserPasswordPrisma,
	updateUserRecoveryCode,
	verifyUserEmail
} from '$lib/prisma/user/user';

// Interface utilisateur unifiée
export interface User {
	id: string;
	email: string;
	username: string | null;
	emailVerified: boolean;
	registered2FA: boolean;
	googleId: string | null;
	name: string | null;
	picture: string | null;
	role: Role;
	isMfaEnabled: boolean;
	totpKey: string | null;
}

// Crée un nouvel utilisateur avec email et mot de passe + 2FA
export async function createUser(email: string, username: string, password: string): Promise<User> {
	const passwordHash = await hashPassword(password);
	const recoveryCode = generateRandomRecoveryCode();
	const encryptedRecoveryCode = encryptString(recoveryCode);
	const encryptedRecoveryCodeString = Buffer.from(encryptedRecoveryCode).toString('base64');

	const createdUser = await createUserInDatabase(
		email,
		username,
		passwordHash,
		encryptedRecoveryCodeString,
		Role.CLIENT,
		false,
		null,
		null
	);

	return {
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

// Récupère un utilisateur par email
export async function getUserFromEmail(email: string): Promise<User | null> {
	const prismaUser = await getUserByEmailPrisma(email);
	if (!prismaUser) return null;

	return {
		id: prismaUser.id,
		email: prismaUser.email,
		username: prismaUser.username,
		emailVerified: prismaUser.emailVerified,
		registered2FA: prismaUser.totpKey !== null,
		googleId: prismaUser.googleId,
		name: prismaUser.name,
		picture: prismaUser.picture,
		role: prismaUser.role,
		isMfaEnabled: prismaUser.isMfaEnabled,
		totpKey: prismaUser.totpKey
	};
}

// Récupère un utilisateur par Google ID
export async function getUserFromGoogleId(googleId: string): Promise<User | null> {
	const prismaUser = await getUserByGoogleIdPrisma(googleId);
	if (!prismaUser) return null;

	return {
		id: prismaUser.id,
		email: prismaUser.email,
		username: prismaUser.username,
		emailVerified: prismaUser.emailVerified,
		registered2FA: prismaUser.totpKey !== null,
		googleId: prismaUser.googleId,
		name: prismaUser.name,
		picture: prismaUser.picture,
		role: prismaUser.role,
		isMfaEnabled: prismaUser.isMfaEnabled,
		totpKey: prismaUser.totpKey
	};
}

// Mise à jour du mot de passe utilisateur
export async function updateUserPassword(userId: string, password: string): Promise<void> {
	if (!isValidId(userId)) {
		throw new Error('Invalid user ID format');
	}
	const passwordHash = await hashPassword(password);
	await updateUserPasswordPrisma(userId, passwordHash);
}

// Met à jour l'email et vérifie
export async function updateUserEmailAndSetEmailAsVerified(
	userId: string,
	email: string
): Promise<void> {
	if (!isValidId(userId)) {
		throw new Error('Invalid user ID format');
	}
	await updateUserEmail(userId, email);
}

// Vérifie et met à jour la vérification de l'email
export async function setUserAsEmailVerifiedIfEmailMatches(
	userId: string,
	email: string
): Promise<boolean> {
	if (!isValidId(userId)) {
		throw new Error('Invalid user ID format');
	}
	const result = await verifyUserEmail(userId, email);
	return result.count > 0;
}

// Réinitialise le code de récupération
export async function resetUserRecoveryCode(userId: string): Promise<string> {
	if (!isValidId(userId)) {
		throw new Error('Invalid user ID format');
	}
	const recoveryCode = generateRandomRecoveryCode();
	const encryptedCode = encryptString(recoveryCode);
	await updateUserRecoveryCode(userId, encryptedCode);
	return recoveryCode;
}

// Gestion des sessions OAuth
export async function handleGoogleOAuth(
	googleId: string,
	email: string,
	name: string,
	picture: string
): Promise<User> {
	let user = await getUserFromGoogleId(googleId);

	if (!user) {
		const createdGoogleUser = await createUserWithGoogleOAuth(googleId, email, name, picture);
		user = {
			id: createdGoogleUser.id,
			email: createdGoogleUser.email,
			username: createdGoogleUser.username,
			emailVerified: createdGoogleUser.emailVerified,
			registered2FA: createdGoogleUser.totpKey !== null,
			googleId: createdGoogleUser.googleId,
			name: createdGoogleUser.name,
			picture: createdGoogleUser.picture,
			role: createdGoogleUser.role,
			isMfaEnabled: createdGoogleUser.isMfaEnabled,
			totpKey: createdGoogleUser.totpKey
		};
	}

	return user;
}

// Le DAO Prisma chiffre déjà la clé avant écriture : on le réexporte tel quel
// plutôt que d'ajouter un wrapper qui s'appelait lui-même.
export { updateUserTOTPKey } from '$lib/prisma/user/user';

export async function getUserRecoverCode(userId: string): Promise<string> {
	const user = await getUserRecoveryAndGoogleId(userId);
	if (!user || user.googleId || !user.recoveryCode) {
		throw new Error('Recovery code not available for this user.');
	}
	return decryptToString(user.recoveryCode);
}

export async function getUserTOTPKey(userId: string): Promise<Uint8Array | null> {
	const user = await getUserTotpKey(userId);

	return user && user.totpKey ? decrypt(user.totpKey) : null;
}

export async function getUserPasswordHash(userId?: string, email?: string): Promise<string | null> {
	if (!userId && !email) throw new Error('Missing user identifier: userId or email is required.');
	const whereClause = userId ? { id: userId } : { email };
	const user = await getUserPasswordHashPrisma(whereClause);
	if (!user) throw new Error('User not found.');
	return user.passwordHash;
}
