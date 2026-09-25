/**
 * In-memory mutex to serialize webhook processing per contact and instance.
 * Eliminates race conditions when multiple messages arrive concurrently.
 */
const activeLocks = new Map<string, Promise<void>>();

export async function withWebhookLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  // Wait if another operation is currently holding the lock for this key
  while (activeLocks.has(key)) {
    try {
      await activeLocks.get(key);
    } catch {
      // Ignore errors from previous holder
    }
  }

  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });

  activeLocks.set(key, promise);

  // Safety timeout: 20 seconds maximum lock hold to prevent stuck locks
  const timer = setTimeout(() => {
    if (activeLocks.get(key) === promise) {
      activeLocks.delete(key);
      release();
    }
  }, 20000);

  try {
    return await fn();
  } finally {
    clearTimeout(timer);
    if (activeLocks.get(key) === promise) {
      activeLocks.delete(key);
    }
    release();
  }
}
