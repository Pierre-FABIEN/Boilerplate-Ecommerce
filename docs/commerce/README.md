# Commerce (panier, checkout, ventes)

Tunnel de commande : panier serveur (`Order` PENDING), checkout, webhook Stripe
(`Transaction`, commande `PAID`), surface admin `/admin/sales`. Réservé en
écriture au visiteur connecté ; `/admin/sales` au rôle `ADMIN`.

Il est conçu pour être retirable d'un bloc. La procédure complète est dans
[retrait.md](./retrait.md) ; ce document décrit son fonctionnement. Objectifs
de latence/erreur et scripts de charge : [slo.md](./slo.md).

## Frontière du module

| Emplacement                                                                                      | Contenu                                                                                           |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | --- | ------------------------- | -------------------------------------------- |
| `src/lib/commerce/`                                                                              | gardes panier / checkout, session Stripe (`checkout.ts`), chemins, panier invité (`guestCart.ts`) |
| `src/lib/prisma/order/` et `src/lib/prisma/transaction/`                                         | DAO Prisma                                                                                        |
| `src/lib/store/Data/cartStore.ts` + `cartSync.ts`                                                | panier client                                                                                     |
| `src/routes/api/save-cart/`                                                                      | persistance panier                                                                                |
| `src/routes/checkout/`                                                                           | tunnel + succès                                                                                   |
| `src/routes/api/webhooks/`                                                                       | Stripe `checkout.session.completed`                                                               |
| `src/lib/server/jobs/post-payment.ts`                                                            | facture + Sendcloud, hors du webhook (voir plus bas)                                              |
| `src/routes/api/jobs/post-payment/`                                                              | endpoint appelé par la queue (QStash)                                                             |
| `src/routes/admin/sales/`                                                                        | liste, facture, bordereau (double marqueur ADMIN)                                                 |     | `src/lib/prisma/returns/` | DAO des demandes de retour (`ReturnRequest`) |
| `src/routes/auth/settings/returns/`                                                              | demande de retour côté compte                                                                     |
| `src/routes/admin/returns/`                                                                      | approbation/refus + remboursement Stripe ou crédit compte (double marqueur ADMIN)                 |
| `src/lib/prisma/savedPayments/`, `src/lib/server/stripeCustomer.ts`                              | moyens de paiement enregistrés (DAO + création paresseuse du `Customer` Stripe)                   |
| `src/routes/auth/settings/saved-payments/`                                                       | ajout/suppression/défaut côté compte (Stripe Elements)                                            |
| `src/lib/prisma/giftCards/`                                                                      | DAO cartes cadeaux (solde décroissant)                                                            |
| `src/routes/admin/gift-cards/`, `src/routes/api/gift-cards/validate/`                            | émission/gestion admin, validation côté checkout                                                  |
| `src/lib/sendcloud/returnLabel.ts`                                                               | étiquette de retour Sendcloud (best-effort, posée à l'approbation)                                |
| `src/lib/prisma/transaction/getTransactionByInvoiceAndEmail.ts`, `src/routes/suivi-commande/`    | suivi de commande sans compte (n° facture + email)                                                |
| `src/lib/server/jobs/cartRecovery.ts`, `src/routes/api/jobs/cart-recovery/`                      | relance panier abandonné (scan périodique, voir plus bas)                                         |
| `src/lib/server/jobs/reviewReminder.ts`, `src/routes/api/jobs/review-reminder/`                  | relance avis produit post-livraison (scan périodique, voir plus bas)                              |
| `src/lib/server/jobs/recentlyViewedReminder.ts`, `src/routes/api/jobs/recently-viewed-reminder/` | relance produits consultés jamais achetés, digest (scan périodique, voir plus bas)                |

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

| Module    | Marqueur         | Pourquoi                                                     |
| --------- | ---------------- | ------------------------------------------------------------ |
| Catalogue | `PRODUCT-PLUGIN` | fournit `Product` et le prix à revalider                     |
| Blog      | `BLOG-PLUGIN`    | articles Prisma, hors tunnel                                 |
| Auth      | `AUTH-PLUGIN`    | `locals.user`, adresses, factures compte                     |
| Admin     | `ADMIN-PLUGIN`   | gardes de `/admin/sales`                                     |
| Promo     | `PROMO-PLUGIN`   | champ checkout ; tests dans [docs/promo](../promo/README.md) |
| Sendcloud | `SENDCLOUD`      | options / points relais / étiquettes                         |

Les projets sur-mesure (`Custom`, `no_shipping`) restent de la dette atelier.

## Contrat serveur

- `/api/save-cart` : authentifié, `order.userId` = visiteur, statut `PENDING`.
- Prix des lignes = `Product.price` (ou `ProductVariant.price` si une
  variante est sélectionnée — voir [docs/products](../products/README.md#variantes-produit)),
  jamais le JSON client ni le panier invité.
- Invité : `localStorage` seulement ; fusion au compte à signup / login
  (même `productId` **et** même `variantId` → quantités additionnées,
  plafonnées au stock de la ligne ; deux variantes du même produit ne
  fusionnent jamais entre elles).
- `?/checkout` : même propriétaire ; un `shippingCost` Sendcloud entre 0 et
  200 € est accepté pour créer la session Stripe. Un code promo et une carte
  cadeau (`giftCardCode`) se cumulent : la carte s'applique sur ce qu'il
  reste à payer une fois la remise promo déduite (voir « Cartes cadeaux »
  plus bas).
- Webhook : sous verrou (`stripe:checkout:<session id>`, `src/lib/server/lock.ts`)
  pour tolérer une double livraison Stripe, crée la `Transaction`, décrémente
  le stock vendu (`Product.stock` ou `ProductVariant.stock` si une variante
  est sélectionnée, écriture atomique `decrement`) et passe l'`Order` en
  `PAID`. Facture et Sendcloud partent ensuite chacun dans leur propre job
  asynchrone (voir ci-dessous), pas dans la requête webhook. Un nouveau
  panier PENDING peut naître ensuite (c'est voulu). Pas de réservation de
  stock avant paiement : une vente concurrente sur le dernier exemplaire peut
  faire passer le stock sous 0.

## Jobs post-paiement (facture, Sendcloud)

Une fois la `Transaction` écrite, le webhook enfile `enqueueInvoiceEmailJob`
et `enqueuePostPaymentJob` (`src/lib/server/qstash.ts`) en parallèle, au lieu
d'appeler directement l'e-mail de facture et Sendcloud : un appel Sendcloud
lent ne doit jamais faire traîner la réponse au webhook Stripe, au risque
d'un timeout perçu côté Stripe (et donc d'une relivraison) — et un pic
d'envois SMTP (ses propres limites de débit) ne doit pas être couplé à la
disponibilité de Sendcloud, ni l'inverse : ce sont deux files indépendantes,
chacune avec son propre retry QStash.

- **QStash configuré** (`QSTASH_TOKEN` + une URL publique — `APP_URL`, ou à
  défaut `VERCEL_URL` fourni par Vercel) : chaque job est publié vers sa
  route (`/api/jobs/invoice-email`, `/api/jobs/post-payment`), dont la
  signature est vérifiée (`QSTASH_CURRENT_SIGNING_KEY` /
  `QSTASH_NEXT_SIGNING_KEY`) ; QStash gère les retries en cas d'échec.
- **QStash absent** (dev local, ou `.env.test`) : `runInvoiceEmailJob` et
  `runPostPaymentJob` s'exécutent directement, en synchrone, dans la requête
  webhook — mêmes effets, sans file d'attente.

`runInvoiceEmailJob` (`src/lib/server/jobs/invoice-email.ts`) tourne sous
verrou (`invoice-email:<transaction id>`). `runPostPaymentJob`
(`src/lib/server/jobs/post-payment.ts`) tourne sous verrou
(`post-payment:<transaction id>`) et ne rappelle jamais Sendcloud si
`sendcloudOrderCreatedAt` / `sendcloudParcelId` sont déjà posés : une
commande ou une étiquette Sendcloud a un coût réel, un retry ne doit jamais
en recréer une seconde.

L'écriture de ces deux marqueurs suit toujours un appel réseau Sendcloud
déjà réussi : un simple timeout DB à cet instant précis ne doit pas se
traduire par un retry QStash qui referait l'appel réseau. `persistSendcloudMarker`
(`$lib/server/sendcloud-marker.ts`) retente l'écriture (3 tentatives, léger
backoff) ; si elle échoue quand même, le job s'arrête sans relancer
(`SendcloudMarkerPersistError`, journalisé en `ERROR` + Sentry
`deadLetter: 'sendcloud-marker'`) plutôt que de laisser QStash retenter et
recréer la commande/étiquette.

### Résilience Sendcloud (disjoncteur + dead-letter)

Les appels `createSendcloudOrder`/`createSendcloudLabel` passent par
`withCircuitBreaker('sendcloud', …)` (`$lib/server/circuit-breaker.ts`) : au
5e échec en moins de 2 minutes, le disjoncteur s'ouvre et court-circuite les
appels Sendcloud pendant 60s (sans requête réseau), pour ne pas marteler un
fournisseur déjà en difficulté à chaque retry QStash.

En parallèle, `recordJobAttempt` (`$lib/server/job-attempts.ts`) compte les
échecs pour **cette transaction précise** (clé `sendcloud:<transaction id>`,
TTL 24h) : après 5 tentatives infructueuses, le job arrête de relancer
l'erreur (donc QStash arrête de retenter) et journalise en `ERROR` + Sentry
(`tags: { deadLetter: 'sendcloud' }`) pour investigation manuelle — la
transaction reste identifiable en base (`sendcloudOrderCreatedAt`/
`sendcloudParcelId` toujours absents) pour un retraitement ultérieur.

**Création d'étiquette : API v3.** `createSendcloudLabel`
(`src/lib/sendcloud/label.ts`) appelle `POST /api/v3/shipments/announce` —
migré depuis l'API v2 (`/api/v2/parcels`), que Sendcloud a placée en mode
maintenance en avril 2026. `Transaction.shippingOption` porte déjà le
`shipping_option_code` v3 choisi par le client au checkout (posé tel quel
depuis `/api/sendcloud/shipping-options`) : aucun second appel réseau pour le
résoudre, contrairement à l'ancien code v2 qui interrogeait
`GET /api/v2/shipping_methods` avec une correspondance approximative par
sous-chaîne de nom de transporteur. `from_address` (l'adresse de la boutique,
mêmes variables d'environnement que l'étiquette de retour ci-dessous) est
obligatoire sur cet endpoint — absent de la documentation Sendcloud consultée,
découvert en conditions réelles (réponse `{"source":{"pointer":"/from_address"}}`).

Chaque échec **lève désormais une exception** (avant la migration : un
`console.error` suivi d'un `return` silencieux) — c'était un bug de
production réel : le disjoncteur/dead-letter décrits ci-dessus ne protégeait
jamais la création d'étiquette, une transaction payée pouvait rester sans
étiquette pour toujours, sans la moindre alerte. Sendcloud autorise 100
requêtes/min (rafale 15/s) sur les méthodes d'écriture ; cette app appelle
Sendcloud au plus deux fois par transaction payée (commande + étiquette), le
disjoncteur et le plafond de tentatives protègent la santé du fournisseur, pas
le débit de l'app elle-même — tailles largement suffisantes.

### Suivi de commande côté client

`/auth/settings/factures/[id]` affiche, au-dessus de la facture, un panneau
« Suivi de commande » (`$lib/components/invoice/OrderTrackingPanel.svelte`) —
statut de paiement (`formatOrderStatus`), méthode d'expédition, et numéro +
lien de suivi transporteur dès que `createSendcloudLabel` les a posés sur la
`Transaction` (`trackingNumber`/`trackingUrl`, voir résilience Sendcloud
ci-dessus). Pas de nouvel appel Sendcloud : lecture seule des champs déjà
écrits par le job post-paiement. Tant que l'étiquette n'est pas encore créée,
le panneau l'indique plutôt que de laisser un vide.

### Suivi de commande sans compte

`/suivi-commande` réutilise le même `OrderTrackingPanel` pour un visiteur
sans session : formulaire numéro de facture + email, résolu par
`getTransactionByInvoiceAndEmail` (comparaison email insensible à la casse).
Un couple invalide renvoie un message générique unique (« Aucune commande ne
correspond à ces informations. ») sans préciser lequel des deux champs est en
cause — sinon le formulaire devient un oracle pour tester des numéros de
facture au hasard. Limité par IP (`guestTrackingLimiter`,
`RefillingTokenBucket` de 8 jetons/30 s, `$lib/server/rate-limit.ts`) pour la
même raison : sans compte ni mot de passe à deviner, seul ce débit protège
contre l'énumération. Lien affiché sur `/checkout/success`.

### Webhook Sendcloud entrant (statut transporteur)

`POST /api/webhooks/sendcloud` (`src/routes/api/webhooks/sendcloud/+server.ts`)
reçoit les évènements `parcel_status_changed` de Sendcloud — le pendant
entrant du flux ci-dessus, qui ne fait que créer commande + étiquette.
Signature HMAC-SHA256 vérifiée sur le corps brut (header
`Sendcloud-Signature`, secret `SENDCLOUD_WEBHOOK_SECRET`, à renseigner dans
les réglages de l'intégration Sendcloud) via
`$lib/sendcloud/webhookSignature.ts` ; une signature absente ou invalide
renvoie 401. Les autres actions (`integration_connected`, `return_created`,
…) sont acquittées (200) sans traitement.

La transaction concernée est retrouvée par `sendcloudParcelId` (posé par
`createSendcloudLabel`, jamais par parsing de `order_number`). Le statut brut
Sendcloud (`parcel.status.id`/`.message`) est stocké tel quel
(`shippingStatusCode`/`shippingStatusMessage`/`shippingStatusUpdatedAt`) et
affiché verbatim par `OrderTrackingPanel` — volontairement jamais interprété
côté code, faute de mapping numérique fiable et documenté par Sendcloud.
Seul effet applicatif : la commande passe de `PAID` à `SHIPPED` au premier
webhook reçu (jamais de rétrogradation), `OrderStatus` n'ayant pas de
granularité plus fine. Toujours répondu 200 une fois la signature validée,
même si la transaction est introuvable : un code d'erreur ferait retenter
Sendcloud (jusqu'à 10 fois) un évènement de toute façon non actionnable.

Aucun changement nécessaire ici lors de la migration v3 de la création
d'étiquette (ci-dessus) : Sendcloud documente explicitement que les webhooks
sont identiques entre v2 et v3 (même forme d'évènement, même façon de les
signer) — confirmé, `parcel.id` reste la clé de rapprochement quelle que soit
l'API utilisée pour créer l'étiquette.

### Tests Sendcloud réels (gratuits)

Sendcloud ne propose **aucun environnement de bac à sable** : une seule paire
de clés (`SENDCLOUD_PUBLIC_KEY`/`SENDCLOUD_SECRET_KEY`), pas de distinction
test/prod. Deux mécanismes documentés par Sendcloud permettent malgré tout de
vérifier le comportement réel sans jamais rien facturer :

- **« Lettre non affranchie »** (`shipping_option_code: 'sendcloud:letter'`) :
  crée un **vrai** enregistrement dans le compte Sendcloud réel (visible dans
  le tableau de bord), mais jamais facturé. Utilisé pour vérifier une vraie
  création d'étiquette de bout en bout. **Ne fonctionne pas pour un retour**
  (`is_return: true`), refusé par Sendcloud pour ce compte — confirmé en
  conditions réelles.
- **`POST /api/v3/returns/validate`** : dry-run documenté par Sendcloud —
  vérifie qu'une adresse/un payload de retour serait accepté, sans jamais
  créer le retour ni le transmettre à un transporteur. Aucun coût, aucune
  trace dans le tableau de bord.

| Fichier                                          | Ce qu'il prouve                                                                                                       |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `src/lib/sendcloud/label.test.ts`                | Forme du payload v3 (mocké), chaque échec lève une exception, la bonne donnée est écrite en base sur succès.          |
| `src/lib/sendcloud/label.live.test.ts`           | Le vrai `createSendcloudLabel` (réseau réel, DB mockée) obtient un vrai `parcelId`/`trackingNumber` de Sendcloud.     |
| `src/lib/sendcloud/returnValidate.ts`/`.test.ts` | Le payload d'adresse retour (mêmes variables d'env que `returnLabel.ts`) est bien formé, sans jamais créer de retour. |
| `e2e/live/sendcloud-label.spec.ts`               | Boucle complète : vraie création d'étiquette → vrai webhook signé → `Order` `PAID` → `SHIPPED`.                       |

Ces tests sont gated par `hasLiveSendcloud()`/`isDummySecret()` (mêmes clés
que la production, dans `.env`/`.env.test`) : `describe.skipIf`/`test.skip`
passent instantanément sans clés réelles configurées, jamais bloquant en CI.

⚠️ **Constat en date du 2026-09-17** : le compte Sendcloud réel de ce projet
est actuellement **suspendu pour suspicion de fraude**
(`403 account_on_hold`, « Please contact the Sendcloud support desk ») sur
l'endpoint de création d'étiquette (`shipments/announce`) — vraisemblablement
déclenché par la rafale de créations réelles effectuées pendant cette session
de test. `returns/validate` (dry-run, aucun enregistrement créé) continue de
fonctionner normalement, ce qui confirme que le blocage porte spécifiquement
sur la création d'enregistrements, pas sur l'API dans son ensemble.
`label.live.test.ts` et `e2e/live/sendcloud-label.spec.ts` échouent donc
actuellement à cette étape précise (pas un bug de code — le payload passe la
validation Sendcloud sans erreur de champ) : **contacter le support Sendcloud
pour lever la suspension avant la mise en production**, puis rejouer ces deux
tests pour confirmer une vraie création réussie.

**Checklist avant mise en production :**

- [ ] Suspension du compte levée par le support Sendcloud (ci-dessus) ; rejouer
      `label.live.test.ts` et `e2e/live/sendcloud-label.spec.ts`.
- [ ] Capacité de retour activée côté panneau/contrat Sendcloud (voir
      « Étiquette de retour Sendcloud » plus bas) — sans ça, aucun retour ne
      peut fonctionner, v2 ou v3.
- [ ] Aucune configuration panel manuelle requise pour la signature webhook :
      confirmé — ce compte (intégration `system: "api"`) signe déjà avec
      `SENDCLOUD_SECRET_KEY`, déjà présent en production.
- [ ] Lancer une fois `GET /api/v2/parcel-statuses` (ou l'équivalent v3) contre
      le vrai compte et documenter la table des codes obtenue ici — le code
      n'interprète aujourd'hui jamais `shippingStatusCode` numériquement
      (affiché verbatim, voir webhook entrant ci-dessus), ce trou de
      documentation reste à combler.
- [ ] Après quelques exécutions des tests réels ci-dessus, une accumulation
      d'étiquettes « lettre non affranchie » de test est normale dans le
      tableau de bord Sendcloud (gratuit, cosmétique) — nettoyage manuel
      optionnel, aucune action API requise.
- [ ] `SENDCLOUD_SENDER_ADDRESS_ID` est devenu inutile depuis la migration v3
      (plus aucun appel ne le consomme) — retirer ses dernières références ou
      le documenter explicitement comme vestige.

### Débit SMTP sous rafale (facture)

`runInvoiceEmailJob` (`$lib/server/jobs/invoice-email.ts`) consomme un jeton
d'un `RefillingTokenBucket` global (`smtp-send`, 5 en rafale, 1/s en
soutenu — donc environ 60 e-mails/min max) avant d'appeler `sendInvoiceEmail`.
Volontairement conservateur : à ajuster selon le plan SMTP souscrit (Brevo)
si un pic de commandes légitime le sature en usage normal.

Un rejet lève une exception plutôt que d'attendre : le job ne doit jamais
traîner, QStash retente déjà ce job précis avec son propre backoff
(`/api/jobs/invoice-email`), indépendamment du job Sendcloud. Chaque rejet
incrémente le compteur `smtp.throttled` (visible sur `/admin/metrics`) et,
au-delà de 30 rejets en 5 minutes, déclenche une alerte Sentry via
`reportIfRepeated` (voir [../admin/README.md](../admin/README.md#alerting)).

Côté webhook (`src/routes/api/webhooks/+server.ts`), l'enfilage des deux jobs
(facture + Sendcloud) utilise `Promise.allSettled`, pas `Promise.all` : la
transaction est déjà commitée en base à ce stade, un rejet (repli direct sans
QStash en dev, ou débit SMTP atteint) ne doit jamais faire échouer la réponse
200 au webhook Stripe — chaque job géré par QStash a de toute façon son
propre retry, découplé de la session Stripe d'origine.

## Retours / SAV

Module activable depuis `/admin/settings` (`StoreSettings.returnsEnabled`, voir
[docs/admin](../admin/README.md#modules-e-commerce-optionnels---adminsettings)).
Une commande payée (`Transaction`) peut faire l'objet d'une seule demande de
retour (`ReturnRequest`, `transactionId` unique) : le compte la crée depuis
`/auth/settings/returns` (liste ses factures) puis
`/auth/settings/returns/[transactionId]` (motif libre). Ces deux routes
répondent 404 si le module est désactivé, comme les autres modules optionnels.

Côté admin, `/admin/returns` liste les demandes (page dédiée, pas le
composant `Table.svelte` générique — son dialogue de confirmation est câblé
pour une suppression, pas pour approuver/refuser) :

- **Refuser** : passe `status` à `REJECTED`, aucun appel Stripe.
- **Approuver + rembourser** : émet un remboursement Stripe **intégral et
  immédiat**. `Transaction.stripePaymentId` est l'id de la Checkout Session
  (pas du PaymentIntent) : il faut d'abord la relire
  (`stripe.checkout.sessions.retrieve(id, { expand: ['payment_intent'] })`)
  pour obtenir le PaymentIntent avant `stripe.refunds.create`. Le statut passe
  à `REFUNDED` et `stripeRefundId` est conservé.
- **Créditer le compte** (`?/creditStore`, alternative au remboursement) :
  n'appelle jamais Stripe — évite les frais de transaction sur un retour et
  incite au rachat. Émet une `GiftCard` (`createGiftCard`, même génération de
  code que l'admin cartes cadeaux) pour le montant intégral de la
  transaction, associée au compte par `recipientEmail`, puis envoie le code
  par e-mail. Le statut passe à `CREDITED` et `ReturnRequest.giftCardId`
  conserve l'id de la carte émise (pas de relation formelle, même découplage
  que `stripeRefundId`/`PromoCode` ailleurs dans le schéma). N'apparaît que
  si `StoreSettings.giftCardsEnabled` est actif — ce chemin s'appuie
  entièrement sur le module cartes cadeaux, il n'a pas son propre
  interrupteur.

Pas de remboursement partiel, pas de ré-expédition/échange : uniquement un
remboursement complet (Stripe ou crédit compte) vers le moyen choisi par
l'admin.

### Étiquette de retour Sendcloud

À l'approbation — Stripe ou crédit compte, les deux traitements appellent la
même fonction — `createSendcloudReturnLabel`
(`src/lib/sendcloud/returnLabel.ts`) génère une étiquette retour (`is_return:
true`, destination = l'adresse de la boutique plutôt que celle du client —
inverse de l'étiquette d'envoi) et pose `returnTrackingNumber`/
`returnTrackingUrl` sur le `ReturnRequest`. Appel **best-effort** : encadré
dans un `try/catch` séparé de l'appel Stripe, un échec Sendcloud ne bloque
jamais le remboursement déjà effectué — seulement une entrée `WARN` dans les
logs. Le compte voit le numéro de suivi sur
`/auth/settings/returns/[transactionId]` dès qu'il est posé, avec un message
d'attente sinon.

Reste sur l'API **v2** (`is_return: true`) — non migré vers v3 dans ce lot :
contrairement à l'envoi aller, aucun `shipping_option_code` n'est choisi par
le client pour un retour, c'est une décision commerciale (quel
transporteur/option de retour ?) qui ne se devine pas dans le code (voir
questions ouvertes plus bas).

⚠️ **Capacité de retour non configurée côté compte Sendcloud, confirmé en
conditions réelles.** `src/lib/sendcloud/returnValidate.ts` (dry-run
`POST /api/v3/returns/validate`, voir « Tests Sendcloud réels » ci-dessus)
confirme que l'adresse construite par `returnLabel.ts` est bien formée
(aucune erreur de champ sur `from_address`/`to_address`), **mais** aucun code
transporteur testé — ni l'option gratuite « lettre non affranchie » (de
toute façon refusée pour un retour), ni un vrai transporteur comme
`colissimo:home/fr` — n'a été accepté : Sendcloud répond systématiquement
« No shipping methods for given parameters ». Ce n'est pas un bug de payload,
mais une capacité de retour qui semble ne jamais avoir été activée au niveau
du compte/contrat transporteur : **à vérifier et activer côté panneau
Sendcloud avant qu'un retour (v2 ou v3) puisse fonctionner en production**,
indépendamment de la suspension pour fraude mentionnée ci-dessus.

## Détection de fraude

Module activable depuis `/admin/settings` (`StoreSettings.fraudDetectionEnabled`,
voir [docs/admin](../admin/README.md#modules-e-commerce-optionnels---adminsettings)) —
calcule un score de risque à chaque tentative de checkout, avant toute
création de session Stripe.

**Choix « avant paiement » plutôt que capture Stripe différée.** Stripe
capture automatiquement dès le paiement aujourd'hui (`payment_intent_data` ne
porte que `metadata`, aucun `capture_method` nulle part dans ce projet). Un
blocage « avant capture » aurait supposé de passer tout le tunnel en capture
manuelle — nouveau webhook `payment_intent.requires_capture`, actions admin
capturer/annuler, gestion de l'expiration Stripe à 7 jours, impact sur
_toutes_ les commandes puisque le mode de capture est global à l'intégration.
À la place, `computeFraudScore` (`$lib/server/fraud.ts`) est appelé dans
l'action `checkout` (`src/routes/checkout/+page.server.ts`), juste avant
`createCheckoutSession` : si le score dépasse le seuil, aucune session
Stripe n'est jamais ouverte. Zéro nouveau flux Stripe, zéro risque sur le
tunnel de paiement existant.

**Trois facteurs, poids fixes** (constantes nommées en tête de
`$lib/server/fraud.ts`, pas de seuils configurables en admin — même
convention que `ABANDONED_ORDER_DAYS`/`REVIEW_REMINDER_DELAY_DAYS` ailleurs
dans ce projet) :

| Facteur                             | Condition                                                                                            | Poids |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- | ----- |
| Vélocité de commandes               | ≥ 3 `Transaction` payées sur les dernières 24h pour ce compte                                        | +40   |
| Écart adresse facturation/livraison | Adresses différentes, pays différent                                                                 | +30   |
| Écart adresse facturation/livraison | Adresses différentes, même pays mais ville/code postal différent                                     | +15   |
| E-mail jetable                      | Domaine dans `$lib/server/fraud/disposableEmailDomains.ts` (liste statique, à enrichir manuellement) | +30   |

Score plafonné à 100. Bandes : `< 30` → Faible, `30-59` → Moyen, `≥ 60` →
Élevé. La vélocité compte les `Transaction` (commandes réellement payées),
jamais les `Order` `PENDING` — un panier créé en continu par une navigation
normale serait un signal bruité.

**Blocage** (`StoreSettings.fraudBlockingEnabled`, n'a d'effet que si
`fraudDetectionEnabled` est aussi actif) : une commande au niveau Élevé
n'atteint jamais Stripe — `error(403, …)` avec un message générique, jamais
le détail des facteurs déclenchés (même logique anti-oracle que
`guestTrackingLimiter`). La tentative est journalisée dans `FraudBlock`
(compte, commande, score, facteurs) et listée sur `/admin/fraud` : sans
cette page, un client légitime bloqué par erreur serait invisible pour le
support.

Le score (et son détail) est aussi posé sur `Order.riskScore`/`riskLevel`/
`riskFactors` à chaque tentative — qu'elle aboutisse ou non — puis recopié
sur `Transaction` par le webhook Stripe au moment du paiement (même pattern
que les adresses aplaties, `src/routes/api/webhooks/+server.ts`), affiché
dans la colonne « Risque » de `/admin/sales` (badge coloré : rouge = Élevé,
contour = Moyen, gris = Faible).

## Cartes cadeaux

Module activable depuis `/admin/settings` (`StoreSettings.giftCardsEnabled`,
voir [docs/admin](../admin/README.md#modules-e-commerce-optionnels---adminsettings)).
Solde décroissant (`GiftCard`, `src/lib/prisma/giftCards/giftCards.ts`),
émis uniquement depuis l'admin (`/admin/gift-cards/create` — code généré,
format `GIFT-XXXX-XXXX-XXXX`, jamais choisi par l'admin ni le client) : pas
de vente en ligne de carte cadeau, seulement leur utilisation au checkout.

Un code se cumule avec un éventuel code promo (`PromoCodeInput`,
[docs/promo](../promo/README.md)) : au checkout, le serveur calcule d'abord
la remise promo, puis plafonne le montant de la carte cadeau par ce qu'il
reste à payer (`validateGiftCard(code, productTotalTTC - promoDiscount)`) —
jamais l'un sans l'autre, jamais un montant envoyé par le client. Le solde
est décrémenté **au même moment que `PromoCode.usageCount`** : dans le
webhook `checkout.session.completed`, après confirmation du paiement (comme
le stock produit) — une session Stripe abandonnée ou un paiement refusé ne
coûte donc plus rien au client. `Order.promoCode`/`giftCardCode`/
`giftCardAmount` sont écrits dès la création de la session (`createCheckoutSession`)
et relus par le webhook pour appliquer le débit réel.

Édition admin (`/admin/gift-cards/[id]`) : statut, destinataire, note,
expiration. La valeur d'émission et le solde ne se modifient jamais par ce
formulaire — un ajustement de solde (SAV, remboursement partiel) passe par un
formulaire séparé et explicite, pour ne jamais mélanger metadata et argent
dans le même geste.

## Moyens de paiement enregistrés

Module activable depuis `/admin/settings` (`StoreSettings.savedPaymentsEnabled`).
Un compte peut enregistrer plusieurs cartes (`SavedPaymentMethod`) depuis
`/auth/settings/saved-payments`, via Stripe Elements + un `SetupIntent`
(`POST /auth/settings/saved-payments/setup-intent`) — jamais de numéro de
carte qui transite par le serveur applicatif, uniquement l'id de
`PaymentMethod` renvoyé par Stripe après confirmation côté client.

`User.stripeCustomerId` est créé **paresseusement** (`ensureStripeCustomer`,
`$lib/server/stripeCustomer.ts`) : à l'ajout de la première carte, jamais au
signup ni au premier passage en caisse. Au checkout suivant, si le compte a
déjà un `stripeCustomerId`, il est passé à `stripe.checkout.sessions.create`
(`customer`) pour que Stripe propose les cartes déjà enregistrées — sans
changement pour un compte qui n'en a aucune.

Supprimer une carte détache le `PaymentMethod` côté Stripe (best-effort : un
`PaymentMethod` déjà détaché ailleurs ne bloque pas la suppression locale) et
efface la ligne locale. Une seule carte par défaut à la fois.

## Relance panier abandonné

Module activable depuis `/admin/settings` (`StoreSettings.cartRecoveryEnabled`).
Contrairement aux autres modules de cette page, ce n'est pas une route ou un
champ qui apparaît/disparaît : c'est un scan périodique
(`$lib/server/jobs/cartRecovery.ts`, `runCartRecoveryJob`) qui détecte les
`Order` `PENDING` non finalisées et envoie un e-mail de relance avec un code
promo à usage unique, généré via le moteur de codes promo existant
(`createPromoCode`-like, `type: PERCENTAGE`, `usageLimit: 1`, expire après 7
jours).

Deux paliers indépendants, chacun avec son propre horodatage d'envoi
(`Order.cartReminder1SentAt`/`cartReminder2SentAt`) pour ne jamais relancer
deux fois le même palier sur la même commande : le filtre porte sur
`updatedAt`, pas `createdAt`, comme la purge des paniers abandonnés
(`cleanup.ts`) — un panier alimenté récemment n'est jamais relancé même s'il
est ancien.

| Palier | Délai depuis le dernier changement | Remise |
| ------ | ---------------------------------- | ------ |
| 1      | 1h                                 | 10 %   |
| 2      | 24h                                | 15 %   |

Les deux paliers restent largement dans la fenêtre des 30 jours avant purge
définitive de la commande (`ABANDONED_ORDER_DAYS`, `cleanup.ts`) : la relance
ne court jamais après une commande déjà supprimée.

Ce scan est **déclenché**, pas événementiel : contrairement à la fidélité ou
la facture (enfilées depuis le webhook Stripe), personne n'appelle ce job
après une action utilisateur. Il est planifié comme la purge
(`$lib/server/jobs/cleanup.ts`) : QStash Schedule
(`scripts/register-cart-recovery-schedule.mjs`, toutes les 30 minutes) ou
repli Vercel Cron (`vercel.json` → `/api/jobs/cart-recovery`), même route
double-auth (signature QStash ou `Authorization: Bearer $CRON_SECRET`) que
`/api/jobs/cleanup`. `StoreSettings.cartRecoveryEnabled` est vérifié dans le
job lui-même (pas par un appelant) : rien d'autre ne garde ce flag en amont.

Le lien de reprise pointe vers `/checkout` : le panier `PENDING` du compte
est déjà réattaché automatiquement à chaque requête
(`findPendingOrder`/`pendingOrderHandle`, voir plus haut), pas besoin d'un
token ou d'un lien spécial.

## Relance avis produit post-livraison

Module activable depuis `/admin/settings` (`StoreSettings.reviewReminderEnabled`).
Même mécanique que la relance panier ci-dessus : un scan périodique
(`$lib/server/jobs/reviewReminder.ts`, `runReviewReminderJob`), pas un job
déclenché par une action utilisateur. Il détecte les `Order` `SHIPPED` dont
`updatedAt` date de plus de 7 jours (`REVIEW_REMINDER_DELAY_DAYS`) et envoie
un e-mail « notez votre achat » avec un lien direct vers le formulaire
d'avis (`/products/[slug]#reviews`) de chaque produit commandé.

`OrderStatusHistory` n'est peuplé qu'en seed, jamais en production : la date
de passage en `SHIPPED` n'est donc pas tracée explicitement. Le webhook
Sendcloud (`src/routes/api/webhooks/sendcloud/+server.ts`) ne fait passer une
commande de `PAID` à `SHIPPED` qu'une seule fois, si bien que `Order.updatedAt`
reste figé à cette date tant que rien d'autre ne modifie la commande — même
astuce que la relance panier avec les commandes `PENDING`.

Un seul rappel par commande (`Order.reviewReminderSentAt`), jamais
réinitialisé — contrairement aux deux paliers de la relance panier.
Planifié quotidiennement : QStash Schedule
(`scripts/register-review-reminder-schedule.mjs`) ou repli Vercel Cron
(`vercel.json` → `/api/jobs/review-reminder`), même route double-auth que
`/api/jobs/cart-recovery`. `StoreSettings.reviewReminderEnabled` est vérifié
dans le job lui-même, comme `cartRecoveryEnabled`.

## Relance produits consultés, jamais achetés

Module activable depuis `/admin/settings`
(`StoreSettings.recentlyViewedReminderEnabled`) — voir
[docs/products](../products/README.md#récemment-consultés) pour la
distinction avec l'historique vitrine « Récemment consultés »
(`localStorage`, inchangé, fonctionne aussi pour un visiteur anonyme). Ce
module ne couvre que les comptes connectés : `ProductView`
(`$lib/prisma/products/productViews.ts`, posée depuis le `load()` de
`/products/[slug]`) n'existe que pour un visiteur identifié — aucun suivi
anonyme dans ce projet (même contrainte que le panier invité).

Même mécanique que les deux relances ci-dessus : scan périodique
(`$lib/server/jobs/recentlyViewedReminder.ts`, `runRecentlyViewedReminderJob`),
détecte les `ProductView` de plus de 24h sans relance déjà envoyée
(`reminderSentAt: null`), écarte tout produit déjà acheté par ce compte
(`OrderItem`/`Order.status IN (PAID, SHIPPED)`, même filtre que « Souvent
achetés ensemble »), regroupe les candidats par compte et envoie **un seul
e-mail digest** par relance (jusqu'à 5 produits) — contrairement aux deux
relances ci-dessus, qui envoient un e-mail par commande : ici un même compte
peut avoir consulté plusieurs fiches, un digest évite de le submerger.
`reminderSentAt` posé une seule fois par ligne `ProductView`, jamais
réinitialisé.

Planifié quotidiennement : QStash Schedule
(`scripts/register-recently-viewed-reminder-schedule.mjs`) ou repli Vercel
Cron (`vercel.json` → `/api/jobs/recently-viewed-reminder`), même route
double-auth que les deux relances précédentes.

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

| #   | Étape                                 | Geste                        | Preuve                          |
| --- | ------------------------------------- | ---------------------------- | ------------------------------- |
| 1   | Fiche : ajouter au panier             | bouton « Ajouter au panier » | UI panier + `OrderItem` en base |
| 2   | `/api/save-cart` d'une autre commande | POST id d'un autre user      | 403, ligne inchangée            |
| 3   | Prix posté ≠ catalogue                | POST `price: 0.01`           | persisté = `Product.price`      |

### Panier invité — `e2e/commerce/guest.spec.ts`

| #   | Étape                            | Geste                  | Preuve                                 |
| --- | -------------------------------- | ---------------------- | -------------------------------------- |
| 1   | Anonyme : ajouter puis recharger | bouton puis reload     | item encore visible                    |
| 2   | Anonyme puis inscription         | signup après add       | `OrderItem` en base, localStorage vide |
| 3   | Compte + invité (autre produit)  | login après add invité | les deux lignes en base                |

### Checkout — `e2e/commerce/checkout.spec.ts`

| #   | Étape                                 | Geste         | Preuve                             |
| --- | ------------------------------------- | ------------- | ---------------------------------- |
| 1   | Anonyme GET `/checkout`               | navigation    | `/auth/login`                      |
| 2   | CLIENT avec panier                    | `/checkout`   | sélecteur d'adresse                |
| 3   | POST sans adresse / sans être proprio | `?/checkout`  | 400 / 403                          |
| 4   | Paiement simulé                       | helper Prisma | l'order payée n'est plus `PENDING` |

### Webhook Stripe — `e2e/commerce/stripe.spec.ts`

| #   | Étape                        | Geste                                    | Preuve                         |
| --- | ---------------------------- | ---------------------------------------- | ------------------------------ |
| 1   | Signature invalide           | POST `/api/webhooks` HMAC faux           | 400, pas de `Transaction`      |
| 2   | `checkout.session.completed` | POST signé (`STRIPE_WEBHOOK_SECRET` e2e) | `Order` `PAID`, `Transaction`  |
| 3   | Facture compte               | GET `/auth/settings/factures/[id]`       | HTML contient l'id transaction |
| 4   | Facture admin                | GET `/admin/sales/facture/[id]`          | HTML contient l'id             |
| 5   | Bordereau admin              | GET `/admin/sales/bordereau/[id]`        | HTML contient l'id             |

Pas de paiement carte. Sendcloud n'est pas appelé (`PUBLIC_ENV=test`).
`incrementUsage` n'est pas joué : il suit `stripe.checkout.sessions.create`.
`.env.test` ne renseigne pas `QSTASH_TOKEN` : le job post-paiement (facture)
s'exécute directement dans la requête webhook, sans file d'attente.

### Webhook Sendcloud — `e2e/commerce/sendcloud-webhook.spec.ts`

| #   | Étape              | Geste                                       | Preuve                                                                                  |
| --- | ------------------ | ------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | Signature invalide | POST `/api/webhooks/sendcloud`              | 401, `Transaction`/`Order` inchangées                                                   |
| 2   | Signature valide   | POST signé (`SENDCLOUD_WEBHOOK_SECRET` e2e) | 200, `shippingStatusCode`/`Message`/`trackingNumber` à jour, `Order` `PAID` → `SHIPPED` |

`parcelId` fictif (compteur local), pas d'appel réseau Sendcloud — seule la
vérification de signature + l'effet en base sont couverts ici. Une navigation
de chauffe (`page.goto('/')`) précède le premier appel API brut : le premier
compile SSR de ce projet peut dépasser le budget par défaut de
`page.request.post()`.

### Sendcloud réel — `e2e/live/sendcloud.spec.ts`, `e2e/live/sendcloud-label.spec.ts`

Réseau réel, gated par `hasLiveSendcloud()` (`describe.skip`/`test.skip`
instantané sans clés réelles). `sendcloud.spec.ts` couvre devis d'expédition +
points relais + persistance checkout (pas de création d'étiquette :
`PUBLIC_ENV=test` coupe `shouldCallSendcloud()`). `sendcloud-label.spec.ts`
contourne ce blocage volontairement, en appelant Sendcloud directement depuis
le process de test (même contournement que `e2e/support/db.ts`) : vraie
création d'étiquette (« lettre non affranchie ») → vrai webhook signé avec le
`parcelId` réellement renvoyé → `Order` `PAID` → `SHIPPED`. Voir « Tests
Sendcloud réels (gratuits) » plus haut pour l'état actuel de ce test (bloqué
par la suspension du compte pour suspicion de fraude, pas un bug de code).

### Détection de fraude — `e2e/commerce/fraud-detection.spec.ts`

Réel : chaque `?/checkout` posté ci-dessous crée une vraie session Stripe
Checkout (mode test, jamais de capture) — c'est le point d'insertion
critique du blocage, prouvé en conditions réelles plutôt que mocké. `src/lib/server/fraud.test.ts`
(Vitest, Prisma mocké) couvre exhaustivement le calcul du score lui-même
(chaque facteur isolé, cumul, bornes exactes des bandes) ; ce spec e2e ne
reprouve pas cette arithmétique, il vérifie le câblage réel.

| #   | Étape                                                    | Geste                                            | Preuve                                                       |
| --- | -------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------ |
| 1   | Risque faible                                            | `?/checkout` normal                              | 303 vers Stripe, `Order.riskLevel = low`, aucun `FraudBlock` |
| 2   | Écart d'adresse (pays différent) — détecté, pas bloquant | adresses livraison/facturation FR/DE             | 303 vers Stripe quand même, `riskLevel = medium`, score 30   |
| 3   | Vélocité + e-mail jetable combinés (score 70)            | 3 transactions payées récentes + domaine jetable | `error(403)`, pas de session Stripe, `FraudBlock` créé       |
| 3b  | Visible dans `/admin/fraud`                              | ADMIN consulte la page                           | l'e-mail du compte bloqué apparaît                           |
| 4   | Badge de risque dans `/admin/sales`                      | transaction avec risque simulé                   | badge « Élevé (72) » visible                                 |

Le compte « à risque » (étape 3) navigue dans un contexte navigateur isolé
(`browser.newContext()`), jamais sur le `page` du compte principal : il doit
s'authentifier pour que son propre checkout soit évalué (`locals.user`
requis), sans jamais remplacer la session déjà active côté admin.

### Ventes — `e2e/commerce/sales.spec.ts`

| #   | Étape                               | Geste                     | Preuve        |
| --- | ----------------------------------- | ------------------------- | ------------- |
| 1   | ADMIN voit la transaction           | `/admin/sales`, recherche | cellule email |
| 2   | CLIENT GET `/admin/sales`           | navigation                | `/`           |
| 3   | Facture user : uniquement la sienne | GET facture d'un autre    | 404           |

### Retours / SAV — `e2e/commerce/returns.spec.ts`

Le remboursement Stripe réel (`?/approve`) n'est pas rejouable : les
transactions viennent de `simulatePaidOrder`, sans vraie Checkout Session.
On vérifie que l'échec est géré proprement (`fail(500)`), pas le remboursement.
Le crédit compte (`?/creditStore`), lui, n'appelle jamais Stripe : entièrement
rejouable, y compris l'e-mail avec le code de la carte cadeau émise.

| #   | Étape                                                    | Geste                                       | Preuve                                                   |
| --- | -------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------- |
| 1   | Module désactivé : routes compte fermées                 | GET `/auth/settings/returns[...]`           | 404                                                      |
| 2   | Demande de retour envoyée                                | formulaire motif → Envoyer                  | `ReturnRequest` `REQUESTED`                              |
| 3   | Une seconde demande n'est pas proposée                   | revisite de la page                         | formulaire absent, statut affiché                        |
| 4   | Admin : la demande est visible et refusable              | `/admin/returns` → Refuser → Confirmer      | statut `REJECTED`                                        |
| 5   | Admin : crédit compte au lieu du remboursement           | Créditer le compte → Confirmer              | statut `CREDITED`, `GiftCard` émise, e-mail avec le code |
| 6   | Crédit indisponible si cartes cadeaux désactivées        | bouton absent, `giftCardsEnabled` à `false` | statut inchangé `REQUESTED`                              |
| 7   | Admin : l'approbation échoue proprement sans Stripe réel | Approuver + rembourser → Confirmer          | message d'échec, statut inchangé                         |

Test à part : IDOR — un compte ne peut pas ouvrir la demande d'un autre (404).
Le blocage anonyme/CLIENT de `/admin/returns` est couvert par `ADMIN_PATHS`.

### Moyens de paiement enregistrés — `e2e/commerce/saved-payments.spec.ts`

L'ajout de carte (`?/attach`) passe par un `SetupIntent` Stripe réel : non
rejouable en e2e. Les cartes sont insérées directement en base
(`createSavedPaymentMethod`), comme si `attach` avait déjà réussi.

| #   | Étape                                          | Geste                               | Preuve                              |
| --- | ---------------------------------------------- | ----------------------------------- | ----------------------------------- |
| 1   | Module désactivé : route et SetupIntent fermés | GET / POST                          | 404 / 404                           |
| 2   | Liste : les deux cartes sont affichées         | GET `/auth/settings/saved-payments` | marque + 4 derniers chiffres        |
| 3   | Changement de carte par défaut                 | bouton étoile                       | `isDefault` bascule en base         |
| 4   | Suppression                                    | bouton corbeille                    | carte absente de l'UI et de la base |

Test à part : IDOR — un compte ne peut pas supprimer la carte d'un autre.

### Cartes cadeaux — `e2e/gift-cards/validate.spec.ts`, `e2e/gift-cards/admin.spec.ts`

Stripe n'est pas appelé : `decrementGiftCardBalance` suit la confirmation
du paiement (webhook `checkout.session.completed`), hors de portée de ces
specs (même convention que `incrementUsage` pour les codes promo, vérifié
côté paiement dans `e2e/commerce/stripe.spec.ts`).

| #   | Étape                                                         | Geste                             | Preuve                                               |
| --- | ------------------------------------------------------------- | --------------------------------- | ---------------------------------------------------- |
| 1   | API : acceptée / inconnue / inactive / expirée / épuisée      | POST `/api/gift-cards/validate`   | `valid`/`reason` par cas                             |
| 2   | Montant plafonné par le reste à payer, pas seulement le solde | `maxApplicable` < solde           | `amount === maxApplicable`                           |
| 3   | Désactivée globalement : refusée même avec un code valide     | flag `giftCardsEnabled` à `false` | 404                                                  |
| 4   | Checkout : carte appliquée seule puis cumulée à un code promo | formulaires « Appliquer »         | montant affiché ; carte retirée si le plafond change |

Administration (`admin.spec.ts`) : liste, désactivation, ajustement manuel du
solde (ne touche jamais `initialValue`), suppression, création avec code
généré affiché une seule fois. À part : CLIENT POST `?/deleteGiftCard` — la
carte reste.

### Relance panier abandonné — `e2e/commerce/cart-recovery.spec.ts`

Le job est appelé directement via `POST /api/jobs/cart-recovery` (même
en-tête `CRON_SECRET` que Vercel Cron en repli sans QStash) : c'est un scan
périodique, pas une réaction à une action utilisateur, donc rien à rejouer
côté webhook. `Order.updatedAt` est reculé via une écriture SQL directe
(`backdateOrder`, `@updatedAt` n'est pas surchargeable via un simple
`update()` Prisma) pour simuler l'ancienneté du panier sans attendre.

| #   | Étape                                         | Geste                      | Preuve                                                    |
| --- | --------------------------------------------- | -------------------------- | --------------------------------------------------------- |
| 1   | Module désactivé : aucune relance même à 30h  | flag à `false` + job       | `cartReminder1/2SentAt` restent `null`, aucun e-mail      |
| 2   | Palier 1 (10 %) à 1h30                        | `backdateOrder(1.5)` + job | e-mail avec code `RELANCE-…`, `cartReminder1SentAt` posé  |
| 3   | Rejouer le job tout de suite : pas de doublon | job une seconde fois       | aucun nouvel e-mail                                       |
| 4   | Palier 2 (15 %) à 25h                         | `backdateOrder(25)` + job  | second e-mail, code différent, `cartReminder2SentAt` posé |

### Relance avis produit — `e2e/products/review-reminder.spec.ts`

Même principe que la relance panier : `POST /api/jobs/review-reminder`
(même en-tête `CRON_SECRET`), `Order.updatedAt` reculé via `backdateOrder`
pour simuler une commande `SHIPPED` de plus ou moins de 7 jours.

| #   | Étape                                         | Geste                        | Preuve                                                                   |
| --- | --------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------ |
| 1   | Module désactivé : aucune relance             | flag à `false` + job         | `reviewReminderSentAt` reste `null`, aucun e-mail                        |
| 2   | Trop récente (2 jours)                        | `backdateOrder(24*2)` + job  | pas encore de relance                                                    |
| 3   | 10 jours : relance envoyée                    | `backdateOrder(24*10)` + job | e-mail avec lien `/products/[slug]#reviews`, `reviewReminderSentAt` posé |
| 4   | Rejouer le job tout de suite : pas de doublon | job une seconde fois         | aucun nouvel e-mail                                                      |

### Relance produits consultés — `e2e/products/recently-viewed-reminder.spec.ts`

Même principe : `POST /api/jobs/recently-viewed-reminder` (même en-tête
`CRON_SECRET`), `ProductView.viewedAt` reculé via `createProductView`
(upsert Prisma classique, pas de raw SQL nécessaire — `viewedAt` n'est pas
`@updatedAt`).

| #   | Étape                                         | Geste                                      | Preuve                                                            |
| --- | --------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| 1   | Module désactivé : aucune relance             | flag à `false` + job                       | `reminderSentAt` reste `null`, aucun e-mail                       |
| 2   | Trop récente (2h)                             | `createProductView(viewedAt: -2h)` + job   | pas encore de relance                                             |
| 3   | 48h, jamais achetée : digest envoyé           | `createProductView(viewedAt: -48h)` + job  | e-mail digest avec lien `/products/[slug]`, `reminderSentAt` posé |
| 4   | Rejouer le job tout de suite : pas de doublon | job une seconde fois                       | aucun nouvel e-mail                                               |
| 5   | Produit acheté entre-temps                    | `linkProductToOrder(status: 'PAID')` + job | jamais dans le digest, `reminderSentAt` reste `null`              |

```bash
npm run test:e2e
```
