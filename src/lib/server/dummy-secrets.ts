/**
 * Détecte les secrets factices de `.env.test.example`.
 *
 * Un mock e2e (OpenCage, Google, Cloudinary, …) ne doit s'activer que dans ce
 * cas : `PUBLIC_ENV=test` tout seul ne suffit plus, sinon on ne parle jamais
 * aux vrais services même avec des clés réelles.
 */
export function isDummySecret(value: string | undefined | null): boolean {
	if (value == null) return true;
	const v = value.trim().replace(/^['"]|['"]$/g, '');
	if (!v) return true;
	if (v === 'e2e' || v === '0') return true;
	if (v.startsWith('e2e-')) return true;
	if (v.endsWith('_e2e')) return true;
	if (v === 'sk_test_e2e' || v === 'pk_test_e2e' || v === 'whsec_e2e') return true;
	return false;
}
