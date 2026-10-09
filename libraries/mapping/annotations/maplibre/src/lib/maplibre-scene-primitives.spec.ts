import { describe, expect, it } from "vitest";
import { GreaterDepth, Group, Matrix4, Vector3, type Mesh } from "three";
import { ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT } from "@carma-mapping/annotations/runtime";
import {
  createMapLibreScenePolygonFills,
  resolveFillGridPitchMeters,
  resolveSceneFromEcefAffine,
} from "./maplibre-scene-primitives";
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

/** The affine scene with the root and frame plumbing the primitives need. */
const createPrimitiveScene = () => {
  const root = new Group();
  const scene = {
    ...createAffineScene(),
    root,
    subscribeFrameUpdate: () => () => undefined,
    requestRender: () => undefined,
    getPixelsPerMeterAtScene: () => 50,
    worldToScreen: () => null,
  } as unknown as MapLibreAnnotationScene;
  return { scene, root };
};

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

describe("createMapLibreScenePolygonFills", () => {
  const positionsECEF = [
    new Vector3(6_000_000, 500_000, 300_000),
    new Vector3(6_000_010, 500_000, 300_000),
    new Vector3(6_000_010, 500_000, 300_008),
    new Vector3(6_000_000, 500_000, 300_008),
  ];

  it("places every polygon vertex where the scene projects its ECEF position", () => {
    const { scene, root } = createPrimitiveScene();
    const fills = createMapLibreScenePolygonFills(scene);
    fills.setPolygonFills([
      {
        id: "fill",
        positionsECEF,
        fill: "rgba(112, 168, 255, 0.25)",
        placement: ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT.COPLANAR,
      },
    ]);
    root.updateMatrixWorld(true);
    const meshes = root.children.filter(
      (child): child is Mesh => (child as Mesh).isMesh
    );
    // The visible pass and the occluded pass share the geometry and the placement.
    expect(meshes).toHaveLength(2);
    for (const mesh of meshes) {
      const positions = mesh.geometry.getAttribute("position");
      for (let index = 0; index < positionsECEF.length; index += 1) {
        const vertex = new Vector3()
          .fromBufferAttribute(positions, index)
          .applyMatrix4(mesh.matrixWorld);
        const expected = scene.sceneFromEcef(positionsECEF[index]!)!;
        expect(vertex.x).toBeCloseTo(expected.x, 3);
        expect(vertex.y).toBeCloseTo(expected.y, 3);
        expect(vertex.z).toBeCloseTo(expected.z, 3);
      }
    }
    fills.destroy();
    expect(root.children).toHaveLength(0);
  });

  it("draws the part behind the surface as a depth-fail pass on top", () => {
    const { scene, root } = createPrimitiveScene();
    const fills = createMapLibreScenePolygonFills(scene);
    fills.setPolygonFills([
      {
        id: "fill",
        positionsECEF,
        fill: "rgba(112, 168, 255, 0.4)",
        placement: ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT.COPLANAR,
      },
    ]);
    const [visible, occluded] = root.children as Mesh[];
    expect(visible!.renderOrder).toBeLessThan(occluded!.renderOrder);
    const visibleMaterial = visible!.material as {
      opacity: number;
      depthFunc: number;
    };
    const occludedMaterial = occluded!.material as {
      opacity: number;
      depthFunc: number;
    };
    expect(occludedMaterial.depthFunc).toBe(GreaterDepth);
    expect(visibleMaterial.depthFunc).not.toBe(GreaterDepth);
    expect(visibleMaterial.opacity).toBeGreaterThan(0.4);
    expect(visibleMaterial.opacity).toBeLessThanOrEqual(1);
    // The dot screen is mapped in plane metres: 10 m along the first edge.
    const uv = occluded!.geometry.getAttribute("uv");
    expect(uv.count).toBe(positionsECEF.length);
    expect(
      Math.hypot(uv.getX(1) - uv.getX(0), uv.getY(1) - uv.getY(0))
    ).toBeCloseTo(10, 4);
    fills.destroy();
  });
});

describe("resolveFillGridPitchMeters", () => {
  it("picks the 1-2-5 pitch that spans at least ten pixels", () => {
    // 50 px per metre: 0.2 m is 10 px.
    expect(resolveFillGridPitchMeters(50)).toBe(0.2);
    // 3 px per metre: 2 m is 6 px, 5 m is 15 px.
    expect(resolveFillGridPitchMeters(3)).toBe(5);
    // 0.012 px per metre: 1000 m is 12 px.
    expect(resolveFillGridPitchMeters(0.012)).toBe(1000);
  });

  it("never spans more than 2.5 times the minimum", () => {
    for (const pixelsPerMeter of [0.5, 1, 4, 7, 12, 33, 80, 250]) {
      const px = resolveFillGridPitchMeters(pixelsPerMeter) * pixelsPerMeter;
      expect(px).toBeGreaterThanOrEqual(10);
      expect(px).toBeLessThanOrEqual(25);
    }
  });

  it("falls back to the coarsest pitch without a scale", () => {
    expect(resolveFillGridPitchMeters(0)).toBe(1000);
  });
});
