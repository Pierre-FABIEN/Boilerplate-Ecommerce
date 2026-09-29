/**
 * Options `superForm()` pour les formulaires où l'on ressaisit après un refus.
 *
 * Note de dépendance : l'override npm `sveltekit-superforms → zod: "$zod"`
 * (package.json) est indispensable depuis la 2.28. Sans lui, npm installe une
 * copie imbriquée de zod 4 pour Superforms, dont l'adaptateur `zod/v3` résout
 * alors des classes distinctes de celles des schémas de l'application — d'où
 * des centaines d'erreurs « ZodObject n'est pas assignable à ZodObjectType ».
 *
 * Superforms laisse son état interne bloqué sur « soumission en cours » après
 * une soumission refusée. Avec son défaut `multipleSubmits: 'prevent'`, le clic
 * suivant est alors annulé en silence — aucune requête, aucun message, aucune
 * erreur — jusqu'à ce que son minuteur `timeoutMs` (8 s) débloque l'état. Sur
 * un formulaire où l'on corrige une erreur et où l'on resoumet aussitôt (code
 * de vérification, mot de passe, adresse), l'application paraît morte.
 *
 * Toujours reproductible en 2.30.2 : le correctif amont 2.28.0 (« loading
 * timers … », issue #622) traite un autre scénario (`timeoutMs` déclenché sur
 * une réponse de redirection). Vérifié en retirant ce contournement après la
 * montée de version — `e2e/auth/journey.spec.ts` échoue de nouveau à l'étape 5.
 *
 * Une double soumission est ici sans conséquence : ces actions sont validées
 * et limitées en débit côté serveur.
 *
 * NE PAS appliquer aux formulaires dont l'action n'est pas idempotente — la
 * garde `'prevent'` y est porteuse, pas décorative. La liste est tenue à jour
 * dans `src/lib/invariants.test.ts`, qui échoue si l'un d'eux la reçoit :
 * - `/auth/2fa`, `/auth/2fa/setup`, `/auth/2fa/reset`, `/auth/reset-password/2fa`
 *   invalident puis recréent la session (une seconde soumission détruit celle
 *   que la première vient d'émettre) — vérifié : l'ajouter fait échouer
 *   `e2e/auth/journey.spec.ts` aux étapes 15 et 16.
 * - `/checkout` ouvrirait deux sessions Stripe.
 * - `/admin/gift-cards/create` : le code est généré unique à chaque appel, donc
 *   rien ne rattrape un double envoi — deux cartes valides, deux fois la même
 *   valeur émise. Les autres formulaires de création sont rattrapés par une
 *   contrainte `@unique` sur une valeur saisie (code promo, slug produit) ou
 *   sur une paire (`Review` : un avis par compte et par produit).
 */
export const RETRY_FRIENDLY_FORM = { multipleSubmits: 'allow' } as const;
