import { TilesRenderer } from "3d-tiles-renderer";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import {
  createTilesCameraSet,
  resolveTilesViewCamera,
} from "./tiles-camera-set";

describe("createTilesCameraSet", () => {
  it("uses the exact render camera for bounding-volume selection", () => {
    const renderCamera = new THREE.PerspectiveCamera();
    const lodCamera = new THREE.PerspectiveCamera();

    expect(resolveTilesViewCamera(renderCamera, lodCamera)).toBe(renderCamera);
    expect(resolveTilesViewCamera(new THREE.Camera(), lodCamera)).toBe(
      lodCamera
    );
  });

  it("selects off-screen shadow casters at the visible viewport density", () => {
    const tiles = {
      setCamera: vi.fn(),
      deleteCamera: vi.fn(),
      setResolution: vi.fn(),
    } as unknown as TilesRenderer;
    const viewCamera = new THREE.PerspectiveCamera();
    const shadowCamera = new THREE.OrthographicCamera();
    const cameras = createTilesCameraSet(tiles, viewCamera);

    cameras.update(viewCamera, 800, 600);
    cameras.setShadowView({
      camera: shadowCamera,
      shadowMapSize: { width: 16_384, height: 8_192 },
    });

    expect(tiles.setCamera).toHaveBeenNthCalledWith(1, viewCamera);
    expect(tiles.setCamera).toHaveBeenNthCalledWith(2, shadowCamera);
    expect(tiles.setResolution).toHaveBeenCalledWith(viewCamera, 800, 600);
    expect(tiles.setResolution).toHaveBeenCalledWith(shadowCamera, 800, 600);

    cameras.update(viewCamera, 1_024, 768);
    expect(tiles.setResolution).toHaveBeenLastCalledWith(
      shadowCamera,
      1_024,
      768
    );

    cameras.setShadowView(null);
    expect(tiles.deleteCamera).toHaveBeenCalledWith(shadowCamera);
    cameras.dispose();
    expect(tiles.deleteCamera).toHaveBeenCalledWith(viewCamera);
  });

  it("replaces a changed view camera without synthetic coverage cameras", () => {
    const tiles = {
      setCamera: vi.fn(),
      deleteCamera: vi.fn(),
      setResolution: vi.fn(),
    } as unknown as TilesRenderer;
    const first = new THREE.PerspectiveCamera();
    const second = new THREE.PerspectiveCamera();
    const cameras = createTilesCameraSet(tiles, first);

    cameras.update(second, 0, 0);

    expect(tiles.deleteCamera).toHaveBeenCalledWith(first);
    expect(tiles.setCamera).toHaveBeenCalledWith(second);
    expect(tiles.setResolution).toHaveBeenCalledWith(second, 1, 1);
  });
});
