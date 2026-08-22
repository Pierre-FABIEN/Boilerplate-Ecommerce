// -----------------------------------------------------------------------------
// Accès Prisma au modèle `User`.
//
// Ce fichier est partagé : il sert à l'authentification (identifiants, email
// vérifié, TOTP, code de récupération, OAuth) ET à l'administration commerce
// (listes, rôles, suppression). En retirant le module d'authentification, seules
// les fonctions marquées AUTH-PLUGIN disparaissent.
//
// Les secrets 2FA (`totpKey`, `recoveryCode`) sont chiffrés ici même : ils ne
// transitent jamais en clair dans la base.
// -----------------------------------------------------------------------------

// AUTH-PLUGIN ▼ chiffrement des secrets 2FA, fourni par le module d'auth.
import { decrypt, encrypt } from '$lib/lucia/encryption';
// AUTH-PLUGIN ▲
import { prisma } from '$lib/server';
import { Role } from '@prisma/client';

export const findUserWithRecoveryCode = async (userId: string) => {
	return await prisma.user.findUnique({
		where: { id: userId },
		select: {
			recoveryCode: true
			// Ajoutez createdAt: true si nécessaire
		}
	});
};

export const findUserByGoogleId = async (googleId: string) => {
	return await prisma.user.findUnique({
		where: { googleId }
		// Ajoutez createdAt: true si nécessaire, par exemple :
		// select: { googleId: true, email: true, createdAt: true, ... }
	});
};

export const createUserWithGoogleOAuth = async (
	googleId: string,
	email: string,
	name: string,
	picture: string
) => {
	return await prisma.user.create({
		data: {
			googleId,
			email,
			name,
			picture,
			role: 'CLIENT',
			emailVerified: true,
			addresses: {
				create: []
			},
			orders: {
				create: []
			},
			transactions: {
				create: []
			}
		}
	});
};

export const createUserInDatabase = async (
	email: string,
	username: string,
	passwordHash: string,
	recoveryCode: string,
	role: Role,
	emailVerified: boolean,
	totpKey: string | null,
	googleId?: string | null
) => {
	// console.log('Creating user:', {
	// 	email,
	// 	username,
	// 	passwordHash,
	// 	recoveryCode,
	// 	role,
	// 	emailVerified,
	// 	totpKey,
	// 	googleId
	// });

	return await prisma.user.create({
		data: {
			email,
			username,
			passwordHash,
			recoveryCode,
			role,
			emailVerified,
			totpKey,
			googleId,
			// Relations initialisées à vide
			addresses: { create: [] },
			orders: { create: [] },
			transactions: { create: [] },
			sessions: { create: [] },
			emailVerificationRequests: { create: [] },
			passwordResetSessions: { create: [] }
		}
	});
};

// 1. On ajoute createdAt dans la sélection, car on retourne déjà un ensemble de champs utilisateur
export const getUserByEmailPrisma = async (email: string) => {
	return await prisma.user.findUnique({
		where: { email },
		select: {
			id: true,
			email: true,
			username: true,
			emailVerified: true,
			totpKey: true,
			googleId: true,
			name: true,
			picture: true,
			isMfaEnabled: true,
			role: true,
			createdAt: true
		}
	});
};

// 2. Idem ici
export const getUserByGoogleIdPrisma = async (googleId: string) => {
	return await prisma.user.findUnique({
		where: { googleId },
		select: {
			id: true,
			email: true,
			username: true,
			emailVerified: true,
			totpKey: true,
			googleId: true,
			name: true,
			picture: true,
			isMfaEnabled: true,
			role: true,
			createdAt: true
		}
	});
};

export const updateUserPasswordPrisma = async (userId: string, passwordHash: string) => {
	return await prisma.user.update({
		where: { id: userId },
		data: { passwordHash }
	});
};

export const updateUserEmail = async (userId: string, email: string) => {
	return await prisma.user.update({
		where: { id: userId },
		data: {
			email,
			emailVerified: true // Marque l'email comme vérifié
		}
	});
};

export const verifyUserEmail = async (userId: string, email: string) => {
	return await prisma.user.updateMany({
		where: {
			id: userId,
			email
		},
		data: {
			emailVerified: true
		}
	});
};

export const updateUserRecoveryCode = async (userId: string, encryptedCode: string) => {
	return await prisma.user.update({
		where: { id: userId },
		data: {
			recoveryCode: encryptedCode
		}
	});
};

// lib/prisma/user/user.ts (ou équivalent)
// DAO : écrit la clé et passe isMfaEnabled à true
// lib/lucia/user.ts
export async function updateUserTOTPKey(userId: string, key: Uint8Array) {
	const encryptedKey = encrypt(key);

	const result = await prisma.user.update({
		where: { id: userId },
		data: {
			totpKey: encryptedKey,
			isMfaEnabled: true
		},
		select: { id: true, totpKey: true }
	});

	// console.log('[updateUserTOTPKey] wrote:', result);
}

