import * as THREE from "three";
import { describe, expect, it } from "vitest";

import type { CopcNodeDescriptor } from "./copcLoader";
import {
  deriveDecodedPointCacheBudget,
  MAX_DECODED_POINT_CACHE_BYTES,
  selectCopcNodesForFrustum,
} from "./pointCloudFrustum";

const node = (
  key: string,
  depth: number,
  pointCount: number,
  boundsLocal: CopcNodeDescriptor["boundsLocal"]
): CopcNodeDescriptor => ({
  key,
  depth,
  pointCount,
  spacing: 1 / 2 ** depth,
  boundsLocal,
});

describe("selectCopcNodesForFrustum", () => {
  it("caps and divides the decoded cache independently of browser capacity", () => {
    expect(deriveDecodedPointCacheBudget(4 * 1024 ** 3, 1)).toBe(
      MAX_DECODED_POINT_CACHE_BYTES
    );
    expect(deriveDecodedPointCacheBudget(4 * 1024 ** 3, 4)).toBe(
      MAX_DECODED_POINT_CACHE_BYTES / 4
    );
    expect(deriveDecodedPointCacheBudget(32 * 1024 ** 2, 2)).toBe(
      16 * 1024 ** 2
    );
  });

  it("rejects nodes outside the view and keeps a small overscan ring", () => {
    const result = selectCopcNodesForFrustum(
      [
        node("visible", 1, 10, [-0.2, -0.2, 0, 0.2, 0.2, 0.5]),
        node("overscan", 1, 10, [1.04, -0.1, 0, 1.12, 0.1, 0.5]),
        node("outside", 1, 10, [1.3, -0.1, 0, 1.5, 0.1, 0.5]),
        node("visible-center", 1, 10, [-0.1, -0.1, 0, 0.1, 0.1, 0.5]),
      ],
      new THREE.Matrix4(),
      100,
      1.18
    );

    expect(result.keys).toEqual(["visible", "visible-center", "overscan"]);
    expect(result.keys).not.toContain("outside");
    expect(result.visibleNodeCount).toBe(2);
  });

  it("rejects nodes behind the camera instead of treating them as overscan", () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.updateMatrixWorld(true);
    const clipFromLocal = new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );

    const result = selectCopcNodesForFrustum(
      [
        node("in-front", 1, 10, [-0.2, -0.2, -2, 0.2, 0.2, -1]),
        node("behind", 1, 10, [-0.2, -0.2, 1, 0.2, 0.2, 2]),
      ],
      clipFromLocal,
      100
    );

    expect(result.keys).toEqual(["in-front"]);
  });

  it("rejects nodes beyond the camera far plane", () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 10);
    camera.updateMatrixWorld(true);
    const clipFromLocal = new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );

    const result = selectCopcNodesForFrustum(
      [
        node("in-range", 1, 10, [-0.2, -0.2, -2, 0.2, 0.2, -1]),
        node("too-far", 1, 10, [-0.2, -0.2, -20, 0.2, 0.2, -12]),
      ],
      clipFromLocal,
      100
    );

    expect(result.keys).toEqual(["in-range"]);
  });

  it("loads coarse center nodes first and respects the working-set budget", () => {
    const result = selectCopcNodesForFrustum(
      [
        node("detail-center", 4, 60, [-0.1, -0.1, 0, 0.1, 0.1, 0.5]),
        node("coarse-edge", 1, 40, [0.7, -0.1, 0, 0.9, 0.1, 0.5]),
        node("coarse-center", 1, 40, [-0.1, -0.1, 0, 0.1, 0.1, 0.5]),
      ],
      new THREE.Matrix4(),
      80
    );

    expect(result.keys).toEqual(["coarse-center", "coarse-edge"]);
    expect(result.pointCount).toBe(80);
  });

  it("returns no nodes for a zero point budget", () => {
    const result = selectCopcNodesForFrustum(
      [node("visible", 0, 10, [-0.1, -0.1, 0, 0.1, 0.1, 0.5])],
      new THREE.Matrix4(),
      0
    );

    expect(result.keys).toEqual([]);
    expect(result.pointCount).toBe(0);
  });

  it("does not spend memory on detail with subpixel point spacing", () => {
    const result = selectCopcNodesForFrustum(
      [
        node("coarse", 1, 10, [-0.2, -0.2, 0, 0.2, 0.2, 0.5]),
        {
          ...node("subpixel-detail", 5, 100, [-0.2, -0.2, 0, 0.2, 0.2, 0.5]),
          spacing: 0.01,
        },
        {
          ...node("visible-detail", 5, 100, [-0.2, -0.2, 0, 0.2, 0.2, 0.5]),
          spacing: 0.02,
        },
      ],
      new THREE.Matrix4(),
      1_000,
      1.18,
      {
        viewportWidth: 100,
        viewportHeight: 100,
        minimumSpacingPixels: 0.75,
      }
    );

    expect(result.keys).toEqual(["coarse", "visible-detail"]);
  });
});
