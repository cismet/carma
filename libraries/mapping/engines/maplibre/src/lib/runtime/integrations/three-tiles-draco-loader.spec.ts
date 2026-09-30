import { PriorityQueue } from "3d-tiles-renderer/core";
import { BufferGeometry, FileLoader, LoadingManager } from "three";
import type { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createThreeTilesDracoLoader } from "./three-tiles-draco-loader";

class DecoderWorker extends EventTarget {
  static instances: DecoderWorker[] = [];
  static reply = false;
  static onInit: (() => void) | undefined;
  onmessage: ((event: MessageEvent) => void) | null = null;
  messages: { type: string; id?: number }[] = [];
  terminate = vi.fn();

  constructor() {
    super();
    DecoderWorker.instances.push(this);
  }

  postMessage(message: { type: string; id?: number }) {
    this.messages.push(message);
    if (message.type === "init") DecoderWorker.onInit?.();
    if (message.type === "decode" && DecoderWorker.reply)
      queueMicrotask(() => this.respond(message.id!));
  }

  respond(id: number) {
    this.onmessage?.(
      new MessageEvent("message", {
        data: {
          type: "decode",
          id,
          geometry: {
            attributes: [
              {
                name: "position",
                array: new Float32Array([1, 2, 3]),
                itemSize: 3,
                stride: 3,
              },
            ],
          },
        },
      })
    );
  }
}

const loaders: DRACOLoader[] = [];
let sequence = 0;
const fixture = () => {
  const manager = new LoadingManager();
  const loader = createThreeTilesDracoLoader(manager)
    .setDecoderConfig({ type: "js" })
    .setWorkerLimit(1)
    .setDecoderPath(`https://decoder.test/${++sequence}/`);
  loaders.push(loader);
  return { loader, manager };
};
const decode = (loader: DRACOLoader) =>
  new Promise<BufferGeometry>((resolve, reject) =>
    loader.parse(new ArrayBuffer(8), resolve, reject)
  );
const waitForDecodes = async (count: number) => {
  await vi.waitFor(() =>
    expect(
      DecoderWorker.instances[0]?.messages.filter(
        (message) => message.type === "decode"
      )
    ).toHaveLength(count)
  );
  return DecoderWorker.instances[0];
};

