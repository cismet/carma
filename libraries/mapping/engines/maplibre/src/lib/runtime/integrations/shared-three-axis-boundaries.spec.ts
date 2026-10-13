import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  AXIS_BOUNDARY_FRAGMENT_FUNCTION,
  AXIS_BOUNDARY_FRAGMENT_HEADER,
  axisBoundaryBisector,
  axisBoundaryVisibleBounds,
  createSharedThreeAxisBoundaries,
  cullAxisBoundarySites,
  scoreAxisBoundarySite,
  type AxisBoundarySite,
} from "./shared-three-axis-boundaries";

import type { MapStyleProjectionUniforms } from "../../core/shared-three-scene-types";
import { MAP_STYLE_PROJECTION_FRAGMENT_OUTPUT } from "../../core/shared-three-map-style-shaders";
import {
  configureMapStyleProjectedMaterial,
  setMapStyleAxisBoundaryUniforms,
} from "./shared-three-map-style-material";

const broadProjection = () =>
  new THREE.Matrix4().set(
    0.005,
    0,
    0,
    0.5,
    0,
    0.005,
    0,
    0.5,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    1
  );
const perspectiveProjection = () =>
  new THREE.Matrix4().set(
    1,
    0,
    -0.5,
    0,
    0,
    1,
    -0.5,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    -1,
    0
  );
const site = (
  id: string,
  x = 0,
  direction = new THREE.Vector3(0, 0, -1),
  projection = broadProjection()
): AxisBoundarySite => ({
  id,
  eye: new THREE.Vector3(x, 0, 10),
  direction,
  sceneToImage: projection,
});
const box = (x: number, y = 0, z = 0) =>
  new THREE.Box3(
    new THREE.Vector3(x - 1, y - 1, z - 1),
    new THREE.Vector3(x + 1, y + 1, z + 1)
  );

const bestDistinctFields = (
  sites: readonly AxisBoundarySite[],
  point: THREE.Vector3
) => {
  const fields = new Map<string, { id: string; score: number }>();
  [...sites]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .forEach((entry) => {
      const score = scoreAxisBoundarySite(entry, point);
      if (score === null) return;
      const key = [
        ...entry.eye.toArray(),
        ...entry.direction.clone().normalize().toArray(),
      ].join(",");
      if (!fields.has(key)) fields.set(key, { id: entry.id, score });
    });
  return [...fields.values()].sort((a, b) => b.score - a.score);
};

