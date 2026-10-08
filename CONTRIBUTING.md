# Contribuer

Merci de vouloir contribuer à ce projet. Ce document décrit le
fonctionnement minimal attendu — il sera étoffé au fil des besoins plutôt
que rétro-documenté après coup une fois plusieurs contributeurs actifs.

## Prérequis

- Node 22 (voir `.github/workflows/ci.yml` — même version qu'en CI).
- npm (le dépôt est verrouillé via `package-lock.json`, ne pas utiliser
  yarn/pnpm).
- Une base PostgreSQL locale pour Prisma (voir [README.md](README.md) et
  [e2e/README.md](e2e/README.md) pour le setup des tests).

## Installation

```bash
npm install
cp .env.example .env # puis remplir les variables (voir docs/secrets-rotation.md)
npm run db:deploy    # applique les migrations Prisma
npm run seed          # jeu de données de démonstration
```

## Avant d'ouvrir une Pull Request

Ces vérifications tournent aussi en CI (`.github/workflows/ci.yml`,
job `lint-and-check`) — les lancer en local évite un aller-retour :

```bash
npm run lint:prettier   # formatage
npm run lint:eslint     # bloquant sur svelte/require-each-key,
                        # svelte/prefer-svelte-reactivity et
                        # svelte/prefer-writable-derived, warn sur le reste
npm run check           # svelte-check (types), bloquant
npm run test:unit -- --run
```

`npm run lint:knip` (détection de code/dépendances mortes) et
`npm run test:e2e` (Playwright, nécessite une base dédiée — voir
[e2e/README.md](e2e/README.md)) sont recommandés mais non bloquants
localement.

## Conventions

- **TypeScript strict** partout (`tsconfig.json`) — éviter `any` explicite
  sauf contrainte réelle documentée (voir `RESTE_A_FAIRE.md` §2.3 pour
  les cas déjà identifiés et pourquoi ils restent en l'état).
- **Svelte 5 (runes)** — pas de syntaxe Svelte 4 (`export let`, stores
  `$:`) dans le nouveau code ; voir
  `/memories/repo/svelte5-effect-store-antipattern.md` (mémoire du dépôt)
  pour l'anti-pattern `$state`+`$effect` à éviter au profit d'un `$derived`
  écrivable.
- **Pas de suppression en masse** de dépendances/fichiers signalés par
  `knip` sans vérification individuelle (voir `RESTE_A_FAIRE.md` §2.4).
- Un commit qui touche à un module documenté dans `docs/` (auth, commerce,
  blog, products, promo, contact, admin) doit mettre à jour le
  `README.md`/`retrait.md` correspondant si le comportement change.

## Tests

- Unitaires (Vitest) : à côté du fichier testé (`*.test.ts`), voir
  `src/lib/server/sanitizeHtml.test.ts` pour un exemple récent.
- End-to-end (Playwright) : `e2e/<domaine>/*.spec.ts`, voir
  [e2e/README.md](e2e/README.md) pour l'environnement requis (base de
  test, SMTP sink, etc.).

## Revue de code

En solo aujourd'hui : pas de process de revue formalisé. Dès qu'un
deuxième contributeur régulier rejoint le projet, les PR passeront par une
revue avant merge sur `main` (voir [CODEOWNERS](CODEOWNERS)).
