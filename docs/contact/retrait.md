# Retirer le module contact

Procédure à suivre dans l'ordre. Compter moins d'une heure.

## À lire d'abord

Supprimer `/contact` et `/admin/contacts` enlève l'interface, pas les lignes
en base.

| Trajectoire | Ce que deviennent les messages | Effort |
| ----------- | ------------------------------ | ------ |
| Autre formulaire / CRM | les modèles Prisma restent ou sont remplacés | modéré |
| Tout retirer | supprimer `ContactSubmission` | faible |

Les étapes 1 et 2 sont communes.

## 1. Supprimer les fichiers du module

```bash
rm -rf src/lib/contact src/routes/contact src/routes/admin/contacts
rm -rf src/lib/prisma/contact src/lib/schema/contact
rm -rf e2e/contact docs/contact
```

`contactFormLimiter` et `getClientIP` dans `src/lib/server/rate-limiter.ts`
peuvent rester si un autre formulaire les réutilise ; sinon retirer le fichier
s'il n'a plus d'import.

## 2. Traiter les points de couplage

```bash
rg "CONTACT-PLUGIN" src/ prisma/
```

Les blocs encadrés par `CONTACT-PLUGIN ▼` et `CONTACT-PLUGIN ▲` se suppriment
tels quels.

| Fichier | Action |
| ------- | ------ |
| `src/lib/components/Navigation.svelte` | retirer le lien Contact / `/contact` |
| `src/routes/admin/+layout.svelte` | retirer l'entrée « contacts » |
| `src/lib/sitemap.config.ts` | retirer `/contact` |
| `src/lib/seo.config.ts` | retirer `pages.contact` |
| `prisma/seed.js` | ne plus vider `contactSubmission` |
| `prisma/schema.prisma` | retirer `ContactSubmission` dans une migration |

## 3. Vérifier

```bash
rg "CONTACT-PLUGIN"      # doit ne rien renvoyer
rg "/contact" src/       # plus de lien vers le formulaire
npx svelte-check --threshold error
npm run test:e2e      # auth + admin + products + commerce + blog + promo doivent encore passer
```
