# Administration

Back-office du projet : tableau de bord, comptes, produits, blog, codes promo,
ventes et messages de contact. Réservé au rôle `ADMIN`.

Il est conçu pour être retirable d'un bloc. La procédure complète est dans
[retrait.md](./retrait.md) ; ce document décrit son fonctionnement.

## Frontière du module

| Emplacement         | Contenu                                                      |
| ------------------- | ------------------------------------------------------------ |
| `src/lib/admin/`    | gardes (`assertAdmin`, `requireAdmin`) et hook `adminHandle` |
| `src/routes/admin/` | pages du back-office                                         |

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

| Couche  | Où                                              | Comportement                                                          |
| ------- | ----------------------------------------------- | --------------------------------------------------------------------- |
| Hook    | `adminHandle`                                   | GET **et** POST sous `/admin` : anonyme → `/auth/login`, CLIENT → `/` |
| Layout  | `src/routes/admin/+layout.server.ts`            | même règle, plus une projection sûre de l'admin connecté              |
| Actions | `requireAdmin(locals)` en tête de chaque action | 403 si le rôle n'est pas `ADMIN`                                      |

SvelteKit n'exécute pas le `load` du layout avant une action : sans
`requireAdmin`, un POST `?/deleteUser` passerait même si chaque page vérifiait
le rôle au chargement. Le hook couvre déjà ce cas ; le helper reste pour le
jour où le hook serait retiré.

Toute nouvelle page sous `/admin` est protège par le hook et le layout. Toute
nouvelle **action** doit appeler `requireAdmin(locals)` en première ligne.

## Attribution du rôle

L'enum Prisma `Role` n'a que deux valeurs : `ADMIN` et `CLIENT` (défaut).

| Mécanisme                 | Effet                                                  |
| ------------------------- | ------------------------------------------------------ |
| Inscription / Google      | toujours `CLIENT`                                      |
| Seed                      | un compte `ADMIN` de démonstration (`prisma/seed.js`)  |
| Fiche `/admin/users/[id]` | promotion ou rétrogradation, valeurs d'enum uniquement |

Il n'existe pas de page de création de compte dans l'admin : les comptes
naissent par inscription.

## Sections

