# Retirer le module d'authentification

Procédure complète, à suivre dans l'ordre. Compter une heure, l'essentiel du
travail étant de décider ce qui remplace l'identité dans le tunnel de commande.

## À lire d'abord

Le module se retire d'un bloc, mais **le commerce, lui, dépend du compte
utilisateur** : une commande, une adresse et une transaction pointent vers `User`.
Trois trajectoires sont possibles, et le choix conditionne tout le reste.

| Trajectoire                          | Ce que devient `User`                                              | Effort   |
| ------------------------------------ | ------------------------------------------------------------------ | -------- |
| Remplacer par une autre solution d'identité (Auth.js, Clerk, Supabase) | conservé, seuls les champs d'identification changent | modéré |
| Passer en commande anonyme           | conservé comme simple fiche client, sans identifiants              | important |
| Retirer aussi le commerce            | supprimé avec `Address`, `Order`, `Transaction`                    | faible   |

Les étapes 1 à 3 sont communes. L'étape 4 traite le cas du commerce conservé.

## 1. Supprimer les fichiers du module

```bash
rm -rf src/lib/lucia \
       src/lib/schema/auth \
       src/lib/schema/users/MfaEnabledSchema.ts \
       src/lib/prisma/session \
       src/lib/prisma/emailVerificationRequest \
       src/lib/prisma/passwordResetSession \
       src/lib/prisma/email \
       e2e
```

Puis les routes, **en préservant les deux sections de commerce qu'elles
hébergent** :

```bash
# à conserver : carnet d'adresses et factures du client
mkdir -p src/routes/compte
mv src/routes/auth/settings/address   src/routes/compte/adresses
mv src/routes/auth/settings/factures  src/routes/compte/factures

rm -rf src/routes/auth
```

Ces deux sections gardent une dépendance à l'identité (`locals.user.id` pour
filtrer les adresses et les transactions) : elles devront lire l'identifiant du
client depuis le mécanisme retenu à l'étape 4.

## 2. Traiter les points de couplage

Chaque dépendance à l'authentification hors du module est signalée dans le code :

```bash
rg "AUTH-PLUGIN" src/ prisma/
```

Les blocs encadrés par `AUTH-PLUGIN ▼` et `AUTH-PLUGIN ▲` se suppriment tels
quels ; les marqueurs isolés demandent une décision. Inventaire :

| Fichier                                        | Action                                                                       |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| `src/hooks.server.ts`                          | retirer l'import de `authHandle` et les deux lignes de la séquence ; adapter ou supprimer `pendingOrderHandle` |
| `src/app.d.ts`                                 | retirer `session`, `user`, `role`, `isMfaEnabled`, `registered2FA` de `Locals` |
| `src/routes/+layout.server.ts`                 | retirer la projection `user`                                                 |
| `src/routes/+layout.svelte`                    | retirer l'hydratation du panier serveur                                      |
| `src/lib/components/Navigation.svelte`         | retirer le bouton « Se connecter »                                           |
| `src/lib/components/cart/Cart.svelte`          | retirer le bloc compte, ne garder que « Checkout »                           |
| `src/lib/components/checkout/AddressSelector.svelte` | remplacer le lien vers l'espace compte par un formulaire d'adresse dans le tunnel |
| `src/lib/components/Facture/Facture.svelte`    | rediriger vers une page de suivi de commande publique                        |
| `src/routes/checkout/+page.server.ts`          | remplacer la garde `locals.user` (voir étape 4)                              |
| `src/routes/admin/+page.server.ts`             | remplacer la garde d'accès **avant** de la supprimer                         |
| `src/routes/admin/users/+page.server.ts`       | idem                                                                         |
| `src/routes/admin/users/[id]/+page.server.ts`  | idem                                                                         |
| `src/routes/admin/blog/post/create/+page.svelte` | choisir l'auteur dans une liste au lieu du compte connecté                  |
| `src/lib/prisma/user/user.ts`                  | supprimer les fonctions d'identification (mot de passe, TOTP, code de secours, OAuth, vérification d'email) et l'import de chiffrement |
| `src/lib/prisma/user/updateUserSecurity.ts`    | supprimer, ou remplacer le hachage Argon2                                    |
| `src/lib/sitemap.config.ts`                    | retirer `/auth` des routes exclues                                           |
| `prisma/schema.prisma`                         | voir étape 3                                                                 |

