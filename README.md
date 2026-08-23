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
| Commerce                     | [docs/commerce/README.md](./docs/commerce/README.md) |
| Retirer le commerce          | [docs/commerce/retrait.md](./docs/commerce/retrait.md) |
| Blog                         | [docs/blog/README.md](./docs/blog/README.md)        |
| Retirer le blog              | [docs/blog/retrait.md](./docs/blog/retrait.md)      |
| Codes promo                  | [docs/promo/README.md](./docs/promo/README.md)      |
| Retirer les codes promo      | [docs/promo/retrait.md](./docs/promo/retrait.md)    |
| Contact                      | [docs/contact/README.md](./docs/contact/README.md)  |
| Retirer le contact           | [docs/contact/retrait.md](./docs/contact/retrait.md)|
| Tests end-to-end            | [e2e/README.md](./e2e/README.md)                    |

## Structure

```
src/lib/lucia/        module d'authentification (retirable, voir docs/auth)
src/lib/admin/        gardes du back-office (retirable, voir docs/admin)
src/lib/products/     lecture publique du catalogue (retirable, voir docs/products)
src/lib/blog/         lecture publique du blog (retirable, voir docs/blog)
src/lib/contact/      formulaire de contact (retirable, voir docs/contact)
src/lib/commerce/     panier / checkout (retirable, voir docs/commerce)
src/lib/prisma/promo/ codes promo (retirable, voir docs/promo)
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
npm run dev                 # Vite (http://localhost:2000) + Prisma Studio (http://localhost:5555)
npm run dev:vite            # Vite seul, sans Studio
npm run build               # build de production
npm run test:e2e            # parcours Playwright (auth + admin + produits + commerce + blog + promo + contact)
npm run check               # vérification des types
npm run db:studio           # Prisma Studio seul (schéma de dev, http://localhost:5555)
npm run db:studio:e2e       # Prisma Studio (schéma e2e, http://localhost:5556)
```
