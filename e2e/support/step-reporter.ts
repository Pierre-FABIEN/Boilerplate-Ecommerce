import type { Reporter, TestCase, TestStep } from '@playwright/test/reporter';

/**
 * Affiche l'avancement des `test.step` au fil de l'eau.
 *
 * Les rapporteurs livrés avec Playwright n'écrivent qu'à la fin de chaque test.
 * Le parcours d'authentification étant un test unique de plusieurs minutes, la
 * console resterait muette du début à la fin ; ce rapporteur annonce l'entrée
 * dans chaque étape puis sa durée.
 */
export default class StepReporter implements Reporter {
	private startedAt = 0;

	onBegin() {
		this.startedAt = Date.now();
	}

	onStepBegin(_test: TestCase, _result: unknown, step: TestStep) {
		// Playwright émet aussi une étape par action (clic, navigation…) : seules
		// les étapes déclarées avec `test.step` nous intéressent ici.
		if (step.category !== 'test.step') return;
		console.log(`${this.elapsed()} ▶ ${step.title}`);
	}

	onStepEnd(_test: TestCase, _result: unknown, step: TestStep) {
		if (step.category !== 'test.step') return;
		const outcome = step.error ? '✗ échec' : '✓';
		console.log(`${this.elapsed()} ${outcome} ${step.title} (${Math.round(step.duration)} ms)`);
	}

	private elapsed(): string {
		const seconds = Math.round((Date.now() - this.startedAt) / 1000);
		return `[${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}]`;
	}
}
