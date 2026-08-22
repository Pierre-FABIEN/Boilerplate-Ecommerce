import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// `.env.test` prime sur `.env` : la suite travaille sur le schéma PostgreSQL
// `e2e` et sur le puits SMTP local, jamais sur les données de développement.
dotenv.config({ path: '.env.test', override: true });

const PORT = 4173;

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
	retries: process.env.CI ? 1 : 0,
	forbidOnly: !!process.env.CI,
	reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},

	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

	webServer: {
		// Serveur de développement plutôt que `build && preview` : démarrage plus
		// court, et cookies de session non marqués `Secure`, donc utilisables en
		// clair sur localhost.
		command: `npx vite dev --port ${PORT} --strictPort`,
		port: PORT,
		reuseExistingServer: false,
		timeout: 180_000,
		stdout: 'pipe',
		stderr: 'pipe',
		env: {
			...(process.env as Record<string, string>),
			NODE_ENV: 'development'
		}
	}
});
