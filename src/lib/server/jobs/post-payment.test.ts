import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Vérifie que le job post-paiement déclenche bien la création de la commande
 * et de l'étiquette Sendcloud au bon moment (transaction payée, pas encore
 * traitée), SANS jamais appeler le vrai Sendcloud : `createSendcloudOrder`/
 * `createSendcloudLabel` sont mockés (depuis la migration v3, plus aucun des
 * deux n'a besoin d'appeler `fetch` avant d'atteindre ces fonctions —
 * `derivePackageForShipping` est une pure dérivation locale, plus un appel
 * réseau). `fetch` est quand même stubé globalement en filet de sécurité :
 * si un futur appel réseau s'ajoutait par erreur à ce chemin, ce test le
 * ferait échouer au lieu de taper le vrai Sendcloud en silence.
 *
 * `.env`/`.env.test` de ce projet partagent les mêmes clés Sendcloud réelles
 * (pas de compte sandbox séparé) : `shouldCallSendcloud()` est donc forcé à
 * `true` ici via `vi.stubEnv`, uniquement pour ce test, avec le réseau
 * entièrement remplacé par des mocks — jamais une vraie requête sortante.
 */

const createSendcloudOrder = vi.fn().mockResolvedValue(undefined);
const createSendcloudLabel = vi.fn().mockResolvedValue(undefined);

vi.mock('$lib/sendcloud/order', () => ({ createSendcloudOrder }));
vi.mock('$lib/sendcloud/label', () => ({ createSendcloudLabel }));

const transactionUpdate = vi.fn();
const transactionFindUnique = vi.fn();
const orderFindUnique = vi.fn().mockResolvedValue(null);

vi.mock('$lib/server', () => ({
	prisma: {
		transaction: {
			findUnique: transactionFindUnique,
			update: transactionUpdate
		},
		order: {
			findUnique: orderFindUnique
		}
	}
}));

const baseTransaction = {
	id: 'tx_test_post_payment',
	status: 'paid',
	orderId: null,
	shippingOption: 'colissimo',
	shippingMethodId: null,
	sendcloudOrderCreatedAt: null,
	sendcloudParcelId: null
};

describe('runPostPaymentJob — déclenchement Sendcloud', () => {
	// `transactionUpdate` fusionne dans cette même valeur (pas dans
	// `baseTransaction` figé) : sinon un `update` intermédiaire (méthode
	// d'expédition) effacerait `sendcloudOrderCreatedAt`/`sendcloudParcelId`
	// déjà posés par le test « déjà créées ». `setInitialTransaction` laisse
	// chaque test partir d'un état différent.
	let currentTransaction: Record<string, unknown>;
	function setInitialTransaction(value: Record<string, unknown>) {
		currentTransaction = { ...value };
	}

	beforeEach(() => {
		vi.clearAllMocks();
		// Force `shouldCallSendcloud()` à `true` sans jamais toucher le vrai
		// Sendcloud : `createSendcloudOrder`/`createSendcloudLabel` sont mockés
		// ci-dessus ; `fetch` est stubé juste en dessous en filet de sécurité
		// (voir commentaire d'en-tête).
		vi.stubEnv('PUBLIC_ENV', 'production');
		vi.stubEnv('SENDCLOUD_PUBLIC_KEY', 'test-fake-public-key');
		vi.stubEnv('SENDCLOUD_SECRET_KEY', 'test-fake-secret-key');
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ shipping_methods: [] })
			})
		);
		setInitialTransaction(baseTransaction);
		transactionFindUnique.mockImplementation(() => Promise.resolve({ ...currentTransaction }));
		transactionUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
			currentTransaction = { ...currentTransaction, ...data };
			return Promise.resolve({ ...currentTransaction });
		});
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.unstubAllGlobals();
	});

	it('crée la commande puis l’étiquette Sendcloud pour une transaction payée non traitée', async () => {
		const { runPostPaymentJob } = await import('./post-payment');

		await runPostPaymentJob(baseTransaction.id);

		expect(createSendcloudOrder).toHaveBeenCalledTimes(1);
		expect(createSendcloudOrder).toHaveBeenCalledWith(
			expect.objectContaining({ id: baseTransaction.id })
		);
		expect(createSendcloudLabel).toHaveBeenCalledTimes(1);

		// L'ordre compte : l'étiquette ne doit jamais être demandée avant que
		// la commande Sendcloud existe.
		const orderCallOrder = createSendcloudOrder.mock.invocationCallOrder[0];
		const labelCallOrder = createSendcloudLabel.mock.invocationCallOrder[0];
		expect(orderCallOrder).toBeLessThan(labelCallOrder);

		// La commande Sendcloud posée en base avant l'appel à l'étiquette.
		expect(transactionUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({ sendcloudOrderCreatedAt: expect.any(Date) })
			})
		);
	});

	it('ne rappelle ni commande ni étiquette déjà créées (retry QStash)', async () => {
		setInitialTransaction({
			...baseTransaction,
			sendcloudOrderCreatedAt: new Date('2026-01-01'),
			sendcloudParcelId: 123456
		});

		const { runPostPaymentJob } = await import('./post-payment');
		await runPostPaymentJob(baseTransaction.id);

		expect(createSendcloudOrder).not.toHaveBeenCalled();
		expect(createSendcloudLabel).not.toHaveBeenCalled();
	});

	it('ignore Sendcloud quand PUBLIC_ENV=test, même avec des clés présentes', async () => {
		vi.stubEnv('PUBLIC_ENV', 'test');

		const { runPostPaymentJob } = await import('./post-payment');
		await runPostPaymentJob(baseTransaction.id);

		expect(createSendcloudOrder).not.toHaveBeenCalled();
		expect(createSendcloudLabel).not.toHaveBeenCalled();
	});

	it('ignore une transaction dont le statut n’est pas "paid"', async () => {
		setInitialTransaction({ ...baseTransaction, status: 'pending' });

		const { runPostPaymentJob } = await import('./post-payment');
		await runPostPaymentJob(baseTransaction.id);

		expect(createSendcloudOrder).not.toHaveBeenCalled();
		expect(createSendcloudLabel).not.toHaveBeenCalled();
	});

	it('n’appelle jamais l’étiquette si seule l’écriture du marqueur de commande échoue (§2.1 audit)', async () => {
		// La commande Sendcloud a déjà été créée (réseau OK) : seul l'`update`
		// qui pose `sendcloudOrderCreatedAt` échoue, comme un timeout DB juste
		// après l'appel réseau. Un retry du job recréerait la commande — donc
		// le job ne doit ni relancer Sendcloud ici, ni throw.
		transactionUpdate.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
			if ('sendcloudOrderCreatedAt' in data) {
				return Promise.reject(new Error('DB timeout'));
			}
			currentTransaction = { ...currentTransaction, ...data };
			return Promise.resolve({ ...currentTransaction });
		});

		const { runPostPaymentJob } = await import('./post-payment');
		await expect(runPostPaymentJob(baseTransaction.id)).resolves.toBeUndefined();

		expect(createSendcloudOrder).toHaveBeenCalledTimes(1);
		expect(createSendcloudLabel).not.toHaveBeenCalled();
	});
});
