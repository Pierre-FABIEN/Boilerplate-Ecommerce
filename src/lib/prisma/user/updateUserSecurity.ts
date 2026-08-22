import { prisma } from '$lib/server';

// AUTH-PLUGIN ▼ hachage Argon2 fourni par le module d'auth.
import { hashPassword } from '$lib/lucia/password';
// AUTH-PLUGIN ▲

/**
 * Met à jour les paramètres de sécurité d'un compte depuis l'administration.
 *
 * `passwordHash` reçoit un mot de passe en clair, haché ici avant écriture. La
 * robustesse n'est PAS vérifiée à ce niveau : c'est un acte d'administration,
 * pas un changement de mot de passe par l'utilisateur (voir
 * `/auth/settings`, qui applique `verifyPasswordStrength`).
 */
export const updateUserSecurity = async (
	id: string,
	{ isMfaEnabled, passwordHash }: { isMfaEnabled: boolean; passwordHash?: string | null }
) => {
	try {
		const dataToUpdate: any = { isMfaEnabled };

		// Vérification et hashage du mot de passe si fourni
		if (passwordHash) {
			dataToUpdate.passwordHash = await hashPassword(passwordHash);
		}

		return await prisma.user.update({
			where: { id },
			data: dataToUpdate
		});
	} catch (error) {
		console.error('Error updating user security:', error);
		throw error;
	}
};
