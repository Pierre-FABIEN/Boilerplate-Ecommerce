/// <reference types="vitest/config" />
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { sentrySvelteKit } from '@sentry/sveltekit';
import { dropStalePwa } from './vite-plugin-drop-stale-pwa.ts';
import svelteKitConfig from './sveltekit.config.ts';

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
		sveltekit(svelteKitConfig)
	],

	optimizeDeps: {
		exclude: ['@node-rs/argon2', '@node-rs/bcrypt']
	},

	ssr: {
		// `better-auth@1.7` dépend de Zod 4 (`node_modules/better-auth/node_modules/zod`),
		// alors que le projet impose Zod 3.25 à la racine (superforms,
		// `zod-v3-to-json-schema`). Sans cet `external`, le bundle serveur
		// embarque le code de better-auth mais laisse `import "zod"` non résolu
		// à la build — il se résout alors, à l'exécution, vers le Zod 3 de la
		// racine : `TypeError: sessionSchema.loose is not a function` (`.loose`
		// est une API Zod 4, absente de Zod 3). Externaliser ces paquets laisse
		// Node résoudre leurs propres imports `zod` normalement, chacun vers sa
		// version — pas de conflit. Alternative de fond écartée : passer tout
		// le projet en Zod 4 (superforms 3 a un adaptateur `zod4`) — changement
		// plus large, hors périmètre de cette réparation.
		external: ['better-auth', '@better-auth/core', 'better-call']
	},

	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html', 'json-summary'],
			include: ['src/**/*.{ts,js}'],
			exclude: ['src/**/*.{test,spec}.{js,ts}'],
			// Seuil uniquement sur `src/lib/**` (logique métier) : les
			// `+page.server.ts`/`+server.ts` de `src/routes/**` sont fins et
			// couverts par Playwright, pas par Vitest — un seuil global aurait
			// mélangé les deux et serait resté décoratif. Valeurs recalibrées
			// le 13/10/2026 suite au bump vitest 3.2.7→5.0.4 (+@vitest/coverage-v8
			// assorti) : le provider v8 est passé à un remapping AST (plus
			// précis sur ternaires/optional chaining/switch) qui compte les
			// branches/fonctions très différemment de l'ancien calcul brut V8 —
			// mesure réelle du 13/10/2026 (16.77/12.93/15.26/16.74%), pas une
			// régression du code. ~1 pt de marge ; à remonter progressivement,
			// jamais à baisser sans le documenter ici.
			thresholds: {
				'src/lib/**': { statements: 16, branches: 12, functions: 14, lines: 16 }
			}
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

	clearScreen: false
});
