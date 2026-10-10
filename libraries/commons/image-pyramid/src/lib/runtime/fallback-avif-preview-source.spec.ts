import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import type { DevicePixels } from "@carma-units";
import {
  AvifAssetChangedError,
  AvifHttpError,
  AvifRepresentationError,
  NativeAvifFormatError,
} from "./avif-source-errors";
import {
  createFallbackAvifPreviewSource,
  isAvifSourceMissing,
} from "./fallback-avif-preview-source";

type FakePreview = {
  url: string;
  budget: number;
  priority?: string;
  options?: unknown;
  getDimensions: Mock<[AbortSignal], Promise<unknown>>;
  select: Mock<[], Promise<{ image: string; refinements: unknown[] }>>;
  read: Mock<[], Promise<string>>;
  close: Mock<[], void>;
  park: Mock<[], void>;
  setActiveCacheBudget: Mock<[number], void>;
};
const state = vi.hoisted(() => ({
  instances: [] as FakePreview[],
  dimensions: new Map<string, (signal: AbortSignal) => Promise<unknown>>(),
}));
vi.mock("./avif-pyramid-preview-source", () => ({
  AvifPyramidPreviewSource: class {
    constructor(
      readonly url: string,
      public budget: number,
      readonly priority?: string,
      readonly options?: unknown
    ) {
      state.instances.push(this);
    }
    getDimensions = vi.fn(
      (signal: AbortSignal) =>
        state.dimensions.get(this.url)?.(signal) ??
        Promise.resolve({ width: 512, height: 384 })
    );
    select = vi.fn<[], Promise<{ image: string; refinements: unknown[] }>>(
      async () => ({ image: this.url, refinements: [] })
    );
    read = vi.fn(async () => this.url);
    close = vi.fn<[], void>();
    park = vi.fn<[], void>();
    setActiveCacheBudget = vi.fn((bytes: number) => {
      this.budget = bytes;
    });
    get residentBytes() {
      return this.budget;
    }
  },
}));
let serial = 0;
const fixture = () => {
  const primary = `https://test.invalid/native-${++serial}.avif`,
    fallback = `https://test.invalid/legacy-${serial}.avif`;
  return {
    primary,
    fallback,
    source: createFallbackAvifPreviewSource(primary, 1024, "high", {
      format: "native",
      fallbackUrl: fallback,
    }),
  };
};
const signal = () => new AbortController().signal;
const native = { width: 512 as DevicePixels, height: 384 as DevicePixels };
const window = {
  source: { x: 0 as DevicePixels, y: 0 as DevicePixels, ...native },
  target: native,
};
afterEach(() => {
  state.instances.length = 0;
  state.dimensions.clear();
  vi.restoreAllMocks();
});

describe("fallback AVIF preview source", () => {
  it("retains the primary identity while binding reads, metrics, budget and close to the selected delegate", async () => {
    const { primary, fallback, source } = fixture();
    state.dimensions.set(primary, async () => {
      throw new AvifHttpError(404, primary);
    });
    source.setActiveCacheBudget(512);
    const selected = await source.select(window, native, signal());
    expect(selected.image).toBe(fallback);
    expect(source.url).toBe(primary);
    expect(source.representationSelected).toBe(true);
    expect(state.instances).toHaveLength(2);
    expect(state.instances[0].options).toMatchObject({ format: "native" });
    expect(state.instances[0].close).toHaveBeenCalledOnce();
    expect(state.instances[1]).toMatchObject({
      url: fallback,
      budget: 512,
      priority: "high",
      options: undefined,
    });
    expect(source.residentBytes).toBe(512);
    await source.read(selected.image, [0, 0, 1, 1], signal());
    expect(state.instances[1].read).toHaveBeenCalledOnce();
    source.park(256);
    expect(state.instances[1].park).toHaveBeenCalledOnce();
    source.close();
    source.close();
    expect(state.instances[1].close).toHaveBeenCalledOnce();
  });
  it("keeps a successful primary and propagates later missing-tile errors without switching formats", async () => {
    const { source } = fixture();
    await source.select(window, native, signal());
    const error = new AvifHttpError(404, source.url);
    state.instances[0].select.mockRejectedValue(error);
    await expect(source.select(window, native, signal())).rejects.toBe(error);
    expect(state.instances).toHaveLength(1);
    expect(source.representationSelected).toBe(true);
    source.close();
  });
  it.each([404, 410])(
    "expires a confirmed HTTP%s miss for a newly opened source, without changing an existing lease",
    async (status) => {
      const now = vi.spyOn(Date, "now").mockReturnValue(1000);
      const { primary, fallback, source } = fixture();
      state.dimensions.set(primary, async () => {
        throw new AvifHttpError(status, primary);
      });
      await source.getDimensions(signal());
      now.mockReturnValue(200000);
      const retry = createFallbackAvifPreviewSource(primary, 1024, "high", {
        format: "native",
        fallbackUrl: fallback,
      });
      await retry.getDimensions(signal());
      expect(state.instances[2].getDimensions).not.toHaveBeenCalled();
      state.dimensions.delete(primary);
      now.mockReturnValue(301001);
      expect((await source.select(window, native, signal())).image).toBe(
        fallback
      );
      const renewed = createFallbackAvifPreviewSource(primary, 1024, "high", {
        format: "native",
        fallbackUrl: fallback,
      });
      expect((await renewed.select(window, native, signal())).image).toBe(
        primary
      );
      source.close();
      retry.close();
      renewed.close();
    }
  );
  it.each([
    new DOMException("Aborted", "AbortError"),
    new TypeError("Failed to fetch"),
    new NativeAvifFormatError("Bad native file"),
    new AvifRepresentationError("Wrong representation"),
    new AvifAssetChangedError(),
    new AvifHttpError(503, "https://test.invalid/unavailable.avif"),
  ])("does not fall back or negatively cache %s", async (error) => {
    const { source, primary } = fixture();
    state.dimensions.set(primary, async () => {
      throw error;
    });
    await expect(source.getDimensions(signal())).rejects.toBe(error);
    expect(isAvifSourceMissing(error)).toBe(false);
    expect(source.representationSelected).toBe(false);
    expect(state.instances).toHaveLength(1);
    state.dimensions.delete(primary);
    await expect(source.getDimensions(signal())).resolves.toEqual(native);
    source.close();
  });
  it("aborts pending initialization on close without opening the fallback", async () => {
    const { source, primary } = fixture();
    state.dimensions.set(
      primary,
      (signal) =>
        new Promise((_, reject) =>
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          })
        )
    );
    const pending = source.getDimensions(signal());
    source.close();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(state.instances).toHaveLength(1);
    expect(state.instances[0].close).toHaveBeenCalledOnce();
    await expect(source.getDimensions(signal())).rejects.toMatchObject({
      name: "AbortError",
    });
  });
});
