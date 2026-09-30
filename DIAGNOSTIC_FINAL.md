# Diagnostic final — synthèse et dernière passe

Ce document ne refait pas les audits déjà réalisés : `AUDIT_TECHNIQUE.md`
(lint/dépendances/CI/gouvernance), `AUDIT_FONCTIONNEL.md` (14 bugs métier,
**tous corrigés**), `CONFORMITE_ECOMMERCE.md` (RGPD/consommation/fiscal/
accessibilité), `REGISTRE_TRAITEMENTS.md` (RGPD art. 30) et `RESTE_A_FAIRE.md`
(backlog technique) couvrent déjà, en profondeur et avec preuve à l'appui,
la quasi-totalité de la surface habituelle d'un audit : sécurité, bugs de
logique métier, SEO, accessibilité, anti-patterns Svelte 5, dépendances,
conformité légale.

Ce document a deux rôles :

1. **Vérifier au jour d'aujourd'hui** que ce que ces documents affirment est
   toujours vrai — un dépôt qui bouge vite dérive vite. Trois écarts réels
   ont été trouvés et corrigés dans le cadre de cette vérification (§1).
2. **Couvrir les deux seuls angles qui n'avaient jamais été traités sous
   cette forme précise** — la couverture de test route par route (pas une
   estimation globale) et la cohérence entre chaque `docs/<module>/README.md`
   et le code réel (§3 et §4) — puis **consolider en une seule liste
   priorisée** ce qui reste ouvert à travers tous les documents (§5).

