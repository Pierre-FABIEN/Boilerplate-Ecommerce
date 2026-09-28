import { json, error } from '@sveltejs/kit';
import { runCleanupJob } from '$lib/server/jobs/cleanup';
import { getQStashReceiver } from '$lib/server/qstash';
import { matchesCronSecret } from '$lib/server/cronAuth';

/**
 * Purge programmée (`sessions`/codes expirés, paniers PENDING abandonnés) —
 * voir `$lib/server/jobs/cleanup.ts`. Deux déclencheurs possibles, jamais un
 * client direct :
 * - QStash Schedule (`scripts/register-cleanup-schedule.mjs`) : POST signé
 *   `upstash-signature`, avec retry/backoff gérés par QStash si l'exécution
 *   échoue — préféré quand `QSTASH_TOKEN` est configuré.
 * - Vercel Cron (`vercel.json`), en repli sans QStash : GET avec
 *   `Authorization: Bearer $CRON_SECRET`, ajouté automatiquement par Vercel
 *   quand cette variable est définie. Pas de retry natif côté Vercel, d'où la
 *   préférence pour QStash dès qu'il est disponible.
 */
async function assertAuthorized(request: Request): Promise<void> {
	const signature = request.headers.get('upstash-signature');
	if (signature) {
		const body = await request.text();
		try {
			await getQStashReceiver().verify({ signature, body, url: request.url });
			return;
		} catch (err) {
			console.error('⚠️ Signature QStash invalide pour /api/jobs/cleanup.', err);
			throw error(401, 'Signature invalide');
		}
	}

	const secret = process.env.CRON_SECRET;
	if (!secret) {
		throw error(500, 'CRON_SECRET non configuré');
	}
	if (!matchesCronSecret(request.headers.get('authorization'), secret)) {
		throw error(401, 'Non autorisé');
	}
}

export async function POST({ request }) {
	await assertAuthorized(request);
	const result = await runCleanupJob();
	return json({ ok: true, ...result });
}

export async function GET({ request }) {
	await assertAuthorized(request);
	const result = await runCleanupJob();
	return json({ ok: true, ...result });
}
