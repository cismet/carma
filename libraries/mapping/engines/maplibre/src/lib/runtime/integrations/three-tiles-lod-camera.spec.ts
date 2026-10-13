// D0: the 3D Tiles runtime selects tiles with the true perspective LOD camera.
// The MapLibre-composite render camera (shared-three-scene-layer.ts) carries a
// uniformly scaled projective matrix, from which 3d-tiles-renderer 0.5.2
// (prepareForTraversal, TilesRenderer.js) would derive a screen-space-error
// denominator inflated by the metres per pixel of the map.
import { TilesRenderer } from "3d-tiles-renderer";
import { MercatorCoordinate } from "maplibre-gl";
import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { synthesizeLodCamera } from "@carma-mapping/engines/threejs";
import {
  configureSharedRenderCamera,
  configureSharedOrthographicCamera,
} from "./shared-three-scene-render-context";
import {
  createTilesCameraSet,
  resolveTilesViewCamera,
} from "./tiles-camera-set";

const FOV = 0.6435011087932844;
const W = 1600;
const H = 900;
const ZOOM = 17;
const PITCH = 60;
const LAT = 51.26;
const LNG = 7.15;

type CameraInfo = {
  isOrthographic: boolean;
  sseDenominator: number;
  pixelSize: number;
};
type Internals = {
  cameraInfo: CameraInfo[];
  prepareForTraversal: () => void;
};

// MapLibre 5.18 mercator_transform.ts:611-630 + custom-layer mainMatrix (:828-838)
const buildMapLibreMainMatrix = (
  worldSize: number,
  mercX: number,
  mercY: number,
  camToCenterPx: number
) => {
  const top = Math.tan(FOV / 2);
  const m = new THREE.Matrix4().makePerspective(
    -top * (W / H),
    top * (W / H),
    top,
    -top,
    1,
    1e7
  );
  m.multiply(new THREE.Matrix4().makeScale(1, -1, 1));
  m.multiply(new THREE.Matrix4().makeTranslation(0, 0, -camToCenterPx));
  m.multiply(
    new THREE.Matrix4().makeRotationX(THREE.MathUtils.degToRad(PITCH))
  );
  m.multiply(
    new THREE.Matrix4().makeTranslation(
      -mercX * worldSize,
      -mercY * worldSize,
      0
    )
  );
  return m.multiply(
    new THREE.Matrix4().makeScale(worldSize, worldSize, worldSize)
  );
};

const buildCameras = (offset = { x: 0, y: 0 }) => {
  const worldSize = 512 * 2 ** ZOOM;
  const originMerc = MercatorCoordinate.fromLngLat([LNG, LAT], 0);
  const meterScale = originMerc.meterInMercatorCoordinateUnits();
  const camToCenterPx = (0.5 / Math.tan(FOV / 2)) * H;
  const map = {
    transform: {
      _fov: FOV,
      cameraToCenterDistance: camToCenterPx,
      worldSize,
      width: W,
      height: H,
      centerOffset: offset,
    },
    getCenter: () => ({ lng: LNG, lat: LAT }),
    getPitch: () => PITCH,
    getBearing: () => 0,
    queryTerrainElevation: () => 0,
  } as unknown as MaplibreMap;
  const lodCamera = new THREE.PerspectiveCamera();
  const lookTarget = new THREE.Vector3();
  const viewport = new THREE.Vector2(W, H);
  expect(
    synthesizeLodCamera(
      lodCamera,
      map,
      { originMerc, meterScale, viewport },
      lookTarget
    )
  ).toBe(true);
  // shared-three-scene-layer.ts:269-272, 428-433
  const rotationX = new THREE.Matrix4().makeRotationAxis(
    new THREE.Vector3(1, 0, 0),
    Math.PI / 2
  );
  const localFromScene = new THREE.Matrix4()
    .makeTranslation(originMerc.x, originMerc.y, originMerc.z)
    .scale(new THREE.Vector3(meterScale, -meterScale, meterScale))
    .multiply(rotationX);
  const mainMatrix = buildMapLibreMainMatrix(
    worldSize,
    originMerc.x,
    originMerc.y,
    camToCenterPx
  );
  const shift = new THREE.Matrix4().makeTranslation(
    (2 * offset.x) / W,
    (-2 * offset.y) / H,
    0
  );
  const sceneToClip = shift.multiply(mainMatrix).multiply(localFromScene);
  const renderCamera = new THREE.PerspectiveCamera();
  configureSharedRenderCamera(renderCamera, lodCamera, sceneToClip);
  return {
    renderCamera,
    lodCamera,
    map,
    frame: { originMerc, meterScale, viewport },
  };
};

