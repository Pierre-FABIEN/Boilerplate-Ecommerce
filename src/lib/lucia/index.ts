// -----------------------------------------------------------------------------
// Instance Lucia v3 (adapter Prisma).
//
// Lucia n'est utilisé ici que pour deux choses : le nom et les attributs du
// cookie de session, et la validation du token qu'il contient. Tout le reste
// (mots de passe, 2FA, vérification d'email, réinitialisation) est implémenté
// dans les autres fichiers de ce dossier.
//
// Les attributs renvoyés par Lucia proviennent de la ligne lue au moment de la
// validation ; les gardes du hook rechargent volontairement l'utilisateur pour
// travailler sur un état à jour (voir `hooks.ts`).
// -----------------------------------------------------------------------------

import { Lucia } from 'lucia';
import { PrismaAdapter } from '@lucia-auth/adapter-prisma';
import { prisma } from '$lib/server';
import { dev } from '$app/environment';

/* Le PrismaAdapter attend les *modèles* Prisma à utiliser */
const adapter = new PrismaAdapter(prisma.session, prisma.user);

export const auth = new Lucia(adapter, {
	env: dev ? 'DEV' : 'PROD',

	/* Cookies de session “rolling” */
	sessionCookie: {
		attributes: {
			secure: !dev,
			httpOnly: true,
			sameSite: 'lax',
			path: '/'
		}
	},

	/* Mapping → données sérialisées côté client */
	getUserAttributes: (dbUser) => ({
		userId: dbUser.id,
		email: dbUser.email,
		username: dbUser.username,
		role: dbUser.role,
		isMfaEnabled: dbUser.isMfaEnabled
	})
});

/* ---------------------- Déclarations globales Lucia ------------------------ */
/* Forme de la ligne `users` telle que Lucia la lit. `id` est un cuid (String)
   et `username` est nul pour les comptes créés via Google. */
declare module 'lucia' {
	interface Register {
		Lucia: typeof auth;
		DatabaseUserAttributes: {
			id: string;
			email: string;
			username: string | null;
			role: string;
			isMfaEnabled: boolean;
		};
	}
}

export type Auth = typeof auth;
