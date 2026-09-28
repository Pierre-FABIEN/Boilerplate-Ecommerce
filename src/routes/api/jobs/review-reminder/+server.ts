import { json, error } from '@sveltejs/kit';
import { runReviewReminderJob } from '$lib/server/jobs/reviewReminder';
import { getQStashReceiver } from '$lib/server/qstash';
import { matchesCronSecret } from '$lib/server/cronAuth';

/**
 * Relance avis produit post-livraison — voir `$lib/server/jobs/reviewReminder.ts`.
 * Même garde double-auth que `/api/jobs/cart-recovery` (QStash Schedule
 * signé, ou repli Vercel Cron avec `Authorization: Bearer $CRON_SECRET`).
 */
async function assertAuthorized(request: Request): Promise<void> {
	const signature = request.headers.get('upstash-signature');
	if (signature) {
		const body = await request.text();
		try {
			await getQStashReceiver().verify({ signature, body, url: request.url });
			return;
		} catch (err) {
			console.error('⚠️ Signature QStash invalide pour /api/jobs/review-reminder.', err);
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
	const result = await runReviewReminderJob();
	return json({ ok: true, ...result });
}

export async function GET({ request }) {
	await assertAuthorized(request);
	const result = await runReviewReminderJob();
	return json({ ok: true, ...result });
}
