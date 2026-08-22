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
Sendcloud relèvent d'un futur module commerce. Un bouton « ajouter au panier »
n'existe volontairement pas sur la fiche.

## Vitrine

| Route | Rôle |
| ----- | ---- |
| `/products` | liste, filtre optionnel `?categorie=` |
| `/products/[slug]` | fiche ; 404 si le slug est inconnu |

Les données viennent de Prisma. Contentful n'est plus utilisé pour les produits.

## Admin

`/admin/products` : liste, création, édition, suppression, catégories. Accès
couvert par `adminHandle`. Un produit déjà présent dans une `OrderItem` **ne
peut pas** être supprimé (`onDelete: Restrict`).

## Ce qui n'est pas le catalogue

L'authentification, le back-office dans son ensemble, le panier et le checkout.
Les `OrderItem` pointent vers `Product` : c'est un couplage commerce, pas une
raison de fusionner les deux modules.

## Tests

- `e2e/products/catalog.spec.ts` : liste publique, fiche, 404
- `e2e/products/admin.spec.ts` : CRUD admin, contrainte FK, CLIENT ne mute pas

```bash
npm run test:e2e
```
