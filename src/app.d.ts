// Voir https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		// interface Error {}

		/**
		 * Données attachées à chaque requête par `src/hooks.server.ts`.
		 */
		interface Locals {
			// AUTH-PLUGIN ▼ renseigné par `authHandle` (`src/lib/lucia/hooks.ts`).
			/** Session courante, ou `null` pour un visiteur anonyme. */
			session: import('$lib/lucia/session').Session | null;
			/** Utilisateur relu en base à chaque requête, ou `null`. */
			user: import('$lib/lucia/user').User | null;
			/** Rôle de l'utilisateur (`ADMIN` / `CLIENT`), raccourci de `user.role`. */
			role: string | null;
			/** La 2FA est exigée sur ce compte. */
			isMfaEnabled: boolean;
			/** Une clé TOTP est enregistrée : la 2FA est configurée. */
			registered2FA: boolean;
			// AUTH-PLUGIN ▲

			/** Commande en cours du visiteur connecté (panier serveur). COMMERCE-PLUGIN */
			pendingOrder: import('@prisma/client').Order | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
