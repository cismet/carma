// @vitest-environment jsdom

import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  THREE_TILES_DEBUG_COLORS,
  createThreeTilesDebugOverlay,
  getThreeTilesDebugColor,
} from "./three-tiles-debug-overlay";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getThreeTilesDebugColor", () => {
  it("distinguishes viewport and shadow-path tiles", () => {
    expect(getThreeTilesDebugColor("viewport")).toBe(
      THREE_TILES_DEBUG_COLORS.viewport
    );
    expect(getThreeTilesDebugColor("shadow")).toBe(
      THREE_TILES_DEBUG_COLORS.shadow
    );
    expect(getThreeTilesDebugColor(undefined)).toBe(
      THREE_TILES_DEBUG_COLORS.other
    );
  });
});

describe("createThreeTilesDebugOverlay", () => {
  it("adds only bounding-box edges and tile labels to the scene", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      font: "",
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      textBaseline: "alphabetic",
      measureText: () => ({ width: 80 }),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
    } as unknown as CanvasRenderingContext2D);

    const parent = new THREE.Group();
    const overlay = createThreeTilesDebugOverlay(parent);
    overlay.update([
      {
        id: "mesh/tile-42.b3dm",
        bounds: new THREE.Box3(
          new THREE.Vector3(-1, 2, -3),
          new THREE.Vector3(4, 8, 6)
        ),
        loadReason: "shadow",
      },
    ]);

    expect(overlay.root.children).toHaveLength(2);
    expect(overlay.root.children[0]).toBeInstanceOf(THREE.LineSegments);
    expect(overlay.root.children[1]).toBeInstanceOf(THREE.Sprite);
    expect(
      overlay.root.children.some((child) => child instanceof THREE.Mesh)
    ).toBe(false);

    overlay.dispose();
    expect(parent.children).not.toContain(overlay.root);
  });
});