describe("calibrated axis boundary mathematics", () => {
  it("uses cosine of the actual source-to-surface ray, including non-unit preferred axes", () => {
    expect(
      scoreAxisBoundarySite(
        site("a", 0, new THREE.Vector3(0, 0, -4)),
        new THREE.Vector3()
      )
    ).toBe(1);
    expect(
      scoreAxisBoundarySite(site("a", 10), new THREE.Vector3())
    ).toBeCloseTo(Math.SQRT1_2, 12);
  });

  it("keeps inclusive full-sensor edges but excludes outside, horizon and behind-camera points", () => {
    const camera = {
      ...site("a"),
      eye: new THREE.Vector3(),
      sceneToImage: perspectiveProjection(),
    };
    expect(
      scoreAxisBoundarySite(camera, new THREE.Vector3(-1, -1, -2))
    ).not.toBeNull();
    expect(
      scoreAxisBoundarySite(camera, new THREE.Vector3(1, 1, -2))
    ).not.toBeNull();
    expect(
      scoreAxisBoundarySite(camera, new THREE.Vector3(1.00001, 0, -2))
    ).toBeNull();
    expect(
      scoreAxisBoundarySite(camera, new THREE.Vector3(0, 0, 0))
    ).toBeNull();
    expect(
      scoreAxisBoundarySite(camera, new THREE.Vector3(0, 0, 2))
    ).toBeNull();
  });

  it("excludes invalid rays and non-finite calibration", () => {
    expect(
      scoreAxisBoundarySite(site("a"), new THREE.Vector3(0, 0, 10))
    ).toBeNull();
    expect(
      scoreAxisBoundarySite(
        site("a", 0, new THREE.Vector3()),
        new THREE.Vector3()
      )
    ).toBeNull();
    expect(
      scoreAxisBoundarySite(site("a"), new THREE.Vector3(NaN, 0, 0))
    ).toBeNull();
    const invalid = site("a");
    invalid.sceneToImage.elements[0] = Infinity;
    expect(scoreAxisBoundarySite(invalid, new THREE.Vector3())).toBeNull();
  });

  it("gives the exact flat symmetric border and consistent pair ordering", () => {
    const left = site("a", -10);
    const right = site("b", 10);
    const middle = axisBoundaryBisector(left, right, new THREE.Vector3())!;
    expect(middle.difference).toBe(0);
    expect(middle.gradient.x).toBeCloseTo(-0.1 * Math.SQRT1_2, 12);
    expect(middle.gradient.y).toBe(0);
    expect(axisBoundaryBisector(right, left, new THREE.Vector3())).toEqual(
      middle
    );
    expect(
      axisBoundaryBisector(left, right, new THREE.Vector3(-1, 0, 0))!.difference
    ).toBeGreaterThan(0);
    expect(
      axisBoundaryBisector(left, right, new THREE.Vector3(1, 0, 0))!.difference
    ).toBeLessThan(0);
  });

  it("matches finite-difference gradients for non-parallel axes and an elevated surface", () => {
    const a = site("a", -12, new THREE.Vector3(0.5, 0.1, -1));
    const b = site("b", 8, new THREE.Vector3(-0.3, 0.2, -1));
    const point = new THREE.Vector3(2, 3, 4);
    const result = axisBoundaryBisector(a, b, point)!;
    const step = 1e-4;
    ["x", "y", "z"].forEach((axis) => {
      const plus = point.clone();
      const minus = point.clone();
      plus[axis as "x" | "y" | "z"] += step;
      minus[axis as "x" | "y" | "z"] -= step;
      const numeric =
        (axisBoundaryBisector(a, b, plus)!.difference -
          axisBoundaryBisector(a, b, minus)!.difference) /
        (2 * step);
      expect(result.gradient[axis as "x" | "y" | "z"]).toBeCloseTo(numeric, 8);
    });
  });

  it("is invariant under pan and rotation of the coordinate frame", () => {
    const cameras = [
      site("a", -10),
      site("b", 10, new THREE.Vector3(-0.2, 0, -1)),
    ];
    const point = new THREE.Vector3(2, 3, 1);
    const transform = new THREE.Matrix4()
      .makeRotationY(0.73)
      .setPosition(123, -456, 20);
    const inverse = transform.clone().invert();
    const movedPoint = point.clone().applyMatrix4(transform);
    cameras.forEach((entry) => {
      const moved = {
        ...entry,
        eye: entry.eye.clone().applyMatrix4(transform),
        direction: entry.direction.clone().transformDirection(transform),
        sceneToImage: entry.sceneToImage.clone().multiply(inverse),
      };
      expect(scoreAxisBoundarySite(moved, movedPoint)).toBeCloseTo(
        scoreAxisBoundarySite(entry, point)!,
        12
      );
    });
    // An observer pose is deliberately absent from every field descriptor.
    expect(bestDistinctFields(cameras, point)[0].id).toBe("b");
  });

  it("keeps a third-field boundary when duplicate axes have distinct sensor frusta", () => {
    const narrow = broadProjection().clone();
    narrow.elements[12] = 1.5;
    const cameras = [site("a", -10), site("a-twin", -10), site("b", 10)];
    const ranked = bestDistinctFields(cameras, new THREE.Vector3());
    expect(ranked.map((entry) => entry.id)).toEqual(["a", "b"]);
    expect(ranked[0].score).toBe(ranked[1].score);
    // An out-of-sensor first twin does not suppress a later eligible twin.
    const union = bestDistinctFields(
      [{ ...cameras[0], sceneToImage: narrow }, cameras[1], cameras[2]],
      new THREE.Vector3()
    );
    expect(union.map((entry) => entry.id)).toEqual(["a-twin", "b"]);
  });

  it("does not invent an isolated contour for identical angular fields", () => {
    const result = axisBoundaryBisector(
      site("a", 5),
      site("b", 5),
      new THREE.Vector3()
    )!;
    expect(result.difference).toBe(0);
    expect(result.gradient.lengthSq()).toBe(0);
  });
});

