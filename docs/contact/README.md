# Contact

Formulaire public `/contact` et lecture admin des messages Prisma
(`ContactSubmission`). Ouvert en écriture à tout visiteur ; `/admin/contacts`
est réservé au rôle `ADMIN`.

Il est conçu pour être retirable d'un bloc. La procédure complète est dans
[retrait.md](./retrait.md) ; ce document décrit son fonctionnement.

## Frontière du module

| Emplacement | Contenu |
| ----------- | ------- |
| `src/lib/contact/` | chemins de tests |
| `src/lib/prisma/contact/` | DAO Prisma |
| `src/lib/schema/contact/` | schéma Zod du formulaire |
| `src/routes/contact/` | page publique |
| `src/routes/admin/contacts/` | liste et fiche (gardes = module admin) |
| `src/lib/server/rate-limit.ts` | `contactFormLimiter` (5 envois valides / IP, 1 jeton / 60 s ; Redis si configuré, sinon mémoire) |

Contrairement à l'auth, le contact **n'a pas de hook** dans `hooks.server.ts`.
Le point d'accroche, ce sont `/contact` et la section admin.

Partout ailleurs, une dépendance au contact est signalée par un marqueur
`CONTACT-PLUGIN`. La liste exhaustive s'obtient ainsi :

```bash
rg "CONTACT-PLUGIN" src/ prisma/
```

Aucun email n'est envoyé à la soumission : la preuve est la ligne en base.

## Vitrine

| Route | Rôle |
| ----- | ---- |
| `/contact` | formulaire nom, email, sujet, message |

Les saisies invalides sont refusées (Zod). Un envoi accepté crée un
`ContactSubmission`. Cinq envois valides d'affilée par IP, puis 429 jusqu'à
ce qu'un jeton se recharge (60 s).

## Admin

`/admin/contacts` : liste. `/admin/contacts/view/[id]` : fiche. Accès couvert
par `adminHandle`. Pas de suppression UI : un administrateur répond par
`mailto:`.

## Ce qui n'est pas le contact

L'authentification, le back-office dans son ensemble, le blog, le commerce.

## Tests

Les numéros sont ceux des `test.step`. Changer la procédure ici, puis le spec,
puis le code. Index : [../../e2e/README.md](../../e2e/README.md).

### Formulaire — `e2e/contact/form.spec.ts`

| # | Étape | Geste | Preuve |
| - | ----- | ----- | ------ |
| 1 | Envoi valide | remplir + Envoyer | toast + ligne en base |
| 2 | Email invalide (serveur) | POST `?/send` | pas de ligne (400 ou `fail` Superforms) |
| 3 | Limiteur | 6 POST valides même IP | 5 lignes, 6ᵉ = 429 |

### Admin — `e2e/contact/admin.spec.ts`

Les messages sont posés en Prisma (`createContactMessage`).

| # | Étape | Geste | Preuve |
| - | ----- | ----- | ------ |
| 1 | Liste admin | GET `/admin/contacts`, recherche | ligne du tableau |
| 2 | Fiche | GET `/admin/contacts/view/[id]` | nom, sujet, message |

À part : un CLIENT GET `/admin/contacts` → `/`.

```bash
npm run test:e2e
```