export const getUserTotpKey = async (
	userId: string
): Promise<{ totpKey: string | null } | null> => {
	return await prisma.user.findUnique({
		where: { id: userId },
		select: {
			totpKey: true // Récupère uniquement la clé TOTP
			// Ajoutez createdAt: true si nécessaire
		}
	});
};

export const getUserPasswordHashPrisma = async (whereClause: {
	id?: string;
	email?: string;
}): Promise<{ passwordHash: string | null } | null> => {
	return await prisma.user.findFirst({
		where: whereClause,
		select: {
			passwordHash: true // Récupère uniquement le hash du mot de passe
			// Ajoutez createdAt: true si nécessaire
		}
	});
};

export const getUserRecoveryAndGoogleId = async (
	userId: string
): Promise<{ recoveryCode: string | null; googleId: string | null } | null> => {
	return await prisma.user.findUnique({
		where: { id: userId },
		select: {
			recoveryCode: true,
			googleId: true
			// Ajoutez createdAt: true si nécessaire
		}
	});
};

export const getAllUsers = async () => {
	try {
		// Comme on utilise include, Prisma renvoie tous les champs scalaires, dont createdAt
		const users = await prisma.user.findMany({
			include: {
				addresses: true,
				orders: {
					include: {
						address: true
					}
				}
			}
		});

		return users;
	} catch (error: unknown) {
		if (error instanceof Error) {
			console.error('Error fetching users:', error);
			throw new Error('Could not fetch users');
		} else {
			console.error('Unknown error fetching users:', error);
			throw new Error('An unknown error occurred');
		}
	}
};

export async function deleteUser(userId: string) {
	try {
		// Désassocier les transactions de l'utilisateur
		await prisma.transaction.updateMany({
			where: { userId },
			data: { userId: null }
		});

		// Supprimer les commandes associées à l'utilisateur
		await prisma.order.deleteMany({
			where: { userId }
		});

		// Supprimer l'utilisateur
		await prisma.user.delete({
			where: { id: userId }
		});

		return { success: true };
	} catch (error: unknown) {
		if (error instanceof Error) {
			throw new Error('Error deleting user: ' + error.message);
		} else {
			throw new Error('An unknown error occurred during user deletion.');
		}
	}
}

export const updateUserRole = async (id: string, role: Role) => {
	try {
		const updatedUser = await prisma.user.update({
			where: { id },
			data: { role }
		});
		// console.log('User role updated:', updatedUser);
		return updatedUser;
	} catch (error: unknown) {
		if (error instanceof Error) {
			console.error('Error updating user role:', error);
			throw error;
		} else {
			console.error('Unknown error updating user role:', error);
			throw new Error('An unknown error occurred during role update.');
		}
	}
};

export async function getUsersById(userId: string) {
	// Ici, on récupère déjà tout par défaut
	return await prisma.user.findUnique({
		where: { id: userId }
	});
}

export async function getUserMFA(userId: string) {
	return await prisma.user.findUnique({
		where: { id: userId },
		select: { isMfaEnabled: true }
	});
}

export async function updateUserMFA(userId: string, data: { isMfaEnabled: boolean }) {
	return await prisma.user.update({
		where: { id: userId },
		data: { isMfaEnabled: data.isMfaEnabled }
	});
}

export async function latestUsers() {
	const users = await prisma.user.findMany({
		orderBy: { id: 'desc' },
		take: 5,
		select: {
			id: true,
			email: true,
			username: true,
			createdAt: true,
			totpKey: true,
			name: true
		}
	});

	// Sérialisation des champs nécessaires
	return users.map((user) => ({
		...user,
		createdAt: user.createdAt.toISOString(), // Date en ISO
		totpKey: user.totpKey ? Array.from(user.totpKey) : null // Uint8Array -> tableau
	}));
}

/**
 * Récupère un utilisateur par son ID depuis Prisma.
 * Renvoie `null` s'il n'existe pas.
 */

export async function getUserByIdPrisma(id: string) {
	return await prisma.user.findUnique({
		where: { id },
		select: {
			id: true,
			email: true,
			emailVerified: true,
			username: true,
			role: true,
			isMfaEnabled: true,
			totpKey: true,
			googleId: true,
			name: true,
			picture: true
		}
	});
}

export async function getUserRecoverCode(userId: string): Promise<string> {
	const user = await getUserRecoveryAndGoogleId(userId);
	if (!user) throw new Error('User not found.');
	return user.recoveryCode || '';
}

export async function getUserTOTPKey(userId: string): Promise<Uint8Array | null> {
	const user = await getUserTotpKey(userId);

	return user && user.totpKey ? decrypt(user.totpKey) : null;
}

export async function getUserPasswordHash(userId?: string, email?: string): Promise<string | null> {
	if (!userId && !email) throw new Error('Missing user identifier: userId or email is required.');
	const whereClause = userId ? { id: userId } : { email };
	const user = await prisma.user.findFirst({
		where: whereClause,
		select: {
			passwordHash: true // Récupère uniquement le hash du mot de passe
			// Ajoutez createdAt: true si nécessaire
		}
	});
	if (!user) throw new Error('User not found.');
	return user.passwordHash;
}
