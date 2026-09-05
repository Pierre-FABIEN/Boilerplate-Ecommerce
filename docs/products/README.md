# Catalogue produits

Vitrine publique et CRUD admin des produits Prisma : fiches, catégories, images
Cloudinary. Réservé en écriture au rôle `ADMIN` ; la lecture (`/products`) est
ouverte.

Il est conçu pour être retirable d'un bloc. La procédure complète est dans
[retrait.md](./retrait.md) ; ce document décrit son fonctionnement.

## Frontière du module

| Emplacement | Contenu |
| ----------- | ------- |
| `src/lib/products/` | lecture publique et chemins de tests |
| `src/lib/prisma/products/` et `src/lib/prisma/categories/` | DAO Prisma |
| `src/routes/products/` | vitrine |
| `src/routes/admin/products/` | CRUD back-office (gardes = module admin) |

Contrairement à l'auth, le catalogue **n'a pas de hook** dans `hooks.server.ts` :
le public est en lecture seule, les mutations passent déjà par `requireAdmin`.
Le point d'accroche, ce sont les routes `/products` et la section admin.

Partout ailleurs, une dépendance au catalogue est signalée par un marqueur
`PRODUCT-PLUGIN`. La liste exhaustive s'obtient ainsi :

```bash
rg "PRODUCT-PLUGIN" src/ prisma/
```

Le catalogue n'est **pas** le tunnel de commande. Panier, checkout, Stripe et
Sendcloud relèvent du module commerce : [docs/commerce](../commerce/README.md).
Le bouton « Ajouter au panier » sur la fiche est un accrochage COMMERCE.

## Vitrine

| Route | Rôle |
| ----- | ---- |
| `/products` | liste, filtre optionnel `?categorie=` |
| `/products/[slug]` | fiche ; 404 si le slug est inconnu |

Les données viennent de Prisma. Contentful n'est plus utilisé pour les produits.

Les trois lectures publiques (`listProducts`, `getProductBySlug`,
`listCategories` dans `src/lib/products/catalog.ts`) passent par un cache
Redis de 60 s quand Upstash est configuré (`src/lib/server/cache.ts`),
invalidé automatiquement à chaque écriture des DAO `src/lib/prisma/products` /
`src/lib/prisma/categories` (un seul numéro de version pour tout le
catalogue : `bumpCacheVersion('catalog')`). Sans Redis configuré, ces
fonctions relisent Prisma à chaque appel, comme avant.

## Admin

`/admin/products` : liste, création, édition, suppression, catégories. Accès
couvert par `adminHandle`. Un produit déjà présent dans une `OrderItem` **ne
peut pas** être supprimé (`onDelete: Restrict`).

## Ce qui n'est pas le catalogue

L'authentification, le back-office dans son ensemble, le panier et le checkout.
Les `OrderItem` pointent vers `Product` : c'est un couplage commerce, pas une
raison de fusionner les deux modules.

## Tests

Les numéros sont ceux des `test.step`. Changer la procédure ici, puis le spec,
puis le code (`src/lib/products`, `/products`, `/admin/products`). Index :
[../../e2e/README.md](../../e2e/README.md).

### Vitrine — `e2e/products/catalog.spec.ts`

| # | Étape | Geste | Preuve |
| - | ----- | ----- | ------ |
| 1 | La liste affiche le nom Prisma | GET `/products` | titres + lien catégorie |
| 2 | La fiche s’ouvre par slug | GET `/products/[slug]` | nom, prix, ligne en base |
| 3 | Un slug inconnu renvoie 404 | GET slug absent | statut 404 |
| 4 | Pas d’UI d’édition admin | HTML de `/products` | pas de `/admin/products` ni `passwordHash` |

### Admin — `e2e/products/admin.spec.ts`

Création UI Cloudinary **non** jouée (`.env.test` sans upload). Les produits
sont créés en Prisma (`createCatalogProduct`), le reste passe par l'UI.

| # | Étape | Geste | Preuve |
| - | ----- | ----- | ------ |
| 1 | Liste admin | GET `/admin/products`, recherche | ligne du tableau Produits |
| 2 | Création Prisma visible sur la vitrine | GET `/products` | heading + base |
| 3 | Édition prix et stock | fiche → 9,99 / 7 → Save | DB + « 9.99 € » / « Stock : 7 » |
| 4 | Suppression sans commande | dialogue Continue | produit absent en base |
| 5 | Produit commandé : suppression refusée | même geste si `OrderItem` | produit **encore** en base |

À part : CLIENT POST `?/deleteProduct` — le produit reste.

```bash
npm run test:e2e
```
