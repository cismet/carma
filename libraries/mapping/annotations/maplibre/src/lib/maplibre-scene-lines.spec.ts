import { describe, expect, it } from "vitest";
import {
  CustomBlending,
  GreaterDepth,
  Group,
  MinEquation,
  Vector3,
} from "three";
import type { Line2 } from "three/examples/jsm/lines/Line2.js";
import type { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import type { AnnotationSceneLineStyle } from "@carma-mapping/annotations/core";

import type { MapLibreAnnotationScene } from "./maplibre-annotation-scene.types";
import { MAPLIBRE_SCENE_LINE_DEFAULTS } from "./maplibre-scene-defaults";
import { LINE_PASS, createLineMaterial } from "./maplibre-scene-line-materials";
import { createMapLibreSceneLineCollection } from "./maplibre-scene-lines";

const STYLE: AnnotationSceneLineStyle = {
  color: "rgba(255, 255, 255, 0.8)",
  width: 2,
};
const DASH = { dashPx: 3, gapPx: 3 };
const POSITIONS = [new Vector3(10, 0, 0), new Vector3(20, 0, 0)];

const createScene = () => {
  const root = new Group();
  const frameListeners = new Set<() => void>();
  const state = { pixelsPerMeter: 50 };
  const scene = {
    root,
    sceneFromEcef: (positionECEF: Vector3, out = new Vector3()) =>
      out.copy(positionECEF),
    subscribeFrameUpdate: (listener: () => void) => {
      frameListeners.add(listener);
      return () => frameListeners.delete(listener);
    },
    subscribePreRender: () => () => undefined,
    requestRender: () => undefined,
    getPixelRatio: () => 2,
    getPixelsPerMeterAtScene: () => state.pixelsPerMeter,
  } as unknown as MapLibreAnnotationScene;
  const runFrame = () => frameListeners.forEach((listener) => listener());
  return { scene, root, state, runFrame };
};

/** The lines of a collection by role: the halo carries the halo uniforms, the occluded pass fails the depth test. */
const passesOf = (root: Group) => {
  const lines = root.children as Line2[];
  const material = (line: Line2) => line.material as LineMaterial;
  const halo = lines.find((line) => material(line).userData["halo"]);
  const occluded = lines.find(
    (line) => material(line).depthFunc === GreaterDepth
  );
  const visible = lines.find(
    (line) => line !== halo && line !== occluded
  ) as Line2;
  return { visible, occluded, halo: halo as Line2 };
};

describe("createLineMaterial", () => {
  it("is a solid, depth-tested, depth-silent line without the new style fields", () => {
    const visible = createLineMaterial(STYLE, LINE_PASS.VISIBLE);
    expect(visible.dashed).toBe(false);
    expect(visible.depthTest).toBe(true);
    expect(visible.depthWrite).toBe(false);
    expect(visible.polygonOffset).toBe(true);
    expect(visible.opacity).toBeCloseTo(0.8, 6);
    const occluded = createLineMaterial(STYLE, LINE_PASS.OCCLUDED);
    expect(occluded.dashed).toBe(true);
    expect(occluded.depthFunc).toBe(GreaterDepth);
    expect(occluded.opacity).toBeCloseTo(
      0.8 * MAPLIBRE_SCENE_LINE_DEFAULTS.occludedOpacity,
      6
    );
    expect(occluded.dashSize).toBe(MAPLIBRE_SCENE_LINE_DEFAULTS.occludedDashPx);
  });

  it("scales the colour's alpha by the style opacity, clamped to 0..1", () => {
    const half = createLineMaterial(
      { ...STYLE, opacity: 0.5 },
      LINE_PASS.VISIBLE
    );
    expect(half.opacity).toBeCloseTo(0.4, 6);
    const over = createLineMaterial(
      { ...STYLE, opacity: 3 },
      LINE_PASS.VISIBLE
    );
    expect(over.opacity).toBeCloseTo(0.8, 6);
    const faint = createLineMaterial(
      { ...STYLE, opacity: 0.5 },
      LINE_PASS.OCCLUDED
    );
    expect(faint.opacity).toBeCloseTo(
      0.4 * MAPLIBRE_SCENE_LINE_DEFAULTS.occludedOpacity,
      6
    );
  });

  it("dashes the visible pass in the given lengths", () => {
    const material = createLineMaterial(
      { ...STYLE, dash: DASH },
      LINE_PASS.VISIBLE
    );
    expect(material.dashed).toBe(true);
    expect(material.dashSize).toBe(3);
    expect(material.gapSize).toBe(3);
    expect(material.depthTest).toBe(true);
  });

  it("draws an overlay line without depth test, depth write or polygon offset", () => {
    for (const dash of [undefined, DASH]) {
      const material = createLineMaterial(
        { ...STYLE, overlay: true, dash },
        LINE_PASS.VISIBLE
      );
      expect(material.depthTest).toBe(false);
      expect(material.depthWrite).toBe(false);
      expect(material.polygonOffset).toBe(false);
      expect(material.dashed).toBe(dash !== undefined);
    }
  });
});

describe("scene line collection", () => {
  it("adds a plain line as before: visible pass, halo, no occluded pass", () => {
    const { scene, root } = createScene();
    const lines = createMapLibreSceneLineCollection(scene);
    lines.addLine({ id: "plain", ...STYLE, positions: POSITIONS });
    const { visible, occluded, halo } = passesOf(root);
    expect(root.children).toHaveLength(2);
    expect(occluded).toBeUndefined();
    expect(visible.visible).toBe(true);
    expect(halo.visible).toBe(true);
    expect(visible.renderOrder).toBe(MAPLIBRE_SCENE_LINE_DEFAULTS.renderOrder);
    expect((visible.material as LineMaterial).dashed).toBe(false);
    lines.destroy();
  });

  it("adds an overlay line after the depth-tested ones, with a shared halo and no occluded pass", () => {
    const { scene, root } = createScene();
    const lines = createMapLibreSceneLineCollection(scene);
    lines.addLine({
      id: "stem",
      ...STYLE,
      overlay: true,
      occludedDashed: true,
      positions: POSITIONS,
    });
    const { visible, occluded, halo } = passesOf(root);
    expect(occluded).toBeUndefined();
    expect(halo.visible).toBe(true);
    expect(visible.visible).toBe(true);
    expect(visible.renderOrder).toBeGreaterThan(
      MAPLIBRE_SCENE_LINE_DEFAULTS.occludedRenderOrder
    );
    const material = visible.material as LineMaterial;
    expect(material.depthTest).toBe(false);
    expect(material.depthWrite).toBe(false);
    lines.destroy();
  });

  it("converts the dash to world units at the line every frame", () => {
    const { scene, root, state, runFrame } = createScene();
    const lines = createMapLibreSceneLineCollection(scene);
    lines.addLine({ id: "dashed", ...STYLE, dash: DASH, positions: POSITIONS });
    const material = passesOf(root).visible.material as LineMaterial;
    expect(material.dashSize).toBeCloseTo(3 / 50, 9);
    expect(material.gapSize).toBeCloseTo(3 / 50, 9);
    state.pixelsPerMeter = 100;
    runFrame();
    expect(material.dashSize).toBeCloseTo(3 / 100, 9);
    lines.destroy();
  });

  it("switches between solid and dashed in place", () => {
    const { scene, root } = createScene();
    const lines = createMapLibreSceneLineCollection(scene);
    const handle = lines.addLine({
      id: "stem",
      ...STYLE,
      overlay: true,
      positions: POSITIONS,
    });
    const material = passesOf(root).visible.material as LineMaterial;
    handle.setStyle({ ...STYLE, overlay: true, dash: DASH });
    expect(passesOf(root).visible.material).toBe(material);
    expect(material.dashed).toBe(true);
    expect(material.dashSize).toBeCloseTo(3 / 50, 9);
    expect(material.depthTest).toBe(false);
    handle.setStyle({ ...STYLE, overlay: true });
    expect(material.dashed).toBe(false);
    lines.destroy();
  });

  it("switches between depth-tested and overlay, adding and dropping the occluded pass", () => {
    const { scene, root } = createScene();
    const lines = createMapLibreSceneLineCollection(scene);
    const depthTested = { ...STYLE, occludedDashed: true };
    const handle = lines.addLine({
      id: "line",
      ...depthTested,
      positions: POSITIONS,
    });
    expect(passesOf(root).occluded).toBeDefined();
    const material = passesOf(root).visible.material as LineMaterial;
    expect(material.depthTest).toBe(true);

    handle.setStyle({ ...depthTested, overlay: true });
    let passes = passesOf(root);
    expect(passes.occluded).toBeUndefined();
    expect(passes.halo.visible).toBe(true);
    expect(passes.visible.material).toBe(material);
    expect(material.depthTest).toBe(false);
    expect(material.polygonOffset).toBe(false);
    expect(passes.visible.renderOrder).toBe(
      MAPLIBRE_SCENE_LINE_DEFAULTS.overlayRenderOrder
    );

    handle.setStyle(depthTested);
    passes = passesOf(root);
    expect(passes.occluded).toBeDefined();
    expect(passes.halo.visible).toBe(true);
    expect(material.depthTest).toBe(true);
    expect(material.polygonOffset).toBe(true);
    expect(passes.visible.renderOrder).toBe(
      MAPLIBRE_SCENE_LINE_DEFAULTS.renderOrder
    );
    expect(material.depthWrite).toBe(false);
    lines.destroy();
  });

  it("applies opacity changes in place and ignores an equal style", () => {
    const { scene, root } = createScene();
    const lines = createMapLibreSceneLineCollection(scene);
    const handle = lines.addLine({
      id: "stem",
      ...STYLE,
      overlay: true,
      opacity: 0.75,
      positions: POSITIONS,
    });
    const material = passesOf(root).visible.material as LineMaterial;
    expect(material.opacity).toBeCloseTo(0.6, 6);
    handle.setStyle({ ...STYLE, overlay: true, opacity: 0.75 });
    expect(passesOf(root).visible.material).toBe(material);
    handle.setStyle({ ...STYLE, overlay: true, opacity: 0.5 });
    expect(passesOf(root).visible.material).toBe(material);
    expect(material.opacity).toBeCloseTo(0.4, 6);
    lines.destroy();
  });

  it("keeps the look of the new style when the colour changes with it", () => {
    const { scene, root } = createScene();
    const lines = createMapLibreSceneLineCollection(scene);
    const handle = lines.addLine({
      id: "stem",
      ...STYLE,
      positions: POSITIONS,
    });
    handle.setStyle({
      color: "rgba(0, 0, 255, 0.5)",
      width: 2,
      overlay: true,
      dash: DASH,
      opacity: 0.5,
    });
    const material = passesOf(root).visible.material as LineMaterial;
    expect(material.dashed).toBe(true);
    expect(material.depthTest).toBe(false);
    expect(material.opacity).toBeCloseTo(0.25, 6);
    lines.destroy();
  });
});

describe("guide batch draw count", () => {
  it("draws 600 exact dash pairs in three existing passes sharing one geometry", () => {
    const { scene, root, runFrame } = createScene();
    const lines = createMapLibreSceneLineCollection(scene);
    const positions = Array.from({ length: 600 }, (_, index) => [
      new Vector3(index * 8, 0, 0),
      new Vector3(index * 8 + 5, 0, 0),
    ]).flat();
    lines.addLine({
      id: "guide",
      ...STYLE,
      positions,
      segmentPairs: true,
      occludedDashed: true,
    });
    const { visible, occluded, halo } = passesOf(root);
    expect(root.children).toHaveLength(3);
    expect(visible.geometry.getAttribute("instanceStart").count).toBe(600);
    expect(occluded!.geometry).toBe(visible.geometry);
    expect(halo.geometry).toBe(visible.geometry);
    const geometry = visible.geometry;
    const positionBuffer = geometry.getAttribute("instanceStart");
    const distances = geometry.getAttribute("instanceDistanceStart");
    runFrame();
    expect(visible.geometry).toBe(geometry);
    expect(geometry.getAttribute("instanceStart")).toBe(positionBuffer);
    expect(geometry.getAttribute("instanceDistanceStart")).toBe(distances);
    lines.destroy();
  });
});

describe("common scene halo defaults and explicit opt-out", () => {
  it("preserves the common darkening blend on overlays unless explicitly disabled", () => {
    const { scene, root } = createScene(),
      collection = createMapLibreSceneLineCollection(scene);
    const line = collection.addLine({
      id: "reticle",
      ...STYLE,
      positions: POSITIONS,
      overlay: true,
      overlayHalo: true,
    });
    let passes = passesOf(root);
    expect(passes.halo.visible).toBe(true);
    const material = passes.halo.material as LineMaterial;
    expect(material.depthTest).toBe(false);
    expect(material.depthWrite).toBe(false);
    expect(material.blending).toBe(CustomBlending);
    expect(material.blendEquation).toBe(MinEquation);
    expect(passes.occluded).toBeUndefined();
    line.setStyle({ ...STYLE, overlay: true });
    passes = passesOf(root);
    expect(passes.halo.visible).toBe(true);
    expect((passes.halo.material as LineMaterial).depthTest).toBe(false);
    line.setStyle({ ...STYLE, overlay: true, overlayHalo: false });
    expect(passesOf(root).halo.visible).toBe(false);
    line.setStyle({ ...STYLE, overlay: true });
    expect(passesOf(root).halo.visible).toBe(true);
    line.setStyle({ ...STYLE, overlay: true, overlayHalo: true, halo: false });
    expect(passesOf(root).halo.visible).toBe(false);
    line.setStyle({ ...STYLE, overlay: false, occludedDashed: true });
    passes = passesOf(root);
    expect(passes.halo.visible).toBe(true);
    expect((passes.halo.material as LineMaterial).depthTest).toBe(true);
    expect(passes.occluded).toBeDefined();
    collection.destroy();
  });
});

describe("scene line halo follows foreground alpha", () => {
  it.each([
    { color: "white", opacity: 0 },
    { color: "rgba(255,255,255,0)", opacity: 1 },
  ])(
    "hides the halo when the actual foreground is transparent: %j",
    (style) => {
      const { scene, root } = createScene(),
        collection = createMapLibreSceneLineCollection(scene);
      collection.addLine({
        id: "faded",
        ...STYLE,
        ...style,
        overlay: true,
        positions: POSITIONS,
      });
      const passes = passesOf(root);
      expect((passes.visible.material as LineMaterial).opacity).toBe(0);
      expect((passes.halo.material as LineMaterial).opacity).toBe(0);
      expect(passes.halo.visible).toBe(false);
      collection.destroy();
    }
  );
  it("tracks partial style and colour alpha and restores the halo in place", () => {
    const { scene, root } = createScene(),
      collection = createMapLibreSceneLineCollection(scene);
    const line = collection.addLine({
      id: "fading",
      ...STYLE,
      overlay: true,
      opacity: 0.5,
      positions: POSITIONS,
    });
    const halo = passesOf(root).halo,
      material = halo.material as LineMaterial;
    expect(material.opacity).toBeCloseTo(0.4, 8);
    expect(halo.visible).toBe(true);
    line.setStyle({ ...STYLE, overlay: true, opacity: 0 });
    expect(halo.visible).toBe(false);
    expect(material.opacity).toBe(0);
    line.setStyle({ ...STYLE, overlay: true, opacity: 0.25 });
    expect(halo.visible).toBe(true);
    expect(material.opacity).toBeCloseTo(0.2, 8);
    line.setStyle({ ...STYLE, color: "rgba(255,255,255,0)", overlay: true });
    expect(halo.visible).toBe(false);
    line.setStyle({ ...STYLE, overlay: true });
    expect(halo.visible).toBe(true);
    expect(material.opacity).toBeCloseTo(0.8, 8);
    expect(passesOf(root).halo.material).toBe(material);
    collection.destroy();
  });
});
