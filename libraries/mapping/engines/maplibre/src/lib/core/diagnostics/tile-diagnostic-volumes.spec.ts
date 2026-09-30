import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  buildVolumeOverlayModel,
  projectDiagnosticVolumes,
} from "./tile-diagnostic-volumes";
import {
  snapshotTileCameraViews,
  TILE_CAMERA_ROLE,
  TILE_MAIN_OBSERVER_ID,
} from "../tile-camera-demand";
import { TILE_DIAGNOSTIC_PROJECTION } from "./tile-diagnostic-options";
import type { SharedThreeSceneTileVolume } from "../shared-three-scene-types";

const frustumOf = (camera: THREE.Camera) => {
  camera.updateMatrixWorld(true);
  return new THREE.Frustum().setFromProjectionMatrix(
    camera.projectionMatrix
      .clone()
      .multiply(camera.matrixWorld.clone().invert()),
    camera.coordinateSystem,
    camera.reversedDepth
  );
};

const volume = (
  id: string,
  min: [number, number, number],
  max: [number, number, number],
  extra: Partial<SharedThreeSceneTileVolume> = {}
): SharedThreeSceneTileVolume => ({
  id,
  kind: "terrain-tile",
  minimum: min,
  maximum: max,
  ...extra,
});

describe("projectDiagnosticVolumes", () => {
  const toScreen = (x: number, z: number): [number, number] => [x, z];
  const identity = new THREE.Matrix4();

  it("cuts 2.5D tiles with the main and the corridor frustum", () => {
    const main = new THREE.PerspectiveCamera(60, 1, 1, 400);
    main.position.set(0, 0, 0);
    main.lookAt(0, 0, -1);
    // Overhead corridor over the tile behind the camera, like a sun frustum.
    const corridor = new THREE.OrthographicCamera(-60, 60, 60, -60, 1, 600);
    corridor.position.set(0, 300, 110);
    corridor.lookAt(0, 0, 110);
    const projected = projectDiagnosticVolumes(
      [
        volume("in-view", [-10, -10, -120], [10, 10, -100]),
        volume("behind", [-10, -10, 100], [10, 10, 120], {
          state: "loading",
        }),
      ],
      identity,
      toScreen,
      frustumOf(main),
      frustumOf(corridor)
    );
    expect(projected.map((entry) => entry.id)).toEqual(["in-view", "behind"]);
    const [inView, behind] = projected;
    expect(inView.inView).toBe(true);
    expect(inView.inShadow).toBe(false);
    expect(inView.kind).toBe("displayed");
    expect(behind.inView).toBe(false);
    expect(behind.inShadow).toBe(true);
    expect(behind.kind).toBe("loading");
  });

  it("projects the footprint and drops unusable boxes", () => {
    const [rect, ...rest] = projectDiagnosticVolumes(
      [
        volume("tile", [10, 0, 20], [30, 5, 60], { loadReason: "shadow" }),
        volume("broken", [Number.NaN, 0, 0], [1, 1, 1]),
      ],
      identity,
      toScreen,
      null,
      null
    );
    expect(rest).toHaveLength(0);
    expect([rect.x, rect.y, rect.w, rect.h]).toEqual([10, 20, 20, 40]);
    // Height still bounds the box even though the overview drops the y axis.
    expect(rect.world.max.y).toBe(5);
    expect(rect.inView).toBe(true);
    expect(rect.inShadow).toBe(false);
    expect(rect.kind).toBe("resident");
  });
});

describe("buildVolumeOverlayModel", () => {
  const tiles = [
    volume("west", [0, 0, 0], [100, 20, 100]),
    volume("east", [100, 0, 0], [200, 30, 100], { state: "loading" }),
  ];

  it("frames a source that has no tile tree", () => {
    const model = buildVolumeOverlayModel({
      volumes: tiles,
      camera: null,
      shadowCamera: null,
      width: 400,
      height: 300,
    });
    if (!model) throw new Error("expected a model");
    expect(model.rects).toEqual([]);
    expect(model.volumes?.map((entry) => entry.id)).toEqual(["west", "east"]);
    expect(model.volumes?.[1].kind).toBe("loading");
    // The extent is the union of the boxes and stays inside the canvas.
    expect(model.viewportBasis?.bounds).toEqual([0, 0, 0, 200, 30, 100]);
    expect(model.viewportBasis?.rectBounds).toEqual([
      0, 0, 0, 100, 20, 100, 100, 0, 0, 200, 30, 100,
    ]);
    expect(model.viewportBasis?.rectTransforms).toEqual([
      ...new THREE.Matrix4().toArray(),
      ...new THREE.Matrix4().toArray(),
    ]);
    const extent = model.extent;
    if (!extent) throw new Error("expected an extent");
    expect(extent.x).toBeGreaterThanOrEqual(0);
    expect(extent.x + extent.w).toBeLessThanOrEqual(400);
    expect(extent.y + extent.h).toBeLessThanOrEqual(300);
    // Live cameras project through the same screen basis as the boxes.
    const [scale, screenX, screenY] = model.viewportBasis?.screen ?? [];
    expect(scale * 200 + screenX).toBeCloseTo(extent.x + extent.w, 6);
    expect(scale * 100 + screenY).toBeCloseTo(extent.y + extent.h, 6);
  });

  it("aligns box geometry to the filtered perspective records", () => {
    const camera = new THREE.PerspectiveCamera(60, 4 / 3, 1, 400);
    camera.lookAt(0, 0, -1);
    const [observer] = snapshotTileCameraViews([
      {
        id: TILE_MAIN_OBSERVER_ID,
        camera,
        viewport: [400, 300],
        errorTargetPixels: 1,
        role: TILE_CAMERA_ROLE.RECEIVER,
      },
    ]);
    const model = buildVolumeOverlayModel({
      volumes: [
        volume("behind", [-10, -10, 100], [10, 10, 120]),
        volume("visible", [-10, -10, -120], [10, 10, -100]),
      ],
      camera: observer,
      shadowCamera: null,
      projection: TILE_DIAGNOSTIC_PROJECTION.CAMERA,
      width: 400,
      height: 300,
    });
    expect(model?.volumes?.map(({ id }) => id)).toEqual(["visible"]);
    expect(model?.viewportBasis?.cameraProjection).toEqual({
      reversedDepth: false,
    });
    expect(model?.viewportBasis?.rectBounds).toEqual([
      -10, -10, -120, 10, 10, -100,
    ]);
    expect(model?.viewportBasis?.rectTransforms).toEqual(
      new THREE.Matrix4().toArray()
    );
  });

  it("returns nothing without usable boxes or space to draw them", () => {
    expect(
      buildVolumeOverlayModel({
        volumes: [],
        camera: null,
        shadowCamera: null,
        width: 400,
        height: 300,
      })
    ).toBeNull();
    expect(
      buildVolumeOverlayModel({
        volumes: tiles,
        camera: null,
        shadowCamera: null,
        width: 40,
        height: 300,
      })
    ).toBeNull();
  });
});
