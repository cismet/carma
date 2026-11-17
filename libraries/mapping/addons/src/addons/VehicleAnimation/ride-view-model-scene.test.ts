// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createRideViewModelScene,
  type RideViewModelScene,
} from "./ride-view-model-scene";
import type { RideView } from "./ride-views";
import { CAR_SHAPE_GTW15 } from "./track";

const WIDTH = 240;
const HEIGHT = 170;

describe("createRideViewModelScene", () => {
  let scene: RideViewModelScene;

  const marker = (view: RideView) => {
    const found = scene.getMarkers().find((entry) => entry.view === view);
    if (!found) {
      throw new Error(`no marker for ${view}`);
    }
    return found;
  };

  beforeEach(() => {
    // jsdom has no WebGL: three reports that, and the markers work without it
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    scene = createRideViewModelScene({
      canvas: document.createElement("canvas"),
      shape: CAR_SHAPE_GTW15,
      bodyColor: "#6ec6f0",
      bellowsColor: "#a7b1b8",
    });
    scene.setSize(WIDTH, HEIGHT);
  });

  afterEach(() => {
    scene.dispose();
    vi.restoreAllMocks();
  });

  it("starts with the front to the right and the right side facing the viewer", () => {
    expect(marker("front").x).toBeGreaterThan(marker("back").x);
    expect(marker("front").behind).toBe(false);
    expect(marker("right").behind).toBe(false);
    expect(marker("left").behind).toBe(true);
  });

  it("swaps the near and far side when the train turns half way round", () => {
    scene.rotate(Math.PI, 0);
    expect(marker("front").x).toBeLessThan(marker("back").x);
    expect(marker("left").behind).toBe(false);
    expect(marker("right").behind).toBe(true);
  });

  it("keeps every marker inside the widget however the train is turned", () => {
    for (let turn = 0; turn < 24; turn++) {
      scene.rotate(Math.PI / 12, 0.2 * (turn % 2 === 0 ? 1 : -1));
      for (const { x, y } of scene.getMarkers()) {
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(WIDTH);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(HEIGHT);
      }
    }
  });

  it("keeps the camera points apart at every turn, so each can be clicked", () => {
    for (let turn = 0; turn < 24; turn++) {
      scene.rotate(Math.PI / 12, 0);
      const markers = scene.getMarkers();
      for (const a of markers) {
        for (const b of markers) {
          if (a !== b) {
            expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(14);
          }
        }
      }
    }
  });

  it("stops tilting at its limits, so the train cannot turn upside down", () => {
    scene.rotate(0, 100);
    const tiltedAll = marker("front").y;
    scene.rotate(0, 100);
    expect(marker("front").y).toBe(tiltedAll);
  });
});
