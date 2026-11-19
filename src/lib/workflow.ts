/**
 * Minimal Medusa-style workflow runner: each step may register a compensation that runs (in reverse
 * order) if a later step throws. DB steps should still share one transaction; compensations are for
 * side effects outside the database (payment providers, storage).
 */
export type StepFn = <T>(name: string, invoke: () => Promise<T>, compensate?: (result: T) => Promise<unknown>) => Promise<T>;

export async function runWorkflow<T>(name: string, fn: (step: StepFn) => Promise<T>): Promise<T> {
	const undo: { name: string; run: () => Promise<unknown> }[] = [];
	const step: StepFn = async (stepName, invoke, compensate) => {
		const result = await invoke();
		if (compensate) undo.push({ name: stepName, run: () => compensate(result) });
		return result;
	};
	try {
		return await fn(step);
	} catch (e) {
		for (const u of undo.reverse()) {
			try {
				await u.run();
			} catch (ce) {
				console.error(`[workflow:${name}] compensation "${u.name}" failed`, ce);
			}
		}
		throw e;
	}
}