beforeEach(() => {
  DecoderWorker.instances = [];
  DecoderWorker.reply = false;
  DecoderWorker.onInit = undefined;
  vi.stubGlobal("Worker", DecoderWorker);
  vi.stubGlobal(
    "ProgressEvent",
    class extends Event {
      constructor(type: string, init: ProgressEventInit) {
        super(type);
        Object.assign(this, init);
      }
    }
  );
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:draco-test");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(async () => {
  for (const loader of loaders.splice(0)) loader.dispose();
  await Promise.resolve();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("native Draco failure recovery", () => {
  it("retries failed decoder initialization and preserves native loading and geometry", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(
        new TypeError("Temporary decoder connection failure")
      )
      .mockResolvedValueOnce(new Response("decoder source"));
    const { loader, manager } = fixture();
    manager.setURLModifier((url) => `${url}?resolved=1`);
    loader.setWithCredentials(true);
    await expect(decode(loader)).rejects.toThrow(
      "Temporary decoder connection"
    );
    DecoderWorker.reply = true;
    const geometry = await decode(loader);
    expect(fetch).toHaveBeenCalledTimes(2);
    const request = fetch.mock.calls[1][0] as Request;
    expect(request.url).toMatch(/draco_decoder\.js\?resolved=1$/);
    expect(request.credentials).toBe("include");
    expect([...geometry.getAttribute("position").array]).toEqual([1, 2, 3]);
    geometry.dispose();
  });

  it.each(["headers", "body"])(
    "aborts decoder assets and rejects parsing at the %s deadline",
    async (stage) => {
      vi.useFakeTimers();
      let signal: AbortSignal | undefined;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        signal = (input as Request).signal;
        if (stage === "headers")
          return new Promise<Response>((_resolve, reject) =>
            signal!.addEventListener("abort", () => reject(signal!.reason))
          );
        return new Response(
          new ReadableStream({
            start(controller) {
              signal!.addEventListener("abort", () =>
                controller.error(signal!.reason)
              );
            },
          })
        );
      });
      const { loader } = fixture();
      const result = expect(decode(loader)).rejects.toMatchObject({
        name: "TimeoutError",
      });
      await vi.advanceTimersByTimeAsync(30_000);
      await result;
      expect(signal?.aborted).toBe(true);
      expect(DecoderWorker.instances).toHaveLength(0);
    }
  );

  it.each(["error", "messageerror"])(
    "releases all native parse slots on worker %s and creates a replacement worker",
    async (eventType) => {
      const fetch = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValue(new Response("decoder source"));
      const { loader } = fixture();
      const queue = new PriorityQueue() as PriorityQueue & { currJobs: number };
      queue.autoUpdate = false;
      queue.maxJobs = 2;
      const results = Promise.allSettled([
        queue.add({}, () => decode(loader)),
        queue.add({}, () => decode(loader)),
      ]);
      queue.tryRunJobs();
      const worker = await waitForDecodes(2);
      expect(queue.currJobs).toBe(2);
      worker.dispatchEvent(
        Object.assign(new Event(eventType), {
          message: "Decoder worker failed",
        })
      );
      expect((await results).map((result) => result.status)).toEqual([
        "rejected",
        "rejected",
      ]);
      await Promise.resolve();
      expect(queue.currJobs).toBe(0);
      expect(worker.terminate).toHaveBeenCalledOnce();
      expect(() => worker.respond(1)).not.toThrow();
      DecoderWorker.reply = true;
      const replacement = queue.add({}, () => decode(loader));
      queue.tryRunJobs();
      const geometry = await replacement;
      expect(geometry).toBeInstanceOf(BufferGeometry);
      expect(DecoderWorker.instances).toHaveLength(2);
      expect(fetch).toHaveBeenCalledOnce();
      geometry.dispose();
    }
  );

  it("releases every parse slot when a worker stays silent after decoder assets load", async () => {
    vi.useFakeTimers();
    vi.spyOn(FileLoader.prototype, "load").mockImplementation((_url, onLoad) =>
      onLoad?.("decoder source")
    );
    const { loader } = fixture();
    const queue = new PriorityQueue() as PriorityQueue & { currJobs: number };
    queue.autoUpdate = false;
    queue.maxJobs = 2;
    const results = Promise.allSettled([
      queue.add({}, () => decode(loader)),
      queue.add({}, () => decode(loader)),
    ]);
    queue.tryRunJobs();
    await vi.advanceTimersByTimeAsync(0);
    const worker = DecoderWorker.instances[0];
    expect(
      worker.messages.filter(({ type }) => type === "decode")
    ).toHaveLength(2);
    expect(queue.currJobs).toBe(2);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(worker.terminate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    for (const result of await results) {
      expect(result.status).toBe("rejected");
      if (result.status === "rejected")
        expect(result.reason).toMatchObject({ name: "TimeoutError" });
    }
    expect(queue.currJobs).toBe(0);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    DecoderWorker.reply = true;
    const replacement = queue.add({}, () => decode(loader));
    queue.tryRunJobs();
    await vi.advanceTimersByTimeAsync(0);
    const geometry = await replacement;
    expect(geometry).toBeInstanceOf(BufferGeometry);
    expect(DecoderWorker.instances).toHaveLength(2);
    geometry.dispose();
  });

  it.each(["decode", "error"])(
    "clears the deadline on a matching %s protocol reply",
    async (type) => {
      vi.useFakeTimers();
      vi.spyOn(FileLoader.prototype, "load").mockImplementation(
        (_url, onLoad) => onLoad?.("decoder source")
      );
      const { loader } = fixture();
      const result = decode(loader).then(
        (geometry) => {
          geometry.dispose();
          return "resolved";
        },
        () => "rejected"
      );
      await vi.advanceTimersByTimeAsync(0);
      const worker = DecoderWorker.instances[0];
      const id = worker.messages.find((message) => message.type === "decode")!
        .id!;
      expect(vi.getTimerCount()).toBe(1);
      if (type === "decode") worker.respond(id);
      else
        worker.onmessage?.(new MessageEvent("message", { data: { type, id } }));
      expect(await result).toBe(type === "decode" ? "resolved" : "rejected");
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(worker.terminate).not.toHaveBeenCalled();
    }
  );

  it("settles in-flight decodes on idempotent disposal and rejects later use", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("decoder source")
    );
    const { loader } = fixture();
    const results = Promise.allSettled([decode(loader), decode(loader)]);
    const worker = await waitForDecodes(2);
    loader.dispose().dispose();
    for (const result of await results) {
      expect(result.status).toBe("rejected");
      if (result.status === "rejected")
        expect(result.reason).toMatchObject({ name: "AbortError" });
    }
    expect(worker.terminate).toHaveBeenCalledOnce();
    await expect(decode(loader)).rejects.toMatchObject({ name: "AbortError" });
    expect(DecoderWorker.instances).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it("aborts an asset still loading when disposed", async () => {
    let signal: AbortSignal | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (input) =>
        new Promise<Response>((_resolve, reject) => {
          signal = (input as Request).signal;
          signal.addEventListener("abort", () => reject(signal!.reason));
        })
    );
    const { loader } = fixture();
    const result = expect(decode(loader)).rejects.toMatchObject({
      name: "AbortError",
    });
    loader.dispose();
    await result;
    expect(signal?.aborted).toBe(true);
    expect(DecoderWorker.instances).toHaveLength(0);
  });

  it("rejects a reserved decode when disposed before native callback registration", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("decoder source")
    );
    const { loader } = fixture();
    let callbacksWhenDisposed = -1;
    DecoderWorker.onInit = () =>
      queueMicrotask(() =>
        queueMicrotask(() => {
          const worker = DecoderWorker.instances[0] as unknown as {
            _callbacks: Record<string, unknown>;
          };
          callbacksWhenDisposed = Object.keys(worker._callbacks).length;
          loader.dispose();
        })
      );
    await expect(decode(loader)).rejects.toMatchObject({ name: "AbortError" });
    expect(callbacksWhenDisposed).toBe(0);
    expect(DecoderWorker.instances[0].terminate).toHaveBeenCalledOnce();
    expect(DecoderWorker.instances[0].messages.map(({ type }) => type)).toEqual(
      ["init"]
    );
  });

  it("revokes initialization completed after disposal without spawning a worker", async () => {
    vi.spyOn(FileLoader.prototype, "load").mockImplementation((_url, onLoad) =>
      onLoad?.("decoder source")
    );
    const { loader } = fixture();
    const result = expect(decode(loader)).rejects.toMatchObject({
      name: "AbortError",
    });
    loader.dispose();
    await result;
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:draco-test");
    expect(DecoderWorker.instances).toHaveLength(0);
  });
});
