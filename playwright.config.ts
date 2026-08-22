import { defineConfig, devices } from '@playwright/test';
import dns from 'node:dns';
import dotenv from 'dotenv';

// Neon ne publie que des AAAA en premier, et l'IPv6 de WSL2 vers AWS coupe par
// intermittence : la base devenait injoignable au milieu d'un run. On privilégie
// donc l'IPv4, ici pour le process Playwright et plus bas pour le serveur.
dns.setDefaultResultOrder('ipv4first');

// `.env.test` prime sur `.env` : la suite travaille sur le schéma PostgreSQL
// `e2e` et sur le puits SMTP local, jamais sur les données de développement.
dotenv.config({ path: '.env.test', override: true });

const PORT = 2000;

export default defineConfig({
	testDir: 'e2e',
	globalSetup: './e2e/support/global-setup.ts',

	// Les parcours enchaînent plusieurs redirections et des écritures sur une base
	// distante : les délais par défaut sont trop courts.
	timeout: 90_000,
	expect: { timeout: 15_000 },

	// Un seul worker : le serveur de dev est mono-processus et les limiteurs de
	// débit vivent en mémoire. L'isolation repose sur un compte et une IP uniques
	// par test plutôt que sur le parallélisme.
	fullyParallel: false,
	workers: 1,
	// Une reprise même en local : la base est distante, et une coupure réseau
	// passagère ne doit pas se lire comme une régression.
	retries: 1,
	forbidOnly: !!process.env.CI,
	// En local, `step-reporter` commente l'avancement en direct : le parcours est
	// un test unique de plusieurs minutes, sinon la console reste muette.
	reporter: process.env.CI
		? [['github'], ['html', { open: 'never' }]]
		: [['list'], ['./e2e/support/step-reporter.ts'], ['html', { open: 'never' }]],

	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',

		// Sans ces bornes, un geste qui n'aboutit pas consomme le délai du test
		// entier — soit plusieurs minutes de silence avant de savoir ce qui a
		// bloqué. Le serveur de dev compile à la demande, d'où une navigation
		// volontairement large.
		actionTimeout: 20_000,
		navigationTimeout: 60_000,

		// Par défaut on ne garde la vidéo que des échecs, pour ne pas alourdir
		// chaque exécution. `E2E_VIDEO=1` enregistre tous les parcours.
		video: process.env.E2E_VIDEO
			? { mode: 'on', size: { width: 1280, height: 720 } }
			: 'retain-on-failure',
		viewport: { width: 1280, height: 720 }
	},

	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

	webServer: {
		// Serveur de développement plutôt que `build && preview` : démarrage plus
		// court, et cookies de session non marqués `Secure`, donc utilisables en
		// clair sur localhost.
		command: `npx vite dev --port ${PORT} --strictPort`,
		port: PORT,
		// Toujours un Vite neuf avec `.env.test` : réutiliser `npm run dev` enverrait
		// les emails vers Brevo et écrirait dans le schéma `public`.
		reuseExistingServer: false,
		timeout: 180_000,
		stdout: 'pipe',
		stderr: 'pipe',
		env: {
			...(process.env as Record<string, string>),
			NODE_ENV: 'development',
			NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --dns-result-order=ipv4first`.trim()
		}
	}
});