**Méthode** : chaque constat a été vérifié par exécution réelle des outils
(`npm run check`, `eslint`, `vitest`, `npm audit`, `knip`, API GitHub
publique pour l'état CI) ou par lecture directe du code avec citation de
fichier/ligne — jamais par supposition. Les deux sections §3/§4 ont été
produites par des explorations dédiées puis vérifiées par échantillonnage
(grep direct sur 4 des affirmations les plus significatives, toutes
confirmées exactes).

---

## 1. Dérive trouvée et corrigée pendant cette vérification

Trois écarts entre ce que les documents précédents affirment et l'état réel
du dépôt à l'instant de cette passe — tous corrigés ici :

### 1.1 🔴 CI cassée sur `main`, non détectée

`RESTE_A_FAIRE.md`/`AUDIT_TECHNIQUE.md` sont datés du 28-29/09 ; le dernier
commit poussé sur `main` (`02eadfb`, "cartSync") a **fait échouer le job CI
`lint-and-check`**, step `Lint (prettier)` (confirmé via l'API GitHub REST
publique, `GET /repos/.../actions/runs`, sans authentification — le dépôt
est public). Cause : `REGISTRE_TRAITEMENTS.md` n'était pas formaté
Prettier (tableaux markdown non alignés). **Corrigé** (`npx prettier
--write`, changement de mise en forme pure, aucun contenu modifié) —
`npx prettier --check .` revient propre sur tous les fichiers suivis par
git.

### 1.2 🔴 Vulnérabilité npm _high_ apparue depuis la dernière passe

`RESTE_A_FAIRE.md` §1 affirmait "4 low, 4 moderate, aucune high/critique"
(triage du 29/09). `npm audit` donne aujourd'hui **7 vulnérabilités dont 1
high** : `brace-expansion` (déni de service par expansion quadratique/
récursion non bornée), transitif via `@typescript-eslint/typescript-estree`,
`glob`, `rimraf` — outillage dev, jamais dans le bundle de production, mais
une vraie vulnérabilité récemment publiée (la base de vulnérabilités npm
évolue même sans changement de code). **Corrigé** (`npm audit fix`, sans
`--force`, aucune dépendance directe changée) : retour à 6 vulnérabilités
(3 low, 3 moderate), exactement l'état déjà documenté et accepté par
`AUDIT_TECHNIQUE.md`/`RESTE_A_FAIRE.md` (`cookie` non exploitable ici —
noms/chemins/domaines de cookie constants, jamais issus d'une entrée
utilisateur ; `@vitest/mocker`/`@vitest/coverage-v8` dev-only).

### 1.3 🟡 `node_modules` désynchronisé de `package-lock.json`

`npm ls @sveltejs/adapter-vercel` signalait `5.10.3 invalid: "^6.3.4" from
the root project` — `package.json`/`package-lock.json` déclarent
correctement `6.3.4` (la montée de version documentée dans
`RESTE_A_FAIRE.md` §1 a bien eu lieu dans le dépôt), mais le `node_modules`
sur disque avait l'ancienne version réellement installée. Cause probable :
un `npm install` manquant après un des nombreux merges de cette période
(même classe de symptôme que le `jsdom` absent de `node_modules` déjà noté
dans `AUDIT_TECHNIQUE.md` §6). **Corrigé** (`npm install`) — revérifié :
`npm ls @sveltejs/adapter-vercel` → `6.3.4` propre, `npm run build` complet
sans erreur.

**Après ces trois correctifs** : `npm run check` 0/0, ESLint 0 erreur/12
warnings (baseline inchangée), `npx vitest run` 84 passed/2 skipped,
`npm run build` propre. Fichiers modifiés : `REGISTRE_TRAITEMENTS.md`
(formatage), `package-lock.json` (resynchronisation). **Non commités** —
à valider et pousser.

---

## 2. Trouvaille fonctionnelle nouvelle — personnalisation produit

Aucun des 5 documents existants ne traite le modèle `Custom`
(`prisma/schema.prisma:642`) — la fonctionnalité de commande sur-mesure
(upload d'une photo + message client + quantité, `shippingOption:
'no_shipping'` forcé au checkout dès qu'une ligne en contient une,
`src/routes/checkout/+page.server.ts:149,278`). `FEATURE_IDEAS.md` (ligne 57) la mentionne, mais comme une **idée d'amélioration future**
("configurateur bijou ⭐"), sans avoir creusé son état actuel — ce que
cette passe fait.

**Ce flux est déjà vivant** : un client peut aujourd'hui commander et payer
un article personnalisé via Stripe. Deux problèmes concrets, pas
hypothétiques :

1. **Aucune validation serveur sur les données de personnalisation.** Le
   chemin réel (`api/save-cart/+server.ts` → `saveCartForUser`
   (`$lib/commerce/cart.ts`) → `updateOrderItems`
   (`$lib/prisma/order/prendingOrder.ts`) → `prisma.custom.createMany`)
   accepte `image`/`userMessage` comme deux chaînes libres sans aucune
   borne de longueur, et `quantity` sans borne haute (seul un plancher à 1
   existe, `prendingOrder.ts:139`). Un schéma Zod complet
   (`src/lib/schema/products/customSchema.ts` — image ≤ 1 Mo, MIME
   liste blanche, message ≤ 500 caractères, quantité ≤ 10000) **existe
   déjà dans le dépôt mais n'est importé nulle part** (confirmé par grep
   sur tout `src/`) — c'est un signal net que la validation a été écrite
   puis jamais branchée, pas un oubli de conception.
2. **La personnalisation demandée par le client n'est visible nulle part
   côté marchand.** Recherche exhaustive (`grep` sur `userMessage`/
   `customizations` dans `src/routes/admin`, `src/lib/server/invoice`) :
   aucune page admin, aucun PDF de facture/bordereau, aucun e-mail n'affiche
   jamais l'image ou le message envoyés par le client. La seule trace est
   un indicateur booléen `hasCustom` calculé dans
   `src/lib/server/jobs/post-payment.ts:76`, jamais lu ailleurs. Concrètement :
   **un admin qui doit fabriquer une pièce sur-mesure n'a aucun moyen de
   voir ce que le client a demandé** — ni sur la fiche commande, ni sur le
   bordereau de préparation.

**Sévérité** : 🟡 moyen-haut — pas une faille de sécurité exploitable de
l'extérieur (route authentifiée), mais un vrai trou opérationnel sur une
fonctionnalité déjà payante (un client peut payer une pièce sur-mesure que
le magasin ne pourra pas fabriquer correctement faute de voir sa demande),
et une absence de validation serveur sur du texte/une URL entrés par
l'utilisateur qui finissent stockés durablement (`Custom`, puis recopiés
dans le JSON `Transaction.products` de la facture).

**Piste** : brancher `customSchema.ts` dans `saveCartForUser`/le endpoint
`api/save-cart`, et afficher `custom.image`/`custom.userMessage` sur la
page admin des ventes (au minimum) et le bordereau de préparation —
exactement la direction déjà décrite dans `FEATURE_IDEAS.md`, mais à
traiter comme une correction de trou opérationnel sur une fonctionnalité
déjà en production, pas comme une amélioration optionnelle à planifier un
jour.

---

## 3. Fichiers morts confirmés (au-delà du signalement `knip`)

`AUDIT_TECHNIQUE.md` §3.4 listait 8 fichiers signalés par `knip` comme
potentiellement inutilisés, "à vérifier individuellement avant toute
suppression". Fait ici — chacun recherché par `grep` sur tout `src/` et
`e2e/` (imports, chemins littéraux) :

| Fichier                                   | Contenu                                                        | Vraiment mort ?                                                                              |
| ----------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `src/lib/blog/paths.ts`                   | `BLOG_PATHS = ['/blog']`                                       | Oui — zéro import                                                                            |
| `src/lib/commerce/paths.ts`               | `COMMERCE_PATHS`, `COMMERCE_ADMIN_PATHS`                       | Oui — zéro import                                                                            |
| `src/lib/contact/paths.ts`                | `CONTACT_PATHS = ['/contact']`                                 | Oui — zéro import                                                                            |
| `src/lib/products/paths.ts`               | `PRODUCT_PATHS = ['/products']`                                | Oui — zéro import                                                                            |
| `e2e/support/commerce.ts`                 | Doublon quasi identique de `commerce/paths.ts`                 | Oui — zéro import                                                                            |
| `src/lib/store/mediaStore.ts`             | Store Svelte `matchMedia` réactif (`isSmall`)                  | Oui — zéro import                                                                            |
| `src/lib/schema/products/customSchema.ts` | Schéma Zod de personnalisation (voir §2)                       | Oui — zéro import, **mais son absence de branchement est le vrai sujet, pas sa suppression** |
| `src/lib/utils/shippingMethodMap.ts`      | Table de correspondance transporteur/format colis (230 lignes) | Oui — zéro import                                                                            |

Les 5 premiers sont du scaffolding jamais raccordé (chaque commentaire dit
"pour la documentation et les tests e2e", mais aucun doc ni test ne les
importe réellement) — suppression sans risque. `customSchema.ts` est un cas
à part : ne pas le supprimer, le **brancher** (§2). `shippingMethodMap.ts`
mérite une vérification supplémentaire avant suppression (230 lignes de
données transporteur codées en dur — vérifier auprès de qui a écrit ce
fichier si une intégration Sendcloud future en a besoin, plutôt que
supposer).

---

## 4. Couverture de test — action par action (nouveau)

Contrairement à l'estimation déjà documentée ("l'essentiel du parcours est
couvert par les 60 specs Playwright"), voici la cartographie action par
action : chaque `action`/handler HTTP exporté par les routes, confirmé
exercé ou non par un test réel (pas seulement "il existe un spec pour ce
module").

### Auth

| Route                                                   | Action                     | Testé ?                                     |
| ------------------------------------------------------- | -------------------------- | ------------------------------------------- |
| `auth/+page.server.ts`                                  | `signout`                  | ✅ e2e                                      |
| `auth/2fa/+page.server.ts`                              | `totp`                     | ✅ e2e                                      |
| `auth/2fa/reset/+page.server.ts`                        | `recovery_code`            | ✅ e2e                                      |
| `auth/2fa/setup/+page.server.ts`                        | `setuptotp`                | ✅ e2e                                      |
| `auth/forgot-password/+page.server.ts`                  | `forgotPassword`           | ✅ e2e                                      |
| `auth/login/+page.server.ts`                            | `login`                    | ✅ e2e                                      |
| `auth/login/google/+server.ts` / `callback`             | `GET`                      | ✅ e2e                                      |
| `auth/not-me/[token]/+page.server.ts`                   | `confirm`                  | ✅ e2e                                      |
| `auth/reset-password/+page.server.ts`                   | `resetPassword`            | ✅ e2e                                      |
| `auth/reset-password/2fa/+page.server.ts`               | `totp`, `recovery_code`    | ❌ **NON**                                  |
| `auth/reset-password/verify-email/+page.server.ts`      | `verify`                   | ✅ e2e                                      |
| `auth/settings/+page.server.ts`                         | `password`, `email`        | ✅ e2e                                      |
| `auth/settings/+page.server.ts`                         | `isMfaEnabled`             | ❌ **NON** (UI masquée)                     |
| `auth/settings/+page.server.ts`                         | `marketingEmailsOptIn`     | ❌ **NON**                                  |
| `auth/settings/address/+page.server.ts`                 | `deleteAddress`            | ✅ e2e                                      |
| `auth/settings/address/[id]/+page.server.ts`            | `updateAddress`            | ❌ **NON**                                  |
| `auth/settings/address/create/+page.server.ts`          | `createAddress`            | ✅ e2e                                      |
| `auth/settings/donnees/+page.server.ts`                 | `delete`                   | ✅ e2e                                      |
| `auth/settings/donnees/export/+server.ts`               | `GET`                      | ✅ e2e                                      |
| `auth/settings/factures/[id]/pdf/+server.ts`            | `GET`                      | ✅ e2e                                      |
| `auth/settings/returns/[transactionId]/+page.server.ts` | `request`                  | ✅ e2e                                      |
| `auth/settings/saved-payments/+page.server.ts`          | `attach`                   | ❌ **NON** (nécessite Stripe Elements réel) |
| `auth/settings/saved-payments/+page.server.ts`          | `delete`, `setDefault`     | ✅ e2e                                      |
| `auth/settings/saved-payments/setup-intent/+server.ts`  | `POST`                     | 🟡 partiel (404 seulement)                  |
| `auth/settings/sessions/+page.server.ts`                | `revoke`, `revokeOthers`   | ✅ e2e                                      |
| `auth/signup/+page.server.ts`                           | `signup`                   | ✅ e2e                                      |
| `auth/verify-email/+page.server.ts`                     | `verifyCode`, `resendCode` | ✅ e2e                                      |

### Admin

| Route                                                                          | Action                                                  | Testé ?                                                                        |
| ------------------------------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `admin/exports/[kind]/**`                                                      | `GET`/`POST` (export, import, purge)                    | ✅ e2e                                                                         |
| `admin/gift-cards/**`                                                          | toutes                                                  | ✅ e2e                                                                         |
| `admin/identite`, `admin/livraison`, `admin/tva`, `admin/settings`             | `default`                                               | ✅ e2e                                                                         |
| `admin/products/(edit)/[id]/+page.server.ts`                                   | `updateProduct`                                         | ✅ e2e                                                                         |
| `admin/products/(edit)/[id]/variants/**`                                       | `deleteVariant`, `updateVariant`                        | ✅ e2e                                                                         |
| `admin/products/(edit)/[id]/variants/create/+page.server.ts`                   | `createVariant`                                         | ❌ **NON**                                                                     |
| `admin/products/(edit)/create/+page.server.ts`                                 | `createProduct`                                         | 🟡 `test.skip` par défaut — **jamais exécuté en CI standard**                  |
| `admin/products/+page.server.ts`                                               | `deleteProduct`, `bulkDeleteProducts`, `deleteTaxonomy` | ✅ e2e                                                                         |
| `admin/products/questions/**`, `admin/products/reviews/**`                     | toutes                                                  | ✅ e2e                                                                         |
| `admin/products/taxonomies/[id]/+page.server.ts`                               | `updateTaxonomy`, `deleteTaxonomyValue`                 | ❌ **NON**                                                                     |
| `admin/products/taxonomies/[id]/values/**`, `admin/products/taxonomies/create` | toutes                                                  | ✅ e2e                                                                         |
| `admin/promo/+page.server.ts`, `[id]`                                          | `deletePromo`, `updatePromo`                            | ✅ e2e                                                                         |
| `admin/promo/create/+page.server.ts`                                           | `createPromo`                                           | ❌ **NON** (création testée via Prisma seulement)                              |
| `admin/returns/+page.server.ts`                                                | `approve`                                               | 🟡 **seul le chemin d'échec Stripe est testé, jamais le remboursement réussi** |
| `admin/returns/+page.server.ts`                                                | `creditStore`, `reject`                                 | ✅ e2e                                                                         |
| `admin/sales/**/pdf`                                                           | `GET`                                                   | ✅ e2e                                                                         |
| `admin/users/+page.server.ts`, `[id]`                                          | `deleteUser`, `updateUserAndAddresses`                  | ✅ e2e                                                                         |

### Blog (zone quasi entièrement non couverte)

| Route                                  | Action                        | Testé ?                      |
| -------------------------------------- | ----------------------------- | ---------------------------- |
| `admin/blog/+page.server.ts`           | `deleteBlogPost`              | ✅ e2e                       |
| `admin/blog/+page.server.ts`           | `deleteBlogTaxonomy`          | ❌ **NON**                   |
| `admin/blog/post/[id]`, `post/create`  | `updatePost`, `createPost`    | ❌ **NON**                   |
| `admin/blog/taxonomies/**` (5 actions) | `update*`/`create*`/`delete*` | ❌ **NON**, aucune exception |

### Commerce / checkout / jobs

| Route                                                                                                                           | Action       | Testé ?                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checkout/+page.server.ts`                                                                                                      | `checkout`   | ✅ e2e (succès réel + erreurs)                                                                                                                                       |
| `api/webhooks/+server.ts`, `api/webhooks/sendcloud`                                                                             | `POST`       | ✅ e2e                                                                                                                                                               |
| `api/jobs/accounting-export`, `cart-recovery`, `review-reminder`, `recently-viewed-reminder`                                    | `POST`/`GET` | ✅ e2e (appel HTTP direct, auth cron réelle)                                                                                                                         |
| `api/jobs/cleanup`, `loyalty-check`, `stock-alerts`, `invoice-email`, `post-payment`, `referral-reward`, `wishlist-price-alert` | `POST`       | 🟡 **logique testée (unitaire ou repli synchrone webhook), mais la route HTTP elle-même — donc son authentification cron/QStash — n'est jamais appelée directement** |

### Products / promo / gift-cards / contact

Tout est couvert (`review`, `askQuestion`, `api/bundles`, `api/wishlist`,
`api/stock-alerts`, `api/save-cart`, `api/address-search`,
`api/promo/validate`, `api/gift-cards/validate`, `contact` → `send`), à
une exception : `api/csp-report/+server.ts` (`POST`) — ❌ **NON testé**,
risque faible (endpoint de reporting, pas de mutation).

### Les trous qui comptent vraiment

Par ordre de risque décroissant :

1. **`auth/reset-password/2fa`** — réinitialiser son mot de passe sur un
   compte 2FA actif n'est jamais testé de bout en bout. Un contournement de
   la 2FA via "mot de passe oublié" passerait inaperçu.
2. **`admin/returns` → `approve`, chemin de succès** — l'action la plus
   sensible côté argent du module retours (remboursement Stripe réel) n'a
   jamais son cas nominal vérifié ; seul l'échec l'est.
3. **`auth/settings/saved-payments` → `attach`/`setup-intent`** —
   l'enregistrement réel d'une carte bancaire n'est jamais exercé.
4. **Le module blog admin dans son ensemble** (hors suppression d'article)
   — création/édition d'article, taxonomies blog : zéro couverture.
5. **`admin/products/(edit)/create` → `createProduct`** — création de
   produit, action fondamentale du catalogue, testée uniquement par un
   spec `skip` par défaut (Cloudinary réel requis) : **jamais exécutée en
   CI standard**.
6. **4 routes de jobs cron** (`cleanup`, `loyalty-check`, `stock-alerts`,
   `invoice-email`) dont l'authentification HTTP elle-même (secret
   cron/signature QStash) n'est jamais testée en direct — seule la logique
   métier sous-jacente l'est indirectement.
7. **`admin/promo/create` → `createPromo`** — création de code promo
   (argent) jamais testée par e2e.
8. **`auth/settings/+page.server.ts` → `marketingEmailsOptIn`** — un bug
   qui inverserait le consentement marketing (RGPD, opt-in) ne serait
   détecté par aucun test.
9. **`admin/products/(edit)/[id]/variants/create` → `createVariant`** et
   **`admin/products/taxonomies/[id]` → `updateTaxonomy`/
   `deleteTaxonomyValue`** — mutations catalogue jamais exercées par e2e.

---

## 5. Cohérence documentation ↔ code (nouveau)

`CONTRIBUTING.md` fixe la règle : "un commit qui touche à un module
documenté dans `docs/` doit mettre à jour le `README.md`/`retrait.md`
correspondant." Vérification module par module — cette règle n'a **pas**
été respectée pour deux domaines qui ont beaucoup bougé récemment (auth,
admin) ; les autres sont à jour.

### `docs/auth/README.md` — écart majeur, tout un pan de fonctionnalité absent

Le document ne mentionne nulle part le dispositif de sécurité de compte
construit lors des sessions récentes, alors que le code existe et est déjà
testé en e2e : historique des connexions (`LoginEvent`), sessions actives
self-service (`/auth/settings/sessions`), alerte "nouvel appareil", lien
"Ce n'était pas moi" (`SessionRevokeToken`), confirmation e-mail au
changement de mot de passe, alerte tentatives échouées répétées, export
RGPD (`/auth/settings/donnees/export`), anonymisation de compte
(`anonymizeUser.ts`). Conséquences concrètes :

- "Modèle de données" affirme "quatre tables" — il y en a six
  (`LoginEvent` et `SessionRevokeToken` manquent).
- "Tests" affirme "un seul scénario, `journey.spec.ts`" — sept specs de
  plus existent (`google`, `address`, `new-device-alert`, `sessions`,
  `password-changed-alert`, `gdpr-data`, `failed-login-alert`).
- "Espace compte" affirme que seules deux sections (`address/`,
  `factures/`) relèvent d'un autre module et doivent être déplacées en cas
  de retrait — en réalité au moins cinq (`returns/`, `saved-payments/`,
  `wishlist/` sont explicitement marquées `COMMERCE-PLUGIN`/
  `PRODUCT-PLUGIN` dans le code, `referral/` dépend de
  `StoreSettings.referralEnabled`).

`docs/auth/retrait.md` hérite du même écart : la procédure de désinstallation
(`rm -rf`) **omet cinq fichiers/dossiers récents** (dont
`anonymizeUser.ts`, les trois modules d'alerte) **et ne prévoit de
préserver que 2 des 5 sections commerce/produits réellement logées sous
`/auth/settings`** — suivre cette procédure telle quelle casserait
silencieusement retours, moyens de paiement enregistrés et liste d'envies
en cas de retrait du module auth.

À l'inverse, `docs/deployment/README.md` §8 documente déjà correctement les
e-mails de sécurité et le lien "Ce n'était pas moi" — l'écart est localisé
au README du module lui-même, pas au reste de la documentation.

### `docs/admin/README.md` — sections et modules manquants

- Trois pages admin réelles et fonctionnelles absentes de la table des
  sections : `/admin/tva`, `/admin/livraison`, `/admin/identite`.
- "Modules e-commerce optionnels" n'en cite que 8 alors que
  `StoreSettings` compte environ 16 booléens d'activation actifs dans le
  code (`flashSaleEnabled`, `referralEnabled`, `stockAlertsEnabled`,
  `frequentlyBoughtTogetherEnabled`, `reviewReminderEnabled`,
  `wishlistPriceAlertEnabled`, `fraudDetectionEnabled`,
  `fraudBlockingEnabled`, `recentlyViewedReminderEnabled` en plus des 8
  déjà cités) — le sommaire admin qui prétend lister "les" modules
  optionnels n'en couvre plus que la moitié.

### `docs/commerce/README.md` — trois fonctionnalités non documentées

- La distinction rétractation légale (`WITHDRAWAL`) vs SAV (`WARRANTY`)
  sur les retours (`ReturnRequest.kind`) — le README décrit encore un seul
  type de retour à motif libre.
- Les litiges Stripe (chargebacks) : `handleChargeDisputeCreated`/
  `handleChargeDisputeClosed`, alerte `DISPUTE_ALERT_EMAIL` — absents de
  toute section (frontière du module, webhook, tests).
- Le délai de livraison configurable (`/admin/livraison`, affiché au
  checkout) — absent malgré sa portée conformité (Code conso. L216-1).

### `docs/products/README.md` — affichage TTC non documenté

Tous les prix vitrine (catalogue, fiche produit, ventes croisées,
récemment consultés) sont convertis en TTC via `toTTC(price, vatRate)` —
le README documente en détail `compareAtPrice`/`flashSaleEndsAt` mais rien
sur cette conversion, alors que `docs/commerce/README.md` documente bien le
même taux côté panier/checkout. La vitrine produit est le seul maillon du
parcours prix qui reste non documenté.

### `docs/promo/README.md` — module parrainage entièrement absent

Le parrainage (`User.referralCode`, `ReferralReward`,
`StoreSettings.referralEnabled`, `/auth/settings/referral`, remise 10 % +
récompense carte cadeau via `$lib/server/jobs/referral.ts`) n'apparaît
dans **aucun** document de `docs/` — ni promo, ni commerce, ni admin —
alors que c'est un module à interrupteur de la même famille que la
fidélité, déjà documentée juste au-dessus dans le même fichier.

### `docs/deployment/README.md` — deux variables d'environnement manquantes

`ACCOUNTING_EXPORT_EMAIL` et `DISPUTE_ALERT_EMAIL` sont dans
`.env.example` et réellement lues par le code, mais absentes de la table
des variables d'environnement du guide de déploiement. Le reste de la
table (Neon, Stripe, Sendcloud, Cloudinary, Brevo, Google OAuth, Upstash,
QStash, Sentry, TinyMCE, `APP_URL`/`VERCEL_URL`) est à jour.

### À jour, sans écart trouvé

`docs/blog/README.md`, `docs/contact/README.md`, `README.md` (racine),
`CONTRIBUTING.md` — aucune affirmation obsolète, structure conforme au code
réel.

---

## 6. Synthèse consolidée — tout ce qui reste ouvert

Vue unique, à travers les 5 documents existants + ce document, de ce qui
n'est **pas encore fait** (par opposition à ce qui a déjà été corrigé
partout ailleurs — la grande majorité).

### 6.1 À corriger (technique, sans décision produit nécessaire)

| #   | Action                                                                                  | Source                  | Effort  |
| --- | --------------------------------------------------------------------------------------- | ----------------------- | ------- |
| 1   | Committer les 3 correctifs de vérification (§1)                                         | ce document             | trivial |
| 2   | Brancher `customSchema.ts` + afficher la personnalisation en admin                      | §2                      | moyen   |
| 3   | Supprimer les 6 fichiers morts confirmés (§3), garder `shippingMethodMap.ts` à trancher | §3                      | trivial |
| 4   | Mettre à jour `docs/auth/README.md` + `retrait.md` (écart majeur)                       | §5                      | moyen   |
| 5   | Mettre à jour `docs/admin/README.md` (3 pages + 9 modules manquants)                    | §5                      | faible  |
| 6   | Compléter `docs/commerce/README.md` (retrait/SAV, litiges, livraison)                   | §5                      | faible  |
| 7   | Compléter `docs/products/README.md` (TTC) et `docs/promo/README.md` (parrainage)        | §5                      | faible  |
| 8   | Ajouter `ACCOUNTING_EXPORT_EMAIL`/`DISPUTE_ALERT_EMAIL` à `docs/deployment/README.md`   | §5                      | trivial |
| 9   | Tester le cas nominal de `admin/returns → approve` (remboursement réussi)               | §4                      | moyen   |
| 10  | Tester `auth/reset-password/2fa` de bout en bout                                        | §4                      | moyen   |
| 11  | Tester l'authentification HTTP directe des 4 routes cron non couvertes                  | §4                      | moyen   |
| 12  | Migration `Float` → `Decimal` pour les montants monétaires                              | `RESTE_A_FAIRE.md` §4.1 | élevé   |

### 6.2 Décisions humaines/produit — pas à moi de trancher

| #   | Décision                                                                                     | Source                       |
| --- | -------------------------------------------------------------------------------------------- | ---------------------------- |
| 1   | Arbitrage détection "nouvel appareil" (statu quo / normaliser / croiser localisation)        | `RESTE_A_FAIRE.md` §3        |
| 2   | Taux de TVA réel à saisir dans `/admin/tva` (20 % attendu, à confirmer par expert-comptable) | `CONFORMITE_ECOMMERCE.md` §4 |
| 3   | Identité légale de l'entreprise à saisir dans `/admin/identite`                              | `CONFORMITE_ECOMMERCE.md` §3 |
| 4   | Désignation d'un médiateur de la consommation réel                                           | `CONFORMITE_ECOMMERCE.md` §2 |
| 5   | Durées de conservation `FraudBlock`/`AdminAuditLog` à trancher                               | `REGISTRE_TRAITEMENTS.md`    |
| 6   | Signature du registre RGPD art. 30 par le responsable de traitement réel                     | `REGISTRE_TRAITEMENTS.md`    |
| 7   | Titrage/poinçon métal précieux — saisie de données fournisseur                               | `CONFORMITE_ECOMMERCE.md` §6 |

### 6.3 Actions d'infrastructure — accès admin requis, hors de portée d'un agent

| #   | Action                                                                                          | Source                      |
| --- | ----------------------------------------------------------------------------------------------- | --------------------------- |
| 1   | Activer "Dependabot alerts" (Settings → Code security)                                          | `AUDIT_TECHNIQUE.md` §3.5   |
| 2   | Décider d'un stockage de secrets chiffré au repos (Vault/1Password/Doppler) si l'équipe grandit | `AUDIT_TECHNIQUE.md` §3.1.b |

### 6.4 Explicitement décidé de ne pas faire (rappel, ne pas rouvrir)

Voir `RESTE_A_FAIRE.md` §7 pour le détail : `multipleSubmits: 'allow'` sur
les formulaires 2FA, allègement de `findPendingOrder`, rate limiting comme
cause d'instabilité e2e, règle de lint anti-prix-TTC-en-dur, masquage
appareil/localisation sur "Ce n'était pas moi".

---

## 7. Verdict global

Ce projet a déjà été audité avec un sérieux rare pour un boilerplate : 14
bugs métier réels trouvés et corrigés (dont deux avec de l'argent réel en
jeu), une XSS corrigée, une conformité RGPD/consommation/fiscale mappée
obligation par obligation avec preuve de code, une architecture "plugin"
documentée module par module, des SLOs chiffrés et vérifiables, un scan de
vulnérabilités qui fonctionne réellement (remplacé après avoir découvert
que l'ancien était cassé en silence). Ce n'est pas un starter — c'est un
socle qui a survécu à plusieurs vagues d'audit consécutives et en est
ressorti plus solide à chaque fois.

Ce qui reste après cette dernière passe n'est plus de l'ordre du "gros
risque caché" — c'est de la **dette de documentation** (deux README de
module qui n'ont pas suivi le rythme des features récentes), de la **dette
de test ciblée** (une douzaine d'actions précises, identifiées une par
une plutôt que par estimation), et une **fonctionnalité à moitié câblée**
(la personnalisation produit) qui mérite d'être terminée avant qu'un vrai
client sur-mesure ne se heurte à son absence de suivi côté admin. Rien
dans ce document n'appelle une intervention en urgence.
