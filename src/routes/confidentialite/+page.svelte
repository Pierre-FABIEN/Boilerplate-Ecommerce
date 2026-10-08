<script lang="ts">
	import SEO from '$lib/components/SEO.svelte';
</script>

<SEO
	title="Politique de confidentialité"
	description="Traitement des données personnelles : finalités, bases légales, durées de conservation et droits RGPD."
/>

<div class="relative box-border min-h-screen w-full px-8 pt-24 pb-16">
	<div class="mx-auto w-full max-w-[760px] space-y-8">
		<h1 class="text-2xl font-bold">Politique de confidentialité</h1>
		<p class="text-sm text-muted-foreground">
			⚠️ Document à compléter avec les coordonnées réelles de l'éditeur avant mise en production —
			voir <code>RESTE_A_FAIRE.md</code> à la racine du projet.
		</p>

		<section class="space-y-2">
			<h2 class="text-lg font-semibold">1. Qui traite vos données ?</h2>
			<p class="text-sm">
				Le responsable du traitement est l'éditeur du site — voir les
				<a href="/mentions-legales" class="underline">mentions légales</a>.
			</p>
		</section>

		<section class="space-y-2">
			<h2 class="text-lg font-semibold">2. Quelles données et pourquoi</h2>
			<ul class="list-disc space-y-2 pl-5 text-sm">
				<li>
					<strong>Compte et commandes</strong> (nom, e-mail, adresses, historique d'achat) — exécution
					du contrat de vente (RGPD art. 6.1.b).
				</li>
				<li>
					<strong>Paiement</strong> — aucune donnée bancaire n'est stockée par nos soins : le paiement
					est intégralement traité par Stripe, notre sous-traitant.
				</li>
				<li>
					<strong>E-mails marketing</strong> (relances, nouveautés) — uniquement avec votre consentement
					explicite (case à cocher dans votre espace compte), jamais par défaut. Les e-mails transactionnels
					(confirmation de commande, facture, réinitialisation de mot de passe) ne sont pas soumis à
					ce consentement.
				</li>
				<li>
					<strong>Sécurité du compte</strong> (mot de passe, double authentification) — intérêt légitime
					à sécuriser votre compte (RGPD art. 6.1.f).
				</li>
			</ul>
		</section>

		<section class="space-y-2">
			<h2 class="text-lg font-semibold">3. Durées de conservation</h2>
			<p class="text-sm">
				Les données de compte, sessions expirées et paniers abandonnés font l'objet d'une purge
				automatique périodique. Les données de facturation sont conservées 10 ans conformément aux
				obligations comptables et fiscales (Code de commerce, art. L123-22).
			</p>
		</section>

		<section class="space-y-2">
			<h2 class="text-lg font-semibold">4. Sous-traitants</h2>
			<p class="text-sm">Les données sont partagées, dans la stricte limite nécessaire, avec :</p>
			<ul class="list-disc space-y-1 pl-5 text-sm">
				<li><strong>Stripe</strong> — traitement des paiements.</li>
				<li><strong>Sendcloud</strong> — création d'étiquettes et suivi de livraison.</li>
				<li><strong>Cloudinary</strong> — hébergement des images.</li>
				<li><strong>Vercel</strong> — hébergement de l'application (voir mentions légales).</li>
				<li><strong>Neon</strong> — hébergement de la base de données.</li>
				<li>
					<strong>Fournisseur SMTP (Brevo ou équivalent)</strong> — envoi des e-mails transactionnels
					et marketing.
				</li>
				<li><strong>Upstash</strong> — file d'attente de tâches et cache technique.</li>
				<li>
					<strong>Sentry</strong> — suivi des erreurs techniques (contexte de requête, jamais utilisé
					à des fins commerciales).
				</li>
			</ul>
		</section>

		<section class="space-y-2">
			<h2 class="text-lg font-semibold">5. Vos droits</h2>
			<p class="text-sm">
				Conformément au Règlement général sur la protection des données (RGPD), vous disposez d'un
				droit d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité
				de vos données. La rectification de vos informations de compte et de vos adresses est
				disponible directement depuis votre espace <a href="/auth/settings" class="underline"
					>Mon compte</a
				>.
			</p>
			<p class="text-sm">
				L'export complet de vos données (portabilité) et la suppression de votre compte (effacement)
				sont disponibles en libre-service depuis
				<a href="/auth/settings/donnees" class="underline">Mon compte → Mes données</a> — aucune
				demande par e-mail n'est nécessaire pour ces deux droits. Pour toute autre demande, utilisez
				le <a href="/contact" class="underline">formulaire de contact</a> en précisant l'objet de
				votre demande RGPD. Vous disposez également du droit d'introduire une réclamation auprès de
				la CNIL (<a
					href="https://www.cnil.fr"
					target="_blank"
					rel="noopener noreferrer"
					class="underline">cnil.fr</a
				>).
			</p>
		</section>

		<section class="space-y-2">
			<h2 class="text-lg font-semibold">6. Sécurité</h2>
			<p class="text-sm">
				Les mots de passe sont chiffrés (Argon2id) et ne sont jamais stockés en clair. Les codes de
				double authentification sont chiffrés au repos. Aucune donnée de carte bancaire ne transite
				par nos serveurs.
			</p>
		</section>

		<section class="space-y-2">
			<h2 class="text-lg font-semibold">7. Cookies</h2>
			<p class="text-sm">
				Ce site utilise uniquement des cookies de session strictement nécessaires à son
				fonctionnement (maintien de votre connexion, panier). Aucun cookie publicitaire ou traceur
				de mesure d'audience n'est déposé à ce jour.
			</p>
		</section>
	</div>
</div>
