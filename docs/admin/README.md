# Administration

Back-office du projet : tableau de bord, comptes, produits, blog, codes promo,
ventes et messages de contact. Réservé au rôle `ADMIN`.

Il est conçu pour être retirable d'un bloc. La procédure complète est dans
[retrait.md](./retrait.md) ; ce document décrit son fonctionnement.

## Frontière du module

| Emplacement | Contenu |
| ----------- | ------- |
| `src/lib/admin/` | gardes (`assertAdmin`, `requireAdmin`) et hook `adminHandle` |
| `src/routes/admin/` | pages du back-office |

Le module s'accroche au reste du projet en **un seul point** : le hook
`adminHandle` (`src/lib/admin/hooks.ts`), branché dans `src/hooks.server.ts`
**après** `authHandle` (il lit `locals.user` et `locals.role`).

Partout ailleurs, une dépendance à l'administration est signalée par un
marqueur `ADMIN-PLUGIN`. La liste exhaustive s'obtient ainsi :

```bash
rg "ADMIN-PLUGIN" src/ prisma/
```

L'admin n'est **pas** un îlot autonome : c'est le CRUD de `User`, `Product`,
`PromoCode`, `BlogPost`, `ContactSubmission`, `Transaction`. Retirer les routes
ne supprime pas ces modèles ; il faut alors un autre outil pour les gérer
(Prisma Studio, CMS, autre back-office).

## Gardes d'accès

Trois couches, volontairement redondantes.

| Couche | Où | Comportement |
| ------ | -- | ------------ |
| Hook | `adminHandle` | GET **et** POST sous `/admin` : anonyme → `/auth/login`, CLIENT → `/` |
| Layout | `src/routes/admin/+layout.server.ts` | même règle, plus une projection sûre de l'admin connecté |
| Actions | `requireAdmin(locals)` en tête de chaque action | 403 si le rôle n'est pas `ADMIN` |

SvelteKit n'exécute pas le `load` du layout avant une action : sans
`requireAdmin`, un POST `?/deleteUser` passerait même si chaque page vérifiait
le rôle au chargement. Le hook couvre déjà ce cas ; le helper reste pour le
jour où le hook serait retiré.

Toute nouvelle page sous `/admin` est protège par le hook et le layout. Toute
nouvelle **action** doit appeler `requireAdmin(locals)` en première ligne.

## Attribution du rôle

L'enum Prisma `Role` n'a que deux valeurs : `ADMIN` et `CLIENT` (défaut).

| Mécanisme | Effet |
| --------- | ----- |
| Inscription / Google | toujours `CLIENT` |
| Seed | un compte `ADMIN` de démonstration (`prisma/seed.js`) |
| Fiche `/admin/users/[id]` | promotion ou rétrogradation, valeurs d'enum uniquement |

Il n'existe pas de page de création de compte dans l'admin : les comptes
naissent par inscription.

## Sections

| Route | Rôle |
| ----- | ---- |
| `/admin` | tableau de bord (ventes récentes, dernières inscriptions) |
| `/admin/sales` | transactions, factures, bordereaux |
| `/admin/users` | liste et suppression ; fiche `[id]` pour rôle, 2FA, mot de passe, adresses |
| `/admin/products` | catalogue et catégories |
| `/admin/blog` | articles, catégories, tags |
| `/admin/promo` | codes promo |
| `/admin/contacts` | messages du formulaire de contact |

Les listes d'utilisateurs n'exposent jamais `passwordHash`, `totpKey` ni
`recoveryCode`.

## Ce qui n'est pas l'admin

L'authentification (`/auth`, sessions, 2FA) et le tunnel de commande
(`/checkout`) sont des modules distincts. Le catalogue public (`/products`)
est documenté à part : [docs/products](../products/README.md). Un administrateur
qui n'a pas validé sa 2FA est d'abord renvoyé vers `/auth/2fa` par `authHandle`,
avant même d'atteindre `/admin`.

## Tests

- `e2e/admin/security.spec.ts` : anonyme et CLIENT refusés partout (GET et POST)
- `e2e/admin/users.spec.ts` : CRUD des comptes, absence de fuites dans le HTML
- `e2e/products/admin.spec.ts` : CRUD catalogue (voir [docs/products](../products/README.md))

Le CRUD blog / promo / ventes / contacts n'est pas encore couvert ; voir
`e2e/README.md`.

```bash
npm run test:e2e
```

## Étendre le module

**Ajouter une page.** La placer sous `src/routes/admin/`. Le hook et le layout
s'en chargent. Si elle a une action, appeler `requireAdmin(locals)` en premier.

**Ajouter un lien d'entrée.** Marquer `ADMIN-PLUGIN` (panier, page compte, etc.)
et ne l'afficher que si `role === 'ADMIN'`.
