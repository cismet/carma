import { afterEach, describe, expect, it, vi } from "vitest";

import { cleanupLegacyProjectedTerrainCache } from "./projected-terrain-cache-maintenance";

const databaseName = "carma-terrain-geometry-cache";
const storeName = "projected_tiles";
type Handler = (() => void) | null;
type LockCallback = (lock: object | null) => Promise<void>;

const createIndexedDbMock = () => {
  const clearRequest = { onerror: null as Handler };
  const clear = vi.fn(() => clearRequest);
  const transaction = {
    oncomplete: null as Handler, onabort: null as Handler, onerror: null as Handler,
    abort: vi.fn(), objectStore: vi.fn(() => ({ clear })),
  };
  const database = {
    objectStoreNames: { contains: vi.fn((name: string) => name === storeName) },
    transaction: vi.fn(() => transaction), close: vi.fn(), onversionchange: null as Handler,
  };
  const request = {
    onsuccess: null as Handler, onerror: null as Handler,
    onblocked: null as Handler, onupgradeneeded: null as Handler,
    result: database, transaction: { abort: vi.fn() },
  };
  const factory = {
    databases: vi.fn(async () => [{ name: databaseName }]),
    open: vi.fn(() => request), deleteDatabase: vi.fn(),
  };
  vi.stubGlobal("indexedDB", factory);
  vi.stubGlobal("navigator", {});
  return { factory, request, database, transaction, clear, clearRequest };
};

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("legacy projected terrain store maintenance", () => {
  it("clears only the exact derived store and waits for transaction completion", async () => {
    const mock = createIndexedDbMock();
    const operation = cleanupLegacyProjectedTerrainCache();
    await flushPromises();
    expect(mock.factory.open).toHaveBeenCalledWith(databaseName);
    mock.request.onsuccess?.();
    expect(mock.database.transaction).toHaveBeenCalledWith(storeName, "readwrite");
    expect(mock.transaction.objectStore).toHaveBeenCalledWith(storeName);
    expect(mock.clear).toHaveBeenCalledOnce();
    expect(mock.database.close).not.toHaveBeenCalled();
    mock.transaction.oncomplete?.();
    expect(await operation).toBe(true);
    expect(mock.database.close).toHaveBeenCalledOnce();
    expect(mock.factory.deleteDatabase).not.toHaveBeenCalled();
  });

  it("does not open a missing database or create a phantom one", async () => {
    const mock = createIndexedDbMock();
    mock.factory.databases.mockResolvedValue([{ name: "user-settings" }]);
    expect(await cleanupLegacyProjectedTerrainCache()).toBe(false);
    expect(mock.factory.open).not.toHaveBeenCalled();
  });

  it.each([undefined, {}, { open: vi.fn() }])("skips unavailable native APIs %j", async (factory) => {
    vi.stubGlobal("indexedDB", factory);
    vi.stubGlobal("navigator", {});
    expect(await cleanupLegacyProjectedTerrainCache()).toBe(false);
  });

  it("handles database enumeration failure without opening anything", async () => {
    const mock = createIndexedDbMock();
    mock.factory.databases.mockRejectedValue(new Error("Storage unavailable"));
    expect(await cleanupLegacyProjectedTerrainCache()).toBe(false);
    expect(mock.factory.open).not.toHaveBeenCalled();
  });

  it("closes without upgrading when the target store is absent", async () => {
    const mock = createIndexedDbMock();
    mock.database.objectStoreNames.contains.mockReturnValue(false);
    const operation = cleanupLegacyProjectedTerrainCache();
    await flushPromises();
    mock.request.onsuccess?.();
    expect(await operation).toBe(false);
    expect(mock.database.transaction).not.toHaveBeenCalled();
    expect(mock.database.close).toHaveBeenCalledOnce();
  });

  it("aborts an upgrade if the database disappears between listing and opening", async () => {
    const mock = createIndexedDbMock();
    const operation = cleanupLegacyProjectedTerrainCache();
    await flushPromises();
    mock.request.onupgradeneeded?.();
    expect(await operation).toBe(false);
    expect(mock.request.transaction.abort).toHaveBeenCalledOnce();
    expect(mock.clear).not.toHaveBeenCalled();
    expect(mock.database.close).toHaveBeenCalledOnce();
  });

  it.each(["onerror", "onblocked"] as const)("handles open %s and closes a late connection", async (event) => {
    const mock = createIndexedDbMock();
    const operation = cleanupLegacyProjectedTerrainCache();
    await flushPromises();
    mock.request[event]?.();
    expect(await operation).toBe(false);
    mock.request.onsuccess?.();
    expect(mock.database.close).toHaveBeenCalledOnce();
    expect(mock.clear).not.toHaveBeenCalled();
  });

  it.each(["onabort", "onerror"] as const)("handles transaction %s", async (event) => {
    const mock = createIndexedDbMock();
    const operation = cleanupLegacyProjectedTerrainCache();
    await flushPromises();
    mock.request.onsuccess?.();
    mock.transaction[event]?.();
    expect(await operation).toBe(false);
    expect(mock.database.close).toHaveBeenCalledOnce();
  });

  it("aborts and closes on versionchange", async () => {
    const mock = createIndexedDbMock();
    const operation = cleanupLegacyProjectedTerrainCache();
    await flushPromises();
    mock.request.onsuccess?.();
    mock.database.onversionchange?.();
    expect(await operation).toBe(false);
    expect(mock.transaction.abort).toHaveBeenCalledOnce();
    expect(mock.database.close).toHaveBeenCalledOnce();
  });

  it("aborts and closes when the clear request fails", async () => {
    const mock = createIndexedDbMock();
    const operation = cleanupLegacyProjectedTerrainCache();
    await flushPromises();
    mock.request.onsuccess?.();
    mock.clearRequest.onerror?.();
    expect(await operation).toBe(false);
    expect(mock.transaction.abort).toHaveBeenCalledOnce();
    expect(mock.database.close).toHaveBeenCalledOnce();
  });

  it("closes when transaction creation throws", async () => {
    const mock = createIndexedDbMock();
    mock.database.transaction.mockImplementation(() => { throw new Error("Transaction failed"); });
    const operation = cleanupLegacyProjectedTerrainCache();
    await flushPromises();
    mock.request.onsuccess?.();
    expect(await operation).toBe(false);
    expect(mock.database.close).toHaveBeenCalledOnce();
    expect(mock.clear).not.toHaveBeenCalled();
  });

  it("fails closed for synchronous native errors", async () => {
    const mock = createIndexedDbMock();
    mock.factory.open.mockImplementation(() => { throw new Error("Open failed"); });
    expect(await cleanupLegacyProjectedTerrainCache()).toBe(false);
  });

  it("does not wait for an already held cooperative lock", async () => {
    const mock = createIndexedDbMock();
    const request = vi.fn(async (_name: string, _options: LockOptions, callback: LockCallback) => callback(null));
    vi.stubGlobal("navigator", { locks: { request } });
    expect(await cleanupLegacyProjectedTerrainCache()).toBe(false);
    expect(request).toHaveBeenCalledWith(
      "carma-legacy-projected-terrain-cache-cleanup",
      { mode: "exclusive", ifAvailable: true }, expect.any(Function)
    );
    expect(mock.factory.databases).not.toHaveBeenCalled();
    expect(mock.factory.open).not.toHaveBeenCalled();
  });

  it("holds the cooperative lock until transaction completion", async () => {
    const mock = createIndexedDbMock();
    let released = false;
    const request = vi.fn(async (_name: string, _options: LockOptions, callback: LockCallback) => {
      await callback({});
      released = true;
    });
    vi.stubGlobal("navigator", { locks: { request } });
    const operation = cleanupLegacyProjectedTerrainCache();
    await flushPromises();
    mock.request.onsuccess?.();
    expect(released).toBe(false);
    mock.transaction.oncomplete?.();
    expect(await operation).toBe(true);
    await flushPromises();
    expect(released).toBe(true);
  });

  it("fails closed when lock acquisition rejects", async () => {
    const mock = createIndexedDbMock();
    vi.stubGlobal("navigator", {
      locks: { request: vi.fn().mockRejectedValue(new Error("Lock unavailable")) },
    });
    expect(await cleanupLegacyProjectedTerrainCache()).toBe(false);
    expect(mock.factory.open).not.toHaveBeenCalled();
  });

  it("bounds a pending open and only closes its late success", async () => {
    vi.useFakeTimers();
    const mock = createIndexedDbMock();
    const operation = cleanupLegacyProjectedTerrainCache();
    await flushPromises();
    await vi.advanceTimersByTimeAsync(1000);
    expect(await operation).toBe(false);
    mock.request.onsuccess?.();
    expect(mock.database.close).toHaveBeenCalledOnce();
    expect(mock.clear).not.toHaveBeenCalled();
  });

  it("aborts an active clear when the overall deadline expires", async () => {
    vi.useFakeTimers();
    const mock = createIndexedDbMock();
    const operation = cleanupLegacyProjectedTerrainCache();
    await flushPromises();
    mock.request.onsuccess?.();
    await vi.advanceTimersByTimeAsync(1000);
    expect(await operation).toBe(false);
    expect(mock.transaction.abort).toHaveBeenCalledOnce();
    expect(mock.database.close).toHaveBeenCalledOnce();
  });

  it("does not open or clear after a timed-out database listing resolves", async () => {
    vi.useFakeTimers();
    const mock = createIndexedDbMock();
    let completeListing = (_entries: { name: string }[]) => {};
    mock.factory.databases.mockImplementation(() => new Promise((resolve) => { completeListing = resolve; }));
    const operation = cleanupLegacyProjectedTerrainCache();
    await vi.advanceTimersByTimeAsync(1000);
    expect(await operation).toBe(false);
    completeListing([{ name: databaseName }]);
    await flushPromises();
    expect(mock.factory.open).not.toHaveBeenCalled();
    expect(mock.clear).not.toHaveBeenCalled();
  });
});