describe("conservative full-sensor candidate culling", () => {
  it("rejects wholly outside boxes on all four sensor sides and behind the camera", () => {
    const a = site("a");
    expect(cullAxisBoundarySites([a], box(0))).toEqual([a]);
    for (const bounds of [box(-102), box(102), box(0, -102), box(0, 102)])
      expect(cullAxisBoundarySites([a], bounds)).toEqual([]);
    const perspective = { ...a, sceneToImage: perspectiveProjection() };
    expect(cullAxisBoundarySites([perspective], box(0, 0, 3))).toEqual([]);
    expect(cullAxisBoundarySites([perspective], box(0, 0, -3))).toEqual([
      perspective,
    ]);
  });

  it("retains boxes crossing a sensor edge, including float32-ambiguous edges", () => {
    const a = site("a");
    expect(cullAxisBoundarySites([a], box(100))).toEqual([a]);
    const veryNear = new THREE.Box3(
      new THREE.Vector3(100 + 1e-6, 0, 0),
      new THREE.Vector3(100 + 2e-6, 1, 1)
    );
    expect(cullAxisBoundarySites([a], veryNear)).toEqual([a]);
  });

  it("retains every candidate with an eligible point inside its receiver box", () => {
    const cameras = Array.from({ length: 48 }, (_, index) => {
      const projection = broadProjection();
      projection.elements[0] *= 1 + index / 20;
      projection.elements[5] *= 1 + index / 30;
      projection.elements[12] += ((index % 7) - 3) / 5;
      projection.elements[13] += ((index % 5) - 2) / 4;
      return site(
        `site-${index}`,
        index - 20,
        new THREE.Vector3(0, 0, -1),
        projection
      );
    });
    for (let x = -120; x <= 120; x += 24) {
      const bounds = new THREE.Box3(
        new THREE.Vector3(x, -20, -5),
        new THREE.Vector3(x + 24, 20, 5)
      );
      const kept = cullAxisBoundarySites(cameras, bounds);
      for (const camera of cameras)
        for (const px of [x, x + 12, x + 24])
          for (const py of [-20, 0, 20])
            if (
              scoreAxisBoundarySite(camera, new THREE.Vector3(px, py, 0)) !==
              null
            )
              expect(kept).toContain(camera);
    }
  });

  it("handles unknown and empty receiver bounds without quality truncation", () => {
    const cameras = [site("a"), site("b")];
    expect(cullAxisBoundarySites(cameras)).toBe(cameras);
    expect(cullAxisBoundarySites(cameras, new THREE.Box3())).toEqual([]);
    const unknown = new THREE.Box3(
      new THREE.Vector3(-Infinity, -Infinity, -Infinity),
      new THREE.Vector3(Infinity, Infinity, Infinity)
    );
    expect(cullAxisBoundarySites(cameras, unknown)).toBe(cameras);
    const empty = new THREE.Box3(
      new THREE.Vector3(2, 2, 2),
      new THREE.Vector3(1, 1, 1)
    );
    expect(cullAxisBoundarySites(cameras, empty)).toEqual([]);
  });
});

