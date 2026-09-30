// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Vector3 } from "three";
import { MeshCoverageCameraWindows } from "./MeshCoverageCameraWindows";

const mocks = vi.hoisted(() => ({
  layer: {
    projectLngLatToScene: vi.fn(),
    isRenderingPaused: () => false,
    setTileCameraView: vi.fn(),
    removeTileCameraView: vi.fn(),
    requestTileCameraAhead: vi.fn((viewAt: (aheadMs: number) => unknown) => {
      viewAt(500);
      return "coverage-window-0:ahead";
    }),
    removePrefetchCameraView: vi.fn(),
  },
  acquire: vi.fn(),
  release: vi.fn(),
  dispose: vi.fn(),
  render: vi.fn(async () => {}),
  sample: vi.fn(),
}));
vi.mock("@carma-mapping/engines/maplibre", () => ({
  acquireSharedThreeScene: mocks.acquire,
  createSharedThreeSceneCameraPreview: () => ({
    present: mocks.render,
    dispose: mocks.dispose,
  }),
  createCameraFlightPlayer: () => ({
    sample: mocks.sample,
    sampleAhead: mocks.sample,
    dispose() {},
  }),
  createCameraLensClip: () => ({}),
  sampleCameraPathGroundHeights: async (_: unknown, points: unknown[]) =>
    points.map(() => 150),
  TILE_CAMERA_PRIORITY: { SECONDARY: 0 },
  TILE_CAMERA_ROLE: { RECEIVER: "receiver" },
}));
vi.mock("@carma-commons/resources", () => ({
  NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN: {},
  WUPPERTAL_CAMERA_FLIGHTS: {
    schwebebahn: {
      coordinates: [
        [7.2, 51.2],
        [7.3, 51.3],
      ],
      aboveGround: 113,
      duration: 180,
      fov: [60, 50],
      note: "Rail",
    },
    wupper: {
      coordinates: [
        [7.2, 51.2],
        [7.3, 51.3],
      ],
      aboveGround: 180,
      duration: 180,
      fov: [30, 12],
      note: "River",
    },
  },
  WUPPERTAL_HKW_CHIMNEY: {
    longitude: 7.1,
    latitude: 51.2,
    footHeight: 140,
    topHeight: 338,
  },
}));

let frames: FrameRequestCallback[];
let observers: Array<{ element?: Element; callback: () => void }>;
const map = {
  getContainer: () => document.body,
  getCenter: () => ({ lng: 7.2, lat: 51.2 }),
  triggerRepaint: vi.fn(),
};
const props = { map, runtime: {} } as unknown as Parameters<
  typeof MeshCoverageCameraWindows
