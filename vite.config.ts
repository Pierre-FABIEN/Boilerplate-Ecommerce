import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { sentrySvelteKit } from '@sentry/sveltekit';
import { dropStalePwa } from './vite-plugin-drop-stale-pwa';

/** @type {import('vite').UserConfig} */
export default defineConfig({
	// `sentrySvelteKit()` doit précéder `sveltekit()` : instrumentation auto
	// des routes/handles. `autoUploadSourceMaps: false` : l'upload de source
	// maps nécessite un compte Sentry + `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/
	// `SENTRY_PROJECT` en CI, hors de portée d'un usage local — désactivé
	// explicitement plutôt que de laisser échouer silencieusement au build.
	plugins: [
		sentrySvelteKit({ autoUploadSourceMaps: false }),
		dropStalePwa(),
		tailwindcss(),
		sveltekit()
	],

	optimizeDeps: {
		exclude: ['@node-rs/argon2', '@node-rs/bcrypt']
	},

	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html'],
			include: ['src/**/*.{ts,js}'],
			exclude: ['src/**/*.{test,spec}.{js,ts}']
			// Pas de `thresholds` pour l'instant : premier chiffre de référence à
			// établir avant de faire échouer la CI dessus (voir RESTE_A_FAIRE.md).
		}
	},

	server: {
		port: 2000,
		strictPort: true,
		watch: {
			usePolling: true,
			interval: 1000
		},
		// Autorise le tunnel `localtunnel` (`npx localtunnel --port 2000`) pour
		// recevoir un vrai webhook entrant (Sendcloud, etc.) en dev — Vite
		// bloque sinon toute requête dont le header `Host` n'est pas connu.
		// Dev uniquement : `vite dev` ne tourne jamais en production.
		allowedHosts: ['.loca.lt']
	},

	// `preprocess` retiré : redondant avec svelte.config.js (vitePreprocess()
	// y est déjà déclaré, seul endroit pertinent pour cette option).

	clearScreen: false
});
