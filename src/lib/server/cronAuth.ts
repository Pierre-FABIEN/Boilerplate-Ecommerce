import { timingSafeEqual } from 'node:crypto';

/**
 * Compare l'en-tête `Authorization` d'un job cron au `CRON_SECRET` attendu.
 *
 * Comparaison à temps constant, comme la vérification de signature Sendcloud
 * (`$lib/sendcloud/webhookSignature.ts`) : un `!==` laisse fuiter la longueur
 * du préfixe correct et permet de reconstruire le secret caractère par
 * caractère. Utilisé par le repli Vercel Cron des routes `/api/jobs/*`, quand
 * QStash (signature HMAC) n'est pas configuré.
 */
export function matchesCronSecret(authorizationHeader: string | null, secret: string): boolean {
	const expected = Buffer.from(`Bearer ${secret}`, 'utf8');
	const received = Buffer.from(authorizationHeader ?? '', 'utf8');
	if (expected.length !== received.length) return false;

	return timingSafeEqual(expected, received);
}
