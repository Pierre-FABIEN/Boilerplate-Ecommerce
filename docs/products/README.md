# Catalogue produits

Vitrine publique et CRUD admin des produits Prisma : fiches, taxonomies, images
Cloudinary. Réservé en écriture au rôle `ADMIN` ; la lecture (`/products`) est
ouverte.

En plus des champs de base (nom, description, prix, stock, images,
taxonomies), `Product` porte trois attributs facultatifs, éditables depuis le
formulaire admin (`/admin/products/create`, `/admin/products/[id]`) : `sku`
(référence interne, unique, jamais utilisée comme clé de recherche),
`compareAtPrice` (prix barré affiché à côté du prix réel — `price` reste le
seul montant facturé, aucune logique de remise n'en découle) et
`flashSaleEndsAt` (date/heure de fin de vente flash). Ce dernier est un module
activable/désactivable depuis `/admin/settings` (`flashSaleEnabled`) : le
champ n'apparaît dans le formulaire produit que si le module est actif, et le
bandeau/badge avec compte à rebours (`FlashSaleCountdown.svelte`) ne
s'affiche sur la vitrine (`/products` et la fiche produit) que si le module
est actif ET que la date est dans le futur — indépendant de `compareAtPrice`
mais généralement combiné avec lui pour le prix barré.

Il est conçu pour être retirable d'un bloc. La procédure complète est dans
[retrait.md](./retrait.md) ; ce document décrit son fonctionnement.

## Taxonomies

Un seul système générique (`Taxonomy`/`TaxonomyValue`/`ProductTaxonomyValue`),
géré en admin, jamais en champ texte libre — évite que « Or »/« or »/« OR »
cohabitent et cassent silencieusement un filtre. Chaque taxonomie (ex.
« Catégorie », « Matière ») définit son `slug` (paramètre d'URL du filtre
catalogue), son `type` (`TEXT`/`COLOR`/`NUMBER`/`BOOLEAN`/`DATE`) et si elle
accepte plusieurs valeurs par produit (`multiple`) :

| CRUD                 | Route                                                       |
| -------------------- | ----------------------------------------------------------- |
| Liste des taxonomies | table « Taxonomies » sur `/admin/products`                  |
| Créer une taxonomie  | `/admin/products/taxonomies/create`                         |
| Éditer une taxonomie | `/admin/products/taxonomies/[id]` (porte aussi ses valeurs) |
| Créer une valeur     | `/admin/products/taxonomies/[id]/values/create`             |
| Éditer une valeur    | `/admin/products/taxonomies/[id]/values/[valueId]`          |

Supprimer une `Taxonomy` supprime en cascade ses `TaxonomyValue` et les
liaisons `ProductTaxonomyValue` correspondantes (`onDelete: Cascade`) : un
produit perd simplement les valeurs de la taxonomie effacée, pas de table à
nettoyer manuellement.

Ce système remplace les anciennes taxonomies dédiées `Category`/`Material`
(tables `categories`/`materials` + `ProductCategory`/`Product.materialId`),
retirées par migration une fois tous les produits reportés sur des
`TaxonomyValue` équivalentes.

## Frontière du module

| Emplacement                                                                                                                                                | Contenu                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/lib/products/`                                                                                                                                        | lecture publique et chemins de tests                                                        |
| `src/lib/prisma/products/`, `src/lib/prisma/taxonomies/`, `src/lib/prisma/reviews/`, `src/lib/prisma/productQuestions/`, `src/lib/prisma/productVariants/` | DAO Prisma                                                                                  |
| `src/lib/store/recentlyViewed.ts`                                                                                                                          | historique « récemment consultés », 100 % client (`localStorage`, aucun backend)            |
| `src/routes/products/`                                                                                                                                     | vitrine (fiche produit inclut avis, questions/réponses et sélecteur de variante)            |
| `src/routes/admin/products/`                                                                                                                               | CRUD back-office (produits, taxonomies, avis, questions, variantes — gardes = module admin) |

Le catalogue a un hook dédié dans `hooks.server.ts` : `catalogAntiScraping`,
qui ne s'applique qu'aux chemins `/products*` (rate-limit dédié + heuristique
`User-Agent`, voir plus bas). En dehors de cela, pas d'autre accroche : le
public est en lecture seule, les mutations passent déjà par `requireAdmin`.
Le point d'accroche, ce sont les routes `/products` et la section admin.

Partout ailleurs, une dépendance au catalogue est signalée par un marqueur
`PRODUCT-PLUGIN`. La liste exhaustive s'obtient ainsi :

```bash
rg "PRODUCT-PLUGIN" src/ prisma/
```

Le catalogue n'est **pas** le tunnel de commande. Panier, checkout, Stripe et
Sendcloud relèvent du module commerce : [docs/commerce](../commerce/README.md).
Le bouton « Ajouter au panier » sur la fiche est un accrochage COMMERCE.

## Vitrine

| Route              | Rôle                                                                 |
| ------------------ | -------------------------------------------------------------------- |
| `/products`        | liste avec sidebar de filtres, tous combinables et pilotés par l'URL |
| `/products/[slug]` | fiche ; 404 si le slug est inconnu                                   |

Les données viennent de Prisma. Contentful n'est plus utilisé pour les produits.

La fiche produit publie un bloc JSON-LD `schema.org/Product` (prix,
disponibilité, SKU, note moyenne — `<SEO type="product" .../>`,
`src/lib/components/SEO.svelte`) dérivé des mêmes valeurs affichées à
l'écran : si une variante est sélectionnée, prix et disponibilité reflètent
la variante, pas le produit de base. `aggregateRating` n'est inclus que si
au moins un avis existe.

### Filtres du catalogue

Tous les filtres de `/products` sont des paramètres d'URL, combinables entre
eux, lus par `src/routes/products/+page.server.ts` et appliqués dans
`listProducts` (`src/lib/products/catalog.ts`) :

| Paramètre           | Filtre                                                                                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<slug-taxonomie>`  | une valeur de la taxonomie ; répétable si `multiple` (`?matiere=Or&matiere=Argent` — OR entre les valeurs), sélection unique sinon — le slug est dynamique (voir `Taxonomy.slug`) |
| `q`                 | recherche texte (`contains` Prisma, nom + description, insensible à la casse)                                                                                                     |
| `prixMin`/`prixMax` | bornes de prix                                                                                                                                                                    |
| `dispo=1`           | en stock uniquement (`stock > 0`)                                                                                                                                                 |
| `tri`               | `pertinence` (défaut) / `prix-asc` / `prix-desc` / `nouveaute`                                                                                                                    |
| `page`              | pagination                                                                                                                                                                        |

`getCatalogFacets` calcule, pour chaque taxonomie, les valeurs disponibles
(avec leur nombre de produits) et les bornes de prix pour la sidebar —
recalculées à partir de la recherche en cours et des filtres des **autres**
taxonomies, mais pas de la taxonomie elle-même : sinon cocher une valeur
ferait disparaître sa propre case. C'est la simplification courante des
vitrines de cette taille, pas un vrai faceted search par filtre croisé.

Chaque combinaison de paramètres fait partie de la clé de cache au même titre
que la page.

Les lectures publiques (`listProducts`, `getProductBySlug`,
`getCatalogFacets`, `getCachedTaxonomiesWithValues` dans
`src/lib/products/catalog.ts`) passent par un cache Redis de 60 s quand
Upstash est configuré (`src/lib/server/cache.ts`), invalidé automatiquement à
chaque écriture des DAO `src/lib/prisma/products` / `src/lib/prisma/taxonomies`
/ `src/lib/prisma/productVariants` (un seul numéro de version pour tout le
catalogue : `bumpCacheVersion('catalog')` — une variante créée/modifiée/supprimée
invalide donc la fiche produit comme un changement de prix classique). Sans
Redis configuré, ces fonctions relisent Prisma à chaque appel, comme avant.

### Avis produit

Un avis (`Review`, `src/lib/prisma/reviews/reviews.ts`) est réservé aux
comptes authentifiés, un seul par produit et par compte — contrainte unique
en base (`@@unique([productId, userId])`), pas seulement un formulaire masqué
côté client : une double soumission concurrente est rejetée proprement
(`AlreadyReviewedError`, code Prisma `P2002`) plutôt que de créer un doublon
ou de planter. La note moyenne (`getReviewSummary`) est une lecture directe,
non passée par le cache du catalogue ci-dessus — volume modeste, fraîcheur
after-submit plus utile ici qu'un TTL de 60 s. Supprimer un compte supprime
ses avis (`onDelete: Cascade`) : ce ne sont pas des écritures comptables à
conserver, contrairement aux `Transaction`.

### Questions & réponses produit

Distinctes des avis : pas de note, et une question (`ProductQuestion`,
`src/lib/prisma/productQuestions/productQuestions.ts`) n'est **jamais**
publique tant qu'un admin n'y a pas répondu — `listPublicQuestionsForProduct`
ne renvoie que les lignes avec `answer` renseigné, il n'existe pas de file
« en attente » visible des visiteurs. Poser une question exige un compte
(`?/askQuestion` sur `/products/[slug]`) ; modérer/répondre se fait depuis
`/admin/products/questions` (liste, delete) et `/admin/products/questions/[id]`
(formulaire de réponse dédié — répondre n'est pas une colonne éditable du
tableau). Module activable depuis `/admin/settings`
(`StoreSettings.productQnaEnabled`, voir
[docs/admin](../admin/README.md#modules-e-commerce-optionnels---adminsettings)) ;
désactivé, la section n'apparaît pas sur la fiche produit et `?/askQuestion`
répond 404. Supprimer un compte supprime ses questions (`onDelete: Cascade`).

### Variantes produit

Une variante (`ProductVariant`, `src/lib/prisma/productVariants/productVariants.ts`)
est une étiquette libre (« Taille 54 », « Or blanc »...) avec son propre stock
et un prix optionnel qui surcharge `Product.price` quand renseigné — pas
d'axes combinatoires (taille × couleur générant un produit cartésien) :
choix délibéré pour rester simple à administrer, une taxonomie plus riche
serait à construire séparément si le besoin apparaît. Un produit sans
variante se comporte exactement comme avant leur introduction : le
sélecteur n'apparaît sur `/products/[slug]` que si `product.variants.length

> 0`, et aucune variante n'est créée implicitement à la création d'un produit.

Gérées depuis une section dédiée, volontairement séparée du formulaire
produit principal (déjà chargé — upload d'images, taxonomies, prix barré) :
liste et création sur `/admin/products/[id]/variants`, édition sur
`/admin/products/[id]/variants/[variantId]`. Une variante déjà présente dans
un `OrderItem` **ne peut pas** être supprimée (`onDelete: Restrict` sur
`OrderItem.variantId`, même garde que pour `Product`).

Le panier distingue deux variantes du même produit comme deux lignes
séparées, jamais fusionnées entre elles (`cartStore.ts`, `guestCart.ts` —
paniers connecté et invité) : stock, prix et quantité maximale sont
plafonnés par variante, pas par produit. Le prix d'une ligne est toujours
revalidé serveur (`updateOrderItems`, `src/lib/prisma/order/prendingOrder.ts`)
contre `ProductVariant.price`, jamais celui envoyé par le client — même
garde que pour `Product.price`. Comme pour un produit sans variante, le
stock de la ligne est décrémenté à la vente (webhook Stripe, voir
[docs/commerce](../commerce/README.md)), jamais réservé avant paiement : une
vente concurrente sur le dernier exemplaire peut faire passer le stock sous 0.

### Récemment consultés

`$lib/store/recentlyViewed.ts` est un historique 100 % client
(`localStorage`, clé `recently-viewed-products`, 8 entrées max) : aucune
route serveur, aucune table Prisma. Chaque visite d'une fiche produit
enregistre un instantané (id/slug/nom/prix/image au moment de la visite) et
affiche les précédentes sous « Récemment consultés » — le prix affiché peut
donc devenir périmé si le produit change de prix depuis, compromis accepté
pour éviter un aller-retour serveur. Toutes les lectures/écritures sont
encadrées d'un `try/catch` (navigation privée, quota dépassé) : une panne de
`localStorage` masque simplement la section, elle ne casse jamais la page.

**Relance e-mail, module séparé et indépendant.** Activable depuis
`/admin/settings` (`StoreSettings.recentlyViewedReminderEnabled`, voir
[docs/admin](../admin/README.md#modules-e-commerce-optionnels---adminsettings)) —
sans rapport avec l'affichage ci-dessus, qui reste inchangé et fonctionne
pour tout visiteur, y compris anonyme. La relance, elle, ne concerne que les
comptes connectés : ce projet n'a aucune identité visiteur anonyme côté
serveur (le panier invité, `$lib/commerce/guestCart.ts`, est lui aussi
délibérément 100 % `localStorage`, fusionné en base seulement à
l'inscription/connexion) — impossible de relancer par e-mail quelqu'un dont
le serveur ne connaît pas encore l'adresse.

Chaque visite d'une fiche produit par un compte connecté pose/actualise une
ligne `ProductView` (`userId`, `productId`, `viewedAt`,
`$lib/prisma/products/productViews.ts`, appelé depuis le `load()` de
`/products/[slug]`, indépendamment du flag). Le job périodique
`$lib/server/jobs/recentlyViewedReminder.ts` (route
`/api/jobs/recently-viewed-reminder`, même double authentification QStash/
`CRON_SECRET` que les autres jobs) sélectionne les consultations d'au moins
24h sans achat depuis (vérifié via `OrderItem`/`Order.status IN (PAID,
SHIPPED)`, même filtre que « Souvent achetés ensemble ») et sans relance déjà
envoyée, puis groupe les candidats par compte et envoie **un seul e-mail
digest** listant jusqu'à 5 produits — jamais un e-mail par produit, pour ne
pas submerger un compte ayant consulté plusieurs fiches. Chaque
`ProductView` n'est relancée qu'une seule fois (`reminderSentAt`, jamais
réinitialisé, même logique que `Order.reviewReminderSentAt`).

### Liste d'envies & ventes croisées

Deux modules activables depuis `/admin/settings` (voir
[docs/admin](../admin/README.md#modules-e-commerce-optionnels---adminsettings)) :

- **Liste d'envies** (`WishlistItem`, `src/lib/prisma/wishlist/wishlist.ts`) —
  un produit par compte au plus une fois. Basculée depuis la fiche produit
  (`POST /api/wishlist`, authentifié) et consultée sur
  `/auth/settings/wishlist`. Les deux routes répondent 404/401 si le module
  est désactivé ou si le compte n'est pas connecté — jamais une page vide qui
  laisserait deviner que la route existe.
- **Ventes croisées** (`getRelatedProducts` dans `catalog.ts`) — jusqu'à 4
  produits partageant une catégorie legacy (`ProductCategory`, non retirée
  tant que la migration B n'est pas passée) avec la fiche consultée, le
  produit courant exclu. Affichées sous « Vous aimerez aussi » sur
  `/products/[slug]` uniquement quand le module est actif et qu'au moins un
  produit correspond.

### Alerte wishlist : baisse de prix / vente flash

Module activable depuis `/admin/settings`
(`StoreSettings.wishlistPriceAlertEnabled`,
[docs/admin](../admin/README.md#modules-e-commerce-optionnels---adminsettings)) :
fait converger Liste d'envies et Vente flash, deux modules déjà en place qui
ne se parlaient pas jusqu'ici, sans introduire de nouveau concept.

`updateProductById` (`src/lib/prisma/products/products.ts`) est le seul point
d'écriture de `Product.price`/`flashSaleEndsAt` dans ce dépôt : dès qu'une
sauvegarde admin fait baisser le prix, ou active une nouvelle vente flash
(nouvelle date de `flashSaleEndsAt`), le job
`$lib/server/jobs/wishlistPriceAlert.ts` est enfilé pour ce produit — même
mécanique event-triggered que les alertes réassort (`stockAlerts.ts`), pas de
scan périodique. Chaque compte ayant le produit dans sa liste d'envies reçoit
alors un e-mail, mais l'idempotence se fait **par valeur**, pas par booléen :
`WishlistItem.lastNotifiedPrice`/`lastNotifiedFlashSaleEndsAt` retiennent la
dernière valeur déjà notifiée pour ce compte (initialisée au prix/à l'état
vente flash du moment de l'ajout, dans `toggleWishlistItem`). Une alerte n'est
donc envoyée que si le prix courant repasse strictement sous cette valeur, ou
si la date de fin de vente flash a changé — un ré-enregistrement identique
(retry QStash, ou sauvegarde admin sans changement réel) ne renvoie jamais
rien, mais une nouvelle baisse ou une nouvelle vente flash redéclenche
normalement une alerte.

L'e-mail part avant le marquage : un échec de `sendMail` ne marque rien (un
futur passage retentera normalement), mais un échec du marquage APRÈS un
envoi réussi (timeout DB) est traité différemment — `persistWishlistNotification`
retente l'écriture 3 fois (backoff `200ms*tentative`, même patron que le
marqueur Sendcloud du job post-paiement), puis abandonne en dead-letter (log
`ERROR` + `Sentry.captureException`) sans faire échouer le reste de la
boucle, plutôt que de laisser silencieusement l'item se refaire notifier au
prochain passage.

### Souvent achetés ensemble

Module activable depuis `/admin/settings`
(`StoreSettings.frequentlyBoughtTogetherEnabled`,
[docs/admin](../admin/README.md#modules-e-commerce-optionnels---adminsettings)) :
suggère, dans le panier, un produit historiquement acheté avec ceux déjà
présents, et applique une petite remise automatique au paiement si ces
produits restent liés dans le panier.

- **Historique de co-achat** (`src/lib/prisma/bundles/bundles.ts`,
  `getFrequentlyBoughtTogether`) — lit directement `OrderItem`, aucune table
  dédiée. Un produit n'est suggéré que s'il a été acheté avec le produit du
  panier dans au moins deux commandes distinctes au statut `PAID` ou
  `SHIPPED` (les commandes en attente ou annulées ne comptent pas).
- **API publique** (`GET /api/bundles?productIds=<csv>`,
  `src/routes/api/bundles/+server.ts`) — répond 404 si le module est
  désactivé. Utilisée par le panier (`Cart.svelte`) pour afficher jusqu'à 3
  suggestions avec un bouton « Ajouter ».
- **Remise automatique** (`computeBundleDiscount`, `BUNDLE_DISCOUNT_PERCENT`
  = 10 %) — recalculée côté serveur au moment du paiement
  (`checkout/+page.server.ts`, action `?/checkout`) à partir du contenu réel
  de la commande, jamais d'une valeur transmise par le client. Elle s'insère
  dans la même chaîne de remises que le code promo, le parrainage et la
  carte cadeau (remise promo → bundle → parrainage → carte cadeau, chacune
  calculée sur le reste après les précédentes). L'aperçu affiché avant
  paiement (`checkout/+page.svelte`) est approximatif ; seul le montant
  recalculé côté serveur est appliqué.

### Anti-scraping

En plus du plafond global par IP (`global-ip`, `hooks.server.ts`), les chemins
`/products*` passent par un second bucket dédié et plus strict
(`catalog-ip`, 40 requêtes par IP avec un ajout de 1 toutes les 2 s —
voir `RefillingTokenBucket`), pensé pour qu'un visiteur qui feuillette des
fiches produit ne le remarque jamais, mais qu'un crawler qui aspire tout le
catalogue en boucle le déclenche vite. S'y ajoute un rejet heuristique des
`User-Agent` de clients HTTP scriptés (curl, wget, bibliothèques
Python/Go/Java, scrapers headless — `$lib/server/anti-scraping.ts`),
volontairement SANS bloquer les crawlers de moteurs de recherche connus
(casserait le référencement). Les deux rejets sont comptabilisés dans
`/admin/metrics` (`anti-scraping.rate-limited`, `anti-scraping.blocked-ua`).
Cette heuristique reste un filet applicatif simple, pas une garantie : un
`User-Agent` se falsifie trivialement.

### Images produits (CDN)

Les images uploadées via l'admin (`cloudinary.uploader.upload`) sont stockées
en base sous forme d'URL Cloudinary complète (`Product.images`), sans
transformation. `$lib/utils/cloudinaryUrl.ts` (`optimizedImageUrl(url,
width?)`) insère `f_auto,q_auto[,w_<width>]` dans l'URL au moment de
l'affichage — Cloudinary sert alors le format le plus compact supporté par le
navigateur (AVIF/WebP) et une largeur adaptée, sans ré-upload ni migration.
Appliqué partout où une image produit est rendue : catalogue (`/products`,
400px), fiche produit (`/products/[slug]`, 800px), panier et récapitulatif
checkout (100px), listing admin (80px). Fonction sans effet si l'URL n'est
pas une URL Cloudinary `/upload/` (donnée de seed/placeholder).

## Admin

`/admin/products` : liste, création, édition, suppression, taxonomies. Accès
couvert par `adminHandle`. Un produit déjà présent dans une `OrderItem` **ne
peut pas** être supprimé (`onDelete: Restrict`). La liste supporte la
sélection multiple et la suppression en lot (voir
[docs/admin](../admin/README.md#actions-groupées)) : un produit du lot déjà
commandé est ignoré plutôt que de faire échouer tout le lot.

`/admin/products/reviews` (modération des avis) et
`/admin/products/questions` (modération + réponse aux questions) sont deux
listes séparées, chacune avec sa propre garde de suppression. Les variantes
d'un produit se gèrent depuis `/admin/products/[id]/variants`, accessible
par un lien sur sa fiche d'édition — volontairement pas un onglet du même
formulaire.

## Ce qui n'est pas le catalogue

L'authentification, le back-office dans son ensemble, le panier et le checkout.
Les `OrderItem` pointent vers `Product` : c'est un couplage commerce, pas une
raison de fusionner les deux modules.

## Tests

Les numéros sont ceux des `test.step`. Changer la procédure ici, puis le spec,
puis le code (`src/lib/products`, `/products`, `/admin/products`). Index :
[../../e2e/README.md](../../e2e/README.md).

### Vitrine — `e2e/products/catalog.spec.ts`

| #   | Étape                          | Geste                  | Preuve                                     |
| --- | ------------------------------ | ---------------------- | ------------------------------------------ |
| 1   | La liste affiche le nom Prisma | GET `/products`        | titres + libellé de la valeur de taxonomie |
| 2   | La fiche s’ouvre par slug      | GET `/products/[slug]` | nom, prix, ligne en base                   |
| 3   | Un slug inconnu renvoie 404    | GET slug absent        | statut 404                                 |
| 4   | Pas d’UI d’édition admin       | HTML de `/products`    | pas de `/admin/products` ni `passwordHash` |

### Admin — `e2e/products/admin.spec.ts`

Création UI Cloudinary **non** jouée (`.env.test` sans upload). Les produits
sont créés en Prisma (`createCatalogProduct`), le reste passe par l'UI.

| #   | Étape                                  | Geste                            | Preuve                          |
| --- | -------------------------------------- | -------------------------------- | ------------------------------- |
| 1   | Liste admin                            | GET `/admin/products`, recherche | ligne du tableau Produits       |
| 2   | Création Prisma visible sur la vitrine | GET `/products`                  | heading + base                  |
| 3   | Édition prix et stock                  | fiche → 9,99 / 7 → Save          | DB + « 9.99 € » / « Stock : 7 » |
| 4   | Suppression sans commande              | dialogue Continue                | produit absent en base          |
| 5   | Produit commandé : suppression refusée | même geste si `OrderItem`        | produit **encore** en base      |

À part : CLIENT POST `?/deleteProduct` — le produit reste.

### Taxonomies — `e2e/products/taxonomies.spec.ts`

| #   | Étape                                 | Geste                         | Preuve                                                  |
| --- | ------------------------------------- | ----------------------------- | ------------------------------------------------------- |
| 1   | Création de la taxonomie              | Save changes                  | ligne du tableau Taxonomies                             |
| 2   | Création d'une valeur                 | Save changes                  | ligne dans le tableau Valeurs de la taxonomie           |
| 3   | Association à un produit              | case cochée → Save changes    | `ProductTaxonomyValue` en base                          |
| 4   | Filtre catalogue par taxonomie        | GET `/products?<slug>=valeur` | produit présent ; valeur inconnue → absent              |
| 5   | Renommage de la valeur                | Save changes                  | valeur mise à jour                                      |
| 6   | Suppression de la taxonomie : cascade | dialogue Continue             | taxonomie et valeur absentes, produit sans cette valeur |

À part : CLIENT POST `?/createTaxonomy` — aucune taxonomie créée.

### Avis produit — `e2e/products/reviews.spec.ts`

| #   | Étape                             | Geste                     | Preuve                        |
| --- | --------------------------------- | ------------------------- | ----------------------------- |
| 1   | Anonyme invité à se connecter     | GET `/products/[slug]`    | pas de formulaire d'avis      |
| 2   | Note et commentaire publiés       | étoiles + commentaire     | `Review` en base, affiché     |
| 3   | Second avis du même compte refusé | POST `?/review` rejoué    | 409, `AlreadyReviewedError`   |
| 4   | Modération admin                  | `/admin/products/reviews` | avis absent après suppression |

À part : CLIENT POST `?/deleteReview` sur l'avis d'un autre — l'avis reste.

### Liste d'envies — `e2e/products/wishlist.spec.ts`

| #   | Étape                                 | Geste                         | Preuve                         |
| --- | ------------------------------------- | ----------------------------- | ------------------------------ |
| 1   | Module désactivé : tout fermé         | GET fiche/page/API            | bouton absent, 404, 404        |
| 2   | Ajout depuis la fiche produit         | clic cœur                     | `WishlistItem` créé            |
| 3   | Liste du compte                       | GET `/auth/settings/wishlist` | carte produit visible          |
| 4   | Retrait depuis la liste               | bouton Retirer                | ligne absente en base          |
| 5   | Ré-ajout puis retrait depuis la fiche | clic cœur × 2                 | libellé revient à « Ajouter… » |

À part : anonyme POST `/api/wishlist` — 401.

### Alerte wishlist : baisse de prix / vente flash — `e2e/products/wishlist-price-alert.spec.ts`

| #   | Étape                                              | Geste                                  | Preuve                                                 |
| --- | -------------------------------------------------- | -------------------------------------- | ------------------------------------------------------ |
| 1   | Ajout à la liste d'envies (baseline)               | clic cœur                              | `WishlistItem.lastNotifiedPrice` = prix courant        |
| 2   | Baisse de prix admin déclenche une alerte          | fiche admin → prix plus bas            | e-mail reçu, `lastNotifiedPrice` mis à jour            |
| 3   | Ré-enregistrer le même prix ne renvoie rien        | Save changes sans changement           | boîte mail vide                                        |
| 4   | Nouvelle baisse redéclenche une alerte             | fiche admin → prix encore plus bas     | e-mail reçu, `lastNotifiedPrice` mis à jour de nouveau |
| 5   | Nouvelle vente flash déclenche une alerte          | fiche admin → `flashSaleEndsAt` future | e-mail reçu, `lastNotifiedFlashSaleEndsAt` renseigné   |
| 6   | Ré-enregistrer la même vente flash ne renvoie rien | Save changes avec la même date         | boîte mail vide                                        |

À part : module désactivé (`wishlistPriceAlertEnabled: false`) — la baisse de
prix admin ne déclenche aucun e-mail, `lastNotifiedPrice` reste inchangé.

### Questions & réponses — `e2e/products/questions.spec.ts`

| #   | Étape                                 | Geste                            | Preuve                                       |
| --- | ------------------------------------- | -------------------------------- | -------------------------------------------- |
| 1   | Module désactivé : section absente    | GET fiche produit                | pas de heading « Questions & réponses »      |
| 2   | Anonyme invité à se connecter         | GET fiche produit                | pas de formulaire `?/askQuestion`            |
| 3   | Question envoyée, pas encore publique | formulaire → Envoyer             | absente de la fiche, message de confirmation |
| 4   | Modération admin : réponse publiée    | `/admin/products/questions/[id]` | réponse visible sur la fiche ensuite         |
| 5   | Modération admin : suppression        | dialogue Continue                | réponse retirée de la fiche                  |

À part : CLIENT POST `?/deleteQuestion` sur la question d'un autre — la question reste.

### Variantes — `e2e/products/variants.spec.ts`

| #   | Étape                                                    | Geste                        | Preuve                                             |
| --- | -------------------------------------------------------- | ---------------------------- | -------------------------------------------------- |
| 1   | Le sélecteur propose les deux variantes                  | GET fiche produit            | options du sélecteur                               |
| 2   | Variante au prix surchargé : affichage mis à jour        | sélection                    | prix et stock affichés changent                    |
| 3   | Ajout au panier : la ligne porte la variante et son prix | bouton « Ajouter au panier » | `OrderItem.variantId` + prix en base               |
| 4   | Le panier affiche la variante distinctement              | GET `/checkout`              | étiquette de variante + prix dans le récapitulatif |

Administration (même spec) : liste des variantes, édition du stock,
suppression d'une variante libre acceptée, suppression d'une variante déjà
commandée refusée (`VariantInUseError`). À part : CLIENT POST
`?/deleteVariant` — la variante reste.

### Actions groupées (admin) — `e2e/products/admin-bulk.spec.ts`

Vérifie la fonctionnalité générique de `Table.svelte` (`selectable`/
`bulkActions`, voir [docs/admin](../admin/README.md#actions-groupées)) sur le
cas d'usage `/admin/products` : sélection multiple, suppression en lot, et un
produit déjà commandé sélectionné dans le lot est ignoré (`skipped`) sans
faire échouer la suppression des autres.

```bash
npm run test:e2e
```
