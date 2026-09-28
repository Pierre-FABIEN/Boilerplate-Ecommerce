/**
 * Contexte de connexion capturé une seule fois, à la création de la session —
 * jamais recalculé après coup (voir `Session.userAgent`/`ipAddress`/`city`/
 * `country` dans `prisma/schema.prisma`).
 *
 * La géolocalisation vient des en-têtes que Vercel ajoute lui-même à chaque
 * requête (`x-vercel-ip-*`) : aucun service tiers, aucun appel réseau
 * supplémentaire, gratuit. Absents en local/hors Vercel — les colonnes
 * restent alors `null`, sans casser l'affichage (voir `/auth/settings/sessions`).
 */
export interface SessionDeviceContext {
	userAgent: string | null;
	ipAddress: string | null;
	city: string | null;
	country: string | null;
}

export function getSessionDeviceContext(request: Request): SessionDeviceContext {
	// Même extraction que le compteur de débit à l'inscription
	// (`src/routes/auth/signup/+page.server.ts`) : le premier maillon de
	// `x-forwarded-for`, seul en-tête disponible derrière le proxy Vercel.
	const forwardedFor = request.headers.get('x-forwarded-for');
	const rawCity = request.headers.get('x-vercel-ip-city');

	return {
		userAgent: request.headers.get('user-agent'),
		ipAddress: forwardedFor ? forwardedFor.split(',')[0].trim() : null,
		// Vercel encode le nom de ville (espaces, accents) façon URL.
		city: rawCity ? decodeURIComponent(rawCity) : null,
		country: request.headers.get('x-vercel-ip-country')
	};
}
