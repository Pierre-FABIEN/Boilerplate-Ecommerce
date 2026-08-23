# Commerce (panier, checkout, ventes)

Tunnel de commande : panier serveur (`Order` PENDING), checkout, webhook Stripe
(`Transaction`, commande `PAID`), surface admin `/admin/sales`. Réservé en
écriture au visiteur connecté ; `/admin/sales` au rôle `ADMIN`.

Il est conçu pour être retirable d'un bloc. La procédure complète est dans
[retrait.md](./retrait.md) ; ce document décrit son fonctionnement.

## Frontière du module

| Emplacement | Contenu |
| ----------- | ------- |
| `src/lib/commerce/` | gardes panier / checkout, chemins, panier invité (`guestCart.ts`) |
| `src/lib/prisma/order/` et `src/lib/prisma/transaction/` | DAO Prisma |
| `src/lib/store/Data/cartStore.ts` + `cartSync.ts` | panier client |
| `src/routes/api/save-cart/` | persistance panier |
| `src/routes/checkout/` | tunnel + succès |
| `src/routes/api/webhooks/` | Stripe `checkout.session.completed` |
| `src/routes/admin/sales/` | liste, facture, bordereau (double marqueur ADMIN) |

Le point d'accroche est le hook `pendingOrderHandle` dans `src/hooks.server.ts`
(après `authHandle` / `adminHandle`). Sans lui, plus de commande PENDING par
visiteur connecté.

Sans compte, le panier est uniquement dans le navigateur (`localStorage`, clé
`commerce:guest-cart`, voir `src/lib/commerce/guestCart.ts`). À l'inscription ou
à la connexion, les lignes sont fusionnées dans l'`Order` du compte. Le checkout
reste derrière login.

Partout ailleurs, une dépendance au tunnel est signalée par `COMMERCE-PLUGIN` :

```bash
rg "COMMERCE-PLUGIN" src/ prisma/
```

## Ce qui n'est pas le commerce

| Module | Marqueur | Pourquoi |
| ------ | -------- | -------- |
| Catalogue | `PRODUCT-PLUGIN` | fournit `Product` et le prix à revalider |
| Blog | `BLOG-PLUGIN` | articles Prisma, hors tunnel |
| Auth | `AUTH-PLUGIN` | `locals.user`, adresses, factures compte |
| Admin | `ADMIN-PLUGIN` | gardes de `/admin/sales` |
| Promo | `PROMO-PLUGIN` | champ checkout ; tests dans [docs/promo](../promo/README.md) |
| Sendcloud | `SENDCLOUD` | options / points relais / étiquettes |

Les projets sur-mesure (`Custom`, `no_shipping`) restent de la dette atelier.

## Contrat serveur

- `/api/save-cart` : authentifié, `order.userId` = visiteur, statut `PENDING`.
- Prix des lignes = `Product.price`, jamais le JSON client ni le panier invité.
- Invité : `localStorage` seulement ; fusion au compte à signup / login
  (même `productId` → quantités additionnées, plafonnées au stock).
- `?/checkout` : même propriétaire ; un `shippingCost` Sendcloud entre 0 et
  200 € est accepté pour créer la session Stripe.
- Webhook : crée la `Transaction` et passe l'`Order` en `PAID`. Un nouveau
  panier PENDING peut naître ensuite (c'est voulu).

## Tests

Les numéros sont ceux des `test.step`. Changer la procédure ici, puis le spec,
puis le code. Index : [../../e2e/README.md](../../e2e/README.md).

Stripe n'est **pas** appelé pour créer une session Checkout : le paiement
simulé en Prisma (`simulatePaidOrder`) reste pour le spec checkout. Le webhook
e2e est couvert à part : corps signé localement (`generateTestHeaderString`),
sans carte ni API Stripe.

En **dev** (`npm run dev`), `stripe listen` relaie les événements Stripe vers
`http://localhost:2000/api/webhooks`. Copier le `whsec_…` affiché par le CLI
dans `STRIPE_WEBHOOK_SECRET` du `.env`, puis relancer Vite. Une fois :
`stripe login`. Hors `npm run dev` : `npm run stripe:listen`.

### Panier — `e2e/commerce/cart.spec.ts`

| # | Étape | Geste | Preuve |
| - | ----- | ----- | ------ |
| 1 | Fiche : ajouter au panier | bouton « Ajouter au panier » | UI panier + `OrderItem` en base |
| 2 | `/api/save-cart` d'une autre commande | POST id d'un autre user | 403, ligne inchangée |
| 3 | Prix posté ≠ catalogue | POST `price: 0.01` | persisté = `Product.price` |

### Panier invité — `e2e/commerce/guest.spec.ts`

| # | Étape | Geste | Preuve |
| - | ----- | ----- | ------ |
| 1 | Anonyme : ajouter puis recharger | bouton puis reload | item encore visible |
| 2 | Anonyme puis inscription | signup après add | `OrderItem` en base, localStorage vide |
| 3 | Compte + invité (autre produit) | login après add invité | les deux lignes en base |

### Checkout — `e2e/commerce/checkout.spec.ts`

| # | Étape | Geste | Preuve |
| - | ----- | ----- | ------ |
| 1 | Anonyme GET `/checkout` | navigation | `/auth/login` |
| 2 | CLIENT avec panier | `/checkout` | sélecteur d'adresse |
| 3 | POST sans adresse / sans être proprio | `?/checkout` | 400 / 403 |
| 4 | Paiement simulé | helper Prisma | l'order payée n'est plus `PENDING` |

### Webhook Stripe — `e2e/commerce/stripe.spec.ts`

| # | Étape | Geste | Preuve |
| - | ----- | ----- | ------ |
| 1 | Signature invalide | POST `/api/webhooks` HMAC faux | 400, pas de `Transaction` |
| 2 | `checkout.session.completed` | POST signé (`STRIPE_WEBHOOK_SECRET` e2e) | `Order` `PAID`, `Transaction` |
| 3 | Facture compte | GET `/auth/settings/factures/[id]` | HTML contient l'id transaction |
| 4 | Facture admin | GET `/admin/sales/facture/[id]` | HTML contient l'id |
| 5 | Bordereau admin | GET `/admin/sales/bordereau/[id]` | HTML contient l'id |

Pas de paiement carte. Sendcloud n'est pas appelé (`PUBLIC_ENV=test`).
`incrementUsage` n'est pas joué : il suit `stripe.checkout.sessions.create`.

### Ventes — `e2e/commerce/sales.spec.ts`

| # | Étape | Geste | Preuve |
| - | ----- | ----- | ------ |
| 1 | ADMIN voit la transaction | `/admin/sales`, recherche | cellule email |
| 2 | CLIENT GET `/admin/sales` | navigation | `/` |
| 3 | Facture user : uniquement la sienne | GET facture d'un autre | 404 |

```bash
npm run test:e2e
```
