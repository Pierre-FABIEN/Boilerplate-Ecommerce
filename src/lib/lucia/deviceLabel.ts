/**
 * Étiquette lisible d'un appareil à partir de son User-Agent (« Chrome sur
 * Windows »), pour /auth/settings/sessions et la fiche admin d'un compte.
 *
 * Volontairement approximatif — quelques expressions régulières plutôt qu'une
 * dépendance dédiée (ua-parser-js et consorts) : reconnaître un appareil dans
 * une liste de sessions ne demande pas une détection exhaustive, seulement un
 * signal utile pour repérer un appareil inconnu.
 *
 * L'ordre des motifs compte : Edge/Opera embarquent la chaîne « Chrome » (et
 * Chrome embarque « Safari », legs WebKit) dans leur propre User-Agent —
 * chaque navigateur doit donc être testé avant ceux dont il contient la
 * signature, jamais l'inverse. Même logique pour Android, dont le
 * User-Agent contient aussi « Linux ».
 */
const OS_PATTERNS: [RegExp, string][] = [
	[/windows nt/i, 'Windows'],
	[/mac os x/i, 'macOS'],
	[/iphone/i, 'iPhone'],
	[/ipad/i, 'iPad'],
	[/android/i, 'Android'],
	[/linux/i, 'Linux']
];

const BROWSER_PATTERNS: [RegExp, string][] = [
	[/edg\//i, 'Edge'],
	[/opr\/|opera/i, 'Opera'],
	[/chrome\//i, 'Chrome'],
	[/firefox\//i, 'Firefox'],
	[/safari\//i, 'Safari']
];

export function describeUserAgent(userAgent: string | null): string {
	if (!userAgent) return 'Appareil inconnu';

	const os = OS_PATTERNS.find(([pattern]) => pattern.test(userAgent))?.[1];
	const browser = BROWSER_PATTERNS.find(([pattern]) => pattern.test(userAgent))?.[1];

	if (browser && os) return `${browser} sur ${os}`;
	return browser ?? os ?? 'Appareil inconnu';
}