>[0];
const flush = async () => {
  await act(async () => {});
};
beforeEach(() => {
  vi.clearAllMocks();
  frames = [];
  observers = [];
  mocks.acquire.mockReturnValue({ layer: mocks.layer, release: mocks.release });
  mocks.layer.projectLngLatToScene.mockImplementation(() => new Vector3());
  vi.stubGlobal(
    "ResizeObserver",
    class {
      record: { element?: Element; callback: () => void };
      constructor(callback: () => void) {
        this.record = { callback };
        observers.push(this.record);
      }
      observe(element: Element) {
        this.record.element = element;
      }
      disconnect() {}
    }
  );
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("shared camera windows", () => {
  it("delegates presentation, bounds in-flight work and ignores foreign rAF time origins", async () => {
    let now = 100;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const putImageData = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      putImageData,
    } as unknown as CanvasRenderingContext2D);
    vi.stubGlobal(
      "ImageData",
      class {
        constructor(
          public data: Uint8ClampedArray,
          public width: number,
          public height: number
        ) {}
      }
    );
    let complete: () => void = () => {};
    mocks.render.mockImplementationOnce(() => {
      return new Promise<void>((resolve) => {
        complete = resolve;
      });
    });
    const { unmount } = render(
      <MeshCoverageCameraWindows {...props} initialCount={1} />
    );
    await flush();
    await act(async () => {
      frames.shift()!(10000);
    });
    now += 16;
    await act(async () => {
      frames.shift()!(16);
    });
    expect(mocks.render).toHaveBeenCalledTimes(1); // bounded in-flight work
    await act(async () => {
      complete();
    });
    expect(putImageData).not.toHaveBeenCalled();
    now += 16;
    await act(async () => {
      frames.shift()!(32);
    });
    expect(putImageData).not.toHaveBeenCalled(); // owned by the shared presenter
    expect(mocks.sample.mock.lastCall?.[0]).toBeCloseTo(0.032);
    expect(mocks.render).toHaveBeenCalledTimes(2);
    unmount();
    expect(putImageData).not.toHaveBeenCalled();
  });
  it("starts closed in the reference story and enables cameras through one control window", async () => {
    render(<MeshCoverageCameraWindows {...props} />);
    expect(mocks.acquire).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cameras" }));
    for (const id of [1, 2, 3])
      fireEvent.click(
        screen.getByRole("switch", { name: `Enable camera ${id}` })
      );
    await flush();
    expect(mocks.acquire).toHaveBeenCalledTimes(3);
    expect(
      screen.getAllByRole("button", { name: /^Close camera \d/ })
    ).toHaveLength(3);
    fireEvent.click(screen.getByRole("switch", { name: "Enable camera 2" }));
    expect(mocks.layer.removeTileCameraView).toHaveBeenCalledWith(
      "coverage-window-1"
    );
  });

  it("collapses options and derives resolution from the viewport without reacquiring the scene", async () => {
    const { container } = render(
      <MeshCoverageCameraWindows {...props} initialCount={1} />
    );
    await flush();
    expect(
      container.querySelector('[data-test-id="camera-options-0"]')
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Camera 1 options" }));
    expect(
      container.querySelector('[data-test-id="camera-options-0"]')
    ).not.toBeNull();
    expect(screen.queryByRole("spinbutton")).toBeNull();
    const viewport = observers[0].element!;
    Object.defineProperties(viewport, {
      clientWidth: { value: 800 },
      clientHeight: { value: 400 },
    });
    act(() => observers[0].callback());
    await act(async () => {
      frames.shift()!(16);
    });
    expect(mocks.render.mock.calls[0].slice(2, 4)).toEqual([800, 400]);
    expect(mocks.acquire).toHaveBeenCalledTimes(1);
  });

  it("adopts the same canvas on undock, returns it on popup close and releases only on disable", async () => {
    const document2 = document.implementation.createHTMLDocument("Camera");
    const events = new EventTarget();
    const popup = {
      document: document2,
      closed: false,
      addEventListener: events.addEventListener.bind(events),
      close: vi.fn(),
    };
    vi.spyOn(window, "open").mockReturnValue(popup as unknown as Window);
    const { unmount } = render(
      <MeshCoverageCameraWindows {...props} initialCount={1} />
    );
    await flush();
    const canvas = document.querySelector(
      '[data-test-id="tile-manager-camera-preview"]'
    );
    fireEvent.click(screen.getByRole("button", { name: "Undock camera 1" }));
    expect(document2.querySelector("canvas")).toBe(canvas);
    expect(mocks.acquire).toHaveBeenCalledTimes(1);
    expect(mocks.release).not.toHaveBeenCalled();
    act(() => events.dispatchEvent(new Event("pagehide")));
    expect(
      document.querySelector('[data-test-id="tile-manager-camera-preview"]')
    ).toBe(canvas);
    unmount();
    expect(mocks.release).toHaveBeenCalledTimes(1);
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
  });

  it("keeps a blocked popup inline and displays the reason", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    render(<MeshCoverageCameraWindows {...props} initialCount={1} />);
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Undock camera 1" }));
    expect(screen.getByRole("status").textContent).toContain("Popup blocked");
    expect(
      screen.getByRole("button", { name: "Undock camera 1" })
    ).toBeTruthy();
  });
});
