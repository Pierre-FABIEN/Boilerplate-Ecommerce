import { PrismaClient } from '@prisma/client';
import { createDecipheriv } from 'node:crypto';

/**
 * Client Prisma dédié aux tests, branché explicitement sur l'URL de `.env.test`
 * (schéma PostgreSQL `e2e`), afin de ne jamais toucher les données de dev.
 */
export const db = new PrismaClient({
	datasources: { db: { url: process.env.DATABASE_URL } },
	log: ['error']
});

/**
 * Déchiffre une charge AES-128-GCM produite par `src/lib/lucia/encryption.ts`.
 * Le module applicatif n'est pas réutilisable ici car il dépend de
 * `$env/static/private`, indisponible hors du bundle SvelteKit.
 */
function decryptPayload(payload: Uint8Array): Buffer {
	const key = Buffer.from(process.env.ENCRYPTION_KEY ?? '', 'base64');
	const bytes = Buffer.from(payload);

	const iv = bytes.subarray(0, 16);
	const tag = bytes.subarray(bytes.length - 16);
	const ciphertext = bytes.subarray(16, bytes.length - 16);

	const decipher = createDecipheriv('aes-128-gcm', key, iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export async function getUser(email: string) {
	return db.user.findUnique({ where: { email } });
}

export async function requireUser(email: string) {
	const user = await getUser(email);
	if (!user) throw new Error(`Utilisateur introuvable en base : ${email}`);
	return user;
}

/** Code OTP de vérification d'adresse email, le plus récent d'abord. */
export async function getEmailVerificationCode(email: string): Promise<string> {
	const user = await requireUser(email);
	const request = await db.emailVerificationRequest.findFirst({
		where: { userId: user.id },
		orderBy: { createdAt: 'desc' }
	});
	if (!request) throw new Error(`Aucune demande de vérification pour ${email}`);
	return request.code;
}

/** Code OTP de réinitialisation de mot de passe, le plus récent d'abord. */
export async function getPasswordResetCode(email: string): Promise<string> {
	const user = await requireUser(email);
	const session = await db.passwordResetSession.findFirst({
		where: { userId: user.id },
		orderBy: { createdAt: 'desc' }
	});
	if (!session) throw new Error(`Aucune session de réinitialisation pour ${email}`);
	return session.code;
}

/** Clé TOTP déchiffrée, telle qu'enregistrée après la configuration de la 2FA. */
export async function getTotpKey(email: string): Promise<Uint8Array> {
	const user = await requireUser(email);
	if (!user.totpKey) throw new Error(`Aucune clé TOTP enregistrée pour ${email}`);
	return new Uint8Array(decryptPayload(user.totpKey));
}

/** Code de récupération en clair, généré à la création du compte. */
export async function getRecoveryCode(email: string): Promise<string> {
	const user = await requireUser(email);
	if (!user.recoveryCode) throw new Error(`Aucun code de récupération pour ${email}`);
	return decryptPayload(Buffer.from(user.recoveryCode, 'base64')).toString('utf-8');
}

/**
 * Active l'exigence de 2FA. Le commutateur existe côté serveur
 * (`/auth/settings?/isMfaEnabled`) mais son interface est commentée, donc les
 * tests basculent le drapeau en base pour atteindre les parcours 2FA.
 */
export async function enableMfa(email: string) {
	await db.user.update({ where: { email }, data: { isMfaEnabled: true } });
}

/** Fait expirer une demande de vérification d'email pour tester ce cas. */
export async function expireEmailVerificationRequests(email: string) {
	const user = await requireUser(email);
	await db.emailVerificationRequest.updateMany({
		where: { userId: user.id },
		data: { expiresAt: new Date(Date.now() - 60_000) }
	});
}

export async function countSessions(email: string): Promise<number> {
	const user = await requireUser(email);
	return db.session.count({ where: { userId: user.id } });
}

/**
 * Nettoyage en fin de test.
 *
 * Les commandes doivent partir en premier : l'application crée un panier
 * (commande au statut PENDING) dès qu'un utilisateur authentifié charge une
 * page, et la relation `Order → User` est en `Restrict`. Le reste (sessions,
 * demandes de vérification, sessions de réinitialisation) part en cascade.
 */
export async function deleteUser(email: string) {
	const user = await getUser(email);
	if (!user) return;

	await db.order.deleteMany({ where: { userId: user.id } });
	await db.user.delete({ where: { id: user.id } });
}