describe("shared axis boundary GPU data lifecycle", () => {
  it("packs all calibrated matrix rows, eyes and normalized directions in stable ID order", () => {
    const controller = createSharedThreeAxisBoundaries();
    const a = site("a", -10, new THREE.Vector3(0, 0, -4));
    const b = site("b", 10);
    controller.setSites([b, a]);
    const receiver = controller.acquire();
    const texture = receiver.uniforms.carmaAxisBoundaryData.value!;
    const values = texture.image.data as Float32Array;
    expect(receiver.uniforms.carmaAxisBoundaryCount.value).toBe(2);
    expect(Array.from(values.slice(0, 4))).toEqual([
      Math.fround(0.005),
      0,
      0,
      0.5,
    ]);
    expect(Array.from(values.slice(16, 19))).toEqual([-10, 0, 10]);
    expect(Array.from(values.slice(20, 23))).toEqual([0, 0, -1]);
    expect(Array.from(values.slice(40, 43))).toEqual([10, 0, 10]);
    expect(texture.type).toBe(THREE.FloatType);
    expect(texture.minFilter).toBe(THREE.NearestFilter);
    expect(texture.generateMipmaps).toBe(false);
    expect(controller.setSites([a, b])).toBe(false);
    expect(receiver.uniforms.carmaAxisBoundaryData.value).toBe(texture);
    controller.dispose();
  });

  it("keeps all 1024 candidates by tiling six-texel records instead of truncating", () => {
    const controller = createSharedThreeAxisBoundaries({ maxTextureSize: 128 });
    controller.setSites(
      Array.from({ length: 1024 }, (_, index) =>
        site(String(index).padStart(4, "0"), index)
      )
    );
    const receiver = controller.acquire();
    expect(receiver.uniforms.carmaAxisBoundaryCount.value).toBe(1024);
    expect(
      receiver.uniforms.carmaAxisBoundaryDataSize.value.x
    ).toBeLessThanOrEqual(128);
    expect(
      receiver.uniforms.carmaAxisBoundaryDataSize.value.y
    ).toBeLessThanOrEqual(128);
    expect(
      (
        receiver.uniforms.carmaAxisBoundaryData.value!.image
          .data as Float32Array
      )[1023 * 24 + 16]
    ).toBe(1023);
    controller.dispose();
  });

  it("reports hardware capacity failure explicitly instead of dropping cameras", () => {
    const controller = createSharedThreeAxisBoundaries({ maxTextureSize: 6 });
    controller.setSites(
      Array.from({ length: 7 }, (_, index) => site(String(index)))
    );
    expect(() => controller.acquire()).toThrow(/no candidates were truncated/);
    controller.dispose();
  });

  it("shares identical bounds, culls independently and snapshots caller-owned descriptors", () => {
    const controller = createSharedThreeAxisBoundaries();
    const a = site("a");
    controller.setSites([a]);
    const first = controller.acquire(box(0));
    const second = controller.acquire(box(0));
    const outside = controller.acquire(box(200));
    expect(first.uniforms.carmaAxisBoundaryData.value).toBe(
      second.uniforms.carmaAxisBoundaryData.value
    );
    expect(outside.uniforms.carmaAxisBoundaryCount.value).toBe(0);
    a.eye.x = 99;
    expect(
      (
        first.uniforms.carmaAxisBoundaryData.value!.image.data as Float32Array
      )[16]
    ).toBe(0);
    expect(controller.setSites([a])).toBe(true);
    expect(
      (
        first.uniforms.carmaAxisBoundaryData.value!.image.data as Float32Array
      )[16]
    ).toBe(99);
    controller.dispose();
  });

  it("updates shared frame/style uniforms without repacking camera data", () => {
    const controller = createSharedThreeAxisBoundaries();
    controller.setSites([site("a"), site("b", 10)]);
    const first = controller.acquire();
    const second = controller.acquire(box(0));
    const texture = first.uniforms.carmaAxisBoundaryData.value;
    const frame = new THREE.Matrix4()
      .makeRotationZ(0.7)
      .setPosition(20, -10, 0);
    controller.setSceneToMetric(frame);
    controller.setStyle({
      enabled: true,
      opacity: 0.5,
      widthCss: 2,
      pixelRatio: 2,
      color: 0xff0000,
    });
    expect(first.uniforms.carmaAxisBoundarySceneToMetric).toBe(
      second.uniforms.carmaAxisBoundarySceneToMetric
    );
    expect(
      first.uniforms.carmaAxisBoundarySceneToMetric.value.equals(frame)
    ).toBe(true);
    expect(first.uniforms.carmaAxisBoundaryStyle.value.toArray()).toEqual([
      1, 0.5, 2, 0,
    ]);
    expect(first.uniforms.carmaAxisBoundaryPixelRatio.value).toBe(2);
    expect(first.uniforms.carmaAxisBoundaryData.value).toBe(texture);
    controller.dispose();
  });

  it("reuses exact sensor admission on pitch-only changes and invalidates changed calibration", () => {
    const controller = createSharedThreeAxisBoundaries();
    const a = site("a");
    controller.setSites([a]);
    const receiver = controller.acquire(box(0));
    controller.setSites([{ ...a, direction: new THREE.Vector3(0, 0.1, -1) }]);
    expect(receiver.uniforms.carmaAxisBoundaryCount.value).toBe(1);
    expect(
      (
        receiver.uniforms.carmaAxisBoundaryData.value!.image
          .data as Float32Array
      )[21]
    ).toBeCloseTo(0.1 / Math.sqrt(1.01), 7);
    const changed = broadProjection();
    changed.elements[12] = 2;
    controller.setSites([{ ...a, sceneToImage: changed }]);
    expect(receiver.uniforms.carmaAxisBoundaryCount.value).toBe(0);
    controller.dispose();
  });

  it("releases old source revisions only after all receivers have moved to new data", () => {
    const controller = createSharedThreeAxisBoundaries();
    controller.setSites([site("a")]);
    const first = controller.acquire(box(0));
    const second = controller.acquire(box(0));
    const previous = first.uniforms.carmaAxisBoundaryData.value!;
    const dispose = vi.spyOn(previous, "dispose");
    controller.setSites([site("b")]);
    expect(first.uniforms.carmaAxisBoundaryData.value).toBe(
      second.uniforms.carmaAxisBoundaryData.value
    );
    expect(first.uniforms.carmaAxisBoundaryData.value).not.toBe(previous);
    expect(dispose).toHaveBeenCalledTimes(1);
    controller.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it("never evicts active textures and bounds the unused cache", () => {
    const controller = createSharedThreeAxisBoundaries({ maxUnusedEntries: 1 });
    controller.setSites([site("a")]);
    const first = controller.acquire(box(0));
    const firstDispose = vi.spyOn(
      first.uniforms.carmaAxisBoundaryData.value!,
      "dispose"
    );
    const second = controller.acquire(box(10));
    const secondDispose = vi.spyOn(
      second.uniforms.carmaAxisBoundaryData.value!,
      "dispose"
    );
    expect(firstDispose).not.toHaveBeenCalled();
    first.dispose();
    expect(firstDispose).not.toHaveBeenCalled();
    second.dispose();
    expect(firstDispose).toHaveBeenCalledTimes(1);
    expect(secondDispose).not.toHaveBeenCalled();
    controller.dispose();
    expect(secondDispose).toHaveBeenCalledTimes(1);
  });

  it("reuses cached bounds on pan, clears released handles and disposes once", () => {
    const controller = createSharedThreeAxisBoundaries();
    controller.setSites([site("a")]);
    const receiver = controller.acquire(box(0));
    const previous = receiver.uniforms.carmaAxisBoundaryData.value!;
    const dispose = vi.spyOn(previous, "dispose");
    receiver.setBounds(box(10));
    receiver.setBounds(box(0));
    expect(receiver.uniforms.carmaAxisBoundaryData.value).toBe(previous);
    receiver.dispose();
    receiver.dispose();
    expect(receiver.uniforms.carmaAxisBoundaryData.value).toBeNull();
    expect(receiver.uniforms.carmaAxisBoundaryCount.value).toBe(0);
    controller.dispose();
    controller.dispose();
    expect(dispose).toHaveBeenCalledTimes(1);
    receiver.setBounds(box(20));
    expect(receiver.uniforms.carmaAxisBoundaryData.value).toBeNull();
  });

  it("removes invalid calibration without losing valid sites", () => {
    const controller = createSharedThreeAxisBoundaries();
    controller.setSites([
      site("valid"),
      site("invalid", 0, new THREE.Vector3()),
    ]);
    const receiver = controller.acquire();
    expect(receiver.uniforms.carmaAxisBoundaryCount.value).toBe(1);
    controller.dispose();
    expect(receiver.uniforms.carmaAxisBoundaryCount.value).toBe(0);
  });
});

describe("axis boundary fragment contract", () => {
  it("evaluates all runtime candidates against actual surface positions with a cheap disabled branch", () => {
    expect(AXIS_BOUNDARY_FRAGMENT_HEADER).toContain(
      "uniform int carmaAxisBoundaryCount"
    );
    expect(AXIS_BOUNDARY_FRAGMENT_FUNCTION).toContain(
      "site < CARMA_AXIS_BOUNDARY_PASS_COUNT"
    );
    expect(AXIS_BOUNDARY_FRAGMENT_FUNCTION).toContain(
      "carmaAxisBoundarySceneToMetric * vec4(scenePosition,1.0)"
    );
    const contour = AXIS_BOUNDARY_FRAGMENT_FUNCTION.slice(
      AXIS_BOUNDARY_FRAGMENT_FUNCTION.indexOf("vec4 carmaAxisBoundaryContour")
    );
    expect(contour.indexOf("return vec4(0.0)")).toBeLessThan(
      contour.indexOf("carmaAxisBoundaryTexel")
    );
    expect(contour).toContain(
      "w <= 0.0 || x < 0.0 || x > w || y < 0.0 || y > w"
    );
    expect(contour).not.toMatch(/acos|ownerId|sampler2D depth|grid/);
  });

  it("uses deterministic distinct fields and analytic derivative AA across winner swaps", () => {
    expect(AXIS_BOUNDARY_FRAGMENT_FUNCTION).toContain(
      "all(equal(eye,bestEye))"
    );
    expect(AXIS_BOUNDARY_FRAGMENT_FUNCTION).toContain(
      "all(equal(direction,secondDirection))"
    );
    expect(AXIS_BOUNDARY_FRAGMENT_FUNCTION).toContain(
      "bestId < secondId ? 1.0 : -1.0"
    );
    expect(AXIS_BOUNDARY_FRAGMENT_FUNCTION).toContain("fwidth(point)");
    expect(AXIS_BOUNDARY_FRAGMENT_FUNCTION).toContain(
      "(direction-cosine*ray)*inverseDistance"
    );
    expect(AXIS_BOUNDARY_FRAGMENT_FUNCTION).toContain(
      "carmaAxisBoundaryPixelRatio * 0.5"
    );
    expect(AXIS_BOUNDARY_FRAGMENT_FUNCTION).not.toContain(
      "fwidth(best-second)"
    );
  });
});

const projectedMaterial = () => {
  const material = new THREE.MeshBasicMaterial();
  const uniforms: MapStyleProjectionUniforms = {
    texture: { value: null },
    sceneToClip: { value: new THREE.Matrix4() },
    enabled: { value: 0 },
    depthTexture: { value: null },
    depthEnabled: { value: 0 },
    depthNearFar: { value: new THREE.Vector2(1, 20000) },
    texelSize: { value: new THREE.Vector2(1, 1) },
  };
  return { material, uniforms };
};
const compileProjected = (material: THREE.Material) => {
  const shader = {
    uniforms: {},
    vertexShader: "#include <common>\n#include <project_vertex>",
    fragmentShader:
      "#include <common>\n#include <map_fragment>\n#include <opaque_fragment>",
  } as Parameters<typeof material.onBeforeCompile>[0];
  material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);
  return shader;
};

describe("axis boundary projected-material integration", () => {
  it("always compiles texture-free disabled uniforms without a receiver and preserves prior hooks", () => {
    const { material, uniforms } = projectedMaterial();
    material.customProgramCacheKey = () => "previous-material-key";
    material.onBeforeCompile = (shader) => {
      shader.uniforms.previousUniform = { value: 42 };
    };
    configureMapStyleProjectedMaterial(material, uniforms);
    const shader = compileProjected(material);
    expect(shader.uniforms.previousUniform.value).toBe(42);
    expect(shader.uniforms.carmaAxisBoundaryDisplayTexture.value).toBeNull();
    expect(shader.uniforms.carmaAxisBoundaryDisplayEnabled.value).toBe(0);
    expect(
      shader.fragmentShader.match(/vec4 carmaAxisBoundaryContour\(/g)
    ).toHaveLength(1);
    expect(shader.fragmentShader).toContain(
      "uniform sampler2D carmaAxisBoundaryDisplayTexture"
    );
    expect(shader.uniforms.carmaPhotoGapTexture.value).toBeNull();
    expect(material.customProgramCacheKey()).toContain(
      "previous-material-key|carma-map-style-projection-v37|axis-tiled-display-v1"
    );
    configureMapStyleProjectedMaterial(material, uniforms);
    expect(
      material.customProgramCacheKey().match(/axis-tiled-display-v1/g)
    ).toHaveLength(1);
    material.dispose();
  });

  it("rebinds existing compiled programs immediately without recompiling or owning receiver textures", () => {
    const texture = new THREE.Texture();
    const bundle = () => ({
      carmaAxisBoundaryDisplayTexture: { value: texture },
      carmaAxisBoundaryDisplaySceneToClip: { value: new THREE.Matrix4() },
      carmaAxisBoundaryDisplayEnabled: { value: 1 },
    });
    const first = bundle();
    const second = bundle();
    const { material, uniforms } = projectedMaterial();
    setMapStyleAxisBoundaryUniforms(material, first);
    configureMapStyleProjectedMaterial(material, uniforms);
    const shader = compileProjected(material);
    const alternate = compileProjected(material);
    const version = material.version;
    expect(shader.uniforms.carmaAxisBoundaryDisplayTexture).toBe(
      first.carmaAxisBoundaryDisplayTexture
    );
    setMapStyleAxisBoundaryUniforms(material, second);
    expect(shader.uniforms.carmaAxisBoundaryDisplayTexture).toBe(
      second.carmaAxisBoundaryDisplayTexture
    );
    expect(alternate.uniforms.carmaAxisBoundaryDisplayEnabled).toBe(
      second.carmaAxisBoundaryDisplayEnabled
    );
    expect(material.version).toBe(version);
    const dispose = vi.spyOn(texture, "dispose");
    setMapStyleAxisBoundaryUniforms(material, null);
    expect(shader.uniforms.carmaAxisBoundaryDisplayTexture.value).toBeNull();
    expect(shader.uniforms.carmaAxisBoundaryDisplayEnabled.value).toBe(0);
    expect(dispose).not.toHaveBeenCalled();
    material.dispose();
    expect(dispose).not.toHaveBeenCalled();
    texture.dispose();
  });

  it("composes contours after photographs in both opaque receiver branches", () => {
    expect(
      MAP_STYLE_PROJECTION_FRAGMENT_OUTPUT.match(
        /carmaAxisBoundaryContour\(vCarmaReceiverPosition\)/g
      )
    ).toHaveLength(2);
    const branches = MAP_STYLE_PROJECTION_FRAGMENT_OUTPUT.split(
      "#include <opaque_fragment>"
    );
    for (const branch of branches.slice(0, 2)) {
      expect(branch.lastIndexOf("carmaAxisBoundaryContour")).toBeGreaterThan(
        branch.lastIndexOf("carmaComposePhoto")
      );
      expect(branch).toContain(
        "outgoingLight = mix(outgoingLight,carmaAxisBoundary.rgb,carmaAxisBoundary.a)"
      );
    }
    expect(branches[1].lastIndexOf("carmaAxisBoundaryContour")).toBeGreaterThan(
      branches[1].lastIndexOf("carmaProjectiveMarkings")
    );
  });
});

describe("conservative observer-frustum acceleration", () => {
  it("encloses the exact convex intersection and excludes wholly invisible receivers", () => {
    const bounds = new THREE.Box3(
      new THREE.Vector3(-10, -10, -10),
      new THREE.Vector3(10, 10, 10)
    );
    const visible = axisBoundaryVisibleBounds(bounds, new THREE.Matrix4());
    expect(visible.min.toArray()).toEqual([-1.001, -1.001, -1.001]);
    expect(visible.max.toArray()).toEqual([1.001, 1.001, 1.001]);
    expect(
      axisBoundaryVisibleBounds(box(3), new THREE.Matrix4()).isEmpty()
    ).toBe(true);
    const controller = createSharedThreeAxisBoundaries();
    controller.setSites([site("a")]);
    const receiver = controller.acquire(
      axisBoundaryVisibleBounds(box(3), new THREE.Matrix4())
    );
    expect(receiver.uniforms.carmaAxisBoundaryCount.value).toBe(0);
    controller.dispose();
  });

  it("keeps flat terrain and zero-dimensional receivers", () => {
    const flat = new THREE.Box3(
      new THREE.Vector3(-10, -10, 0),
      new THREE.Vector3(10, 10, 0)
    );
    const visible = axisBoundaryVisibleBounds(flat, new THREE.Matrix4());
    expect(visible.min.toArray()).toEqual([-1.001, -1.001, -0.001]);
    expect(visible.max.toArray()).toEqual([1.001, 1.001, 0.001]);
    const point = new THREE.Vector3(0.5, 0.2, 0.1);
    expect(
      axisBoundaryVisibleBounds(
        new THREE.Box3(point.clone(), point.clone()),
        new THREE.Matrix4()
      ).containsPoint(point)
    ).toBe(true);
  });

  it("clips correctly with a perspective eye inside the original receiver box", () => {
    const camera = new THREE.PerspectiveCamera(45, 1, 1, 100);
    camera.updateMatrixWorld(true);
    const metricToClip = camera.projectionMatrix
      .clone()
      .multiply(camera.matrixWorldInverse);
    const original = new THREE.Box3(
      new THREE.Vector3(-10, -10, -10),
      new THREE.Vector3(10, 10, 10)
    );
    const visible = axisBoundaryVisibleBounds(original, metricToClip);
    expect(visible.containsPoint(new THREE.Vector3(0, 0, -5))).toBe(true);
    expect(visible.containsPoint(new THREE.Vector3())).toBe(false);
    expect(visible.max.z).toBeCloseTo(-0.999, 8);
    expect(visible.min.z).toBeCloseTo(-10.001, 8);
    expect(visible.max.x).toBeCloseTo(Math.tan(Math.PI / 8) * 10 + 0.001, 8);
  });

  it("retains every actual point inside both rotated perspective frustum and receiver bounds", () => {
    const camera = new THREE.PerspectiveCamera(53, 1.7, 2, 200);
    camera.position.set(17, -23, 31);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    const metricToClip = camera.projectionMatrix
      .clone()
      .multiply(camera.matrixWorldInverse);
    const original = new THREE.Box3(
      new THREE.Vector3(-80, -70, -50),
      new THREE.Vector3(70, 90, 80)
    );
    const visible = axisBoundaryVisibleBounds(original, metricToClip);
    let checked = 0;
    for (let x = -80; x <= 70; x += 10)
      for (let y = -70; y <= 90; y += 10)
        for (let z = -50; z <= 80; z += 10) {
          const point = new THREE.Vector3(x, y, z);
          const clip = new THREE.Vector4(x, y, z, 1).applyMatrix4(metricToClip);
          if (
            clip.w > 0 &&
            Math.abs(clip.x) <= clip.w &&
            Math.abs(clip.y) <= clip.w &&
            Math.abs(clip.z) <= clip.w
          ) {
            checked++;
            expect(visible.containsPoint(point)).toBe(true);
          }
        }
    expect(checked).toBeGreaterThan(50);
  });

  it("keeps the original box for invalid or singular clipping transforms", () => {
    const original = box(0);
    const invalid = new THREE.Matrix4();
    invalid.elements[0] = NaN;
    const singular = new THREE.Matrix4().makeScale(0, 1, 1);
    expect(axisBoundaryVisibleBounds(original, invalid).equals(original)).toBe(
      true
    );
    expect(axisBoundaryVisibleBounds(original, singular).equals(original)).toBe(
      true
    );
  });

  it("detects calibration mutation in the prepared public culler", () => {
    const a = site("a");
    expect(cullAxisBoundarySites([a], box(0))).toEqual([a]);
    a.sceneToImage.elements[12] = 2;
    expect(cullAxisBoundarySites([a], box(0))).toEqual([]);
  });
});
