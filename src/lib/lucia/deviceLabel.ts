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

/**
 * Mêmes motifs que `BROWSER_PATTERNS`, avec un groupe capturant la version
 * majeure — jamais le build complet, qui change toutes les ~4 semaines pour
 * Chrome (RESTE_A_FAIRE.md § A.2.5). Safari n'expose sa version que via le
 * segment `Version/`, le `Safari/<build>` final n'est qu'un numéro WebKit figé.
 */
const BROWSER_VERSION_PATTERNS: [RegExp, string][] = [
	[/edg\/(\d+)/i, 'Edge'],
	[/(?:opr|opera)\/(\d+)/i, 'Opera'],
	[/chrome\/(\d+)/i, 'Chrome'],
	[/firefox\/(\d+)/i, 'Firefox'],
	[/version\/(\d+).*safari/i, 'Safari']
];

/**
 * Empreinte d'appareil pour la détection de « nouvel appareil »
 * (`recordLoginEvent`) : OS + navigateur + version majeure seulement, pour
 * ne pas ré-alerter à chaque mise à jour mineure/build, tout en continuant à
 * distinguer un changement d'OS ou de navigateur. Volontairement plus fin
 * que `describeUserAgent()` (« Chrome sur Windows » seul est trop générique,
 * voir RESTE_A_FAIRE.md § A.2.5) — `null` si le navigateur n'est pas
 * reconnu, pour ne jamais comparer à l'aveugle.
 */
export function normalizeDeviceFingerprint(userAgent: string | null): string | null {
	if (!userAgent) return null;

	const match = BROWSER_VERSION_PATTERNS.find(([pattern]) => pattern.test(userAgent));
	if (!match) return null;
	const [pattern, browser] = match;
	const majorVersion = userAgent.match(pattern)?.[1];
	const os = OS_PATTERNS.find(([osPattern]) => osPattern.test(userAgent))?.[1] ?? 'OS inconnu';

	return `${browser}/${majorVersion}-${os}`;
}
