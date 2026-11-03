import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	BETTER_AUTH_SECRET: { static: true },
	GOOGLE_CLIENT_ID: { static: true },
	GOOGLE_CLIENT_SECRET: { static: true },
	PUBLIC_TINYMCE_API_KEY: { public: true, static: true },
	SECRET_ADDRESS_SEARCH_MODE: { static: true },
	// Lus à l'exécution (pas `static`) : mêmes sémantiques que les anciens
	// `$env/dynamic/private`/`$env/dynamic/public` qu'ils remplacent — absents
	// en local sans configuration supplémentaire (voir isValidSentryDsn).
	// `schema` les déclare optionnels (sans lui, `defineEnvVars` exige une
	// valeur, même vide) : `undefined` reste un résultat valide.
	SENTRY_DSN: { schema: (value: string | undefined) => value },
	PUBLIC_SENTRY_DSN: { public: true, schema: (value: string | undefined) => value },
	STRIPE_SECRET_KEY: {}
});