const trueDenominator = (2 * Math.tan(FOV / 2)) / H;

describe("three tiles LOD camera (D0)", () => {
  it("registers the LOD camera, whose projection yields the true sse denominator", () => {
    const { renderCamera, lodCamera } = buildCameras();
    const tiles = new TilesRenderer() as unknown as TilesRenderer & Internals;
    const viewCamera = resolveTilesViewCamera(renderCamera, lodCamera);
    expect(viewCamera).toBe(lodCamera);
    expect(lodCamera.projectionMatrix.elements[5]).toBeCloseTo(
      1 / Math.tan(FOV / 2),
      6
    );

    const cameras = createTilesCameraSet(tiles, viewCamera);
    cameras.update(viewCamera, W, H);
    tiles.group.updateMatrixWorld(true);
    tiles.prepareForTraversal();

    expect(tiles.cameras).toEqual([lodCamera]);
    const info = tiles.cameraInfo[0];
    expect(info.isOrthographic).toBe(false);
    expect(info.sseDenominator / trueDenominator).toBeCloseTo(1, 6);
    cameras.dispose();
  });

  it("documents why the composite render camera is unusable for selection", () => {
    const { renderCamera } = buildCameras();
    const tiles = new TilesRenderer() as unknown as TilesRenderer & Internals;
    tiles.setCamera(renderCamera);
    tiles.setResolution(renderCamera, W, H);
    tiles.group.updateMatrixWorld(true);
    tiles.prepareForTraversal();

    // The scaled composite matrix shrinks the denominator by the metres per
    // pixel of the map (~2.7x at z17), inflating every screen-space error by
    // the same factor: a 4 px target would behave like a ~1.5 px target.
    expect(tiles.cameraInfo[0].sseDenominator / trueDenominator).toBeLessThan(
      0.5
    );
  });

  it("keeps the ortho shadow camera at viewport pixel density", () => {
    const L = 1415; // flat-ground footprint square at z17 / pitch 60
    const tiles = new TilesRenderer() as unknown as TilesRenderer & Internals;
    const shadowCamera = new THREE.OrthographicCamera(
      -L / 2,
      L / 2,
      L / 2,
      -L / 2,
      0.1,
      5000
    );
    shadowCamera.position.set(0, 2000, 0);
    shadowCamera.lookAt(0, 0, 0);
    shadowCamera.updateProjectionMatrix();
    shadowCamera.updateMatrixWorld(true);
    tiles.setCamera(shadowCamera);
    tiles.setResolution(shadowCamera, W, H);
    tiles.group.updateMatrixWorld(true);
    tiles.prepareForTraversal();
    expect(tiles.cameraInfo[0].isOrthographic).toBe(true);
    expect(tiles.cameraInfo[0].pixelSize).toBeCloseTo(L / H, 6);
  });
});

describe("off-center Three camera", () => {
  it("matches the MapLibre perspective window without moving the camera or changing focal scale", () => {
    const centered = buildCameras();
    const shifted = buildCameras({ x: 180, y: -100 });
    expect(shifted.lodCamera.position.toArray()).toEqual(
      centered.lodCamera.position.toArray()
    );
    expect(shifted.lodCamera.quaternion.toArray()).toEqual(
      centered.lodCamera.quaternion.toArray()
    );
    expect(shifted.lodCamera.projectionMatrix.elements[5]).toBeCloseTo(
      centered.lodCamera.projectionMatrix.elements[5],
      12
    );
    expect(shifted.lodCamera.projectionMatrix.elements[8]).toBeCloseTo(
      -360 / W,
      12
    );
    expect(shifted.lodCamera.projectionMatrix.elements[9]).toBeCloseTo(
      -200 / H,
      12
    );
    for (const point of [new THREE.Vector3(), new THREE.Vector3(50, 30, 70)]) {
      const lod = point.clone().project(shifted.lodCamera);
      const rendered = point.clone().project(shifted.renderCamera);
      expect(lod.x).toBeCloseTo(rendered.x, 10);
      expect(lod.y).toBeCloseTo(rendered.y, 10);
    }
  });
  it("clears the off-center frustum when the preview returns to centered browsing", () => {
    const { lodCamera, map, frame } = buildCameras({ x: 180, y: -100 });
    const transform = map.transform as unknown as {
      centerOffset: { x: number; y: number };
      fovInRadians: number;
    };
    transform.centerOffset = { x: 0, y: 0 };
    transform.fovInRadians = 0.4;
    synthesizeLodCamera(lodCamera, map, frame);
    expect(lodCamera.view?.enabled).toBe(false);
    expect(lodCamera.projectionMatrix.elements[8]).toBe(0);
    expect(lodCamera.projectionMatrix.elements[9]).toBe(0);
    expect(THREE.MathUtils.degToRad(lodCamera.fov)).toBeCloseTo(0.4, 12);
  });
});

