import { Box3, Matrix4, OrthographicCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { clipShadowReceiverSources } from "./shadow-receiver-sources";
import {
  createShadowReceiverMask,
  type ShadowReceiverSource,
} from "./shadow-receiver-mask";
import {
  createTileCameraDemand,
  snapshotTileCameraViews,
  TILE_CAMERA_ROLE,
} from "./tile-camera-demand";

const box = (x: number, z: number) =>
  new Box3(
    new Vector3(x - 0.1, -0.1, z - 0.1),
    new Vector3(x + 0.1, 0.1, z + 0.1)
  );
const source: ShadowReceiverSource = {
  bounds: new Box3(new Vector3(-10, -1, -11), new Vector3(10, 1, -9)),
  geometricError: 1,
  screenErrorPixels: 6,
  centerness: 1,
  maximumCasterDistance: 100,
};
const view = (
  x = 0,
  role: "receiver" | "geometry" = TILE_CAMERA_ROLE.RECEIVER
) => {
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.x = x;
  return {
    id: String(x),
    camera,
    role,
    viewport: [100, 100] as const,
    errorTargetPixels: 6,
  };
};
const matches = (
  sources: readonly ShadowReceiverSource[],
  bounds: Box3,
  disc = 0
) =>
  createShadowReceiverMask(sources, new Matrix4(), disc)?.match(bounds, {
    receiverGeometricError: Infinity,
    receiverCenterness: 0,
    lightFacing: 0,
  }) ?? false;

describe("visible receiver sources", () => {
  it("requests only casters that can reach the clipped receiver, retaining finite-disc support", () => {
    const demand = createTileCameraDemand(snapshotTileCameraViews([view()]));
    const before = source.bounds.clone();
    const clipped = clipShadowReceiverSources([source], demand, new Matrix4());
    expect(matches(clipped, box(0, -5))).toBe(true);
    expect(matches(clipped, box(5, -5))).toBe(false);
    expect(matches(clipped, box(0, -12))).toBe(false);
    expect(matches(clipped, box(0, 105))).toBe(false);
    expect(matches(clipped, box(1.3, 70))).toBe(false);
    expect(matches(clipped, box(1.3, 70), 0.005)).toBe(true);
    expect(source.bounds).toEqual(before);
  });
  it("keeps receiver views separate and ignores geometry-only cameras", () => {
    const demand = createTileCameraDemand(
      snapshotTileCameraViews([
        view(-5),
        view(5),
        view(0, TILE_CAMERA_ROLE.GEOMETRY),
      ])
    );
    const clipped = clipShadowReceiverSources([source], demand, new Matrix4());
    expect(clipped).toHaveLength(2);
    expect(matches(clipped, box(-5, -5))).toBe(true);
    expect(matches(clipped, box(5, -5))).toBe(true);
    expect(matches(clipped, box(0, -5))).toBe(false);
  });
  it("clips transformed boxes in world space and returns vertices in the source frame", () => {
    const transform = new Matrix4()
      .makeRotationZ(Math.PI / 2)
      .setPosition(100, 20, 0);
    const cameraView = view();
    cameraView.camera.applyMatrix4(transform);
    const demand = createTileCameraDemand(
      snapshotTileCameraViews([cameraView])
    );
    const clipped = clipShadowReceiverSources([source], demand, transform);
    expect(matches(clipped, box(0, -5))).toBe(true);
    expect(matches(clipped, box(5, -5))).toBe(false);
  });
  it("drops invisible receivers and reuses fully contained volumes", () => {
    const demand = createTileCameraDemand(snapshotTileCameraViews([view()]));
    expect(
      clipShadowReceiverSources(
        [{ ...source, bounds: box(50, -10) }],
        demand,
        new Matrix4()
      )
    ).toEqual([]);
    const contained = { ...source, bounds: box(0, -10) };
    expect(
      clipShadowReceiverSources([contained], demand, new Matrix4())
    ).toEqual([contained]);
    expect(
      clipShadowReceiverSources([contained], demand, new Matrix4())[0]
    ).toBe(contained);
  });
});
