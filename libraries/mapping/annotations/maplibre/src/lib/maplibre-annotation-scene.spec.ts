import { describe, expect, it, vi } from "vitest";
import {
  AgXToneMapping,
  Matrix4,
  NoToneMapping,
  PerspectiveCamera,
  Vector3,
} from "three";
import type { Map as MaplibreMap } from "maplibre-gl";
import {
  acquireSharedThreeScene,
  type SharedThreeSceneFrame,
  type SharedThreeSceneRuntime,
} from "@carma-mapping/engines/maplibre";
vi.mock("@carma-mapping/engines/maplibre", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@carma-mapping/engines/maplibre")>()),
  acquireSharedThreeScene: vi.fn(),
}));

import {
  createMapLibreAnnotationScene,
  resolveSceneFromEcefAffine,
} from "./maplibre-annotation-scene";
import type { MapLibreAnnotationScene } from "./maplibre-annotation-scene.types";

/** A scene whose projection is a known affine: scale by 2, swap y/z, shift. */
const createAffineScene = () =>
  ({
    sceneFromEcef: (positionECEF: Vector3, out = new Vector3()) =>
      out.set(
        positionECEF.x * 2 + 10,
        positionECEF.z * 2 - 5,
        positionECEF.y * 2 + 1
      ),
  } as unknown as MapLibreAnnotationScene);

describe("resolveSceneFromEcefAffine", () => {
  it("reproduces the projection around the anchor", () => {
    const scene = createAffineScene();
    const anchor = new Vector3(100, 200, 300);
    const affine = resolveSceneFromEcefAffine(scene, anchor, new Matrix4());
    expect(affine).not.toBeNull();
    const probe = new Vector3(103, 196, 302);
    const expected = scene.sceneFromEcef(probe)!;
    const actual = probe.clone().applyMatrix4(affine!);
    expect(actual.x).toBeCloseTo(expected.x, 9);
    expect(actual.y).toBeCloseTo(expected.y, 9);
    expect(actual.z).toBeCloseTo(expected.z, 9);
  });

  it("returns null while the anchor cannot be projected", () => {
    const scene = {
      sceneFromEcef: () => null,
    } as unknown as MapLibreAnnotationScene;
    expect(resolveSceneFromEcefAffine(scene, new Vector3(1, 2, 3))).toBeNull();
  });
});

describe("annotation scene as a live overlay", () => {
  it.each([false, true])(
    "warms overlay shaders without world tone mapping and restores state when compile throws=%s",
    async (throws) => {
      vi.useFakeTimers();
      const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
      const camera = new PerspectiveCamera();
      const renderer = {
        toneMapping: AgXToneMapping,
        compileAsync: vi.fn(() => {
          expect(renderer.toneMapping).toBe(NoToneMapping);
          if (throws) throw new Error("compile failed");
          return Promise.resolve();
        }),
      };
      const layer = {
        addRuntime: vi.fn<(runtime: SharedThreeSceneRuntime) => void>(),
        removeRuntime: vi.fn(),
        getRenderer: () => renderer,
        runIdleRender: (draw: () => void) => {
          draw();
          return true;
        },
      };
      vi.mocked(acquireSharedThreeScene).mockReturnValue({
        layer,
        release: vi.fn(),
      } as unknown as ReturnType<typeof acquireSharedThreeScene>);
      const map = {
        getCenter: () => ({ lng: 0, lat: 0 }),
        on: vi.fn(),
        off: vi.fn(),
        triggerRepaint: vi.fn(),
      };
      const scene = createMapLibreAnnotationScene(
        map as unknown as MaplibreMap
      );
      try {
        const runtime = layer.addRuntime.mock.calls[0][0];
        expect(runtime.renderAsOverlay).toBe(true);
        expect(runtime.root).toBe(scene.root);
        runtime.update({ renderCamera: camera } as SharedThreeSceneFrame);
        scene.prepareMaterials();
        await vi.runAllTimersAsync();
        expect(renderer.compileAsync).toHaveBeenCalledTimes(1);
        expect(renderer.compileAsync).toHaveBeenCalledWith(scene.root, camera);
        expect(renderer.toneMapping).toBe(AgXToneMapping);
        expect(warning).toHaveBeenCalledTimes(throws ? 1 : 0);
      } finally {
        scene.dispose();
        warning.mockRestore();
        vi.useRealTimers();
      }
    }
  );
});
