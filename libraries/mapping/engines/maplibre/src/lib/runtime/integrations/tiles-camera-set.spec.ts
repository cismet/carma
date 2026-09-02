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

  it("keeps tile selection on the viewport camera", () => {
    const tiles = buildTiles();
    const viewCamera = new THREE.PerspectiveCamera();
    const cameras = createTilesCameraSet(tiles, viewCamera);

    cameras.update(viewCamera, 800, 600);

    expect(tiles.setCamera).toHaveBeenCalledOnce();
    expect(tiles.setCamera).toHaveBeenCalledWith(viewCamera);
    expect(tiles.setResolution).toHaveBeenCalledWith(viewCamera, 800, 600);
    cameras.dispose();
    expect(tiles.deleteCamera).toHaveBeenCalledWith(viewCamera);
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
