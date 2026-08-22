# Authentification

Module d'identité du projet : comptes locaux (email + mot de passe), connexion
Google, vérification d'adresse, double authentification TOTP avec code de secours,
réinitialisation de mot de passe, sessions en base.

Il est conçu pour être retirable d'un bloc. La procédure complète est dans
[retrait.md](./retrait.md) ; ce document décrit son fonctionnement.

## Frontière du module

Tout le code d'authentification vit dans quatre emplacements :

| Emplacement                                | Contenu                                                            |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `src/lib/lucia/`                           | logique : sessions, mots de passe, 2FA, emails, chiffrement, OAuth |
| `src/routes/auth/`                         | pages et endpoints du parcours                                     |
| `src/lib/schema/auth/`                     | schémas Zod des formulaires                                        |
| `src/lib/prisma/{session,emailVerificationRequest,passwordResetSession,email}/` | accès aux tables d'authentification |

Le module s'accroche au reste du projet en **un seul point** : le hook
`authHandle` (`src/lib/lucia/hooks.ts`), branché dans `src/hooks.server.ts`.

Partout ailleurs, une dépendance à l'authentification est signalée par un
marqueur `AUTH-PLUGIN` en commentaire. La liste exhaustive s'obtient ainsi :

```bash
rg "AUTH-PLUGIN" src/ prisma/
```

Deux règles maintiennent cette frontière :

1. aucun fichier hors du module n'importe `$lib/lucia` sans marqueur ;
2. l'identité ne circule que par `event.locals` (typé dans `src/app.d.ts`), jamais
   par un import direct du module depuis une page.

## Modèle de données

Quatre tables, décrites dans `prisma/schema.prisma`.

| Table                          | Rôle                                                                    | Durée de vie             |
| ------------------------------ | ----------------------------------------------------------------------- | ------------------------ |
| `users`                        | identifiants, email vérifié, secrets 2FA, identifiant Google, rôle      | permanente               |
| `sessions`                     | sessions ouvertes, avec le drapeau 2FA validée                          | 30 jours, glissante      |
| `email_verification_requests`  | code à 8 caractères pour valider une adresse                            | 10 minutes               |
| `password_reset_sessions`      | progression d'une réinitialisation (code, 2FA, mot de passe)            | 10 minutes               |

`users` est partagé avec le commerce : `Address`, `Order` et `Transaction` s'y
rattachent. Les trois autres tables appartiennent exclusivement au module et
disparaissent avec lui (`onDelete: Cascade` depuis `users`).

Deux champs sont chiffrés en base, pas hachés, car le serveur doit pouvoir les
relire pour valider un code : `totpKey` et `recoveryCode`.

## Parcours

### Inscription et vérification d'adresse

L'inscription crée le compte, ouvre une session et envoie un code à 8 caractères
par email. Le compte existe alors avec `emailVerified = false`, ce qui ne donne
accès à rien d'autre qu'à la page de vérification.

```
/auth/signup → /auth/verify-email → /auth
```

L'identifiant de la demande est déposé dans un cookie dédié : la page de saisie
retrouve ainsi la demande en cours sans exposer d'identifiant dans l'URL. Un
renvoi de code supprime la demande précédente, donc invalide l'ancien code.

### Connexion

```
/auth/login → /                      (compte sans 2FA)
/auth/login → /auth/2fa → /auth      (2FA exigée)
/auth/login → /auth/verify-email     (adresse non vérifiée)
```

Deux protections se cumulent : un quota par adresse IP et un délai croissant par
compte après chaque échec (jusqu'à cinq minutes d'attente). Un compte créé via
Google n'a pas de mot de passe local ; toute tentative de connexion classique est
refusée comme un mot de passe invalide, sans révéler la nature du compte.

### Connexion Google

```
/auth/login/google → Google → /auth/login/google/callback → /
```

L'état et le vérificateur PKCE transitent par des cookies éphémères. Au retour,
le compte est retrouvé par `googleId`, ou créé avec l'adresse déjà considérée
comme vérifiée puisque validée par Google.

### Double authentification

La 2FA se déroule en deux temps, volontairement distincts :

- **exigée** (`users.isMfaEnabled`) : demandé depuis les paramètres du compte ;
- **configurée** (`users.totpKey`) : une clé TOTP existe.

Tant que la 2FA est exigée sans être configurée, `authHandle` confine la
navigation à `/auth/2fa/setup`. Une fois configurée, chaque nouvelle session doit
la valider (`sessions.twoFactorVerified`) avant d'accéder au reste du site.

