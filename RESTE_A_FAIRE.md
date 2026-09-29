# Reste à faire — Boilerplate-Ecommerce-1

Backlog actionnable au 28/09/2026, à la suite de la session d'audit et de
corrections. Complément de `AUDIT_TECHNIQUE.md` (état des lieux général) et
`AUDIT_FONCTIONNEL.md` (constats métier, tous clos).

Chaque entrée précise **le niveau de preuve** : ce qui a été vérifié en
exécutant le code, ce qui est estimé, et ce qui n'a jamais été regardé. Un
« rien trouvé » dans une zone jamais auditée ne vaut pas « rien à trouver ».

**État de référence** (vérifié) : `npm run check` 0 erreur · 82 tests
unitaires · ESLint 0 erreur / 12 avertissements · suite `e2e/commerce/` 33/33.

---

## 1. Sécurité des dépendances — ✅ risque production levé

**Preuve** : `npm audit` (4 _low_, 4 _moderate_, aucune _high_/_critical_).

| Paquet                         | Nature                                                  | Correctif                |
| ------------------------------ | ------------------------------------------------------- | ------------------------ |
| `cookie` (via `@sveltejs/kit`) | caractères hors bornes acceptés dans nom/chemin/domaine | aucune 2.x ne le corrige |
| `@vitest/mocker`               | traversée de chemin / lecture de fichier arbitraire     | Vitest 5                 |

**Triage fait le 29/09.** La seule vulnérabilité qui touchait la
**production** est corrigée : `@sveltejs/adapter-vercel` 5.10.3 → **6.3.4**
(empoisonnement de cache). npm l'annonçait comme _breaking_, mais son
`peerDependency` est `@sveltejs/kit ^2.4.0` alors que le projet est en 2.70.3 :
la montée est compatible, et `nodejs20.x` reste un runtime valide en v6.
Vérifié par un `npm run build` complet.

Les deux restantes ne sont **pas exploitables ici** :

- `cookie` : la faille exige un nom, chemin ou domaine de cookie issu d'une
  entrée utilisateur. Vérifié — tous sont des constantes (Lucia utilise son
  nom par défaut, `path: '/'` partout).
- `@vitest/mocker` : `devDependency`, absente du bundle de production.

⚠️ Ne pas les « corriger » à l'aveugle : `npm audit fix --force` propose de
descendre `@sveltejs/kit` en **0.0.30**, ce qui détruirait le projet.

**Piège connu** : `npm install <pkg>@<version>` remplace un épinglage exact
par un accent circonflexe. Plusieurs dépendances de ce dépôt sont épinglées
**volontairement** (`sveltekit-superforms`, `prisma`, `@prisma/client`) —
rétablir le pin après manipulation.

---

## 2. Soumission silencieusement avalée — ✅ CLOS le 29/09

Superforms laisse son état interne bloqué sur « soumission en cours » après un
refus. Avec son défaut `multipleSubmits: 'prevent'`, le clic suivant est
annulé **sans requête, sans message, sans erreur** pendant ~8 s.

**État final** : 42 formulaires sur 48 portent `RETRY_FRIENDLY_FORM`
(`src/lib/forms/superformOptions.ts`). Les 6 restants sont des **exclusions
volontaires**, dont l'action n'est pas idempotente :

| Formulaire                                                                    | Coût d'une seconde soumission                                                                                 |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `/auth/2fa`, `/auth/2fa/setup`, `/auth/2fa/reset`, `/auth/reset-password/2fa` | Détruit la session que la première vient d'émettre (vérifié : échec de `journey.spec.ts` aux étapes 15 et 16) |
| `/checkout`                                                                   | Ouvrirait deux sessions Stripe                                                                                |
| `/admin/gift-cards/create`                                                    | Émettrait deux cartes valides — le code est généré unique à chaque appel, rien ne rattrape le doublon         |

Cette liste est **contrainte par `src/lib/invariants.test.ts`** (règle 3) : le
test échoue si l'un d'eux reçoit l'option.

