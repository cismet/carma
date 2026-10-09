import { describe, expect, it } from "vitest";
import { Matrix4, Vector3 } from "three";
import { resolveSceneFromEcefAffine } from "./maplibre-scene-primitives";
import type { MapLibreAnnotationScene } from "./maplibre-annotation-scene";

/** A scene whose projection is a known affine: scale by 2, swap y/z, shift. */
const createAffineScene = (): Pick<
  MapLibreAnnotationScene,
  "sceneFromEcef"
> => ({
  sceneFromEcef: (positionECEF, out = new Vector3()) =>
    out.set(
      positionECEF.x * 2 + 10,
      positionECEF.z * 2 - 5,
      positionECEF.y * 2 + 1
    ),
});

describe("resolveSceneFromEcefAffine", () => {
  it("reproduces the projection around the anchor", () => {
    const scene = createAffineScene() as MapLibreAnnotationScene;
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
