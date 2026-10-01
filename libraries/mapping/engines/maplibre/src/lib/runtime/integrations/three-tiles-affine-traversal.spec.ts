// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { TilesRenderer } from "3d-tiles-renderer";
import {
  Box3,
  Frustum,
  Matrix4,
  OrthographicCamera,
  PerspectiveCamera,
  Vector3,
  type Camera,
} from "three";
import type { Tile } from "3d-tiles-renderer/core";
import { createAffineTilesTraversalPreparation } from "./three-tiles-affine-traversal";

vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:vitest-affine-traversal",
  });
});

type CameraInfo = {
  frustum: Frustum;
  position: Vector3;
  pixelSize: number;
  sseDenominator: number;
};
const renderers: TilesRenderer[] = [];
afterEach(() => {
  for (const renderer of renderers.splice(0)) renderer.dispose();
  vi.restoreAllMocks();
});

const rotatedMetric = () =>
  new Matrix4()
    .makeRotationY(0.7)
    .multiply(new Matrix4().makeScale(0.997, 1, 0.9995));
const shear = () =>
  new Matrix4().set(
    1,
    0.3,
    0.15,
    2,
    0.1,
    1,
    0.2,
    -3,
    0,
    0.1,
    1.2,
    4,
    0,
    0,
    0,
    1
  );
const fixture = (mount: Matrix4, camera: Camera, viewport = [1000, 500]) => {
  const renderer = new TilesRenderer("mesh.json");
  renderers.push(renderer);
  renderer.group.matrixAutoUpdate = false;
  renderer.group.matrix.copy(mount);
  renderer.group.updateMatrixWorld(true);
  const localCamera = new Vector3(0.4, -0.3, 12);
  camera.position.copy(localCamera).applyMatrix4(mount);
  camera.lookAt(new Vector3().applyMatrix4(mount));
  camera.updateMatrixWorld(true);
  renderer.setCamera(camera);
  renderer.setResolution(camera, viewport[0], viewport[1]);
  const infos = (renderer as unknown as { cameraInfo: CameraInfo[] })
    .cameraInfo;
  return {
    renderer,
    camera,
    localCamera,
    infos,
    viewport,
    prepare: createAffineTilesTraversalPreparation(renderer),
  };
};

describe("affine tiles traversal under geodetic mounts", () => {
  it("leaves similarity mounts to native preparation without changing its camera data", () => {
    const mount = new Matrix4()
      .makeRotationY(0.7)
      .multiply(new Matrix4().makeScale(2, 2, 2));
    const f = fixture(mount, new PerspectiveCamera(60, 2, 0.1, 1000));
    f.renderer.prepareForTraversal();
    const info = f.infos[0];
    const frustum = info.frustum.clone();
    const position = info.position.clone();
    const denominator = info.sseDenominator;
    expect(f.prepare()).toBe(false);
    expect(f.infos[0]).toBe(info);
    expect(info.position.equals(position)).toBe(true);
    expect(info.sseDenominator).toBe(denominator);
    expect(info.frustum.planes.map((plane) => plane.constant)).toEqual(
      frustum.planes.map((plane) => plane.constant)
    );
  });

  it.each([
    ["rotated east/north metric", rotatedMetric],
    ["translated shear", shear],
  ] as const)(
    "keeps exact root-space frustum and camera position for %s",
    (_, matrix) => {
      const f = fixture(matrix(), new PerspectiveCamera(60, 2, 0.1, 1000));
      const warning = vi
        .spyOn(console, "warn")
        .mockImplementation(() => undefined);
      const placement = f.renderer.group.matrixWorld.clone();
      expect(f.prepare()).toBe(true);
      const expected = new Frustum().setFromProjectionMatrix(
        new Matrix4()
          .multiplyMatrices(
            f.camera.projectionMatrix,
            f.camera.matrixWorldInverse
          )
          .multiply(placement),
        f.camera.coordinateSystem,
        f.camera.reversedDepth
      );
      for (let index = 0; index < 6; index++) {
        expect(
          f.infos[0].frustum.planes[index].normal.distanceTo(
            expected.planes[index].normal
          )
        ).toBeLessThan(1e-12);
        expect(f.infos[0].frustum.planes[index].constant).toBeCloseTo(
          expected.planes[index].constant,
          8
        );
      }
      expect(f.infos[0].position.distanceTo(f.localCamera)).toBeLessThan(1e-12);
      expect(f.renderer.group.matrixWorld.equals(placement)).toBe(true);
      expect(warning).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["perspective", () => new PerspectiveCamera(60, 1, 0.1, 1000)],
    ["orthographic", () => new OrthographicCamera(-2, 2, 2, -2, 0.1, 1000)],
  ] as const)(
    "bounds projected error in %s even when pixel density differs by axis",
    (_, camera) => {
      for (const matrix of [rotatedMetric(), shear()]) {
        const f = fixture(matrix, camera());
        expect(f.prepare()).toBe(true);
        const bounds = new Box3(new Vector3(-1, -1, -1), new Vector3(1, 1, 1));
        const geometricError = 0.001;
        const tile = {
          geometricError,
          engineData: {
            boundingVolume: {
              distanceToPoint: (point: Vector3) =>
                bounds.distanceToPoint(point),
              intersectsFrustum: (frustum: Frustum) =>
                frustum.intersectsBox(bounds),
            },
          },
        } as unknown as Tile;
        const target = { inView: false, error: 0, distanceFromCamera: 0 };
        f.renderer.calculateTileViewError(tile, target);
        expect(target.inView).toBe(true);
        const origin = new Vector3().applyMatrix4(matrix).project(f.camera);
        for (const direction of [
          new Vector3(1, 0, 0),
          new Vector3(0, 1, 0),
          new Vector3(0, 0, 1),
          new Vector3(1, 1, 1).normalize(),
          new Vector3(-1, 1, -1).normalize(),
        ]) {
          const projected = direction
            .multiplyScalar(geometricError)
            .applyMatrix4(matrix)
            .project(f.camera)
            .sub(origin);
          const actualError = Math.hypot(
            (projected.x * f.viewport[0]) / 2,
            (projected.y * f.viewport[1]) / 2
          );
          expect(target.error).toBeGreaterThanOrEqual(actualError);
        }
        expect(Number.isFinite(target.error)).toBe(true);
      }
    }
  );
});
