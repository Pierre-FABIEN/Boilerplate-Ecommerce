# Boilerplate-core

Socle SvelteKit (Svelte 5) : commerce, blog, espace d'administration et
authentification, sur PostgreSQL via Prisma.

## Démarrer

```bash
npm install
cp .env.example .env          # renseigner DATABASE_URL, DIRECT_URL, ENCRYPTION_KEY…
npm run db:deploy             # applique les migrations
npm run seed                  # jeu de données de démonstration
npm run dev
```

## Documentation

| Sujet                        | Document                                            |
| ---------------------------- | --------------------------------------------------- |
| Authentification            | [docs/auth/README.md](./docs/auth/README.md)        |
| Retirer l'authentification   | [docs/auth/retrait.md](./docs/auth/retrait.md)      |
| Administration              | [docs/admin/README.md](./docs/admin/README.md)      |
| Retirer l'administration     | [docs/admin/retrait.md](./docs/admin/retrait.md)    |
| Catalogue produits           | [docs/products/README.md](./docs/products/README.md) |
| Retirer le catalogue         | [docs/products/retrait.md](./docs/products/retrait.md) |
| Tests end-to-end            | [e2e/README.md](./e2e/README.md)                    |

## Structure

```
src/lib/lucia/        module d'authentification (retirable, voir docs/auth)
src/lib/admin/        gardes du back-office (retirable, voir docs/admin)
src/lib/products/     lecture publique du catalogue (retirable, voir docs/products)
src/lib/prisma/       accès aux données, un dossier par domaine
src/lib/components/   composants partagés, dont shadcn-svelte
src/lib/server/       utilitaires serveur (Stripe, Cloudinary, quotas de débit)
src/routes/auth/      parcours d'authentification
src/routes/admin/     espace d'administration (réservé au rôle ADMIN)
prisma/               schéma, migrations et seed
e2e/                  parcours Playwright
```

## Commandes

```bash
npm run dev                 # serveur de développement
npm run build               # build de production
npm run test:e2e            # parcours Playwright (auth + admin + produits)
npm run check               # vérification des types
npm run db:studio           # explorateur de base de données
```
