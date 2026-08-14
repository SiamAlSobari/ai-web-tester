/**
 * Process safety guard to prevent zombie browser processes upon abrupt terminations.
 */
export type CleanupFunction = () => Promise<void> | void;

export class ProcessGuard {
  private static readonly cleanupHandlers: Set<CleanupFunction> = new Set();
  private static isInitialized = false;

  static register(cleanupFn: CleanupFunction): () => void {
    this.ensureInitialized();
    this.cleanupHandlers.add(cleanupFn);
    return () => {
      this.cleanupHandlers.delete(cleanupFn);
    };
  }

  private static ensureInitialized(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];

    for (const sig of signals) {
      process.once(sig, async () => {
        await this.runAllCleanups();
        process.exit(0);
      });
    }

    process.once('beforeExit', async () => {
      await this.runAllCleanups();
    });
  }

  static async runAllCleanups(): Promise<void> {
    const handlers = Array.from(this.cleanupHandlers);
    this.cleanupHandlers.clear();

    await Promise.allSettled(
      handlers.map(async (fn) => {
        try {
          await fn();
        } catch {
          // Suppress errors during emergency teardown
        }
      })
    );
  }
}
