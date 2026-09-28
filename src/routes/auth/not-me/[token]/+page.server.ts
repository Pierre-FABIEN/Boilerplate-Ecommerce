/**
 * « Ce n'était pas moi » — révoque une session précise sans être connecté,
 * depuis le lien de l'alerte nouvel appareil (`$lib/server/newDeviceAlert.ts`).
 * Page publique, volontairement en dehors de `/auth/settings` (fermé aux
 * visiteurs anonymes par `authHandle`, voir `$lib/lucia/hooks.ts`).
 *
 * Le chargement (`load`) ne consomme jamais le jeton : un simple GET —
 * y compris déclenché par un scanner de liens automatique dans un client
 * mail — ne doit jamais révoquer quoi que ce soit. Seule l'action
 * `?/confirm`, un clic humain réel, le fait.
 */
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	consumeSessionRevokeToken,
	peekSessionRevokeToken
} from '$lib/prisma/sessionRevokeToken/sessionRevokeToken';
import { findSessionDeviceInfo } from '$lib/prisma/session/sessions';
import { invalidateSession, sessionPublicId } from '$lib/lucia/session';
import { describeUserAgent } from '$lib/lucia/deviceLabel';
import { log } from '$lib/server/log';

export const load = (async ({ params }) => {
	const target = await peekSessionRevokeToken(params.token);
	if (!target) {
		return { valid: false as const };
	}

	// Best-effort : la session peut déjà avoir expiré/été révoquée entre
	// l'envoi de l'alerte et ce chargement — le lien reste utilisable quand
	// même (il n'y aura simplement plus rien à révoquer), juste sans détail
	// d'appareil à afficher.
	const session = await findSessionDeviceInfo(target.sessionId);

	return {
		valid: true as const,
		device: session?.userAgent ? describeUserAgent(session.userAgent) : null,
		location: session ? [session.city, session.country].filter(Boolean).join(', ') : null
	};
}) satisfies PageServerLoad;

export const actions: Actions = {
	confirm: async ({ params }) => {
		const target = await consumeSessionRevokeToken(params.token);
		if (!target) {
			return fail(410, { message: 'Ce lien a déjà été utilisé ou a expiré.' });
		}

		await invalidateSession(target.sessionId);
		log('INFO', 'auth:not-me', 'Session révoquée via le lien "Ce n\'était pas moi"', {
			userId: target.userId,
			// Empreinte, pas `sessionId` : c'est le token du cookie, il n'a rien à
			// faire dans les journaux (voir `sessionPublicId`).
			session: sessionPublicId(target.sessionId)
		});

		return { success: true };
	}
};
