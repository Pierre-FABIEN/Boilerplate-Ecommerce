# Codes promo

Remises sur le total TTC des produits (hors port) : CRUD admin, API de
validation, champ au checkout. Réservé en écriture au rôle `ADMIN` ; la
validation (`/api/promo/validate`) est ouverte aux visiteurs du tunnel.

Il est conçu pour être retirable d'un bloc. La procédure complète est dans
[retrait.md](./retrait.md) ; ce document décrit son fonctionnement.

## Frontière du module

| Emplacement | Contenu |
| ----------- | ------- |
| `src/lib/prisma/promo/` | DAO Prisma (`validatePromo`, CRUD, `incrementUsage`) |
| `src/lib/schema/promo/` | schémas Zod des formulaires admin |
| `src/routes/admin/promo/` | CRUD back-office (gardes = module admin) |
| `src/routes/api/promo/validate/` | validation JSON pour le checkout |
| `src/lib/components/checkout/PromoCodeInput.svelte` | champ UI du tunnel |

Contrairement à l'auth, le promo **n'a pas de hook** dans `hooks.server.ts` :
les mutations passent par `requireAdmin`, la validation est une API publique.
Le point d'accroche, ce sont les routes `/admin/promo` et l'appel
`validatePromo` au checkout.

Partout ailleurs, une dépendance au promo est signalée par un marqueur
`PROMO-PLUGIN`. La liste exhaustive s'obtient ainsi :

```bash
rg "PROMO-PLUGIN" src/ prisma/
```

## Contrat

`validatePromo(code, productTotalTTC)` est la source de vérité. Un code est
refusé s'il est inconnu, inactif, expiré, épuisé (`usageCount >= usageLimit`)
ou si le total TTC produits est sous `minAmount`. La remise `PERCENTAGE` est
un pourcentage du total ; `FIXED` est plafonnée à ce total. Les frais de port
ne sont pas remisés.

Le checkout relit le code côté serveur (`?/checkout`) : un `discountAmount`
posté par le client n'est jamais crédité. `incrementUsage` est appelé après
la création de la session Stripe, donc **pas** pendant le paiement simulé
Prisma des e2e commerce.

## Admin

`/admin/promo` : liste, création, édition, suppression. Accès couvert par
`adminHandle`. Désactiver un code (`active=false`) le retire du tunnel sans
l'effacer.

## Ce qui n'est pas le promo

L'authentification, le back-office dans son ensemble, le panier et Stripe.
`Order.promoCode` / `Order.discountAmount` appartiennent au commerce : ce
module les renseigne, il ne les possède pas.

## Tests

Les numéros sont ceux des `test.step`. Changer la procédure ici, puis le spec,
puis le code. Index : [../../e2e/README.md](../../e2e/README.md).

Le paiement Stripe n'est **pas** appelé : la remise au checkout est prouvée
par l'API et l'UI, pas par `incrementUsage`.

### Admin — `e2e/promo/admin.spec.ts`

La création passe par Prisma (les champs numériques du formulaire Superforms
sont fragiles en e2e). L'édition de la valeur et la suppression passent par
l'UI.

| # | Étape | Geste | Preuve |
| - | ----- | ----- | ------ |
| 1 | La liste admin affiche les codes | GET `/admin/promo`, recherche | ligne du tableau |
| 2 | Édition de la valeur | fiche → 15 → Enregistrer | `value` en base |
| 3 | Suppression | dialogue Continue | code absent en base |

À part : un CLIENT POST `?/deletePromo` — le code reste.

### Validation — `e2e/promo/validate.spec.ts`

| # | Étape | Geste | Preuve |
| - | ----- | ----- | ------ |
| 1 | Pourcentage accepté | POST `/api/promo/validate` 10 % sur 100 € | `valid`, remise 10 |
| 2 | Code inconnu / inactif / expiré | POST | `valid: false` |
| 3 | Montant min. et limite d'usage | POST sous le seuil / quota plein | `valid: false` |
| 4 | Checkout : code appliqué | UI « Appliquer » | toast + remise affichée |
| 5 | Checkout : code refusé | code inconnu | toast d'erreur, pas de remise |

```bash
npm run test:e2e
```
