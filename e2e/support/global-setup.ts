import { execFileSync } from 'node:child_process';
import { startSmtpSink } from './smtp-sink';
import { db } from './db';
import { E2E_EMAIL_PREFIX } from './account';

/**
 * Préparation globale de la suite end-to-end :
 *  1. applique les migrations au schéma PostgreSQL `e2e` ;
 *  2. purge les comptes laissés par un run interrompu ;
 *  3. démarre le puits SMTP qui absorbe les emails.
 *
 * La fonction retournée est utilisée par Playwright comme teardown global.
 */
async function withRetry<T>(operation: () => Promise<T>, attempts = 5): Promise<T> {
	let lastError: unknown;
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			return await operation();
		} catch (error) {
			lastError = error;
			console.log(`[e2e] base injoignable (tentative ${attempt}/${attempts}), nouvel essai…`);
			await new Promise((resolve) => setTimeout(resolve, 3000));
		}
	}
	throw lastError;
}

/**
 * Routes `/api/jobs/*` sollicitées par la suite. Vite dev transforme le graphe
 * de modules SSR d'une route au PREMIER accès : mesuré à 81,7 s pour
 * `accounting-export` (5,7 ms au second appel). Le test qui tombe le premier
 * sur une de ces routes dépasse donc `actionTimeout` quoi qu'il fasse.
 * On paie ce coût ici, une fois, hors du chrono des tests.
 *
 * Appel sans en-tête d'autorisation : la garde rejette avant d'exécuter le job,
 * donc aucun effet de bord (ni e-mail, ni écriture) — seul le module est chargé.
 */
const WARMUP_ROUTES = [
	'accounting-export',
	'cart-recovery',
	'cleanup',
	'post-payment',
	'recently-viewed-reminder',
	'review-reminder'
];

function warmUpJobRoutes() {
	const port = Number(process.env.E2E_PORT ?? 2001);
	const startedAt = Date.now();

	const requests = WARMUP_ROUTES.map(async (route) => {
		try {
			await fetch(`http://localhost:${port}/api/jobs/${route}`, {
				method: 'POST',
				signal: AbortSignal.timeout(180_000)
			});
		} catch {
			// Un préchauffage raté ne doit jamais empêcher la suite de démarrer :
			// le test concerné paiera la compilation lui-même, comme avant.
		}
	});

	return async () => {
		await Promise.allSettled(requests);
		console.log(
			`[e2e] ${WARMUP_ROUTES.length} route(s) /api/jobs préchauffée(s) en ${Math.round(
				(Date.now() - startedAt) / 1000
			)} s.`
		);
	};
}

export default async function globalSetup() {
	// Lancé avant les migrations pour que la compilation Vite se recouvre avec
	// elles ; attendu juste avant de rendre la main aux tests.
	const awaitWarmUp = warmUpJobRoutes();

	// Réveille le compute Neon via le pooler (DATABASE_URL) avant migrate,
	// qui parle au host direct (DIRECT_URL) et échoue à froid.
	await withRetry(() => db.$queryRawUnsafe('SELECT 1'));

	const nodeOptions = `${process.env.NODE_OPTIONS ?? ''} --dns-result-order=ipv4first`.trim();
	await withRetry(async () => {
		execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
			env: {
				...process.env,
				NODE_OPTIONS: nodeOptions,
				DATABASE_URL: process.env.DATABASE_URL,
				DIRECT_URL: process.env.DIRECT_URL
			},
			stdio: 'pipe'
		});
	});

	// Neon met la base en veille après inactivité : la première connexion peut
	// échouer le temps que le calcul redémarre.
	const stale = await withRetry(() =>
		db.user.findMany({
			where: { email: { startsWith: E2E_EMAIL_PREFIX } },
			select: { id: true }
		})
	);
	if (stale.length > 0) {
		const ids = stale.map((u) => u.id);
		await db.transaction.deleteMany({ where: { userId: { in: ids } } });
		await db.order.deleteMany({ where: { userId: { in: ids } } });
		await db.user.deleteMany({ where: { id: { in: ids } } });
		console.log(`[e2e] ${stale.length} compte(s) résiduel(s) purgé(s).`);
	}

	await db.transaction.deleteMany({ where: { stripePaymentId: { startsWith: 'e2e-' } } });

	const staleProducts = await withRetry(() =>
		db.product.findMany({
			where: { slug: { startsWith: 'e2e-' } },
			select: { id: true }
		})
	);
	if (staleProducts.length > 0) {
		const ids = staleProducts.map((p) => p.id);
		await db.orderItem.deleteMany({ where: { productId: { in: ids } } });
		await db.productTaxonomyValue.deleteMany({ where: { productId: { in: ids } } });
		await db.product.deleteMany({ where: { id: { in: ids } } });
		await db.taxonomyValue.deleteMany({ where: { value: { startsWith: 'e2e-cat-' } } });
		console.log(`[e2e] ${staleProducts.length} produit(s) résiduel(s) purgé(s).`);
	}

	// Taxonomies jetables (`e2e/products/taxonomies.spec.ts`) laissées par un run interrompu.
	await db.taxonomy.deleteMany({ where: { slug: { startsWith: 'e2e-taxonomy-' } } });

	const smtpPort = Number(process.env.SMTP_PORT ?? 2525);
	const httpPort = Number(process.env.SMTP_HTTP_PORT ?? 2526);
	const sink = await startSmtpSink(smtpPort, httpPort);
	console.log(
		`[e2e] boîte de réception : SMTP sur 127.0.0.1:${smtpPort}, lecture sur 127.0.0.1:${httpPort}`
	);

	await awaitWarmUp();

	return async () => {
		await sink.close();
		await db.$disconnect();
	};
}
