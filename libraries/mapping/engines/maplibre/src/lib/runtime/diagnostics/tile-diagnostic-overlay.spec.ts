// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { OverlayModel } from "../../core/diagnostics/tile-diagnostic-model";
import { createTileDiagnosticOverlay } from "./tile-diagnostic-overlay";
import { yieldTileDiagnosticTask } from "./tile-diagnostic-scheduler";
vi.mock("./tile-diagnostic-scheduler", () => ({
  scheduleTileDiagnosticTask: (fn: () => void) => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) fn();
    });
    return () => {
      cancelled = true;
    };
  },
  yieldTileDiagnosticTask: vi.fn(() => Promise.resolve()),
}));
class TestWorker {
  static instances: TestWorker[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    TestWorker.instances.push(this);
  }
  emit(data: unknown) {
    this.onmessage?.({ data });
  }
}
const tick = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};
const model = (): OverlayModel => ({
  width: 400,
  height: 300,
  extent: null,
  intersectionEdges: null,
  centerHit: null,
  footprintBounds: null,
  rects: [],
  target: 2,
});
const input = (value = model()) => ({
  model: value,
  view: { x: 0, y: 0, w: 400, h: 300 },
  opacity: 1,
  popout: false,
  labels: "none" as const,
  hover: null,
});
const frames = (worker: TestWorker) =>
  worker.postMessage.mock.calls
    .map((call) => call[0])
    .filter((message) => message.type === "frame");
beforeEach(() => {
  vi.useFakeTimers();
  TestWorker.instances = [];
  vi.stubGlobal("Worker", TestWorker);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(private callback: (entries: unknown[]) => void) {}
      observe() {
        this.callback([{ contentRect: { width: 400, height: 300 } }]);
      }
      disconnect() {}
    }
  );
  Object.defineProperty(
    HTMLCanvasElement.prototype,
    "transferControlToOffscreen",
    { configurable: true, value: () => ({}) }
  );
});
afterEach(() => {
  vi.runAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
describe("diagnostic worker mailbox", () => {
  it("delivers camera changes immediately during an unacknowledged tile frame without repacking tiles", async () => {
    const overlay = createTileDiagnosticOverlay(document.createElement("div"));
    const worker = TestWorker.instances[0];
    worker.emit({ type: "ready" });
    overlay.update(input());
    await tick();
    expect(frames(worker)).toHaveLength(1);
    const camera = new THREE.PerspectiveCamera();
    camera.updateMatrixWorld();
    overlay.updateCamera(camera);
    camera.position.x = 12;
    camera.updateMatrixWorld();
    overlay.updateCamera(camera);
    overlay.updateCamera(camera);
    const messages = worker.postMessage.mock.calls
      .map(([message]) => message)
      .filter((message) => message.type === "camera");
    expect(messages).toHaveLength(2);
    expect(messages[0].camera.matrixWorld[12]).toBe(0);
    expect(messages[1].camera.matrixWorld[12]).toBe(12);
    expect(frames(worker)).toHaveLength(1);
    overlay.updateCamera(camera, true);
    expect(
      worker.postMessage.mock.calls.filter(
        ([message]) => message.type === "camera"
      )
    ).toHaveLength(3);
    overlay.dispose();
    overlay.updateCamera(camera);
    expect(
      worker.postMessage.mock.calls.filter(
        ([message]) => message.type === "camera"
      )
    ).toHaveLength(3);
  });

  it("does not replace hover indices when an obsolete snapshot is discarded", async () => {
    const overlay = createTileDiagnosticOverlay(document.createElement("div"));
    const worker = TestWorker.instances[0];
    const rect = {
      tile: {},
      id: "a",
      x: 0,
      y: 0,
      w: 20,
      h: 20,
      kind: "displayed",
      phase: "",
      error: 2,
      floor: false,
      ring: false,
      outsideDemand: false,
      quality: null,
    } as OverlayModel["rects"][number];
    const a = model();
    a.rects = [rect];
    overlay.update(input(a));
    worker.emit({ type: "ready" });
    await tick();
    worker.emit({ type: "frame" });
    const b = model();
    b.rects = Array.from(
      { length: 128 },
      () => ({ ...rect, tile: {} } as typeof rect)
    );
    b.rects[127] = rect;
    let now = 0;
    vi.spyOn(performance, "now").mockImplementation(() => (now += 3));
    vi.mocked(yieldTileDiagnosticTask).mockImplementationOnce(() => {
      overlay.update({
        ...input(a),
        hover: { tile: rect.tile, parent: null, siblings: [] },
      });
      return Promise.resolve();
    });
    overlay.update(input(b));
    await tick();
    expect(frames(worker)).toHaveLength(2);
    expect(frames(worker)[1].snapshot).toBeUndefined();
    expect(frames(worker)[1].frame.selection).toEqual([[0, 1]]);
    overlay.dispose();
  });
  it("starts only on attachment and coalesces pending models behind one in-flight frame", async () => {
    expect(TestWorker.instances).toHaveLength(0);
    const host = document.createElement("div");
    document.body.append(host);
    const overlay = createTileDiagnosticOverlay(host);
    const worker = TestWorker.instances[0];
    overlay.update(input());
    await tick();
    expect(frames(worker)).toHaveLength(0);
    worker.emit({ type: "ready" });
    await tick();
    expect(frames(worker)).toHaveLength(1);
    const latest = input();
    latest.model.target = 7;
    overlay.update(input());
    overlay.update(latest);
    await tick();
    expect(frames(worker)).toHaveLength(1);
    worker.emit({
      type: "frame",
      instances: 0,
      bufferBytes: 0,
      uploads: 1,
      workerMs: 1,
    });
    await tick();
    expect(frames(worker)).toHaveLength(2);
    expect(frames(worker)[1].snapshot.target).toBe(7);
    overlay.dispose();
    expect(host.querySelectorAll("canvas")).toHaveLength(0);
    worker.emit({ type: "disposed" });
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });
  it("does not re-upload geometry on pan, and cancels queued work on dispose", async () => {
    const host = document.createElement("div");
    const overlay = createTileDiagnosticOverlay(host),
      worker = TestWorker.instances[0],
      state = input();
    overlay.update(state);
    worker.emit({ type: "ready" });
    await tick();
    worker.emit({ type: "frame" });
    await tick();
    overlay.update({ ...state, view: { ...state.view, x: 20 } });
    await tick();
    expect(frames(worker)[1].snapshot).toBeUndefined();
    worker.emit({ type: "frame" });
    overlay.update(input());
    overlay.dispose();
    await tick();
    expect(frames(worker)).toHaveLength(2);
    vi.advanceTimersByTime(250);
    expect(worker.terminate).toHaveBeenCalled();
  });
  it("fails closed on worker errors without disturbing the scene", async () => {
    const status = vi.fn(),
      host = document.createElement("div");
    const overlay = createTileDiagnosticOverlay(host, { onStatus: status });
    const worker = TestWorker.instances[0];
    worker.emit({ type: "error", message: "GPU unavailable" });
    expect(status).toHaveBeenCalledWith({
      ready: false,
      error: "GPU unavailable",
    });
    expect(host.children).toHaveLength(0);
    overlay.update(input());
    await tick();
    expect(frames(worker)).toHaveLength(0);
    overlay.dispose();
  });
});