```
paramètres → /auth/2fa/setup → /auth/recovery-code
connexion  → /auth/2fa → /auth
téléphone perdu → /auth/2fa/reset → /auth/2fa/setup
```

Le code de secours (16 caractères) est délivré une seule fois, à la configuration.
L'utiliser retire la 2FA, invalide toutes les sessions du compte et délivre un
nouveau code — en une transaction, pour qu'un même code ne serve jamais deux fois.

### Mot de passe oublié

Trois étapes obligatoires, dont la progression est enregistrée dans la session de
réinitialisation, ce qui interdit d'accéder directement à la dernière page :

```
/auth/forgot-password
  → /auth/reset-password/verify-email     (code reçu par email)
  → /auth/reset-password/2fa              (si le compte exige la 2FA)
  → /auth/reset-password                  (nouveau mot de passe)
  → /auth
```

Changer le mot de passe invalide toutes les autres sessions du compte : une
session volée ne survit pas à une réinitialisation.

### Espace compte

`/auth/settings` couvre le changement d'adresse (avec revalidation par code), le
changement de mot de passe (mot de passe actuel exigé) et l'activation de la 2FA.

Deux sections hébergées sous `/auth/settings` relèvent du commerce et non de
l'authentification : `address/` (carnet d'adresses) et `factures/` (transactions).
Elles sont à déplacer, pas à supprimer, en cas de retrait du module.

## Gardes d'accès

Les contrôles existent à deux niveaux, et ce doublon est voulu : le hook couvre
les routes qu'on ajoutera demain, la page protège son propre cas d'usage.

| Niveau                       | Portée                                                                  |
| ---------------------------- | ----------------------------------------------------------------------- |
| `authHandle`                 | 2FA exigée non configurée, 2FA non validée, `/auth/settings/**` anonyme  |
| `load` de chaque page        | état précis attendu par la page (session de reset, email vérifié, etc.)  |
| `/admin/**`                  | connexion **et** rôle `ADMIN`                                           |
| `/checkout`                  | connexion (commande et adresses rattachées au compte)                   |

Ce que le hook ne fait pas : protéger `/admin`. Les routes d'administration
portent leur propre garde ; toute nouvelle page sous `/admin` doit la reprendre.

## Sécurité

