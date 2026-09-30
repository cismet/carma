import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchGroundElevationMeters,
  GROUND_ELEVATION_TIMEOUT_MS,
} from "./ground-elevation";

const source = { tileUrlTemplate: "https://dem.test/{z}/{x}/{y}.png" };
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("ground elevation startup probe", () => {
  it.each(["headers", "body"])(
    "releases startup when DEM %s stall",
    async (stage) => {
      vi.useFakeTimers();
      const pending = new Promise<never>(() => {});
      const fetchMock = vi.fn((_url: string, _init: RequestInit) =>
        stage === "headers"
          ? pending
          : Promise.resolve({ ok: true, blob: () => pending })
      );
      vi.stubGlobal("fetch", fetchMock);
      const probe = fetchGroundElevationMeters(7.2, 51.2, source);
      await vi.advanceTimersByTimeAsync(GROUND_ELEVATION_TIMEOUT_MS);
      expect(await probe).toBeNull();
      expect(fetchMock.mock.calls[0][1].signal!.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it("releases a pending probe when its layer is removed", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      (_url: string, _init: RequestInit) => new Promise<never>(() => {})
    );
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const probe = fetchGroundElevationMeters(7.2, 51.2, {
      ...source,
      signal: controller.signal,
    });
    controller.abort();
    expect(await probe).toBeNull();
    expect(fetchMock.mock.calls[0][1].signal!.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps fast height sampling and closes its bitmap", async () => {
    vi.useFakeTimers();
    const close = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, blob: async () => new Blob() }))
    );
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 1, height: 1, close }))
    );
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        getContext() {
          return {
            drawImage: vi.fn(),
            getImageData: () => ({
              width: 1,
              height: 1,
              data: new Uint8ClampedArray([128, 100, 0, 255]),
            }),
          };
        }
      }
    );
    expect(await fetchGroundElevationMeters(7.2, 51.2, source)).toBe(100);
    expect(close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
