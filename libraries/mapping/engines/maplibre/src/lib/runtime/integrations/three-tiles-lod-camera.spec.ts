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
import { configureSharedRenderCamera } from "./shared-three-scene-layer";
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

const buildCameras = () => {
  const worldSize = 512 * 2 ** ZOOM;
  const originMerc = MercatorCoordinate.fromLngLat([LNG, LAT], 0);
  const meterScale = originMerc.meterInMercatorCoordinateUnits();
  const camToCenterPx = (0.5 / Math.tan(FOV / 2)) * H;
  const map = {
    transform: { _fov: FOV, cameraToCenterDistance: camToCenterPx, worldSize },
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
  const sceneToClip = buildMapLibreMainMatrix(
    worldSize,
    originMerc.x,
    originMerc.y,
    camToCenterPx
  ).multiply(localFromScene);
  const renderCamera = new THREE.PerspectiveCamera();
  configureSharedRenderCamera(renderCamera, lodCamera, sceneToClip);
  return { renderCamera, lodCamera };
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