Le correctif de fond serait amont, mais la montée en superforms 2.30.2 **ne le
corrige pas** — vérifié en retirant tous les contournements : échec de nouveau
à l'étape 5. Le correctif 2.28.0 visait un autre scénario.

---

## 3. Arbitrage en attente — détection « nouvel appareil »

**Preuve** : lecture du code, conséquence déduite du cycle de publication des
navigateurs.

`src/lib/prisma/loginEvent/loginEvent.ts` compare le `User-Agent` **exact**.
Celui de Chrome contient la version complète, et Chrome se met à jour toutes
les 4 semaines environ : **chaque utilisateur reçoit une alerte de sécurité
quasi mensuelle pour sa propre machine**. C'est de la fatigue d'alerte — le
mécanisme par lequel les vraies alertes de compromission finissent ignorées.

Le correctif apparent (comparer sur l'étiquette `describeUserAgent()`, déjà
existante) est **un piège** : « Chrome sur Windows » est le profil le plus
courant, un attaquant passerait pour un appareil connu. On échangerait des
faux positifs gênants contre des faux négatifs dangereux.

Options, à trancher côté produit :

1. Statu quo, en assumant les alertes périodiques.
2. Normaliser le numéro de build en gardant la version majeure — gain partiel.
3. Croiser appareil **et** localisation approximative.

---

## 4. Dettes de fond

### 4.1 Montants monétaires en `Float`

**Preuve** : `prisma/schema.prisma` (`Product.price`, `Order.total`,
`Transaction.amount`, `GiftCard.balance`, `PromoCode.value`…).

Pas de bug activable en l'état : `money2()` encadre les calculs. Mais c'est le
type de fragilité qui se paie en écarts comptables difficiles à reconstituer.
Migration vers `Decimal` ou des entiers en centimes à planifier.

### 4.2 `findPendingOrder` trop lourde

**Preuve** : appelée par `pendingOrderHandle` à **chaque page vue** d'un
visiteur connecté (hors `/admin` et `/api`), avec `include: { product: true,
variant: true, custom: true }` — donc descriptions et tableaux d'images.

⚠️ **Tentative d'allègement abandonnée le 28/09.** Mesure sur 3 exécutions de
chaque côté : référence ~80 % de réussite, version allégée ~29 %. La donnée
traverse une frontière typée par un simple `as`, donc non vérifiée par le
compilateur, jusqu'au layout client. Une reprise doit d'abord **typer
correctement cette frontière**, pas seulement réduire le `select`.

### 4.3 Avertissements ESLint (12)

9 × `no-explicit-any`, 3 × `{@html}` (risque XSS). Préexistants. Les trois
`{@html}` méritent une revue : contenu blog rendu sans assainissement.

---

## 5. Zones jamais auditées — ✅ toutes couvertes

Ont été couverts : sécurité OWASP, intégrité des données et concurrence, les
deux lots d'authentification récents, la performance des requêtes, puis les
domaines **blog / promo / produits admin**, l'**accessibilité**, les
**anti-patterns Svelte 5** (propres), les **textes non traduits**,
l'**observabilité** et enfin le **SEO**.

**SEO — audité le 29/09.** L'infrastructure est saine : `title`/`description`
dynamiques par page, `canonical`, Open Graph et Twitter Card, JSON-LD `Product`
(avec `aggregateRating` uniquement si des avis existent) et `Article`,
`robots.txt` et sitemap corrects. Deux correctifs appliqués :

- `lastmod` retiré des pages statiques du sitemap : il valait `new Date()`,
  donc chaque page se déclarait modifiée à l'instant **à chaque requête**.
  Google en déduit que les dates du sitemap ne veulent rien dire et cesse de
  s'y fier, y compris pour les produits et articles dont la date est réelle.
  Le champ étant facultatif, l'omettre vaut mieux que mentir.
- `image` ajoutée au JSON-LD `Article` : sans elle, aucune miniature n'est
  affichée à côté du résultat de recherche.

