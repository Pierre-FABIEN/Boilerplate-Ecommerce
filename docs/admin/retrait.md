# Retirer le module d'administration

Procédure à suivre dans l'ordre. Compter une heure, l'essentiel étant de décider
comment gérer ensuite les produits, les commandes et les comptes.

## À lire d'abord

Supprimer `/admin` enlève l'interface, pas les données. Trois trajectoires :

| Trajectoire | Ce que devient le CRUD | Effort |
| ----------- | ---------------------- | ------ |
| Remplacer par un autre back-office | les modèles Prisma restent | modéré |
| Tout gérer via Prisma Studio / SQL | plus d'UI métier | faible |
| Retirer aussi le commerce et le blog | supprimer les modèles concernés | important |

Les étapes 1 et 2 sont communes. L'étape 3 traite le commerce conservé.

## 1. Supprimer les fichiers du module

```bash
rm -rf src/lib/admin src/routes/admin
```

Les tests et la doc partent avec :

```bash
rm -rf e2e/admin docs/admin
```

## 2. Traiter les points de couplage

```bash
rg "ADMIN-PLUGIN" src/ prisma/
```

Les blocs encadrés par `ADMIN-PLUGIN ▼` et `ADMIN-PLUGIN ▲` se suppriment tels
quels.

| Fichier | Action |
| ------- | ------ |
| `src/hooks.server.ts` | retirer l'import de `adminHandle` et la ligne de la séquence |
| `src/lib/components/cart/Cart.svelte` | retirer le bouton « Dashboard » |
| `src/routes/auth/+page.svelte` | idem |
| `src/lib/sitemap.config.ts` | retirer `/admin` des routes exclues |
| `prisma/seed.js` | ne plus créer le compte `ADMIN` de démonstration, ou le laisser `CLIENT` |

Point de vigilance : retirer le hook **sans** retirer les routes rouvre le
back-office à n'importe quel visiteur. Supprimer d'abord les routes, ou le
hook et les routes dans le même commit.

Les gardes d'authentification (`authHandle`) et le commerce
(`pendingOrderHandle`) restent en place.

## 3. Données et dépendances

Aucun paquet npm n'appartient uniquement à l'admin. Les DAO Prisma
(`src/lib/prisma/user`, `products`, `promo`, `blogPost`, `contact`,
`transaction`) sont partagés : ne les supprimer que si le commerce et le blog
partent aussi.

Le rôle `ADMIN` dans `prisma/schema.prisma` peut rester (inutile sans
back-office) ou être retiré dans une migration dédiée.

## 4. Vérifier

```bash
rg "ADMIN-PLUGIN"           # doit ne rien renvoyer
rg "/admin" src/            # plus de lien vers le back-office
npx svelte-check --threshold error
npm run test:e2e            # le parcours auth seul doit passer
```

Puis, manuellement : page d'accueil, connexion d'un compte `CLIENT`, et
confirmation qu'une visite de `/admin` n'existe plus (404).
