# Retirer le module blog

Procédure à suivre dans l'ordre. Compter moins d'une heure.

## À lire d'abord

Supprimer la vitrine et `/admin/blog` enlève l'interface, pas les lignes en
base. Deux trajectoires :

| Trajectoire | Ce que devient le blog | Effort |
| ----------- | ---------------------- | ------ |
| Autre vitrine (CMS, headless) | les modèles Prisma restent ou sont remplacés | modéré |
| Tout retirer | supprimer BlogPost, BlogAuthor, BlogCategory, BlogTag, BlogComment | faible |

Les étapes 1 et 2 sont communes.

## 1. Supprimer les fichiers du module

```bash
rm -rf src/lib/blog src/routes/blog src/routes/admin/blog
rm -rf src/lib/prisma/blogPost src/lib/schema/BlogPost
rm -f src/lib/server/blog.ts prisma/seed-data/blog.js
rm -rf e2e/blog docs/blog
```

Les schémas `src/lib/schema/categories` concernent les **catégories produit**,
pas le blog.

## 2. Traiter les points de couplage

```bash
rg "BLOG-PLUGIN" src/ prisma/
```

Les blocs encadrés par `BLOG-PLUGIN ▼` et `BLOG-PLUGIN ▲` se suppriment
tels quels.

| Fichier | Action |
| ------- | ------ |
| `src/lib/components/Navigation.svelte` | retirer le lien Blog / `/blog` |
| `src/routes/admin/+layout.svelte` | retirer l'entrée « blog » du menu |
| `src/lib/sitemap.config.ts` | retirer `/blog` |
| `prisma/seed.js` | ne plus créer auteurs, catégories ni articles |
| `prisma/schema.prisma` | retirer les modèles `Blog*` dans une migration |

`BlogCategory` n'a rien à voir avec `Category` (catalogue).

## 3. Données et dépendances

TinyMCE (`PUBLIC_TINYMCE_API_KEY`, `/tinymce`) ne sert plus si aucun autre
éditeur riche ne reste.

## 4. Vérifier

```bash
rg "BLOG-PLUGIN"      # doit ne rien renvoyer
rg "/blog" src/       # plus de lien vers la vitrine
npx svelte-check --threshold error
npm run test:e2e      # auth + admin + products + commerce doivent encore passer
```
