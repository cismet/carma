import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CameraIntrinsics } from "@carma-commons/camera/model";
const {
  buildViewStateFromEcefMock,
  buildOrientationQuaternionFromWorldCameraBasisAtAnchorMock,
  pickBestAvailablePositionAtViewportCenterMock,
  readCameraWorldBasisMock,
  readSceneCameraIntrinsicsMock,
  toSceneStateVec3Mock,
} = vi.hoisted(() => ({
  buildViewStateFromEcefMock: vi.fn((input) => input),
  buildOrientationQuaternionFromWorldCameraBasisAtAnchorMock: vi.fn(() => ({
    kind: "orientation",
  })),
  pickBestAvailablePositionAtViewportCenterMock: vi.fn(),
  readCameraWorldBasisMock: vi.fn(() => ({ kind: "basis" })),
  readSceneCameraIntrinsicsMock: vi.fn(),
  toSceneStateVec3Mock: vi.fn((value) => value ?? null),
}));

vi.mock("../core/construct", () => ({
  buildViewStateFromEcef: buildViewStateFromEcefMock,
}));

vi.mock("@carma-commons/camera/model", async () => {
  const actual = await vi.importActual<
    typeof import("@carma-commons/camera/model")
  >("@carma-commons/camera/model");

  return {
    ...actual,
    buildOrientationQuaternionFromWorldCameraBasisAtAnchor:
      buildOrientationQuaternionFromWorldCameraBasisAtAnchorMock,
  };
});

vi.mock("@carma-mapping/engines/cesium/core", async () => {
  const actual = await vi.importActual<
    typeof import("@carma-mapping/engines/cesium/core")
  >("@carma-mapping/engines/cesium/core");

  return {
    ...actual,
    pickBestAvailablePositionAtViewportCenter:
      pickBestAvailablePositionAtViewportCenterMock,
    readCameraWorldBasis: readCameraWorldBasisMock,
    readSceneCameraIntrinsics: readSceneCameraIntrinsicsMock,
    toSceneStateVec3: toSceneStateVec3Mock,
  };
});

import { readFromCesium } from "./cesium";

describe("readFromCesium", () => {
  beforeEach(() => {
    buildViewStateFromEcefMock.mockClear();
    buildOrientationQuaternionFromWorldCameraBasisAtAnchorMock.mockClear();
    pickBestAvailablePositionAtViewportCenterMock.mockReset();
    readCameraWorldBasisMock.mockClear();
    readSceneCameraIntrinsicsMock.mockReset();
    toSceneStateVec3Mock.mockClear();
  });

  it("returns null for transient scene reads during invalid hmr state", () => {
    const state = readFromCesium(
      {
        get camera() {
          throw new TypeError(
            "Cannot read properties of undefined (reading 'camera')"
          );
        },
      } as never,
      "spec"
    );

    expect(state).toBeNull();
  });

  it("captures the live Cesium canvas viewport as metadata for stable zoom round-trips", () => {
    const intrinsics: CameraIntrinsics = {
      type: "PerspectiveCamera",
      fov: 0.5,
      fovHorizontal: 0.8,
    };
    readSceneCameraIntrinsicsMock.mockReturnValue(intrinsics);
    pickBestAvailablePositionAtViewportCenterMock.mockReturnValue({
      x: 1,
      y: 2,
      z: 3,
    });

    const state = readFromCesium(
      {
        camera: {
          positionWC: {
            x: 4,
            y: 5,
            z: 6,
          },
        },
        canvas: {
          clientWidth: 976,
          clientHeight: 732,
        },
        frameState: {
          frameNumber: 42,
        },
      } as never,
      "spec"
    );

    expect(state).not.toBeNull();
    expect(buildViewStateFromEcefMock).toHaveBeenCalledWith(
      expect.objectContaining({
        intrinsics: expect.objectContaining({
          type: "PerspectiveCamera",
          fov: 0.5,
          fovHorizontal: 0.8,
        }),
        metadata: expect.objectContaining({
          frameId: 42,
          sourceId: "spec",
          source: "user-interaction",
          viewport: {
            widthPx: 976,
            heightPx: 732,
          },
        }),
      })
    );
  });
});
