# Retirer le module catalogue

Procédure à suivre dans l'ordre. Compter moins d'une heure, l'essentiel étant de
décider ce que deviennent les commandes qui référencent encore un `Product`.

## À lire d'abord

Supprimer la vitrine et `/admin/products` enlève l'interface, pas les lignes
en base. Trois trajectoires :

| Trajectoire | Ce que devient le catalogue | Effort |
| ----------- | --------------------------- | ------ |
| Autre vitrine (CMS, headless) | les modèles Prisma restent ou sont remplacés | modéré |
| Commerce sans vitrine | garder `Product` pour les `OrderItem` | faible |
| Retirer aussi le commerce | supprimer Product, Category, Order, Transaction | important |

Les étapes 1 et 2 sont communes. L'étape 3 traite le commerce conservé.

## 1. Supprimer les fichiers du module

```bash
rm -rf src/lib/products src/routes/products src/routes/admin/products
rm -rf src/lib/prisma/products src/lib/prisma/categories
rm -rf src/lib/schema/products src/lib/schema/categories
rm -rf e2e/products docs/products
```

Les schémas `src/lib/schema/categories` concernent les **catégories produit**,
pas le blog (`src/lib/schema/BlogPost/`).

## 2. Traiter les points de couplage

```bash
rg "PRODUCT-PLUGIN" src/ prisma/
```

Les blocs encadrés par `PRODUCT-PLUGIN ▼` et `PRODUCT-PLUGIN ▲` se suppriment
tels quels.

| Fichier | Action |
| ------- | ------ |
| `src/lib/components/Navigation.svelte` | retirer le lien Catalogue / `/products` |
| `src/routes/admin/+layout.svelte` | retirer l'entrée « produits » du menu |
| `src/lib/sitemap.config.ts` | retirer `/products` |
| `prisma/seed.js` | ne plus créer catégories ni produits |
| `prisma/schema.prisma` | `OrderItem.productId` : garder si le commerce reste |

Point de vigilance : le panier et le checkout **dépendent** encore de `Product`.
Les retirer n'est pas inclus dans ce module ; voir un futur `COMMERCE-PLUGIN`.

## 3. Données et dépendances

Cloudinary (`CLOUDINARY_*`) sert surtout les images produit. Le conserver si
d'autres uploads restent (personnalisations de commande).

Le modèle `Category` n'a rien à voir avec `BlogCategory`.

## 4. Vérifier

```bash
rg "PRODUCT-PLUGIN"      # doit ne rien renvoyer
rg "/products" src/      # plus de lien vers la vitrine
npx svelte-check --threshold error
npm run test:e2e         # auth + admin doivent encore passer
```
