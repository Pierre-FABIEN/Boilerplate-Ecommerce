# Retirer le module commerce

Procédure à suivre dans l'ordre. Compter moins d'une heure une fois le PSP
(Stripe) et Sendcloud décidés.

## À lire d'abord

Supprimer `/checkout` et `/admin/sales` enlève l'interface, pas les
`Transaction` en base. Trois trajectoires :

| Trajectoire | Ce que devient le tunnel | Effort |
| ----------- | ------------------------ | ------ |
| Autre PSP | garder `Order` / `Transaction`, remplacer Stripe | modéré |
| Catalogue sans vente | retirer COMMERCE, garder `Product` (`OrderItem` Restrict) | faible |
| Tout retirer | Order, Transaction, hook, `/checkout`, `/admin/sales` | important |

Les étapes 1 et 2 sont communes.

## 1. Supprimer les fichiers du module

```bash
rm -rf src/lib/commerce src/lib/prisma/order src/lib/prisma/transaction
rm -rf src/lib/store/Data/cartStore.ts src/lib/store/Data/cartSync.ts
rm -rf src/lib/components/cart src/lib/components/checkout src/lib/components/Facture
rm -rf src/routes/checkout src/routes/api/save-cart src/routes/api/webhooks
rm -rf src/routes/admin/sales src/routes/auth/settings/factures
rm -rf src/lib/server/jobs/post-payment.ts src/routes/api/jobs/post-payment
rm -rf e2e/commerce docs/commerce
```

Les adresses (`src/lib/prisma/addresses`) restent avec l'auth si le compte les
expose encore.

`src/lib/server/redis.ts`, `cache.ts`, `lock.ts` et `qstash.ts` sont des utilitaires
partagés (comme `rate-limit.ts` pour l'auth) : ne pas les supprimer s'ils
servent encore ailleurs (le cache catalogue de `PRODUCT-PLUGIN`, par exemple).

## 2. Traiter les points de couplage

```bash
rg "COMMERCE-PLUGIN" src/ prisma/
```

Les blocs encadrés par `COMMERCE-PLUGIN ▼` et `COMMERCE-PLUGIN ▲` se suppriment
tels quels.

| Fichier | Action |
| ------- | ------ |
| `src/hooks.server.ts` | retirer `pendingOrderHandle` |
| `src/routes/+layout.server.ts` | retirer `pendingOrder` |
| `src/routes/+layout.svelte` | retirer hydratation / `startSync` / panier invité |
| `src/lib/commerce/guestCart.ts` | localStorage `commerce:guest-cart` |
| `src/lib/components/Navigation.svelte` | retirer `<Cart />` |
| `src/routes/admin/+layout.svelte` | retirer l'entrée « ventes » |
| `src/lib/sitemap.config.ts` | retirer `/checkout` |
| `src/routes/products/[slug]/+page.svelte` | retirer « Ajouter au panier » |
| `prisma/schema.prisma` | `Order`, `OrderItem`, `Transaction` : garder si historique comptable |

Sendcloud (`src/lib/sendcloud`, `/api/sendcloud`) et le promo (`PROMO-PLUGIN`)
ne font pas partie de ce module : les retirer à part.

## 3. Données et dépendances

`STRIPE_*` et `VITE_STRIPE_PUBLISHABLE_KEY` ne servent plus. `SENDCLOUD_*` non
plus si le shipping part avec. `QSTASH_*` et `APP_URL` non plus, s'ils ne
servaient qu'au job post-paiement.

## 4. Vérifier

```bash
rg "COMMERCE-PLUGIN"      # doit ne rien renvoyer
rg "/checkout" src/       # plus de lien vers le tunnel
npx svelte-check --threshold error
npm run test:e2e          # auth + admin + products doivent encore passer
```
