import { describe, expect, it } from "vitest";
import { GreaterDepth, Group, Matrix4, Vector3, type Mesh } from "three";
import { getLocalUpDirectionAtAnchor } from "@carma-mapping/annotations/core";
import { ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT } from "@carma-mapping/annotations/runtime";
import {
  createMapLibreScenePolygonFills,
  resolveSceneFromEcefAffine,
} from "./maplibre-scene-primitives";
import {
  resolveAreaFillGridPitchMeters,
  resolveMapLibreAreaFillStyle,
} from "./maplibre-area-fill-style";
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

describe("resolveAreaFillGridPitchMeters", () => {
  it("picks the 1-2-5 pitch that spans at least ten pixels", () => {
    // 3 px per metre: 2 m is 6 px, 5 m is 15 px.
    expect(resolveAreaFillGridPitchMeters(3)).toBe(5);
    // 0.012 px per metre: 1000 m is 12 px.
    expect(resolveAreaFillGridPitchMeters(0.012)).toBe(1000);
  });

  it("never goes below one metre, however close the view", () => {
    expect(resolveAreaFillGridPitchMeters(50)).toBe(1);
    expect(resolveAreaFillGridPitchMeters(250)).toBe(1);
  });

  it("spans ten to twenty-five pixels wherever a metre fits", () => {
    for (const pixelsPerMeter of [0.5, 1, 4, 7, 10]) {
      const px = resolveAreaFillGridPitchMeters(pixelsPerMeter) * pixelsPerMeter;
      expect(px).toBeGreaterThanOrEqual(10);
      expect(px).toBeLessThanOrEqual(25);
    }
  });

  it("falls back to the coarsest pitch without a scale", () => {
    expect(resolveAreaFillGridPitchMeters(0)).toBe(1000);
  });
});

describe("ground placement", () => {
  it("flattens a ground area onto the tangent plane of its lowest corner", () => {
    const { scene, root } = createPrimitiveScene();
    const fills = createMapLibreScenePolygonFills(scene);
    const anchor = new Vector3(4_000_000, 500_000, 4_900_000);
    const up = getLocalUpDirectionAtAnchor(anchor);
    const east = new Vector3(-anchor.y, anchor.x, 0).normalize();
    const north = new Vector3().crossVectors(up, east).normalize();
    // A courtyard rectangle where one corner caught a kerb 0.4 m up.
    const positionsECEF = [
      anchor.clone(),
      anchor.clone().addScaledVector(east, 12),
      anchor.clone().addScaledVector(east, 12).addScaledVector(north, 8),
      anchor
        .clone()
        .addScaledVector(north, 8)
        .addScaledVector(up, 0.4),
    ];
    fills.setPolygonFills([
      {
        id: "ground",
        positionsECEF,
        fill: "rgba(107, 188, 123, 0.25)",
        placement: ANNOTATION_SCENE_POLYGON_FILL_PLACEMENT.GROUND,
      },
    ]);
    root.updateMatrixWorld(true);
    const [mesh] = root.children as Mesh[];
    const positions = mesh!.geometry.getAttribute("position");
    // The geometry is relative to the anchor, so every corner's height above
    // the tangent plane is its dot with up.
    for (let index = 0; index < positions.count; index += 1) {
      const local = new Vector3().fromBufferAttribute(positions, index);
      expect(Math.abs(local.dot(up))).toBeLessThan(1e-3);
    }
    fills.destroy();
  });
});

describe("resolveMapLibreAreaFillStyle", () => {
  it("keeps the defaults for anything missing or malformed", () => {
    const style = resolveMapLibreAreaFillStyle({
      checkerDarkShare: 2,
      gridPitchSeriesMeters: [5, -1, 2],
      crosshairArmCssPx: Number.NaN,
    });
    expect(style.checkerDarkShare).toBe(1);
    expect(style.gridPitchSeriesMeters).toEqual([2, 5]);
    expect(style.crosshairArmCssPx).toBe(3);
    expect(style.visibleOpacityFactor).toBe(1.8);
  });

  it("drives the pitch with its own series", () => {
    const style = resolveMapLibreAreaFillStyle({
      gridPitchSeriesMeters: [0.5, 5],
      gridMinPitchCssPx: 20,
    });
    expect(resolveAreaFillGridPitchMeters(50, style)).toBe(0.5);
    expect(resolveAreaFillGridPitchMeters(5, style)).toBe(5);
  });
});
