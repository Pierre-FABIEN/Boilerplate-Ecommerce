/**
 * Sessions actives — self-service, dans le même esprit que « Gérer les
 * appareils » chez Google/GitHub : chaque session ouverte (appareil,
 * localisation approximative, dernière activité), avec la possibilité de
 * déconnecter une session précise ou toutes les autres d'un coup.
 *
 * Jamais la session en cours par ces actions : la déconnexion normale
 * (`/auth/signout`) reste le seul chemin pour ça, une fenêtre de paramètres
 * n'a pas à se fermer sous les pieds de qui la consulte.
 */
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import {
	deleteOtherSessionsForUser,
	deleteSessionForUser,
	findSessionsForUser
} from '$lib/prisma/session/sessions';
import { findRecentLoginEvents } from '$lib/prisma/loginEvent/loginEvent';
import { sessionIdentityCacheKey } from '$lib/lucia/session';
import { invalidateCache } from '$lib/server/cache';
import { describeUserAgent } from '$lib/lucia/deviceLabel';
import { log } from '$lib/server/log';

export const load = (async ({ locals }) => {
	if (!locals.user || !locals.session) {
		redirect(302, '/auth/login');
	}

	const [sessions, loginEvents] = await Promise.all([
		findSessionsForUser(locals.user.id),
		findRecentLoginEvents(locals.user.id)
	]);

	return {
		sessions: sessions.map((session) => ({
			id: session.id,
			// `null` distingué de « appareil non reconnu » : une session ouverte
			// avant l'ajout de ce suivi (colonne alors vide) n'a jamais eu de
			// User-Agent capturé, ce n'est pas la même chose qu'un User-Agent
			// présent mais qu'on n'a pas su identifier — voir +page.svelte, qui
			// affiche un message différent (et explicite) dans ce cas.
			device: session.userAgent ? describeUserAgent(session.userAgent) : null,
			city: session.city,
			country: session.country,
			createdAt: session.createdAt,
			lastActiveAt: session.lastActiveAt,
			isCurrent: session.id === locals.session!.id
		})),
		// Historique en lecture seule — distinct des sessions actives ci-dessus,
		// survit à leur expiration/révocation (voir le modèle `LoginEvent`).
		loginEvents: loginEvents.map((event) => ({
			id: event.id,
			device: event.userAgent ? describeUserAgent(event.userAgent) : null,
			city: event.city,
			country: event.country,
			createdAt: event.createdAt,
			method: event.method,
			isNewDevice: event.isNewDevice
		}))
	};
}) satisfies PageServerLoad;

export const actions: Actions = {
	revoke: async (event) => {
		const userId = event.locals.user?.id;
		if (!userId) {
			return fail(401, { message: 'Non connecté' });
		}

		const formData = await event.request.formData();
		const sessionId = String(formData.get('sessionId') ?? '');
		if (!sessionId) {
			return fail(400, { message: 'Session invalide' });
		}
		if (sessionId === event.locals.session?.id) {
			return fail(400, { message: 'Utilisez la déconnexion classique pour la session en cours.' });
		}

		const { count } = await deleteSessionForUser(userId, sessionId);
		if (count === 0) {
			// Session déjà expirée/supprimée, ou appartenant à quelqu'un d'autre —
			// jamais distingué côté message, voir le commentaire sur
			// `deleteSessionForUser`.
			return fail(404, { message: 'Session introuvable' });
		}

		await invalidateCache(sessionIdentityCacheKey(sessionId));
		log('INFO', 'auth:sessions', 'Session déconnectée (self-service)', { userId, sessionId });

		return { success: true };
	},

	revokeOthers: async (event) => {
		const userId = event.locals.user?.id;
		const currentSessionId = event.locals.session?.id;
		if (!userId || !currentSessionId) {
			return fail(401, { message: 'Non connecté' });
		}

		// Lues avant suppression : il faut leurs ids pour invalider le cache
		// d'identité de chacune (voir `resolveIdentity`, `$lib/lucia/hooks.ts`),
		// sans quoi une session tout juste supprimée resterait valide jusqu'à
		// 8s de plus pour qui l'utilisait.
		const others = (await findSessionsForUser(userId)).filter((s) => s.id !== currentSessionId);

		await deleteOtherSessionsForUser(userId, currentSessionId);
		await Promise.all(others.map((s) => invalidateCache(sessionIdentityCacheKey(s.id))));

		log('INFO', 'auth:sessions', 'Autres sessions déconnectées (self-service)', {
			userId,
			count: others.length
		});

		return { success: true, count: others.length };
	}
};
