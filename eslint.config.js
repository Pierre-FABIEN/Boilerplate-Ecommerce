import prettier from 'eslint-config-prettier';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

export default ts.config(
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	prettier,
	...svelte.configs['flat/prettier'],
	{
		rules: {
			// Convention déjà utilisée dans le repo pour les paramètres
			// intentionnellement inutilisés (ex: signature imposée par un type).
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
			// `svelte/prefer-svelte-reactivity` et `svelte/require-each-key` restent
			// en 'error' (défaut) : ce sont des bugs de réactivité potentiels, pas
			// du style — le step CI "Lint (eslint)" est désormais bloquant dessus.
			// Le reste de la dette ESLint ci-dessous est volontairement en 'warn'
			// (visible dans la sortie CI, mais ne bloque pas) tant qu'elle n'a pas
			// été résorbée (voir RESTE_A_FAIRE.md §2.3).
			'@typescript-eslint/no-explicit-any': 'warn',
			// Résorbé (0 occurrence) — promu en 'error' pour éviter toute régression.
			'svelte/prefer-writable-derived': 'error',
			// 2 usages revus et acceptés (contenu de confiance interne) — voir
			// RESTE_A_FAIRE.md §2.3.
			'svelte/no-at-html-tags': 'warn'
		}
	},
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		}
	},
	{
		// *.svelte.ts/js (fichiers "universal reactivity" Svelte 5) sont aussi
		// parsés par svelte-eslint-parser et ont besoin du parser TS, sinon la
		// syntaxe TS moderne (ex: `import { type X }`) casse le parsing.
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],

		languageOptions: {
			parserOptions: {
				parser: ts.parser
			}
		}
	},
	{
		// k6 injecte ces globales au runtime (scripts exécutés hors Node/browser).
		files: ['k6/**'],
		languageOptions: {
			globals: {
				__ENV: 'readonly',
				__VU: 'readonly',
				__ITER: 'readonly'
			}
		}
	},
	{
		// static/tinymce est une librairie vendorisée/minifiée : la lint génère
		// des milliers de faux positifs sans rapport avec le code applicatif.
		// .vercel/ : sortie de `vercel build`/`npm run build` (adapter-vercel).
		// coverage/ : rapport généré par `vitest run --coverage`.
		// Aucun des deux n'est commité (voir .gitignore) mais tous deux
		// peuvent exister localement/en CI et contiennent du JS bundlé/généré
		// qui produit des milliers de faux positifs s'il est linté.
		ignores: ['build/', '.svelte-kit/', 'dist/', 'static/tinymce/', '.vercel/', 'coverage/']
	}
);