| Sujet                | Choix                                                                       |
| -------------------- | --------------------------------------------------------------------------- |
| Mots de passe        | Argon2id (19 MiB, 2 passes), longueur minimale 8, refus des mots de passe connus de « Have I Been Pwned » (interrogé en k-anonymat : seuls 5 caractères de l'empreinte SHA-1 sortent du serveur) |
| Sessions             | token nanoid 32 caractères (≈190 bits), cookie `httpOnly` + `sameSite=lax` + `secure` en production ; le token sert directement d'identifiant de ligne (voir limites) |
| Secrets 2FA          | AES-128-GCM, clé `ENCRYPTION_KEY`, vecteur d'initialisation tiré à chaque écriture |
| Codes email          | base32 sans ambiguïté, 8 caractères, 10 minutes, une demande vivante par compte |
| Énumération          | les messages d'erreur ne distinguent pas « compte inconnu » de « mot de passe invalide » |
| Données au client    | `locals.user` reste serveur ; `+layout.server.ts` n'expose qu'une projection explicite, sans secret |

### Quotas

Tous les compteurs sont en mémoire du processus.

| Point d'entrée                     | Clé              | Quota                                    |
| ---------------------------------- | ---------------- | ---------------------------------------- |
| toutes les requêtes                | IP               | 100 par seconde                          |
| inscription                        | IP               | 3 jetons, 1 rechargé toutes les 10 s     |
| connexion                          | IP               | 20 jetons, 1 rechargé par seconde        |
| connexion                          | compte           | délai croissant : 0, 1, 2, 4, 8, 16, 30, 60, 180, 300 s |
| mot de passe oublié                | IP et compte     | 3 jetons, 1 rechargé par minute          |
| saisie du code email               | compte           | 5 essais par 30 min                      |
| envoi d'un code email              | compte           | 3 envois par 10 min                      |
| saisie du code (réinitialisation)  | session de reset | 5 essais par 30 min                      |
| changement de mot de passe         | compte           | 5 par 30 min                             |
| configuration 2FA                  | compte           | 3 jetons, 1 rechargé toutes les 10 min   |
| code TOTP                          | compte           | 5 essais par 30 min                      |
| code de secours                    | compte           | 3 essais par heure                       |

En déploiement sans état partagé (Vercel serverless), chaque instance applique son
propre quota : la limite réelle est donc multipliée par le nombre d'instances
actives. Pour une limite stricte, remplacer `src/lib/server/rate-limit.ts` par une
implémentation adossée à Redis.

## Configuration

| Variable                    | Rôle                                                       | Obligatoire      |
| --------------------------- | ---------------------------------------------------------- | ---------------- |
| `ENCRYPTION_KEY`            | 16 octets en base64, chiffre les secrets 2FA               | oui              |
| `SMTP_HOST`, `SMTP_PORT`    | serveur d'envoi des codes                                  | oui              |
| `SMTP_USER`, `SMTP_PASS`    | authentification SMTP                                      | selon le serveur |
| `GOOGLE_CLIENT_ID`          | identifiant OAuth Google                                   | si Google activé |
| `GOOGLE_CLIENT_SECRET`      | secret OAuth Google                                        | si Google activé |
| `VITE_GOOGLE_REDIRECT_URI`  | URI de retour, identique à la console Google Cloud         | si Google activé |

`ENCRYPTION_KEY` est à sauvegarder comme un mot de passe de base de données : la
perdre rend inutilisables toutes les 2FA existantes, qu'il faudrait alors
reconfigurer compte par compte.

Un échec d'envoi d'email n'interrompt pas l'inscription : le compte est créé et le
code reste consultable en base pendant sa durée de validité.

## Tests

Le parcours complet est couvert par un test end-to-end unique,
`e2e/auth/journey.spec.ts`, qui enchaîne inscription, vérification, changements de
mot de passe et d'adresse, réinitialisation, 2FA, code de secours et déconnexion,
en vérifiant à chaque étape le refus des cas invalides puis l'état réel en base.
Voir [../../e2e/README.md](../../e2e/README.md).

```bash
npm run test:e2e          # exécution simple
npm run test:e2e:video    # avec vidéo du parcours
```

## Étendre le module

**Protéger une nouvelle route.** Lire `locals.user` dans son `load` et rediriger
si absent. Pour un espace entier, préférer un préfixe traité dans `authHandle`,
comme `/auth/settings`, afin que l'oubli d'une garde sur une page ne crée pas de
faille.

**Ajouter un fournisseur OAuth.** Déclarer le client dans
`src/lib/lucia/oauth.ts`, ajouter le couple de routes sur le modèle de
`src/routes/auth/login/google/`, ajouter la colonne d'identifiant externe dans
`users` et sa recherche dans `src/lib/prisma/user/user.ts`.

**Ajouter un champ au compte.** Étendre le modèle Prisma, puis le type `User`
(`src/lib/lucia/user.ts`) et la projection de `loadFreshUser`
(`src/lib/lucia/hooks.ts`). Si le champ doit être visible côté client, l'ajouter
explicitement dans `src/routes/+layout.server.ts` — la projection y est
volontairement manuelle pour éviter toute fuite.

**Changer la durée des sessions.** Une seule constante, dans
`createSession` (`src/lib/lucia/session.ts`), avec le seuil de prolongation
automatique juste en dessous dans `validateSessionToken`.

## Limites connues

- **Le token de session est stocké en clair** : `sessions.id` est la valeur même du
  cookie. Un accès en lecture à la base suffit donc à usurper les sessions
  ouvertes. Le renforcement consiste à stocker le SHA-256 du token et à le hacher
  à la lecture, dans `createSession` et `validateSessionToken`
  (`src/lib/lucia/session.ts`) — en tenant compte du fait que l'inscription et la
  connexion Google passent, elles, par `auth.createSession` de Lucia.
- Deux chemins de création de session coexistent, celui de Lucia et celui du
  module. Les unifier éviterait ce genre d'écart.
- Les quotas ne sont pas partagés entre instances (voir ci-dessus).
- Le hook recharge l'utilisateur et la session à chaque requête, soit deux
  requêtes SQL par page servie à un visiteur connecté. C'est le prix d'un état
  toujours à jour ; un cache court serait le premier levier d'optimisation.
- Les emails partent en SMTP direct, sans file d'attente : un envoi lent ralentit
  la requête qui le déclenche.
- Aucune purge automatique des sessions et demandes expirées ; elles restent en
  base jusqu'à suppression manuelle. Les index sur `expiresAt` sont en place pour
  une tâche planifiée.
