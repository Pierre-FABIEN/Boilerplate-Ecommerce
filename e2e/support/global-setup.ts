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
export default async function globalSetup() {
	execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
		env: {
			...process.env,
			DATABASE_URL: process.env.DATABASE_URL,
			DIRECT_URL: process.env.DIRECT_URL
		},
		stdio: 'pipe'
	});

	const stale = await db.user.findMany({
		where: { email: { startsWith: E2E_EMAIL_PREFIX } },
		select: { id: true }
	});
	if (stale.length > 0) {
		const ids = stale.map((u) => u.id);
		// Les paniers bloquent la suppression des comptes (`Order → User` en Restrict).
		await db.order.deleteMany({ where: { userId: { in: ids } } });
		await db.user.deleteMany({ where: { id: { in: ids } } });
		console.log(`[e2e] ${stale.length} compte(s) résiduel(s) purgé(s).`);
	}

	const smtpPort = Number(process.env.SMTP_PORT ?? 2525);
	const sink = await startSmtpSink(smtpPort);
	console.log(`[e2e] puits SMTP à l'écoute sur 127.0.0.1:${smtpPort}`);

	return async () => {
		await sink.close();
		await db.$disconnect();
	};
}