| Route               | Rôle                                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/admin`            | tableau de bord (ventes récentes, dernières inscriptions)                                                                                                                      |
| `/admin/sales`      | transactions, factures, bordereaux                                                                                                                                             |
| `/admin/users`      | liste et suppression ; fiche `[id]` pour rôle, 2FA, mot de passe, adresses                                                                                                     |
| `/admin/products`   | catalogue, taxonomies, avis, questions/réponses, variantes (voir [docs/products](../products/README.md))                                                                       |
| `/admin/blog`       | articles, catégories, tags                                                                                                                                                     |
| `/admin/promo`      | codes promo (inclut le seuil de fidélité, voir [docs/promo](../promo/README.md#fid%C3%A9lit%C3%A9))                                                                            |
| `/admin/gift-cards` | émission et gestion des cartes cadeaux (voir [docs/commerce](../commerce/README.md#cartes-cadeaux))                                                                            |
| `/admin/returns`    | approbation/refus des demandes de retour, remboursement Stripe automatique ou crédit compte alternatif (voir [docs/commerce](../commerce/README.md#retours--sav))              |
| `/admin/contacts`   | messages du formulaire de contact                                                                                                                                              |
| `/admin/metrics`    | compteurs applicatifs (cache, rate-limit, jobs) en lecture seule                                                                                                               |
| `/admin/exports`    | export CSV, purge ciblée par ancienneté, import (restauration) — ventes, utilisateurs, produits, blog, promo, contacts ; export comptable mensuel automatisé (voir ci-dessous) |
| `/admin/settings`   | activation des modules e-commerce optionnels (voir ci-dessous)                                                                                                                 |
| `/admin/tva`        | taux de TVA du catalogue (`StoreSettings.vatRate`, affiché TTC côté vitrine, voir [docs/products](../products/README.md))                                                      |
| `/admin/livraison`  | délai de livraison affiché au checkout (`StoreSettings.estimatedDelivery{Min,Max}Days`)                                                                                        |
| `/admin/identite`   | identité légale de l'entreprise (raison sociale, SIRET, logo...) — source unique pour `/mentions-legales` et les factures/avoirs                                               |

Les listes d'utilisateurs n'exposent jamais `passwordHash`, `totpKey` ni
`recoveryCode`.

### Purge depuis `/admin/exports`

Purge manuelle, déclenchée par un admin, ciblée par ancienneté (`createdAt`) —
jamais un vidage total de table. Complète, sans le remplacer, le job
automatique `$lib/server/jobs/cleanup.ts` (qui purge déjà, sans action admin,
les sessions expirées et les paniers `PENDING` abandonnés depuis 30 jours).

Les ventes (`Transaction`) sont l'exception à la règle "jamais purgé"
documentée dans `cleanup.ts` : purgeables ici, mais seulement avec une
confirmation renforcée (taper `SUPPRIMER`), décision explicite assumée pour
cette page uniquement — `cleanup.ts` continue de ne jamais y toucher
automatiquement. Les utilisateurs ne sont purgeables que s'ils n'ont jamais
vérifié leur email (filtre non désactivable depuis l'UI). `products`/`users`
liés à une commande existante (contrainte FK `Restrict`) sont ignorés plutôt
que de faire échouer toute la purge.

L'import restaure les colonnes exportées uniquement : jamais les secrets
(`passwordHash`, `totpKey`), jamais les relations profondes (tags et
commentaires de blog). Indisponible pour les ventes.

### Export comptable automatisé

Remplace l'export manuel ponctuel (`GET /admin/exports/sales`) par un envoi
périodique sans action admin : le 1er de chaque mois, un job planifié
(`$lib/server/jobs/accountingExport.ts`, `runAccountingExportJob`) génère un
CSV des transactions payées du mois calendaire précédent et l'envoie en
pièce jointe à `ACCOUNTING_EXPORT_EMAIL`.

Colonnes inspirées de la nomenclature officielle du FEC (Fichier des
Écritures Comptables) — `JournalCode`, `EcritureDate`, `PieceRef`,
`CompteNum`... — mais **pas** un FEC réglementaire complet : une seule
écriture par transaction, pas de contrepartie débit/crédit par compte de
tiers. Point de départ d'un rapprochement comptable mensuel, pas un
substitut d'un vrai logiciel de comptabilité.

Même modèle de déclenchement que la purge/la relance panier abandonné : scan
périodique, pas événementiel — QStash Schedule
(`scripts/register-accounting-export-schedule.mjs`, `npm run
jobs:register-accounting-export-schedule`, 1er du mois 05:00 UTC) ou repli
Vercel Cron (`vercel.json` → `/api/jobs/accounting-export`), même route
double-auth (signature QStash ou `Authorization: Bearer $CRON_SECRET`) que
`/api/jobs/cleanup`.

Idempotent par période : `AccountingExportLog` (une ligne par mois `YYYY-MM`)
empêche un double envoi si le job est rejoué (retry QStash après un envoi
déjà réussi, relance manuelle) — contrairement au verrou Redis (`withLock`,
éphémère, absent en dev/e2e sans Upstash configuré), cet enregistrement
persiste. `ACCOUNTING_EXPORT_EMAIL` manquant → le job s'exécute mais
n'envoie rien (log `WARN`), comme un module `StoreSettings` désactivé.

### Modules e-commerce optionnels — `/admin/settings`

Une quinzaine de modules sont derrière un interrupteur plutôt qu'activés en
dur : liste d'envies, ventes croisées, espace retour/SAV, moyen de paiement
enregistré, palier de fidélité, cartes cadeaux, questions & réponses
produit, relance panier abandonné, ventes flash (`flashSaleEnabled`),
parrainage (`referralEnabled`, voir [docs/promo](../promo/README.md)),
alertes de réassort (`stockAlertsEnabled`), produits fréquemment achetés
ensemble (`frequentlyBoughtTogetherEnabled`), relance d'avis
(`reviewReminderEnabled`), alerte de baisse de prix sur liste d'envies
(`wishlistPriceAlertEnabled`), détection et blocage de fraude
(`fraudDetectionEnabled`/`fraudBlockingEnabled`), relance « récemment
consultés » (`recentlyViewedReminderEnabled`). Réglage unique
(`StoreSettings`, ligne `id = "singleton"`, `$lib/server/storeSettings.ts`),
lu par chaque route publique concernée — un module désactivé ne se contente
pas d'être masqué à l'écran, sa route reste fermée (ex. `/auth/settings/wishlist`
répond 404, `POST /api/wishlist` répond 404) : un accès direct à l'URL ne
contourne pas l'interrupteur. Exception : la relance panier abandonné n'a pas
de route publique à fermer — c'est un job planifié
(`$lib/server/jobs/cartRecovery.ts`) qui vérifie le flag lui-même avant
d'agir.

Chaque interrupteur s'enregistre immédiatement au clic (pas de bouton
« Enregistrer ») : `onCheckedChange` bascule l'état local puis soumet aussitôt
le formulaire (`requestSubmit`), désactivé le temps de la requête pour éviter
un double clic pendant la sauvegarde.

Lecture mise en cache 30 s (même mécanisme que le catalogue,
`$lib/server/cache.ts`, `bumpCacheVersion('settings')` à chaque sauvegarde) —
une modification depuis `/admin/settings` peut donc mettre jusqu'à 30 s à se
répercuter partout sans Redis pour invalider immédiatement. `/admin/settings`
lui-même lit toujours la valeur non mise en cache.

Au 16/09/2026, les huit modules ont une implémentation complète derrière leur
interrupteur : liste d'envies, ventes croisées (`e2e/products/wishlist.spec.ts`,
`e2e/products/cross-sell.spec.ts`), espace retour/SAV avec remboursement
Stripe automatique ou crédit compte alternatif (carte cadeau), moyen de
paiement enregistré (Stripe Elements), palier de
fidélité intégré à la section promo, cartes cadeaux à solde décroissant
(`e2e/gift-cards/*.spec.ts`), questions & réponses produit modérées
(`e2e/products/questions.spec.ts`) et relance panier abandonné par e-mail
(`e2e/commerce/cart-recovery.spec.ts`) — voir
[docs/commerce](../commerce/README.md#retours--sav) et
[docs/promo](../promo/README.md#fid%C3%A9lit%C3%A9) pour le détail des trois
premiers, [docs/commerce#cartes-cadeaux](../commerce/README.md#cartes-cadeaux)
et [docs/products#questions--réponses-produit](../products/README.md#questions--r%C3%A9ponses-produit)
pour les deux suivants, et
[docs/commerce#relance-panier-abandonné](../commerce/README.md#relance-panier-abandonn%C3%A9)
pour le dernier.

### Actions groupées

`src/lib/components/Table.svelte`, le tableau générique réutilisé par toutes
les listes admin, expose deux props optionnelles pour la sélection multiple :
`selectable` (colonne de case à cocher, case « tout sélectionner » sur la
page courante) et `bulkActions` (barre d'actions affichée dès qu'une ligne
est cochée — libellé, variante `destructive` avec confirmation
`AlertDialog`, fonction `onApply(ids: string[])`). Les deux sont `undefined`
par défaut : les autres listes admin qui n'y opèrent pas restent inchangées,
zéro risque à l'ajout.

Seule `/admin/products` la consomme pour l'instant (suppression en lot,
action `bulkDeleteProducts`) : un produit du lot déjà présent dans une
commande est compté à part (`skipped`) plutôt que de faire échouer toute la
suppression — même logique FK-Restrict qu'une suppression individuelle,
appliquée ligne par ligne. La sélection est réinitialisée à chaque
changement de page/recherche (elle ne suit jamais des lignes qui ne sont
plus affichées). Voir [docs/products](../products/README.md#admin) et le
test `e2e/products/admin-bulk.spec.ts`.

### Alerting

`$lib/server/alerting.ts` (`reportIfRepeated`) complète les compteurs de
`/admin/metrics` : quand un signal lié à la charge dépasse un seuil dans une
fenêtre glissante, il déclenche un `Sentry.captureMessage` (tag
`alert:<clé>`) en plus d'un log `ERROR` — une seule alerte par fenêtre, pas à
chaque occurrence. Deux signaux instrumentés :

- `http-5xx` : 20+ réponses ≥500 en 1 minute (`errorRateTracking` dans
  `hooks.server.ts`, compteur `http.5xx`).
- `lock-contention` : 20+ échecs d'acquisition de verrou distribué en 5
  minutes, tous verrous confondus (`withLock` dans `$lib/server/lock.ts`,
  compteur `lock.contention`).

Ce n'est pas un remplacement d'un outil d'alerting dédié (PagerDuty/Slack) :
c'est ce que Sentry peut exploiter sans infrastructure supplémentaire —
configurer une règle d'alerte Sentry sur le tag `alert:*` pour être notifié
en dehors du dashboard `/admin/metrics`.

## Ce qui n'est pas l'admin

L'authentification (`/auth`, sessions, 2FA) et le tunnel de commande
(`/checkout`) sont des modules distincts. Le catalogue public (`/products`)
est documenté à part : [docs/products](../products/README.md). Le blog public
(`/blog`) et son CRUD : [docs/blog](../blog/README.md). Les ventes
(`/admin/sales`) sont la surface admin du commerce :
[docs/commerce](../commerce/README.md). Un administrateur
qui n'a pas validé sa 2FA est d'abord renvoyé vers `/auth/2fa` par `authHandle`,
avant même d'atteindre `/admin`.

## Tests

Les numéros sont ceux des `test.step`. Changer la procédure ici, puis le spec,
puis le code. Index commun : [../../e2e/README.md](../../e2e/README.md).

### Accès — `e2e/admin/security.spec.ts`

Routes : `ADMIN_PATHS` dans `e2e/support/admin.ts`.

| #   | Étape                          | Geste                                           | Preuve                |
| --- | ------------------------------ | ----------------------------------------------- | --------------------- |
| 1   | Anonyme renvoyé à la connexion | GET chaque path                                 | `/auth/login`         |
| 2   | CLIENT renvoyé à l’accueil     | inscription + GET                               | `/`                   |
| 3   | CLIENT ne mute pas             | POST `?/deleteUser`, `?/deletePromo`            | lignes encore en base |
| 4   | ADMIN entre                    | `promoteToAdmin` + GET `/admin`, `/admin/users` | titres visibles       |

### Utilisateurs — `e2e/admin/users.spec.ts`

| #   | Étape                    | Geste                | Preuve                                     |
| --- | ------------------------ | -------------------- | ------------------------------------------ |
| 1   | Liste sans secret        | recherche emails     | 3 cellules ; pas de hash / totp / recovery |
| 2   | Promotion CLIENT → ADMIN | fiche → ADMIN → Save | `role` en base                             |
| 3   | Rôle hors enum refusé    | POST `SUPERUSER`     | reste `CLIENT`                             |
| 4   | MFA depuis la fiche      | checkbox + Save      | `isMfaEnabled`                             |
| 5   | Suppression d’un CLIENT  | dialogue Continue    | disparu UI + base                          |

À part : CLIENT GET `/admin/users/:id` d'un autre compte → `/`.

### Modules e-commerce — `e2e/admin/settings.spec.ts`

| #   | Étape                                  | Geste                 | Preuve                                                                                              |
| --- | -------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | Modules désactivés au départ           | GET `/admin/settings` | 5 des 7 switches à `unchecked` (couverture historique, cartes cadeaux/Q&A non vérifiés par ce spec) |
| 2   | Activation d'un module (pas de bouton) | switch                | `StoreSettings` en base                                                                             |
| 3   | Rechargée, l'état enregistré persiste  | reload                | switch reflète la base                                                                              |

À part : CLIENT POST `/admin/settings` — réglages inchangés.

### Exports — `e2e/admin/exports.spec.ts`

Purge jouée sur `products`, seuil 365 jours, lignes de test vieillies de 400 jours.

| #   | Étape                                  | Geste                         | Preuve                                 |
| --- | -------------------------------------- | ----------------------------- | -------------------------------------- |
| 1   | Export CSV                             | GET `/admin/exports/products` | en-tête + ligne attendues              |
| 2   | Aperçu de purge                        | Prévisualiser                 | delta +2 sur le compte                 |
| 3   | Purge ciblée, FK protégée ignorée      | Confirmer la suppression      | `1 supprimée(s), 1 ignorée(s)`         |
| 4   | Réimport met à jour une ligne modifiée | Importer                      | `0 créé(s), 1 mis à jour`, prix changé |

Blocage anonyme/CLIENT couvert par `ADMIN_PATHS` (`e2e/admin/security.spec.ts`).

### Export comptable — `e2e/admin/accounting-export.spec.ts`

Appel direct de la route de job (comme la relance panier abandonné), pas de
parcours UI : ce n'est pas une action déclenchée depuis l'admin.

| #   | Étape                                 | Geste                              | Preuve                                              |
| --- | ------------------------------------- | ---------------------------------- | --------------------------------------------------- |
| 1   | Premier appel : export envoyé         | POST `/api/jobs/accounting-export` | `sent: true`, e-mail avec pièce jointe CSV attendue |
| 2   | Rejoué tout de suite : pas de doublon | POST `/api/jobs/accounting-export` | `sent: false`, aucune boîte de réception            |

Catalogue admin : [docs/products](../products/README.md). Ventes :
[docs/commerce](../commerce/README.md). Blog : [docs/blog](../blog/README.md).
Promo : [docs/promo](../promo/README.md). Contact : [docs/contact](../contact/README.md).

```bash
npm run test:e2e
```

## Étendre le module

**Ajouter une page.** La placer sous `src/routes/admin/`. Le hook et le layout
s'en chargent. Si elle a une action, appeler `requireAdmin(locals)` en premier.

**Ajouter un lien d'entrée.** Marquer `ADMIN-PLUGIN` (panier, page compte, etc.)
et ne l'afficher que si `role === 'ADMIN'`.
