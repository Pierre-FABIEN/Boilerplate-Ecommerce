import type { RequestHandler } from '../$types';
import { invalidateSession } from '$lib/lucia/session';
import { auth } from '$lib/lucia';

export const POST: RequestHandler = async ({ cookies, locals }) => {
	if (!locals.session) {
		return new Response(JSON.stringify({ message: 'Not authenticated' }), { status: 401 });
	}

	await invalidateSession(locals.session.id);
	cookies.delete(auth.sessionCookieName, { path: '/' });

	return new Response(JSON.stringify({ success: true }), { status: 200 });
};
