import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CameraIntrinsics } from "@carma-commons/camera/model";
const {
  buildViewStateFromEcefMock,
  buildOrientationQuaternionFromWorldCameraBasisAtAnchorMock,
  localYUpSceneDirectionToWorldDirectionAtAnchorMock,
  readLocalCameraBasisMock,
  resolvePreferredSurfacePickMock,
  readCameraWorldBasisMock,
  readSceneCameraIntrinsicsMock,
  setViewFromCameraStateMock,
  toSceneStateVec3Mock,
} = vi.hoisted(() => ({
  buildViewStateFromEcefMock: vi.fn((input) => input),
  buildOrientationQuaternionFromWorldCameraBasisAtAnchorMock: vi.fn(() => ({
    kind: "orientation",
  })),
  localYUpSceneDirectionToWorldDirectionAtAnchorMock: vi.fn(
    (direction) => direction
  ),
  readLocalCameraBasisMock: vi.fn(() => ({
    forward: { x: 0, y: 0, z: -1 },
    up: { x: 0, y: 1, z: 0 },
    right: { x: 1, y: 0, z: 0 },
  })),
  resolvePreferredSurfacePickMock: vi.fn(),
  readCameraWorldBasisMock: vi.fn(() => ({ kind: "basis" })),
  readSceneCameraIntrinsicsMock: vi.fn(),
  setViewFromCameraStateMock: vi.fn(),
  toSceneStateVec3Mock: vi.fn((value) => value ?? null),
}));

vi.mock("../core/construct", () => ({
  buildViewStateFromEcef: buildViewStateFromEcefMock,
}));

vi.mock("@carma-commons/camera/model", () => {
  return {
    buildOrientationQuaternionFromWorldCameraBasisAtAnchor:
      buildOrientationQuaternionFromWorldCameraBasisAtAnchorMock,
    localYUpSceneDirectionToWorldDirectionAtAnchor:
      localYUpSceneDirectionToWorldDirectionAtAnchorMock,
    readLocalCameraBasis: readLocalCameraBasisMock,
  };
});

vi.mock("@carma-mapping/engines/cesium/core", () => {
  return {
    resolvePreferredSurfacePick: resolvePreferredSurfacePickMock,
    readCameraWorldBasis: readCameraWorldBasisMock,
    readSceneCameraIntrinsics: readSceneCameraIntrinsicsMock,
    setViewFromCameraState: setViewFromCameraStateMock,
    toSceneStateVec3: toSceneStateVec3Mock,
  };
});

import { readFromCesium } from "./cesium";

describe("readFromCesium", () => {
  beforeEach(() => {
    buildViewStateFromEcefMock.mockClear();
    buildOrientationQuaternionFromWorldCameraBasisAtAnchorMock.mockClear();
    resolvePreferredSurfacePickMock.mockReset();
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
    resolvePreferredSurfacePickMock.mockReturnValue({
      surfacePositionECEF: {
        x: 1,
        y: 2,
        z: 3,
      },
      globePositionECEF: null,
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
