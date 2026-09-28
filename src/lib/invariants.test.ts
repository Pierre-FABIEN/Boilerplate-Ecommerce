/**
 * Garde-fous sur des invariants que le typage ne peut pas exprimer.
 *
 * Chaque règle ici correspond à un bug réellement survenu dans ce dépôt, et
 * dont la nature est de réapparaître : rien dans le langage n'empêche de le
 * réécrire, seule la vigilance du relecteur s'y oppose. Un test qui lit les
 * sources rend la violation impossible à fusionner sans la voir.
 *
 * Ajouter une règle ici plutôt qu'un commentaire dès qu'un correctif repose
 * sur « il ne faut pas oublier de… ».
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();

function walk(dir: string): string[] {
	const entries = readdirSync(dir);
	return entries.flatMap((entry) => {
		const full = join(dir, entry);
		if (entry === 'node_modules' || entry === '.svelte-kit') return [];
		return statSync(full).isDirectory() ? walk(full) : [full];
	});
}

/** Retire commentaires de bloc et de ligne, pour ne jamais accuser une explication. */
function stripComments(source: string): string {
	return source
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.split('\n')
		.map((line) => line.replace(/(^|[^:])\/\/.*$/, '$1'))
		.join('\n');
}

function sourceLines(file: string): { line: string; number: number }[] {
	return stripComments(readFileSync(file, 'utf8'))
		.split('\n')
		.map((line, index) => ({ line, number: index + 1 }));
}

const rel = (file: string) => relative(ROOT, file).split(sep).join('/');

describe('Invariants du dépôt', () => {
	/**
	 * `Session.id` EST le token du cookie (`createSession`, $lib/lucia/session.ts) :
	 * aucun hachage entre le cookie et la clé primaire. Le renvoyer au client ou
	 * l'écrire dans un journal revient à publier un identifiant de connexion
	 * réutilisable tel quel. `sessionPublicId()` existe pour ces usages.
	 *
	 * Déjà survenu trois fois : page des sessions actives, fiche admin d'un
	 * compte, puis deux lignes de log distinctes.
	 */
	it("n'expose jamais le token de session (utiliser sessionPublicId)", () => {
		// Exclus : les modules qui manipulent légitimement le token brut, et les
		// webhooks Stripe, dont `session.id` désigne une session de paiement.
		const allowed = [
			'src/lib/lucia/',
			'src/lib/prisma/session/',
			'src/lib/prisma/passwordResetSession/',
			'src/lib/prisma/sessionRevokeToken/',
			'src/routes/api/webhooks/'
		];

		const files = [...walk(join(ROOT, 'src'))].filter(
			(file) =>
				file.endsWith('.ts') &&
				!file.endsWith('.test.ts') &&
				!allowed.some((prefix) => rel(file).startsWith(prefix))
		);

		const violations: string[] = [];
		for (const file of files) {
			for (const { line, number } of sourceLines(file)) {
				if (line.includes('sessionPublicId')) continue;
				// Valeur d'une propriété d'objet : ce qui part vers un `load`, une
				// réponse JSON ou les arguments d'un `log()`. La négation écarte les
				// comparaisons, qui ne produisent qu'un booléen.
				if (
					/:\s*(?:[\w$]+\.)*session\.id\b(?!\s*[=!]==)/.test(line) ||
					/:\s*(?:[\w$]+\.)*sessionId\b(?!\s*[=!]==)/.test(line)
				) {
					violations.push(`${rel(file)}:${number} → ${line.trim()}`);
				}
			}
		}

		expect(violations, `Token de session exposé :\n${violations.join('\n')}`).toEqual([]);
	});

	/**
	 * Le montant encaissé doit venir de `OrderItem.price`, figé et validé à
	 * l'ajout au panier — seul champ qui porte la surcharge de prix d'une
	 * variante. Lire `product.price` ici facturait le prix de base : le client
	 * voyait 125 €, Stripe encaissait 105,50 €, la facture enregistrait 125 €.
	 */
	it('calcule les montants du tunnel de paiement depuis OrderItem.price', () => {
		const files = ['src/lib/commerce/checkout.ts', 'src/routes/checkout/+page.server.ts'];

		const violations: string[] = [];
		for (const file of files) {
			for (const { line, number } of sourceLines(join(ROOT, file))) {
				if (/\bproduct\.price\b/.test(line)) {
					violations.push(`${file}:${number} → ${line.trim()}`);
				}
			}
		}

		expect(
			violations,
			`Prix de base utilisé au lieu de \`item.price\` :\n${violations.join('\n')}`
		).toEqual([]);
	});
});
