/**
 * Une DSN Sentry valide ressemble à `https://<clé>@<host>/<projet>` — un
 * simple contrôle de forme, aucun appel réseau. Sans lui, une valeur vide,
 * un texte de remplacement ou une DSN mal collée laisse le SDK devenir un
 * no-op en interne mais imprime quand même `Invalid Sentry Dsn: ****` dans
 * la console à chaque page (vu sur `/auth/settings` en production) — ce
 * contrôle l'évite en amont plutôt que de subir l'avertissement du SDK.
 *
 * Ni `$lib/server/*` ni `$lib/server/dummy-secrets.ts` : utilisé à la fois
 * côté client (`src/hooks.client.ts`) et serveur (`src/hooks.server.ts`),
 * doit rester importable des deux côtés.
 */
export function isValidSentryDsn(dsn: string | undefined | null): dsn is string {
	if (!dsn) return false;
	try {
		const url = new URL(dsn);
		return (url.protocol === 'http:' || url.protocol === 'https:') && url.username.length > 0;
	} catch {
		return false;
	}
}
