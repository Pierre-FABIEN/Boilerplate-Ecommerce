# Blog

Vitrine publique et CRUD admin des articles Prisma : fiches, catégories, tags.
Réservé en écriture au rôle `ADMIN` ; la lecture (`/blog`) est ouverte et ne
montre que les articles `published`.

Il est conçu pour être retirable d'un bloc. La procédure complète est dans
[retrait.md](./retrait.md) ; ce document décrit son fonctionnement.

## Frontière du module

| Emplacement | Contenu |
| ----------- | ------- |
| `src/lib/blog/` | lecture publique et chemins de tests |
| `src/lib/prisma/blogPost/` | DAO Prisma (articles, catégories, tags) |
| `src/lib/schema/BlogPost/` | schémas Zod des formulaires admin |
| `src/routes/blog/` | vitrine |
| `src/routes/admin/blog/` | CRUD back-office (gardes = module admin) |

Contrairement à l'auth, le blog **n'a pas de hook** dans `hooks.server.ts` :
le public est en lecture seule, les mutations passent déjà par `requireAdmin`.
Le point d'accroche, ce sont les routes `/blog` et la section admin.

Partout ailleurs, une dépendance au blog est signalée par un marqueur
`BLOG-PLUGIN`. La liste exhaustive s'obtient ainsi :

```bash
rg "BLOG-PLUGIN" src/ prisma/
```

Les commentaires (`BlogComment`) sont un modèle Prisma rattaché aux articles
(`onDelete: Cascade`). Il n'y a pas d'UI publique de commentaires dans ce
module.

## Vitrine

| Route | Rôle |
| ----- | ---- |
| `/blog` | liste des articles publiés, filtre optionnel `?categorie=` |
| `/blog/[slug]` | fiche ; 404 si le slug est inconnu **ou** si l'article n'est pas publié |

Les données viennent de Prisma.

Un brouillon n'apparaît ni dans la liste ni à l'URL de son slug.

## Admin

`/admin/blog` : liste, création, édition, suppression, catégories, tags. Accès
couvert par `adminHandle`. Un article peut être dépublié : il disparaît de la
vitrine sans être effacé.

## Ce qui n'est pas le blog

L'authentification, le back-office dans son ensemble, le catalogue produits
(`Category` n'est pas `BlogCategory`), le panier et le checkout.

## Tests

Les numéros sont ceux des `test.step`. Changer la procédure ici, puis le spec,
puis le code (`src/lib/blog`, `/blog`, `/admin/blog`). Index :
[../../e2e/README.md](../../e2e/README.md).

### Vitrine — `e2e/blog/catalog.spec.ts`

| # | Étape | Geste | Preuve |
| - | ----- | ----- | ------ |
| 1 | La liste affiche le titre Prisma | GET `/blog` | titres + lien catégorie |
| 2 | La fiche s’ouvre par slug | GET `/blog/[slug]` | titre, auteur, ligne en base |
| 3 | Un slug inconnu renvoie 404 | GET slug absent | statut 404 |
| 4 | Un brouillon n’est pas public | GET slug `published=false` | statut 404, absent de la liste |
| 5 | Pas d’UI d’édition admin | HTML de `/blog` | pas de `/admin/blog` ni `passwordHash` |

### Admin — `e2e/blog/admin.spec.ts`

La création et l'édition du titre passent par Prisma : TinyMCE n'est pas joué
en e2e.

| # | Étape | Geste | Preuve |
| - | ----- | ----- | ------ |
| 1 | Liste admin | GET `/admin/blog`, recherche | ligne du tableau Articles |
| 2 | Création Prisma visible sur la vitrine | GET `/blog` | heading + base |
| 3 | Édition Prisma du titre | `updateBlogPostTitle` | DB + titre sur la fiche publique |
| 4 | Suppression | dialogue Continue | article absent en base |
| 5 | Dépublier : disparaît de la vitrine | `published=false` en Prisma | GET slug → 404 |

À part : CLIENT POST `?/deleteBlogPost` — l'article reste.

```bash
npm run test:e2e
```
