# Retirer le module codes promo

Procédure à suivre dans l'ordre. Compter moins d'une heure.

## À lire d'abord

Supprimer `/admin/promo` enlève l'interface, pas les lignes en base. Deux
trajectoires :

| Trajectoire | Ce que devient le promo | Effort |
| ----------- | ----------------------- | ------ |
| Autre moteur de remise | les champs `Order.promoCode` restent | modéré |
| Tout retirer | supprimer `PromoCode`, le champ checkout, l'API | faible |

Les étapes 1 et 2 sont communes.

## 1. Supprimer les fichiers du module

```bash
rm -rf src/lib/prisma/promo src/lib/schema/promo
rm -rf src/routes/admin/promo src/routes/api/promo
rm -f src/lib/components/checkout/PromoCodeInput.svelte
rm -rf e2e/promo docs/promo
```

## 2. Traiter les points de couplage

```bash
rg "PROMO-PLUGIN" src/ prisma/
```

Les blocs encadrés par `PROMO-PLUGIN ▼` et `PROMO-PLUGIN ▲` se suppriment
tels quels.

| Fichier | Action |
| ------- | ------ |
| `src/routes/admin/+layout.svelte` | retirer l'entrée « promo » |
| `src/routes/checkout/+page.svelte` | retirer `<PromoCodeInput />` et l'état promo |
| `src/routes/checkout/+page.server.ts` | ne plus appeler `validatePromo` / `incrementUsage` |
| `src/lib/commerce/checkout.ts` | retirer la mention promo du commentaire |
| `prisma/seed.js` | ne plus créer ni vider `promoCode` |
| `prisma/schema.prisma` | retirer `PromoCode` et `PromoType` dans une migration |

`Order.promoCode` et `Order.discountAmount` peuvent rester à 0 / null : ce
sont des colonnes commerce.

## 3. Vérifier

```bash
rg "PROMO-PLUGIN"      # doit ne rien renvoyer
rg "promo" src/routes/admin src/routes/api src/lib/prisma/promo
npx svelte-check --threshold error
npm run test:e2e      # auth + admin + products + commerce + blog doivent encore passer
```
