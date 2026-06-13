import { describe, expect, it, vi } from "vitest";
import { Cartesian2, Cartesian3, type Scene } from "@carma-cesium";

vi.mock("@carma-commons/utils", () => ({
  warnOnce: vi.fn(),
}));

vi.mock("../../carma-guards", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../carma-guards")>();

  return {
    ...actual,
    isValidScene: vi.fn(() => true),
  };
});

import {
  pickSceneCenter,
  pickScenePositionAtScreenPosition,
} from "./Picking";

type FakeScene = Scene & {
  canvas: {
    clientHeight: number;
    clientWidth: number;
  };
  globe: {
    depthTestAgainstTerrain: boolean;
  };
  pickPosition: ReturnType<typeof vi.fn>;
  pickTranslucentDepth: boolean;
};

const createFakeScene = (): FakeScene =>
  ({
    canvas: {
      clientHeight: 100,
      clientWidth: 100,
    },
    globe: {
      depthTestAgainstTerrain: true,
    },
    pickPosition: vi.fn(),
    pickTranslucentDepth: false,
  } as unknown as FakeScene);

describe("Picking", () => {
  it("returns null when pickPosition throws", () => {
    const scene = createFakeScene();
    scene.pickPosition.mockImplementation(() => {
      throw new Error("pick failed");
    });

    const result = pickScenePositionAtScreenPosition(
      scene,
      new Cartesian2(10, 20)
    );

    expect(result).toBeNull();
  });

  it("returns undefined for a center pick that cannot be converted to cartographic coordinates", () => {
    const scene = createFakeScene();
    scene.pickPosition.mockReturnValue(Cartesian3.ZERO);

    expect(pickSceneCenter(scene)).toBeUndefined();
  });

  it("returns finite center picks", () => {
    const scene = createFakeScene();
    const scenePosition = Cartesian3.fromDegrees(7, 51, 100);
    scene.pickPosition.mockReturnValue(scenePosition);

    expect(pickSceneCenter(scene)).toBe(scenePosition);
  });
});
