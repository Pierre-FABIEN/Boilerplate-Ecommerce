import { findUserWithRecoveryCode } from '$lib/prisma/user/user';
import { prisma } from '$lib/server';
import { decryptToString, encryptString } from './encryption';
import { ExpiringTokenBucket } from './rate-limit';
import { generateRandomRecoveryCode } from './utils';
import { isValidId } from './ids';

export const totpBucket = new ExpiringTokenBucket<string>(5, 60 * 30);
export const recoveryCodeBucket = new ExpiringTokenBucket<string>(3, 60 * 60);

export async function resetUser2FAWithRecoveryCode(
	userId: string,
	recoveryCode: string
): Promise<boolean> {
	// Vérification du format de l'identifiant
	if (!isValidId(userId)) {
		throw new Error('Invalid user ID format');
	}

	// Récupérer le code de récupération chiffré
	const user = await findUserWithRecoveryCode(userId);

	if (!user || !user.recoveryCode) {
		return false;
	}

	// Déchiffrer le code de récupération après décodage Base64
	const userRecoveryCode = decryptToString(Buffer.from(user.recoveryCode, 'base64'));
	if (recoveryCode !== userRecoveryCode) {
		return false;
	}

	// Générer un nouveau code de récupération chiffré
	const newRecoveryCode = generateRandomRecoveryCode();
	const encryptedNewRecoveryCode = encryptString(newRecoveryCode).toString('base64');

	// Mettre à jour le code de récupération et réinitialiser la 2FA
	const result = await prisma.$transaction([
		prisma.session.updateMany({
			where: { userId },
			data: { twoFactorVerified: false }
		}),
		prisma.user.updateMany({
			where: {
				id: userId,
				recoveryCode: user.recoveryCode
			},
			data: {
				recoveryCode: encryptedNewRecoveryCode,
				totpKey: null
			}
		})
	]);

	return result[1].count > 0;
}
