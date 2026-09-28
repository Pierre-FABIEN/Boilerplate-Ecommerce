# Registre des traitements (RGPD art. 30)

Document vivant, dans le même esprit que `CONFORMITE_ECOMMERCE.md` : brouillon
de registre des activités de traitement, construit en lisant le code (schéma
Prisma, jobs serveur, variables d'environnement) plutôt que recopié d'un
modèle générique. **Ceci n'est pas le registre officiel** — un registre au
sens de l'article 30 doit être tenu et signé par le responsable de
traitement (ou son DPO), avec son identité réelle. Ce document sert de
matière première technique pour le construire, pas de substitut.

## Responsable du traitement

⚠️ À compléter avec l'identité réelle de l'entreprise — voir
`CONFORMITE_ECOMMERCE.md` section 3 (mêmes informations que les mentions
légales : raison sociale, adresse, SIRET, représentant légal). Délégué à la
protection des données (DPO) : à désigner si l'obligation s'applique
(traitement à grande échelle de données sensibles, ou suivi régulier et
systématique à grande échelle — à évaluer selon le volume réel d'activité).

## Méthode

Chaque traitement ci-dessous a été identifié en lisant le schéma Prisma et
le code serveur associé (pas une liste théorique). La colonne « Durée de
conservation » indique soit une durée explicite trouvée dans le code, soit
« non explicite dans le code » quand aucune purge n'existe — ce deuxième
cas est en lui-même une chose à trancher (voir « Points ouverts » en bas de
document), pas juste une case à cocher.

---

## 1. Comptes clients et authentification

| Champ                          | Détail                                                                                                                                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalité                       | Création et gestion du compte client, connexion, sécurité (2FA)                                                                                                                                                  |
| Base légale                    | Exécution du contrat (art. 6.1.b) pour le compte ; intérêt légitime (art. 6.1.f) pour la sécurité (sessions, 2FA)                                                                                                |
| Données                        | `User` (email, username, name, picture), `passwordHash` (Argon2id), `recoveryCode`/`totpKey` (chiffrés AES), `googleId`, `Session` (dont `userAgent`, `ipAddress`, `city`/`country` approximatifs — ajoutés pour l'auto-service « Sessions actives », `/auth/settings/sessions`), `LoginEvent` (historique des connexions, mêmes colonnes appareil/localisation — voir plus bas), `EmailVerificationRequest`, `PasswordResetSession` |
| Personnes concernées           | Clients                                                                                                                                                                                                          |
| Destinataires / sous-traitants | Google (connexion OAuth, si utilisée) ; Vercel (en-têtes de géolocalisation `x-vercel-ip-*`, dérivés de l'IP côté edge, jamais un service de géolocalisation tiers séparé)                                       |
| Durée de conservation          | Sessions et jetons expirés purgés automatiquement (`$lib/server/jobs/cleanup.ts`) — l'IP/ville/pays d'une session ont donc la même durée de vie qu'elle (30 jours glissants au plus) ; `LoginEvent` conservé 90 jours (même job), plus long que la session car c'est un journal de sécurité, voir §1bis ; le compte lui-même n'a pas de purge automatique — suppression uniquement sur demande (self-service ou admin, voir section 8) |

## 1bis. Historique des connexions et alerte « nouvel appareil »

| Champ                          | Détail                                                                                                                                                                                                                    |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalité                       | Détecter et signaler au client une connexion depuis un appareil inconnu (sécurité du compte) ; conserver un historique consultable après expiration des sessions                                                       |
| Base légale                    | Intérêt légitime (art. 6.1.f) — sécurité du compte                                                                                                                                                                      |
| Données                        | `LoginEvent` (userAgent, ipAddress, city, country, méthode de connexion, indicateur « nouvel appareil ») — jamais créé pour une simple réémission de session (validation 2FA, changement de mot de passe), seulement pour une authentification réelle (`$lib/prisma/loginEvent/loginEvent.ts`) |
| Personnes concernées           | Clients                                                                                                                                                                                                                  |
| Destinataires / sous-traitants | Aucun (l'alerte part par SMTP, déjà listé en section 6, vers le client lui-même)                                                                                                                                        |
| Durée de conservation          | **90 jours, explicite dans le code** (`LOGIN_EVENT_RETENTION_DAYS`, `$lib/server/jobs/cleanup.ts`) — plus long que la session qu'il documente (justifié : un journal de sécurité doit survivre à l'expiration de ce qu'il journalise), pas indéfini |

## 2. Commandes, factures et paiement

| Champ                          | Détail                                                                                                                                                                                                                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalité                       | Traitement des commandes, facturation, comptabilité                                                                                                                                                                                                                                |
| Base légale                    | Exécution du contrat (art. 6.1.b) ; obligation légale comptable (art. 6.1.c, Code de commerce L123-22)                                                                                                                                                                             |
| Données                        | `Order`, `OrderItem`, `Transaction` (adresses figées à la commande, montants, numéro de facture)                                                                                                                                                                                   |
| Personnes concernées           | Clients                                                                                                                                                                                                                                                                            |
| Destinataires / sous-traitants | **Stripe** (paiement — `stripeCustomerId`, `stripePaymentIntentId` ; aucune donnée de carte bancaire stockée par l'application)                                                                                                                                                    |
| Durée de conservation          | **10 ans, explicite dans le code** (obligation comptable, Code de commerce L123-22) — `Order`/`Transaction` ne sont jamais supprimées ni anonymisées, y compris après suppression du compte client (voir section 8). Commandes en attente abandonnées : supprimées après 30 jours. |

## 3. Retours et avoirs

| Champ                          | Détail                                                                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Finalité                       | Traitement des rétractations légales et des retours SAV                                               |
| Base légale                    | Obligation légale (droit de rétractation, Code conso. L221-18 à L221-28) ; exécution du contrat (SAV) |
| Données                        | `ReturnRequest`, `CreditNoteCounter`                                                                  |
| Personnes concernées           | Clients                                                                                               |
| Destinataires / sous-traitants | Stripe (remboursement), Sendcloud (étiquette de retour)                                               |
| Durée de conservation          | Non explicite en tant que telle — rattachée à `Transaction`, conservée 10 ans par ricochet            |

## 4. Export comptable

| Champ                          | Détail                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------- |
| Finalité                       | Export mensuel des transactions payées pour la comptabilité                           |
| Base légale                    | Obligation légale comptable                                                           |
| Données                        | `AccountingExportLog`, export CSV des transactions                                    |
| Personnes concernées           | Clients (via les transactions exportées)                                              |
| Destinataires / sous-traitants | Destinataire interne par e-mail (adresse comptable configurée), SMTP (voir section 6) |
| Durée de conservation          | Non explicite dans le code pour le log d'export lui-même                              |

## 5. Livraison

| Champ                          | Détail                                                              |
| ------------------------------ | ------------------------------------------------------------------- |
| Finalité                       | Création des étiquettes d'expédition, suivi de livraison            |
| Base légale                    | Exécution du contrat                                                |
| Données                        | Adresse de livraison (`Order`/`Transaction`), point relais éventuel |
| Personnes concernées           | Clients                                                             |
| Destinataires / sous-traitants | **Sendcloud** (création colis, tracking, webhooks de statut)        |
| Durée de conservation          | Liée à la commande (10 ans, voir section 2)                         |

## 6. Marketing, e-mails transactionnels et relances

| Champ                          | Détail                                                                                                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalité                       | E-mails transactionnels (confirmation, facture, réinitialisation de mot de passe) toujours envoyés ; e-mails marketing (newsletter, relances) uniquement avec consentement |
| Base légale                    | Exécution du contrat (transactionnel) ; consentement, art. 6.1.a (marketing — `User.marketingEmailsOptIn`, défaut `false`, opt-in explicite, jamais opt-out par défaut)    |
| Données                        | Email, historique d'envoi (`Order.cartReminder1/2SentAt`, `Order.reviewReminderSentAt`, `ProductView.reminderSentAt`, `WishlistItem.lastNotifiedPrice/FlashSaleEndsAt`)    |
| Personnes concernées           | Clients avec compte (relances liées à `ProductView` : comptes connectés uniquement, aucun tracking de visiteur anonyme dans ce projet)                                     |
| Destinataires / sous-traitants | **SMTP Brevo** (ou équivalent configuré)                                                                                                                                   |
| Durée de conservation          | Non explicite — liée au cycle de vie de la commande ou du compte                                                                                                           |

## 7. Avis produits, questions, fidélité, parrainage

| Champ                          | Détail                                                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Finalité                       | Avis clients, questions/réponses produit, programme de fidélité et de parrainage                                           |
| Base légale                    | Intérêt légitime / consentement implicite à la publication (avis, questions) ; exécution du contrat (fidélité, parrainage) |
| Données                        | `Review`, `ProductQuestion`, `LoyaltyAward`, `User.referralCode/referredById`, `ReferralReward`, `GiftCard`                |
| Personnes concernées           | Clients                                                                                                                    |
| Destinataires / sous-traitants | Aucun                                                                                                                      |
| Durée de conservation          | Non explicite — conservées même après anonymisation du compte (rattachées à un compte devenu anonyme, voir section 8)      |

## 8. Droits des personnes (self-service)

| Champ                     | Détail                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalité                  | Export des données personnelles (portabilité) et suppression de compte (effacement)                                                                                                                                                                                                                                                                                                                             |
| Base légale               | Obligation légale (RGPD art. 15, 17, 20)                                                                                                                                                                                                                                                                                                                                                                        |
| Où                        | `/auth/settings/donnees` — export JSON complet ; suppression par **anonymisation** (`$lib/prisma/user/anonymizeUser.ts`), jamais de suppression physique du compte                                                                                                                                                                                                                                              |
| Détail de l'anonymisation | Vide les champs identifiants de `User` (email, nom, mot de passe...), supprime `SavedPaymentMethod` (+ détachement Stripe), `Address`, `WishlistItem`, `StockAlert`, `ProductView`, jetons de session/réinitialisation ; conserve `Order`/`Transaction`/`Review`/`ReturnRequest`/`ProductQuestion`/`LoyaltyAward`/`ReferralReward` rattachés au compte désormais anonyme, pour l'obligation comptable de 10 ans |
| Même flux côté admin      | `/admin/users?/deleteUser` utilise la même fonction (un bug qui supprimait les commandes au lieu de les conserver a été corrigé, voir `CONFORMITE_ECOMMERCE.md`)                                                                                                                                                                                                                                                |

## 9. Détection de fraude / scoring de risque

| Champ                          | Détail                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Finalité                       | Prévention de la fraude à la commande (calcul d'un score de risque avant paiement)                                                                                                                                                                                                                                                               |
| Base légale                    | Intérêt légitime (art. 6.1.f) — prévention de la fraude                                                                                                                                                                                                                                                                                          |
| Données                        | Vélocité de commandes sur 24h, écart entre adresse de livraison et de facturation, domaine d'e-mail jetable connu → `Order.riskScore/riskLevel/riskFactors`, `Transaction` (recopié), `FraudBlock` (commandes bloquées)                                                                                                                          |
| Personnes concernées           | Clients                                                                                                                                                                                                                                                                                                                                          |
| ⚠️ Point d'attention RGPD      | Si le blocage automatique est activé (`StoreSettings.fraudBlockingEnabled`), il s'agit d'une **décision automatisée produisant un effet juridique** (commande refusée) — l'article 22 RGPD peut s'appliquer (droit à une intervention humaine, à contester la décision). À faire trancher avec un juriste si ce module est activé en production. |
| Destinataires / sous-traitants | Aucun                                                                                                                                                                                                                                                                                                                                            |
| Durée de conservation          | **Non explicite dans le code — `FraudBlock` n'a aucune purge identifiée**, conservation actuellement permanente par défaut (voir « Points ouverts »)                                                                                                                                                                                             |

## 10. Wishlist, alertes stock, navigation produit

| Champ                          | Détail                                                                                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finalité                       | Liste d'envies, alertes de réassort, historique de navigation (relance produits consultés)                                                                                            |
| Base légale                    | Action explicite de l'utilisateur (clic « cœur », inscription à une alerte)                                                                                                           |
| Données                        | `WishlistItem`, `StockAlert`, `ProductView` (comptes connectés uniquement — le « récemment consulté » vitrine anonyme est en `localStorage` navigateur, jamais un traitement serveur) |
| Personnes concernées           | Clients avec compte                                                                                                                                                                   |
| Destinataires / sous-traitants | Aucun                                                                                                                                                                                 |
| Durée de conservation          | Supprimées à l'anonymisation du compte (section 8)                                                                                                                                    |

## 11. Journal d'audit admin

| Champ                          | Détail                                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Finalité                       | Traçabilité des actions administrateur (sécurité)                                                              |
| Base légale                    | Intérêt légitime / obligation de sécurité (art. 32)                                                            |
| Données                        | `AdminAuditLog` (acteur, action, cible, métadonnées) — sans clé étrangère, survit à la suppression d'un compte |
| Personnes concernées           | Administrateurs (acteurs) et clients (cibles des actions journalisées)                                         |
| Destinataires / sous-traitants | Aucun                                                                                                          |
| Durée de conservation          | **Non explicite dans le code — aucune purge identifiée** (voir « Points ouverts »)                             |

## 12. Formulaire de contact

| Champ                          | Détail                                                     |
| ------------------------------ | ---------------------------------------------------------- |
| Finalité                       | Traiter une demande envoyée via le formulaire de contact   |
| Base légale                    | Consentement / mesures précontractuelles (art. 6.1.a ou b) |
| Données                        | `ContactSubmission` (nom, email, sujet, message)           |
| Personnes concernées           | Visiteurs, avec ou sans compte                             |
| Destinataires / sous-traitants | Destinataire interne par e-mail                            |
| Durée de conservation          | Non explicite dans le code                                 |

---

## Sous-traitants (destinataires tiers)

| Sous-traitant              | Rôle                                           | Statut                                                                                                                                                                |
| -------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stripe                     | Paiement, remboursement                        | Confirmé, en usage actif                                                                                                                                              |
| Sendcloud                  | Expédition, étiquettes, suivi                  | Confirmé, en usage actif                                                                                                                                              |
| Cloudinary                 | Hébergement des images                         | Confirmé, en usage actif                                                                                                                                              |
| Vercel                     | Hébergement de l'application                   | Confirmé, en usage actif                                                                                                                                              |
| Neon                       | Hébergement de la base de données (PostgreSQL) | Confirmé, en usage actif                                                                                                                                              |
| SMTP (Brevo ou équivalent) | Envoi des e-mails transactionnels et marketing | Confirmé, en usage actif                                                                                                                                              |
| Upstash (Redis + QStash)   | Cache, verrous, file d'attente de jobs         | Confirmé, en usage actif                                                                                                                                              |
| Google                     | Connexion OAuth (si utilisée par le client)    | Confirmé, en usage conditionnel                                                                                                                                       |
| **Sentry**                 | Monitoring d'erreurs (serveur + navigateur)    | **Confirmé présent (`SENTRY_DSN`), absent de l'audit précédent** — peut capturer des IP/contextes de requête ; aucun `Sentry.setUser()` explicite trouvé dans le code |
| **TinyMCE**                | Éditeur de texte riche (back-office)           | Clé API présente, SDK chargé côté client admin — à vérifier si le cloud TinyMCE est réellement utilisé ou seulement la version auto-hébergée                          |
| api-adresse.data.gouv.fr   | Autocomplétion d'adresse                       | API publique gouvernementale, sans clé — pas un sous-traitant au sens RGPD                                                                                            |

Confirmé absent : aucun SDK analytics/publicitaire (Google Analytics, Meta
Pixel, Matomo...), aucune IA/LLM, aucun SMS.

---

## Points ouverts (à trancher, pas des bugs)

1. **`FraudBlock` n'a aucune purge automatique** — les tentatives de commande
   bloquées pour fraude sont conservées indéfiniment. À faire trancher :
   une durée de conservation raisonnable (ex. 1 à 3 ans) est probablement
   attendue au regard du principe de minimisation (art. 5.1.e).
2. **`AdminAuditLog` n'a aucune purge automatique** — même remarque, avec la
   nuance que ce journal a une vraie justification de sécurité qui peut
   légitimer une conservation plus longue.
3. **Blocage automatique de fraude = décision automatisée** (`fraudBlockingEnabled`)
   — vérifier l'applicabilité de l'art. 22 RGPD avant activation en
   production (droit à une intervention humaine).
4. ~~**Contentful** semble être un sous-traitant configuré mais inutilisé~~
   — retiré (`.env.example`, `.env.test.example`, CI) : clés supprimées,
   plus aucun accès à révoquer.
5. **Sentry** ajouté à `/confidentialite` (était absent) — reste à vérifier
   ce qu'il capture réellement (IP, corps de requête, éventuel PII dans les
   messages d'erreur).
6. **Identité du responsable de traitement et DPO** — voir en haut de
   document, même blocage que les mentions légales.
