/** Canonical tuples isolate producer epochs from unscoped legacy namespaces. */
export const parseDerivedCacheEpochNamespace = (namespace: string): [string, string] | null => {
  if (!namespace.startsWith("[")) return null;
  try {
    const pair: unknown = JSON.parse(namespace);
    return Array.isArray(pair) && pair.length === 2 &&
      pair.every(value => typeof value === "string" && value.length > 0) &&
      JSON.stringify(pair) === namespace ? pair as [string, string] : null;
  } catch { return null; }
};

/** Hold a cooperative read lease until disposal. Idle cleanup may only obtain
 * an exclusive lease on epochs with no live cache client.
 */
export const createDerivedCacheLease = (databaseName: string, epoch: string | null, enabled: boolean) => {
  let closed = false;
  let locks: LockManager | undefined;
  try { if (enabled && typeof navigator !== "undefined") locks = navigator.locks; } catch { /* Cleanup is optional. */ }
  if (typeof locks?.request !== "function") locks = undefined;
  const leaseName = (producer: string | null) =>
    `carma-derived-cache-epoch:${JSON.stringify([databaseName, producer])}`;
  let ready: Promise<boolean> | null = null;
  let abort: AbortController | null = null;
  let release: (() => void) | null = null;
  return {
    locks, leaseName,
    acquire(): Promise<boolean> {
      if (closed || !enabled) return Promise.resolve(false);
      if (!locks) return Promise.resolve(true);
      ready ??= new Promise<boolean>(resolve => {
        const controller = new AbortController();
        abort = controller;
        try {
          void locks!.request(leaseName(epoch), { mode: "shared", signal: controller.signal }, async () => {
            abort = null;
            if (closed) { resolve(false); return; }
            const held = new Promise<void>(done => { release = done; });
            resolve(true);
            await held;
            release = null;
          }).catch(() => resolve(false));
        } catch { resolve(false); }
      });
      return ready;
    },
    close() {
      closed = true;
      abort?.abort();
      abort = null;
      release?.();
      release = null;
    },
  };
};