**Reste ouvert — images sans `width`/`height`** (`products/[slug]`, lignes 247,
366, 398, et le catalogue). C'est un vrai sujet de *Cumulative Layout Shift*
sur les pages qui convertissent, mais **non corrigeable au jugé** :
`optimizedImageUrl` ne fixe que la largeur (`w_800`) sans recadrage, la hauteur
dépend donc du ratio de chaque image source. Déclarer un ratio arbitraire
créerait un décalage différent, pas une amélioration. La correction propre est
un `aspect-ratio` CSS sur le conteneur — c'est une **décision de design**
(quel ratio pour les visuels produit ?), pas un correctif technique.

**Écarté après vérification — `rel=prev/next` sur la pagination.** Google a
officiellement annoncé en 2019 ne plus utiliser ces balises pour l'indexation.
Les ajouter n'aurait aucun effet sur le référencement.

À surveiller par ailleurs : les avertissements ESLint sur `{@html}` (3) sont
**sans risque** — le contenu blog est assaini par DOMPurify côté serveur avant
stockage (vérifié).

---

## 6. Instabilité e2e résiduelle

**Statut : surveillance, pas de chantier.**

Une première estimation annonçait « 1 échec sur 3 » sur
`e2e/commerce/cart.spec.ts`. **Cette mesure était fausse** : elle avait été
prise pendant une session de bissection où les sources étaient éditées entre
et pendant les exécutions (rechargements HMR, serveurs résiduels).

Mesures propres : `cart.spec.ts` **3/3**, suite complète **33/33 sans retry**.
Une exécution antérieure avait donné 2 tests instables (`checkout` IDOR, `seo`
sitemap). L'instabilité est donc **réelle mais rare**.

➡️ **Un échec de ces specs doit être traité comme une vraie régression**, pas
balayé comme du bruit connu.

Outillage en place : `e2e/support/fixtures.ts` joint au rapport, uniquement en
cas d'échec, un « journal navigateur » (exceptions JavaScript, erreurs
console, réponses HTTP ≥ 400). Le prochain échec sera donc diagnosticable
directement.

**Règle de méthode** : ne jamais éditer de fichier source pendant qu'une suite
e2e tourne, et repartir d'un serveur propre avant toute comparaison A/B —
sinon on mesure son propre bruit.

---

## 7. À ne pas refaire — décisions déjà tranchées

| Piste                                                            | Verdict      | Raison                                                                                                |
| ---------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------- |
| `multipleSubmits: 'allow'` sur les formulaires 2FA               | ❌           | Casse le parcours 2FA (session réémise)                                                               |
| Alléger `findPendingOrder`                                       | ❌ en l'état | Régression mesurée (80 % → 29 %)                                                                      |
| Rate limiting comme cause d'instabilité e2e                      | ❌ infirmé   | Zéro trace de quota dans les journaux ; les fixtures isolent déjà les limiteurs par `X-Forwarded-For` |
| Règle interdisant les prix TTC en dur dans les tests e2e         | ❌           | Indistinguable statiquement d'un prix HT légitime ; Vitest ne scanne que `src/**`                     |
| Masquer appareil/localisation sur la page « Ce n'était pas moi » | ❌           | C'est précisément ce qui permet à l'utilisateur de juger                                              |

---

## 8. Garde-fous en place

`src/lib/invariants.test.ts` lit les sources pour interdire des classes de
bugs que le typage ne peut pas exprimer. **Y ajouter une règle dès qu'un
correctif repose sur « il ne faut pas oublier de… »** plutôt que sur une
contrainte de compilation.

Règles actuelles :

1. Aucun identifiant de session en valeur de propriété d'objet — donc ni vers
   un `load`, ni dans un `log()`. `Session.id` **est** le token du cookie.
   Cette fuite est survenue **trois fois** avant d'être outillée.
2. Les montants du tunnel de paiement doivent venir de `OrderItem.price`, pas
   de `product.price` — lire le prix de base facturait le mauvais montant sur
   les produits à variantes.
3. `RETRY_FRIENDLY_FORM` interdit sur les formulaires non idempotents (2FA,
   checkout, création de carte cadeau). La règle ne vivait qu'en commentaire :
   elle a été franchie dès l'application en masse aux routes admin, exposant à
   l'émission de deux cartes cadeaux valides sur un double-clic.