Point de vigilance : les gardes d'administration ne sont pas décoratives. Les
supprimer sans les remplacer ouvre `/admin/**` — donc la liste des clients, les
transactions et la modification des comptes — à n'importe quel visiteur. Prévoir
un mécanisme d'accès (réseau privé, proxy authentifié, sous-domaine protégé)
**avant** de retirer ces contrôles.

`src/lib/server/rate-limit.ts` et `src/lib/server/rate-limiter.ts` ne relèvent pas
de l'authentification : ils servent le hook global et le formulaire de contact, et
restent en place.

## 3. Base de données

Dans `prisma/schema.prisma`, supprimer les trois modèles exclusivement liés à
l'authentification, ainsi que les relations correspondantes dans `User` :

- `Session`
- `EmailVerificationRequest`
- `PasswordResetSession`

Puis les champs d'identification de `User`, selon la trajectoire retenue :
`passwordHash`, `recoveryCode`, `emailVerified`, `isMfaEnabled`, `totpKey`,
`googleId`. `email`, `username`, `name`, `picture` et `role` peuvent rester si la
fiche client est conservée.

```bash
npx prisma migrate dev --name retrait_authentification
npx prisma generate
```

Vérifier `prisma/seed.js` : il crée un administrateur avec mot de passe haché,
clé TOTP et code de secours chiffrés. Ces champs disparaissent avec la migration
et son `truncate()` référence les trois tables supprimées.

Si la trajectoire est « autre solution d'identité », créer la migration **après**
avoir ajouté les tables de la nouvelle solution, pour n'avoir qu'une seule
migration cohérente.

## 4. Identité de remplacement dans le commerce

Cinq endroits ont besoin de savoir « qui commande » :

| Emplacement                              | Besoin                                          |
| ---------------------------------------- | ----------------------------------------------- |
| `src/hooks.server.ts` (`pendingOrderHandle`) | rattacher un panier serveur                 |
| `src/routes/checkout/+page.server.ts`    | créer la commande et lister les adresses        |
| `src/routes/api/webhooks/+server.ts`     | relier le paiement Stripe à la commande         |
| `src/lib/prisma/addresses/addresses.ts`  | filtrer les adresses par client                 |
| `src/lib/prisma/transaction/getTransactionsByUserId.ts` | filtrer les factures par client   |

Deux réponses possibles :

- **commande anonyme** : générer un identifiant de visiteur, le stocker dans un
  cookie signé, l'utiliser partout à la place de `locals.user.id`, et créer la
  fiche client à la validation du paiement à partir de l'email saisi. Les
  webhooks continuent de fonctionner sans changement, la commande portant déjà
  son propre identifiant ;
- **autre solution d'identité** : exposer l'identifiant client dans
  `event.locals` sous le même nom, et les cinq emplacements ci-dessus n'ont alors
  rien à changer.

## 5. Configuration et dépendances

Variables d'environnement devenues inutiles (`.env`, `.env.example`, secrets
d'hébergement) : `ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`VITE_GOOGLE_REDIRECT_URI`, et les `SMTP_*` si aucun autre email n'est envoyé.

Paquets npm utilisés uniquement par le module :

```bash
npm remove lucia @lucia-auth/adapter-prisma @node-rs/argon2 @oslojs/crypto \
           @oslojs/otp arctic @pilcrowjs/object-parser uqr nanoid nodemailer
```

Attention avant de désinstaller :

- `@oslojs/encoding` sert aussi au seed : le conserver ;
- `nanoid` et `nodemailer` sont fréquemment réutilisés ailleurs — vérifier d'abord
  avec `rg "from 'nanoid'"` ;
- `argon2` et `input-otp` figurent dans `package.json` sans être importés : ils
  peuvent partir dans tous les cas.

Retirer enfin les scripts `test:e2e*` de `package.json`, `playwright.config.ts`,
`.env.test`, `.env.test.example` et `scripts/collect-videos.mjs`, la suite
end-to-end ne couvrant que l'authentification.

## 6. Vérifier

```bash
rg "AUTH-PLUGIN"           # doit ne rien renvoyer
rg "lucia|/auth/" src/     # aucune référence résiduelle
npx svelte-check --threshold error
npm run build
```

Puis, manuellement : page d'accueil, ajout au panier, tunnel de commande complet
avec paiement de test, réception du webhook, et accès à `/admin` — qui doit être
refusé si le mécanisme d'accès de remplacement est en place.