describe("orthographic scene display", () => {
  it.each([0, 0.37])(
    "preserves centre-plane pixels, padding and roll %s without perspective scaling",
    (roll) => {
      const perspective = new THREE.PerspectiveCamera(48, W / H, 2, 5000);
      perspective.position.set(40, 100, 250);
      const anchor = new THREE.Vector3(5, 8, -20);
      perspective.lookAt(anchor);
      perspective.setViewOffset(W, H, -180, 100, W, H);
      perspective.updateMatrixWorld(true);
      // MapLibre can encode roll and a common homogeneous scale in the
      // composite render projection rather than in the synthesized camera pose.
      perspective.projectionMatrix.multiply(
        new THREE.Matrix4().makeRotationZ(-roll)
      );
      perspective.projectionMatrix.multiplyScalar(2.7);
      perspective.projectionMatrixInverse
        .copy(perspective.projectionMatrix)
        .invert();
      const original = perspective.projectionMatrix.clone();
      const orthographic = new THREE.OrthographicCamera();
      expect(
        configureSharedOrthographicCamera(orthographic, perspective, anchor)
      ).toBe(true);
      expect(perspective.projectionMatrix.equals(original)).toBe(true);
      const depth = -anchor.clone().applyMatrix4(perspective.matrixWorldInverse)
        .z;
      for (const [x, y] of [
        [0, 0],
        [10, 0],
        [0, 10],
        [-15, 7],
      ]) {
        const world = new THREE.Vector3(x, y, -depth).applyMatrix4(
          perspective.matrixWorld
        );
        const a = world.clone().project(perspective);
        const b = world.clone().project(orthographic);
        expect(b.x).toBeCloseTo(a.x, 10);
        expect(b.y).toBeCloseTo(a.y, 10);
      }
      const front = new THREE.Vector3(10, 7, -depth / 2).applyMatrix4(
        perspective.matrixWorld
      );
      const back = new THREE.Vector3(10, 7, -depth * 2).applyMatrix4(
        perspective.matrixWorld
      );
      const a = front.project(orthographic),
        b = back.project(orthographic);
      expect(a.x).toBeCloseTo(b.x, 12);
      expect(a.y).toBeCloseTo(b.y, 12);
      expect(orthographic.near).toBeCloseTo(2, 10);
      expect(orthographic.far).toBeCloseTo(5000, 6);
      const first = new THREE.Raycaster(),
        second = new THREE.Raycaster();
      first.setFromCamera(new THREE.Vector2(-0.8, 0.4), orthographic);
      second.setFromCamera(new THREE.Vector2(0.8, -0.4), orthographic);
      expect(first.ray.direction.distanceTo(second.ray.direction)).toBeLessThan(
        1e-12
      );
      expect(first.ray.origin.distanceTo(second.ray.origin)).toBeGreaterThan(1);
    }
  );

  it("keeps native orthographic SSE and doubles density when the view scale doubles", () => {
    const perspective = new THREE.PerspectiveCamera(45, W / H, 1, 5000);
    perspective.position.set(0, 0, 100);
    perspective.updateMatrixWorld(true);
    const ortho = new THREE.OrthographicCamera();
    expect(
      configureSharedOrthographicCamera(ortho, perspective, new THREE.Vector3())
    ).toBe(true);
    const firstWidth = ortho.right - ortho.left;
    const tiles = new TilesRenderer() as unknown as TilesRenderer & Internals;
    const cameras = createTilesCameraSet(tiles, perspective);
    try {
      expect(resolveTilesViewCamera(ortho, ortho)).toBe(ortho);
      cameras.update(ortho, W, H);
      tiles.group.updateMatrixWorld(true);
      tiles.prepareForTraversal();
      expect(tiles.cameraInfo).toHaveLength(1);
      expect(tiles.cameraInfo[0].isOrthographic).toBe(true);
      const firstPixelSize = tiles.cameraInfo[0].pixelSize;
      perspective.position.z = 50;
      perspective.updateMatrixWorld(true);
      expect(
        configureSharedOrthographicCamera(
          ortho,
          perspective,
          new THREE.Vector3()
        )
      ).toBe(true);
      expect(ortho.right - ortho.left).toBeCloseTo(firstWidth / 2, 10);
      cameras.update(ortho, W, H);
      tiles.prepareForTraversal();
      expect(tiles.cameraInfo[0].pixelSize).toBeCloseTo(firstPixelSize / 2, 10);
    } finally {
      cameras.dispose();
      tiles.dispose();
    }
  });
});
