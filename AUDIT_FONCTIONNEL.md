# Audit fonctionnel — bugs de logique métier

Document distinct d'[AUDIT_TECHNIQUE.md](AUDIT_TECHNIQUE.md) (qui couvre
lint/dépendances/CI/gouvernance). Ici : des bugs de **comportement réel de
l'application**, du même type que celui trouvé et corrigé le 2026-09-28 :

> Le stock produit n'était jamais décrémenté à la vente — le webhook Stripe
> créait bien la `Transaction` et passait la commande en `PAID`, mais aucun
> effet de bord ne touchait `Product.stock`. La feature semblait complète ;
> un morceau critique manquait silencieusement, et c'était même documenté
> comme "voulu" dans deux fichiers avant d'être reconnu comme un vrai gap.

**Méthode** : chaque constat ci-dessous a été lu directement dans le code
(pas seulement grep), et pour la majorité, vérifié en conditions réelles
(requête DB directe, lecture du test e2e qui l'exerce, comparaison avec un
chemin équivalent qui fonctionne correctement). Plusieurs pistes soulevées
en première passe se sont révélées être des faux positifs après vérification
— elles sont listées en fin de document par honnêteté, pas cachées.

---

## 0. Résumé exécutif

| #   | Constat                                                                                                                              | Sévérité | Domaine       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | -------- | ------------- |
| 1   | ✅ Carte cadeau + code promo débités **avant** confirmation du paiement Stripe, erreurs avalées silencieusement (corrigé)            | 🔴       | Commerce      |
| 2   | ✅ Solde de carte cadeau décrémenté sans atomicité (race condition) (corrigé)                                                        | 🔴       | Commerce      |
| 3   | ✅ Admin change mot de passe/2FA d'un compte sans invalider ses sessions actives (corrigé)                                           | 🔴       | Auth/Admin    |
| 4   | ✅ `post-payment.ts` : marqueur d'idempotence Sendcloud posé après l'appel réseau → commande/étiquette dupliquée sur retry (corrigé) | 🔴       | Jobs          |
| 5   | Taux de TVA affiché en dur "5,5 %" alors que le taux réel est configurable                                                           | 🟡       | Transverse    |
| 6   | Approbation de retour : statut vérifié hors verrou → double remboursement Stripe possible                                            | 🟡       | Commerce      |
| 7   | Emails de relance wishlist potentiellement dupliqués (marquage après l'envoi, erreur avalée)                                         | 🟡       | Jobs          |
| 8   | Cartes cadeaux de parrainage potentiellement orphelines/dupliquées                                                                   | 🟡       | Jobs          |
| 9   | Liens relatifs (cassés) dans 5 emails de relance si `APP_URL`/`VERCEL_URL` absent                                                    | 🟡       | Transverse    |
| 10  | Prix barré masqué dès qu'une variante est sélectionnée, même sans surcharge de prix                                                  | 🟡       | Produits      |
| 11  | Boutons de tri actifs sur des colonnes non triables (ventes, fraude, utilisateurs)                                                   | 🔵       | Admin         |
| 12  | Redondance dans le flux 2FA (marquage de session juste avant son invalidation)                                                       | 🔵       | Auth          |
| 13  | Mise à jour d'adresse admin sans vérification d'appartenance (défense en profondeur)                                                 | 🔵       | Auth/Admin    |
| 14  | Test e2e variantes obsolète + donnée de test corrompue trouvée et corrigée pendant l'audit                                           | 🔵       | Qualité tests |

**Déjà corrigé aujourd'hui, avant cet audit** : stock produit/variante non
décrémenté à la vente (webhook Stripe) — voir historique de commit, non
listé ci-dessus.

---

## 1. Commerce / Checkout / Paiement

### 1.1 🔴 ✅ Corrigé — Carte cadeau et code promo consommés avant la confirmation du paiement

> **Corrigé le 2026-09-28** : `incrementUsage`/`decrementGiftCardBalance` sont
> désormais appelés dans `handleCheckoutSession` (webhook), plus dans
> `checkout/+page.server.ts`. Vérifié par `e2e/commerce/stripe.spec.ts`
> (assertions `usageCount`/`balance` après webhook signé).

**Fichier** : [src/routes/checkout/+page.server.ts](src/routes/checkout/+page.server.ts#L282-L296)

```ts
const session = await createCheckoutSession({
	/* ... */
});

if (promoResult.valid && promoResult.promo) {
	try {
		await incrementUsage(promoResult.promo.id);
	} catch (err) {
		console.error('Erreur incrementUsage code promo:', err);
	}
}

if (giftCardResult.valid && giftCardResult.giftCard && appliedGiftCardAmount > 0) {
	try {
		await decrementGiftCardBalance(giftCardResult.giftCard.id, appliedGiftCardAmount);
	} catch (err) {
		console.error('Erreur decrementGiftCardBalance:', err);
	}
}

throw redirect(303, session.url || '/');
```

Le compteur d'usage du code promo et le solde de la carte cadeau sont
modifiés **avant** que le client n'atteigne la page de paiement Stripe, pas
après confirmation (contrairement au stock, désormais décrémenté dans le
webhook `checkout.session.completed`). Si le client ferme l'onglet, annule
sur la page Stripe, ou si le paiement est refusé : le crédit carte cadeau et
l'usage promo sont **perdus définitivement**, sans aucune compensation
nulle part dans le code (`decrementGiftCardBalance`/`incrementUsage` ne sont
appelés qu'à cet unique endroit dans tout le dépôt).

Aggravant : les deux appels sont dans un `try/catch` qui **avale l'erreur**
(`console.error` puis continue) — si le débit échoue (DB indisponible,
carte désactivée entre-temps), la session Stripe est quand même créée avec
la remise appliquée, sans qu'aucune trace ne permette de savoir que le
débit a échoué.

**Impact** : perte financière pour le client (carte cadeau créditée pour
rien), perte de traçabilité comptable, remise accordée sans que la
contrepartie (débit réel) soit garantie.

**Sévérité** : 🔴 critique — argent réel, sans mécanisme de rattrapage.

**Piste de correction** : déplacer `incrementUsage`/`decrementGiftCardBalance`
dans `handleCheckoutSession` (webhook), après la création de la
`Transaction` — exactement le même changement que celui déjà appliqué au
stock aujourd'hui. Nécessite de faire transiter `promoCode`/`giftCardCode`/
`giftCardAmount` jusqu'au webhook (déjà fait en partie : `order.promoCode`
est stocké sur la commande).

### 1.2 🔴 ✅ Corrigé — Solde de carte cadeau décrémenté sans atomicité (race condition)

> **Corrigé le 2026-09-28**, dans le même changement que §1.1 :
> `decrementGiftCardBalance` utilise désormais `updateMany` avec une garde
> `balance: { gte: amount }`, atomique.

**Fichier** : [src/lib/prisma/giftCards/giftCards.ts](src/lib/prisma/giftCards/giftCards.ts#L171-L182)

```ts
export const decrementGiftCardBalance = async (id: string, amount: number) => {
	const giftCard = await prisma.giftCard.findUnique({ where: { id } });
	if (!giftCard) return null;

	const nextBalance = Math.max(0, parseFloat((giftCard.balance - amount).toFixed(2)));
	return await prisma.giftCard.update({
		where: { id },
		data: { balance: nextBalance, active: nextBalance > 0 ? giftCard.active : false }
	});
};
```

Lecture puis écriture, sans transaction ni opération atomique. Deux
commandes concurrentes utilisant le même code de carte cadeau peuvent
toutes les deux lire le même solde de départ et toutes les deux réussir
leur mise à jour — la seconde écrase le résultat de la première au lieu de
partir de son résultat. Une carte à 50 € peut ainsi financer deux achats de
30 € et 40 €, pour un solde final incohérent (10 € ou 20 € au lieu de 0 €).

C'est exactement la même classe de bug que le stock avant sa correction
d'aujourd'hui — sauf que la correction stock utilise `{ decrement: quantity
}` (atomique), pas ce genre de lecture-puis-écriture.

**Sévérité** : 🔴 critique — exploitable pour dépenser plus que le solde
réel d'une carte cadeau.

**Piste de correction** : `prisma.giftCard.update({ where: { id, balance: {
gte: amount } }, data: { balance: { decrement: amount } } })` et vérifier
que la mise à jour a bien matché une ligne (sinon solde insuffisant, à
gérer explicitement) — même pattern que le fix stock.

### 1.3 🟡 Double remboursement / double carte cadeau sur une demande de retour

**Fichier** : [src/routes/admin/returns/+page.server.ts](src/routes/admin/returns/+page.server.ts) —
actions `approve` (L60), `creditStore` (L130), `reject` (L197)

```ts
const returnRequest = await getReturnRequestById(id);
if (returnRequest.status !== 'REQUESTED') {
	return fail(400, { message: 'Cette demande a déjà été traitée' });
}
// ... appel Stripe (approve) ou createGiftCard (creditStore), puis
// markReturnApproved/markReturnCredited plus bas — sans verrou ...
```

Les **trois** actions de cette route partagent le même patron : le contrôle
"déjà traité ?" est une lecture isolée, faite avant l'opération réelle
(remboursement Stripe pour `approve`, **création d'une nouvelle carte
cadeau** pour `creditStore`) et avant l'écriture qui fait passer le statut
hors `REQUESTED`. Un double-clic (ou deux admins agissant sur la même
demande en même temps) peut faire passer les deux requêtes ce contrôle
avant qu'aucune des deux n'ait eu le temps d'écrire le nouveau statut :

- `approve` : deux appels `stripe.refunds.create` pour le même remboursement.
- `creditStore` : **deux cartes cadeaux créées** pour un seul retour (pas de
  dédoublonnage Stripe qui pourrait au moins limiter la casse comme pour
  `approve` — la carte cadeau est un nouvel objet à chaque appel).

Le reste du dépôt a déjà le bon réflexe pour ce genre de situation
(`withLock` du webhook Stripe, des jobs post-paiement, du webhook
Sendcloud) — cette route admin est la seule à manipuler de l'argent réel
sans ce filet.

**Sévérité** : 🟡 moyen — nécessite un double-clic ou une coïncidence
admin, mais l'impact (remboursement ou carte cadeau en double) est un vrai
coût financier, et `creditStore` n'a aucun garde-fou côté tiers pour
limiter les dégâts.

**Piste de correction** : `withLock(`return:${id}`, ...)` autour des trois
actions, ou re-vérifier le statut dans la même transaction que
`markReturnApproved`/`markReturnCredited`.

---

## 2. Jobs asynchrones / Webhooks sortants

### 2.1 🔴 ✅ Corrigé — Commande/étiquette Sendcloud potentiellement dupliquée

> **Corrigé le 2026-09-28** : l'écriture des marqueurs `sendcloudOrderCreatedAt`/
> `sendcloudParcelId` passe désormais par `persistSendcloudMarker`
> (`$lib/server/sendcloud-marker.ts`, 3 tentatives avec backoff). Si elle
> échoue quand même, le job s'arrête (dead-letter, `SendcloudMarkerPersistError`)
> **sans jamais relancer** l'appel réseau déjà réussi — au lieu de laisser
> QStash retenter tout le job et recréer une commande/étiquette. Vérifié par
> un nouveau test dans `src/lib/server/jobs/post-payment.test.ts` (échec de
> l'écriture du marqueur de commande → étiquette jamais appelée, job ne
> relance rien).

**Fichier** : [src/lib/server/jobs/post-payment.ts](src/lib/server/jobs/post-payment.ts#L153-L165)

```ts
if (!transaction.sendcloudOrderCreatedAt) {
	await withCircuitBreaker('sendcloud', () => createSendcloudOrder(transaction));
	transaction = await prisma.transaction.update({
		where: { id: transaction.id },
		data: { sendcloudOrderCreatedAt: new Date() }
	});
}
```

Le marqueur d'idempotence (`sendcloudOrderCreatedAt`) est écrit **après**
l'appel réseau Sendcloud, pas dans la même opération atomique. Si l'appel
réussit mais que l'`update` qui suit échoue (timeout DB, crash du process),
le marqueur reste vide. Un retry QStash (après expiration du verrou de 60s)
relit une transaction où `sendcloudOrderCreatedAt` est toujours `null` et
recrée une commande Sendcloud — donc potentiellement une deuxième
étiquette, un deuxième colis facturé. Même risque sur
`createSendcloudLabel` juste après.

**Sévérité** : 🔴 critique — coût réel dupliqué chez le transporteur, pas
seulement un problème d'affichage.

**Piste de correction** : vérifier auprès de Sendcloud si une commande
existe déjà pour cette transaction avant d'en recréer une (idempotency key
si l'API le permet), ou au minimum élargir la fenêtre du verrou pour couvrir
tout le cycle appel+update.

### 2.2 🟡 Emails de relance wishlist potentiellement dupliqués

**Fichier** : [src/lib/server/jobs/wishlistPriceAlert.ts](src/lib/server/jobs/wishlistPriceAlert.ts#L68-L82)

```ts
try {
	await sendMail({
		/* ... */
	});
	await markWishlistItemNotified(item.id, {
		/* ... */
	});
} catch (error) {
	log('ERROR', 'wishlist-price-alert', 'Échec...', {
		/* ... */
	});
	// pas de throw : la boucle continue
}
```

Si `sendMail` réussit mais que `markWishlistItemNotified` échoue ensuite
(timeout DB), l'erreur est journalisée mais pas remontée — l'item reste non
marqué. Un futur passage du job renvoie alors le même email pour la même
baisse de prix.

**Sévérité** : 🟡 moyen — dépend de la fréquence des échecs DB juste après
un envoi réussi, mais reproductible en théorie sur chaque exécution.

**Piste de correction** : inverser l'ordre (marquer avant d'envoyer,
quitte à accepter qu'un email manqué en cas d'échec d'envoi ne soit pas
retenté), ou entourer les deux appels d'une logique qui traite l'échec du
marquage comme aussi grave que l'échec de l'envoi.

### 2.3 🟡 Cartes cadeaux de parrainage potentiellement orphelines

**Fichier** : [src/lib/server/jobs/referral.ts](src/lib/server/jobs/referral.ts#L60-L72)

La carte cadeau de récompense est créée, puis le `ReferralReward` qui la
référence est créé dans un appel séparé. Si la création du `ReferralReward`
échoue après coup, la carte cadeau existe déjà mais rien ne la relie au
parrainage — un retry ne la retrouve pas (`findUnique` sur `referredId`
dans `ReferralReward` renvoie toujours rien) et en recrée une seconde.

**Sévérité** : 🟡 moyen — moins fréquent que 2.1/2.2 (deux écritures DB
proches dans le temps, pas un appel réseau externe entre les deux), mais
même famille de problème.

**Piste de correction** : envelopper la création de la carte cadeau et du
`ReferralReward` dans un seul `prisma.$transaction`, à l'image de la
protection déjà en place dans `loyalty.ts` pour un cas équivalent.

---

## 3. Transverse (affichage, emails, tri)

### 3.1 🟡 Taux de TVA affiché en dur à "5,5 %"

**Fichiers** : [src/lib/components/cart/Cart.svelte](src/lib/components/cart/Cart.svelte#L288),
[src/lib/components/checkout/CartSummary.svelte](src/lib/components/checkout/CartSummary.svelte#L181)

```svelte
<span>TVA (5,5 %) :</span>
<!-- Cart.svelte -->
<span>TVA (5,5%)</span>
<!-- CartSummary.svelte -->
```

Le taux de TVA est configurable depuis `/admin/tva`
(`StoreSettings.vatRate`, voir [src/lib/server/vat.ts](src/lib/server/vat.ts))
— feature construite précisément parce que 5,5 % (taux réduit) est **incorrect**
pour de la bijouterie, qui relève du taux normal en France (voir
`CONFORMITE_ECOMMERCE.md`). Le calcul réel du montant TTC utilise bien le
taux configuré (`getVatRate()`), mais ces deux libellés restent figés au
texte de l'ancien taux constant. Un admin qui corrige le taux (ce pour quoi
la fonctionnalité existe) voit ses clients continuer à lire "TVA (5,5 %)"
dans le panier alors que le montant réellement prélevé applique un autre
taux.

**Sévérité** : 🟡 moyen (affichage trompeur, pas une erreur de calcul —
mais avec une vraie portée commerciale/légale puisque c'est exactement le
problème que la fonctionnalité `vatRate` a été construite pour résoudre).

**Piste de correction** : passer `data.vatRate` (déjà chargé côté page
panier/checkout pour le calcul TTC) jusqu'à ces deux libellés et formater
dynamiquement `TVA ({(vatRate * 100).toLocaleString('fr-FR')} %)`.

### 3.2 🟡 Liens relatifs (cassés) dans les emails si `APP_URL` absent

**Fichiers** : `cartRecovery.ts`, `recentlyViewedReminder.ts`,
`reviewReminder.ts`, `stockAlerts.ts`, `wishlistPriceAlert.ts` (tous dans
`src/lib/server/jobs/`)

```ts
return `${resolveAppUrl() ?? ''}/checkout`; // cartRecovery.ts
const productUrl = `${resolveAppUrl() ?? ''}/products/${product.slug}`; // stockAlerts.ts, wishlistPriceAlert.ts
```

`resolveAppUrl()` renvoie `null` si ni `APP_URL` ni `VERCEL_URL` ne sont
définis. Le repli `?? ''` produit alors une URL relative (`/checkout`),
invalide dans un client email. **Comparaison directe dans le même dépôt** :
[src/lib/server/invoice/email.ts](src/lib/server/invoice/email.ts#L37)
gère le même cas correctement avec un repli absolu :

```ts
const invoiceUrl = `${resolveAppUrl() ?? 'http://localhost:2000'}/auth/settings/factures/${source.id}`;
```

Les 5 autres fichiers n'ont pas ce filet — un déploiement où `APP_URL`
serait momentanément absent (erreur de config, nouvel environnement de
preview) enverrait des emails de relance avec des liens non cliquables,
silencieusement (aucune erreur levée).

**Sévérité** : 🟡 moyen — dépend d'un environnement mal configuré, mais
silencieux et déjà démontré incohérent au sein même du dépôt.

**Piste de correction** : reprendre le même repli que `invoice/email.ts`
dans les 5 fichiers, ou centraliser un `resolveAppUrlOrDefault()` unique.

### 3.3 🔵 Boutons de tri actifs sur des colonnes non triables

**Fichiers** : `src/lib/prisma/transaction/getAllTransactions.ts`,
`src/lib/prisma/fraud/getFraudBlocks.ts`, `src/lib/prisma/user/user.ts`
(listes `*_SORTABLE`) comparés aux colonnes réellement affichées par
`Table.svelte` sur `/admin/sales`, `/admin/fraud`, `/admin/users`.

`Table.svelte` affiche un bouton de tri sur **chaque** colonne visible,
sans savoir laquelle est réellement triable côté serveur :

```svelte
{#each visibleColumns as column (column.key)}
	<Table.Head>
		{column.label}
		<button onclick={() => sortItems(column.key)}><ChevronDown /></button>
	</Table.Head>
{/each}
```

`normalizeListParams` ([src/lib/prisma/pagination.ts](src/lib/prisma/pagination.ts#L38))
ignore silencieusement tout `sort` hors de la whitelist `sortable` (protection
légitime contre l'injection d'un `orderBy` Prisma arbitraire) et retombe sur
`defaultSort`. Concrètement : sur `/admin/sales`, cliquer sur "N° facture"
ou "Client" (colonnes affichées, absentes de `TRANSACTION_SORTABLE =
['amount', 'createdAt', 'status']`) ne change rien à l'ordre — même chose
pour "Email"/"Niveau de risque" sur `/admin/fraud`, et "Nom" sur
`/admin/users`.

**Sévérité** : 🔵 mineur — UX seulement (bouton silencieusement sans
effet), aucune donnée corrompue, la whitelist elle-même est une bonne
pratique de sécurité à conserver telle quelle.

**Piste de correction** : soit élargir chaque `*_SORTABLE` aux colonnes
réellement affichées quand ça a du sens, soit faire en sorte que
`Table.svelte` n'affiche le bouton de tri que pour les colonnes déclarées
triables (nouveau champ `sortable?: boolean` sur `TableColumn`).

---

## 4. Auth / Admin

### 4.1 🔴 ✅ Corrigé — Changement de mot de passe/2FA par un admin sans révoquer les sessions existantes

> **Corrigé le 2026-09-28** : `admin/users/[id]/+page.server.ts` appelle
> désormais `invalidateUserSessions(id)` (import `$lib/lucia/session`) juste
> après `updateUserSecurity`/`updateUserMFA`, mais seulement si un mot de
> passe a réellement été fourni ou si `isMfaEnabled` change de valeur par
> rapport à l'utilisateur chargé avant l'action — pour ne pas déconnecter la
> cible à chaque sauvegarde du formulaire (ex. simple modification
> d'adresse). Vérifié par `e2e/admin/users.spec.ts` (étape 4, étendue) :
> une session brute est insérée pour la cible (`createRawSession`,
> `e2e/support/db.ts`), `countSessions` vaut 1 avant la bascule MFA, 0 après.

**Fichier** : [src/lib/prisma/user/updateUserSecurity.ts](src/lib/prisma/user/updateUserSecurity.ts),
appelé depuis [src/routes/admin/users/[id]/+page.server.ts](src/routes/admin/users/[id]/+page.server.ts#L177)

```ts
export const updateUserSecurity = async (id, { isMfaEnabled, passwordHash }) => {
	const dataToUpdate: Prisma.UserUpdateInput = { isMfaEnabled };
	if (passwordHash) dataToUpdate.passwordHash = await hashPassword(passwordHash);
	return await prisma.user.update({ where: { id }, data: dataToUpdate });
	// aucune session invalidée
};
```

Quand un admin change le mot de passe d'un compte (scénario typique :
compte compromis, ou remise à zéro à la demande de l'utilisateur), les
sessions déjà ouvertes sur ce compte restent valides — le nouveau mot de
passe ne sert à rien pour quelqu'un qui a déjà une session active (attaquant
avec un cookie volé, ou l'utilisateur lui-même sur un autre appareil qu'il
voulait déconnecter). **Comparaison directe dans le même fichier de
routes** : l'action `password` du self-service
([src/routes/auth/settings/+page.server.ts](src/routes/auth/settings/+page.server.ts#L136))
fait exactement ce qu'il faut :

```ts
await invalidateUserSessions(event.locals.user.id);
await updateUserPassword(event.locals.user.id, new_password);
```

Le chemin admin n'a jamais reçu cet appel.

**Sévérité** : 🔴 critique — défait l'objectif même d'une remise à zéro de
mot de passe faite pour reprendre le contrôle d'un compte.

**Piste de correction** : appeler `invalidateUserSessions(id)` dans
`updateUserSecurity` (ou juste après, côté appelant) dès que
`passwordHash` ou `isMfaEnabled` change.

### 4.2 🔵 Redondance dans le flux de validation 2FA

**Fichier** : [src/routes/auth/2fa/+page.server.ts](src/routes/auth/2fa/+page.server.ts#L100-L110)

```ts
await setSessionAs2FAVerified(locals.session.id); // marque l'ANCIENNE session
await auth.invalidateSession(locals.session.id); // ... puis l'invalide juste après
const newSession = await auth.createSession(locals.user.id, { twoFactorVerified: true });
```

`setSessionAs2FAVerified` marque la session qui va être invalidée deux
lignes plus loin — écriture DB totalement perdue. Ce n'est pas un problème
de sécurité (recréer une nouvelle session après la validation 2FA est au
contraire la bonne pratique, rotation d'identifiant de session après
élévation de privilège), juste du code mort/confus, probablement un reliquat
d'une évolution du flux (le `setup` initial de la 2FA, qui marque bien la
session en place à juste titre, suit un patron différent).

**Sévérité** : 🔵 mineur — aucun impact fonctionnel, juste une écriture DB
inutile et un flux plus confus à lire qu'il ne devrait.

**Piste de correction** : supprimer l'appel `setSessionAs2FAVerified` devenu
inutile dans ce fichier précis (le garder dans `2fa/setup/+page.server.ts`,
où il sert réellement).

### 4.3 🔵 Mise à jour d'adresse admin sans vérification d'appartenance

**Fichiers** : [src/routes/admin/users/[id]/+page.server.ts](src/routes/admin/users/[id]/+page.server.ts#L184-L199),
[src/lib/prisma/addresses/addresses.ts](src/lib/prisma/addresses/addresses.ts#L17-L26)

`updateAddress(id, data, ownerId?)` accepte un `ownerId` optionnel qui,
s'il est fourni, vérifie que l'adresse appartient bien à ce compte avant
d'écrire. La route admin ne le passe jamais. Un admin a de toute façon
l'autorité de modifier n'importe quel compte via cette page — ce n'est donc
pas un contournement de privilège, juste l'absence d'un garde-fou de
cohérence des données (protéger contre un id d'adresse erroné/altéré dans
le formulaire, pas contre un accès non autorisé).

**Sévérité** : 🔵 mineur — défense en profondeur manquante, pas une
vulnérabilité en soi dans ce contexte (admin déjà pleinement privilégié).

**Piste de correction** : passer `ownerId: id` dans l'appel admin, pour
rester cohérent avec la fonction telle qu'elle est déjà écrite.

---

## 5. Produits / Catalogue

### 5.1 🟡 Prix barré masqué dès qu'une variante est sélectionnée

**Fichier** : [src/routes/products/[slug]/+page.svelte](src/routes/products/[slug]/+page.svelte#L275)

```svelte
{#if !selectedVariant && hasDiscount}
	<p class="line-through">{toTTC(product.compareAtPrice, data.vatRate).toFixed(2)} €</p>
	<Badge variant="destructive">-{discountPercent}%</Badge>
{/if}
```

Le prix barré et le badge de remise ne s'affichent que si **aucune**
variante n'est sélectionnée — y compris pour une variante qui n'a pas de
surcharge de prix (`ProductVariant.price` null, donc qui utilise bien
`product.price`/`product.compareAtPrice`). Un produit en vente flash avec
variantes perd son affichage de remise dès qu'un client choisit une
variante, même si le prix affiché reste identique.

**Sévérité** : 🟡 moyen — UX/marketing, pas de donnée incorrecte (le prix
facturé reste juste), mais l'argument de vente (remise visible) disparaît.

**Piste de correction** : conditionner sur `hasDiscount && !selectedVariant?.price`
(masquer seulement si la variante a une vraie surcharge de prix) plutôt que
sur la simple présence d'une variante sélectionnée.

### 5.2 🔵 Test e2e variantes obsolète + donnée de test corrompue (trouvé et corrigé pendant cet audit)

**Fichier** : [e2e/products/variants.spec.ts](e2e/products/variants.spec.ts#L53)

En vérifiant une trouvaille remontée par un rapport d'exploration
automatisé (qui affirmait à tort que la réactivité prix/stock de variante
était cassée), l'investigation a confirmé deux choses différentes, toutes
deux réelles :

1. **Fait confirmé par une requête directe en base** : `StoreSettings.vatRate`
   du schéma e2e partagé était bloqué à `0.2` (20 %) au lieu du défaut
   attendu `0.055` (5,5 %) — résidu d'une exécution interrompue de
   `e2e/admin/vat-rate.spec.ts` (dont le `finally` restaure correctement le
   taux d'origine, mais seulement si le test va à son terme). **Corrigé
   pendant cet audit** (remis à `0.055` par écriture directe).
2. Le test `variants.spec.ts` attend un prix affiché de `25.00 €`
   (le prix HT brut de la variante), alors que la fiche produit affiche
   désormais le prix **TTC** (conversion ajoutée après l'écriture de ce
   test, voir commit `5edd161 fix: prix TTC sur les pages clientes`) — avec
   le taux par défaut, `25 × 1,055 = 26,38 €`, jamais `25,00 €`. Le test est
   simplement resté au prix HT après cette évolution ; la réactivité
   prix/stock de la page elle-même (`$derived` sur `selectedVariant`) est
   correcte à la lecture du code.

**Sévérité** : 🔵 mineur — la pollution de données (1) était réelle et
gênante (peut fausser d'autres assertions de prix dans toute la suite tant
qu'elle traîne), mais déjà corrigée ; le test obsolète (2) est un problème
de maintenance de la suite, pas un bug applicatif.

**Piste de correction** : mettre à jour l'assertion de `variants.spec.ts`
pour attendre le prix TTC réellement affiché (ou lire `data.vatRate` dans
le test et calculer la valeur attendue), pour que ce test redevienne un
vrai filet de sécurité sur ce composant.

---

## 6. Pistes explorées, écartées après vérification (faux positifs)

Par honnêteté : ces points ont été soulevés en première passe puis
invalidés après lecture complète du code, pour ne pas polluer la liste
ci-dessus avec du bruit.

- **"Désactiver la 2FA ne réinvalide pas la session courante"** — en
  apparence inquiétant, mais sans impact réel : `isMfaEnabled` est relu à
  chaque requête (`loadFreshUser`, cache de quelques secondes maximum), et
  le garde qui redirige vers `/auth/2fa` ne s'applique que si
  `isMfaEnabled` est vrai. Une fois désactivée, la valeur de
  `session.twoFactorVerified` devient simplement sans objet — aucune
  page protégée ne redevient accessible par erreur.
- **"Avis produit sans flag d'activation (`reviewsEnabled`)"** — les avis
  ne sont, à la différence des Questions produit (`productQnaEnabled`) et
  des autres modules optionnels, jamais présentés dans la documentation
  comme un module togglable (`docs/products/README.md`) : c'est une
  différence de conception assumée, pas un oubli.
- **"Le prix ne se met pas à jour à la sélection d'une variante"** — la
  cause réelle est la donnée de test corrompue + un test obsolète (§5.2),
  pas un bug de réactivité Svelte : `displayedPrice`/`displayedStock`
  dérivent tous les deux de `selectedVariant` de façon identique.

---

## 7. Ce qui a été vérifié et confirmé correct

Domaines explorés en profondeur sans trouvaille : `cart.ts`/`guestCart.ts`
(prix toujours revalidés serveur), `prendingOrder.ts`, `promo.ts`
(validation des montants), `returns.ts` (transitions d'état), génération de
factures/avoirs (numérotation atomique, calculs de totaux cohérents entre
checkout et facture), blog (visibilité publiée/non publiée), formulaire de
contact (rate-limit cohérent), KPIs du dashboard admin (agrégats Prisma,
pas de double comptage), suppression de produit (nettoyage Cloudinary +
cascade Prisma sur wishlist/alertes/variantes/questions), jobs `cleanup`,
`cartRecovery`, `reviewReminder`, `accountingExport`, `recentlyViewedReminder`,
`stockAlerts`, `loyalty`, webhook Sendcloud entrant (idempotent par
construction, `updateMany` conditionné sur le statut).

---

## 8. Priorisation suggérée

1. **Cette semaine** : §1.1 et §1.2 (argent réel, sans filet) + §4.1
   (sécurité — remise à zéro de mot de passe inefficace).
2. **Prochaines itérations** : §2.1 (coût transporteur dupliqué), §1.3
   (double remboursement), §3.1 (affichage TVA trompeur).
3. **Quand l'occasion se présente** : §2.2, §2.3, §3.2, §5.1, §3.3, §4.2,
   §4.3, §5.2.

Rien dans ce document n'a été corrigé (sauf la donnée de test §5.2,
corrigée en cours d'investigation) — c'est un état des lieux, pas encore un
plan d'action exécuté.
