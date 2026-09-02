import { TilesRenderer } from "3d-tiles-renderer";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import {
  createTilesCameraSet,
  resolveTilesViewCamera,
} from "./tiles-camera-set";

const buildTiles = () =>
  ({
    setCamera: vi.fn(),
    deleteCamera: vi.fn(),
    setResolution: vi.fn(),
  } as unknown as TilesRenderer);

const buildSunCamera = () => {
  const camera = new THREE.OrthographicCamera(-100, 100, 50, -50, 1, 500);
  camera.position.set(10, 200, 30);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
};

describe("createTilesCameraSet", () => {
  it("always selects tiles with the true perspective LOD camera", () => {
    const renderCamera = new THREE.PerspectiveCamera();
    const lodCamera = new THREE.PerspectiveCamera();

    // The MapLibre render camera carries the composite scene-to-clip
    // projection; its scaled matrix would inflate the screen-space error.
    expect(resolveTilesViewCamera(renderCamera, lodCamera)).toBe(lodCamera);
    expect(resolveTilesViewCamera(new THREE.Camera(), lodCamera)).toBe(
      lodCamera
    );
  });

  it("registers a private clone of the shadow camera at the visible viewport density", () => {
    const tiles = buildTiles();
    const viewCamera = new THREE.PerspectiveCamera();
    const sunCamera = buildSunCamera();
    const cameras = createTilesCameraSet(tiles, viewCamera);

    cameras.update(viewCamera, 800, 600);
    cameras.setShadowView({
      camera: sunCamera,
      shadowMapSize: { width: 16_384, height: 8_192 },
    });

    const registered = cameras.getShadowCamera();
    expect(registered).toBeInstanceOf(THREE.OrthographicCamera);
    expect(registered).not.toBe(sunCamera);
    expect(registered?.matrixWorld.equals(sunCamera.matrixWorld)).toBe(true);
    expect(
      registered?.projectionMatrix.equals(sunCamera.projectionMatrix)
    ).toBe(true);
    expect(registered?.left).toBe(-100);
    expect(registered?.far).toBe(500);
    expect(tiles.setCamera).toHaveBeenNthCalledWith(1, viewCamera);
    expect(tiles.setCamera).toHaveBeenNthCalledWith(2, registered);
    expect(tiles.setResolution).toHaveBeenCalledWith(viewCamera, 800, 600);
    // The shadow map can be much larger than the display; the LOD viewport
    // stays the visible one.
    expect(tiles.setResolution).toHaveBeenCalledWith(registered, 800, 600);

    cameras.update(viewCamera, 1_024, 768);
    expect(tiles.setResolution).toHaveBeenLastCalledWith(
      registered,
      1_024,
      768
    );

    cameras.setShadowView(null);
    expect(tiles.deleteCamera).toHaveBeenCalledWith(registered);
    expect(cameras.getShadowCamera()).toBeNull();
    cameras.dispose();
    expect(tiles.deleteCamera).toHaveBeenCalledWith(viewCamera);
  });

  it("keeps the registered pose across small refits and applies material ones", () => {
    const tiles = buildTiles();
    const viewCamera = new THREE.PerspectiveCamera();
    const sunCamera = buildSunCamera();
    const cameras = createTilesCameraSet(tiles, viewCamera);
    const view = { camera: sunCamera, shadowMapSize: { width: 1, height: 1 } };

    cameras.setShadowView(view);
    const registered = cameras.getShadowCamera() as THREE.OrthographicCamera;
    const initialWorld = registered.matrixWorld.clone();

    // A content-driven refit within 10 % of the extent does not re-pose the
    // registered camera, so the traversal is not re-triggered at rest.
    sunCamera.left = -105;
    sunCamera.right = 104;
    sunCamera.position.x += 8;
    sunCamera.updateProjectionMatrix();
    sunCamera.updateMatrixWorld(true);
    cameras.setShadowView(view);
    expect(registered.matrixWorld.equals(initialWorld)).toBe(true);
    expect(registered.left).toBe(-100);
    expect(tiles.setCamera).toHaveBeenCalledTimes(2);

    // A footprint change beyond the threshold applies.
    sunCamera.left = -150;
    sunCamera.updateProjectionMatrix();
    cameras.setShadowView(view);
    expect(registered.left).toBe(-150);
    expect(registered.matrixWorld.equals(sunCamera.matrixWorld)).toBe(true);

    // A rotated sun always applies, even with the same footprint.
    const rotatedWorld = registered.matrixWorld.clone();
    sunCamera.rotateY(THREE.MathUtils.degToRad(2));
    sunCamera.updateMatrixWorld(true);
    cameras.setShadowView(view);
    expect(registered.matrixWorld.equals(rotatedWorld)).toBe(false);
    expect(registered.matrixWorld.equals(sunCamera.matrixWorld)).toBe(true);
    expect(tiles.setCamera).toHaveBeenCalledTimes(2);
  });

  it("replaces a changed view camera without synthetic coverage cameras", () => {
    const tiles = buildTiles();
    const first = new THREE.PerspectiveCamera();
    const second = new THREE.PerspectiveCamera();
    const cameras = createTilesCameraSet(tiles, first);

    cameras.update(second, 0, 0);

    expect(tiles.deleteCamera).toHaveBeenCalledWith(first);
    expect(tiles.setCamera).toHaveBeenCalledWith(second);
    expect(tiles.setResolution).toHaveBeenCalledWith(second, 1, 1);
  });
});
