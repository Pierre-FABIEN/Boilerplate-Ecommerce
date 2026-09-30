# Codes promo

Remises sur le total TTC des produits (hors port) : CRUD admin, API de
validation, champ au checkout. Réservé en écriture au rôle `ADMIN` ; la
validation (`/api/promo/validate`) est ouverte aux visiteurs du tunnel.

Il est conçu pour être retirable d'un bloc. La procédure complète est dans
[retrait.md](./retrait.md) ; ce document décrit son fonctionnement.

## Frontière du module

| Emplacement                                         | Contenu                                              |
| --------------------------------------------------- | ---------------------------------------------------- |
| `src/lib/prisma/promo/`                             | DAO Prisma (`validatePromo`, CRUD, `incrementUsage`) |
| `src/lib/schema/promo/`                             | schémas Zod des formulaires admin                    |
| `src/routes/admin/promo/`                           | CRUD back-office (gardes = module admin)             |
| `src/routes/api/promo/validate/`                    | validation JSON pour le checkout                     |
| `src/lib/components/checkout/PromoCodeInput.svelte` | champ UI du tunnel                                   |

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
posté par le client n'est jamais crédité. `incrementUsage` est appelé dans
le webhook Stripe (`checkout.session.completed`), après confirmation du
paiement — pas à la création de la session, pour qu'un panier abandonné ou
un paiement refusé ne consomme jamais le compteur d'usage.

## Admin

`/admin/promo` : liste, création, édition, suppression. Accès couvert par
`adminHandle`. Désactiver un code (`active=false`) le retire du tunnel sans
l'effacer.

## Fidélité

Module activable depuis `/admin/settings` (`StoreSettings.loyaltyEnabled`,
voir [docs/admin](../admin/README.md#modules-e-commerce-optionnels---adminsettings)).
Plutôt qu'un système séparé, la fidélité est un champ optionnel de
`PromoCode` (`loyaltyThreshold`, renseigné depuis le formulaire
création/édition existant) : dès qu'un compte atteint ce nombre de commandes
`PAID`, le code lui est attribué automatiquement.

- Après chaque paiement (`handleCheckoutSession` dans
  `src/routes/api/webhooks/+server.ts`), si le module est actif, un job
  (`enqueueLoyaltyCheckJob`, même mécanique QStash/repli direct que les jobs
  facture/Sendcloud) compte les commandes payées du compte et parcourt les
  codes actifs dont `loyaltyThreshold` est atteint.
- `LoyaltyAward` (`userId`, `promoCodeId`, unique par paire) empêche un même
  compte de recevoir deux fois le même code — l'attribution est définitive
  même si le seuil est modifié ou dépassé ensuite.
- Un e-mail est envoyé au compte avec le code à la première attribution
  (`sendMail`). Il n'y a pas de page dédiée côté compte : le code fonctionne
  comme n'importe quel code promo au checkout.

Laisser `loyaltyThreshold` vide désactive la fidélité pour ce code
spécifique, indépendamment de l'interrupteur global.

## Parrainage

Module activable depuis `/admin/settings` (`StoreSettings.referralEnabled`,
voir [docs/admin](../admin/README.md#modules-e-commerce-optionnels---adminsettings)).
Contrairement à la fidélité, ce n'est pas un `PromoCode` mais un lien direct
sur `User` : `referralCode` (généré, unique, alphabet sans caractères
ambigus) et `referredById`, capturé à l'inscription via `?ref=<code>`
(`/auth/signup?ref=XXXXXXXX`) — voir `src/lib/prisma/referral/referral.ts`.
Le compte consulte et partage son propre code depuis
`/auth/settings/referral`.

- **Filleul** : remise automatique de 10 %
  (`REFERRAL_REFEREE_DISCOUNT_PERCENT`) sur sa première commande payée,
  appliquée au checkout (`src/routes/checkout/+page.server.ts`) — montant
  fixe, pas de configuration admin.
- **Parrain** : à la toute première commande payée du filleul (et une seule
  fois, `ReferralReward.referredId` unique), une carte cadeau de 10 €
  (`REFERRAL_REWARD_AMOUNT`, module Gift Cards réutilisé tel quel) est créée
  et envoyée par e-mail — job `runReferralRewardJob`
  (`src/lib/server/jobs/referral.ts`, même mécanique QStash/repli direct
  que la fidélité, appelé depuis le webhook Stripe). Carte cadeau et
  `ReferralReward` sont créées dans une même transaction (une écriture
  orpheline sans l'autre serait un vrai coût, pas juste un bug d'affichage).

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

| #   | Étape                            | Geste                         | Preuve              |
| --- | -------------------------------- | ----------------------------- | ------------------- |
| 1   | La liste admin affiche les codes | GET `/admin/promo`, recherche | ligne du tableau    |
| 2   | Édition de la valeur             | fiche → 15 → Enregistrer      | `value` en base     |
| 3   | Suppression                      | dialogue Continue             | code absent en base |

À part : un CLIENT POST `?/deletePromo` — le code reste.

### Validation — `e2e/promo/validate.spec.ts`

| #   | Étape                           | Geste                                     | Preuve                        |
| --- | ------------------------------- | ----------------------------------------- | ----------------------------- |
| 1   | Pourcentage accepté             | POST `/api/promo/validate` 10 % sur 100 € | `valid`, remise 10            |
| 2   | Code inconnu / inactif / expiré | POST                                      | `valid: false`                |
| 3   | Montant min. et limite d'usage  | POST sous le seuil / quota plein          | `valid: false`                |
| 4   | Checkout : code appliqué        | UI « Appliquer »                          | toast + remise affichée       |
| 5   | Checkout : code refusé          | code inconnu                              | toast d'erreur, pas de remise |

### Fidélité — `e2e/promo/loyalty.spec.ts`

Pas de système séparé : un `PromoCode` actif avec `loyaltyThreshold` est
comparé au nombre de commandes payées du compte après chaque webhook signé
(`src/lib/server/jobs/loyalty.ts`, fallback synchrone sans QStash configuré
en e2e).

| #   | Étape                                              | Geste            | Preuve                                   |
| --- | -------------------------------------------------- | ---------------- | ---------------------------------------- |
| 1   | Module désactivé : aucune récompense même au seuil | webhook signé    | `LoyaltyAward` absent                    |
| 2   | Première commande payée : pas encore de récompense | webhook signé    | `LoyaltyAward` absent                    |
| 3   | Seuil atteint : récompense créée et e-mail envoyé  | 2e webhook signé | `LoyaltyAward` créé, e-mail avec le code |
| 4   | Une commande de plus ne double pas la récompense   | 3e webhook signé | même `orderCountAtAward`                 |

### Parrainage — `e2e/promo/referral.spec.ts`

Signe le webhook Stripe comme `loyalty.spec.ts` (fallback synchrone sans
QStash en e2e).

| #   | Étape                                             | Geste                            | Preuve                                            |
| --- | ------------------------------------------------- | -------------------------------- | ------------------------------------------------- |
| 1   | Module désactivé : ni lien capturé ni récompense  | `?ref=<code>` puis webhook signé | `referredById` non posé, `ReferralReward` absent  |
| 2   | Filleul remisé, parrain récompensé une seule fois | webhook signé, puis 2e commande  | remise 10 % appliquée, une seule `ReferralReward` |

```bash
npm run test:e2e
```
