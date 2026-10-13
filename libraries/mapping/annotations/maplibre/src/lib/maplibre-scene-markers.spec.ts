import { describe, expect, it } from "vitest";
import {
  GreaterDepth,
  Group,
  Raycaster,
  Vector2,
  Vector3,
  type InstancedBufferAttribute,
  type InstancedBufferGeometry,
  type Mesh,
  type ShaderMaterial,
} from "three";

import type { MapLibreAnnotationScene } from "./maplibre-annotation-scene.types";
import { packSceneMarkerStyle } from "./maplibre-scene-marker-style";
import { createMapLibreSceneMarkerCollection } from "./maplibre-scene-markers";
import { MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS } from "./maplibre-scene-defaults";

/** Scene units are ECEF scaled by 2 and shifted; frame updates run on demand. */
/** Runs this frame's update, as the shared scene does before each draw. */
const runFrame = (frameListeners: Set<() => void>) =>
  frameListeners.forEach((listener) => listener());

const createScene = () => {
  const root = new Group();
  const frameListeners = new Set<() => void>();
  const scene = {
    root,
    sceneFromEcef: (positionECEF: Vector3, out = new Vector3()) =>
      out.copy(positionECEF).multiplyScalar(2).add(new Vector3(10, 0, 0)),
    subscribeFrameUpdate: (listener: () => void) => {
      frameListeners.add(listener);
      return () => frameListeners.delete(listener);
    },
    getFrame: () => ({ viewport: new Vector2(800, 600) }),
    requestRender: () => undefined,
    getPixelRatio: () => 2,
  } as unknown as MapLibreAnnotationScene;
  return { scene, root, frameListeners };
};

const meshesOf = (root: Group) =>
  root.children.filter((child): child is Mesh => (child as Mesh).isMesh);

const instanceValues = (mesh: Mesh, name: string) => {
  const geometry = mesh.geometry as InstancedBufferGeometry;
  const attribute = geometry.getAttribute(name) as InstancedBufferAttribute;
  return Array.from(
    attribute.array.slice(0, geometry.instanceCount * attribute.itemSize)
  );
};

const BASE = new Vector3(6_000_000, 500_000, 300_000);
const STYLE = {
  sizePx: 10,
  fill: "transparent",
  outline: "#ffffff",
  outlineWidthPx: 1,
};

describe("packSceneMarkerStyle", () => {
  it("keeps the outline inside the outer diameter", () => {
    const packed = packSceneMarkerStyle(STYLE);
    expect(packed.shape).toEqual([5, 0, 1, 0]);
    expect(packed.fill[3]).toBe(0);
    expect(packed.outline).toEqual([1, 1, 1, 1]);
  });

  it("makes a bar a stadium of its full length and scales everything", () => {
    const packed = packSceneMarkerStyle({
      ...STYLE,
      sizePx: 2,
      barLengthPx: 8,
      scale: 1.5,
      ring: { widthPx: 4, color: "rgba(255, 255, 255, 0.5)", soft: true },
    });
    expect(packed.shape).toEqual([1.5, 4.5, 1.5, 6]);
    expect(packed.ring[3]).toBeCloseTo(0.5);
    expect(packed.ringSoft).toBe(1);
  });
});

describe("createMapLibreSceneMarkerCollection", () => {
  it("draws all markers in a visible and an occluded pass without depth writes", () => {
    const { scene, root, frameListeners } = createScene();
    const collection = createMapLibreSceneMarkerCollection(scene);
    collection.addMarker({ ...STYLE, id: "a", positionECEF: BASE });
    collection.addMarker({
      ...STYLE,
      id: "b",
      positionECEF: BASE.clone().addScalar(5),
    });
    const [visible, occluded] = meshesOf(root);
    expect((visible!.geometry as InstancedBufferGeometry).instanceCount).toBe(
      0
    );
    runFrame(frameListeners);
    expect(visible!.renderOrder).toBe(
      MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS.markerRenderOrder
    );
    expect((visible!.geometry as InstancedBufferGeometry).instanceCount).toBe(
      2
    );
    for (const mesh of [visible!, occluded!]) {
      expect((mesh.material as ShaderMaterial).depthWrite).toBe(false);
    }
    expect((occluded!.material as ShaderMaterial).depthFunc).toBe(GreaterDepth);
    expect(instanceValues(visible!, "markerCenter").slice(0, 3)).toEqual(
      [BASE.x * 2 + 10, BASE.y * 2, BASE.z * 2].map(Math.fround)
    );
  });

  it("leaves hidden markers out and follows positions and bar edges", () => {
    const { scene, root, frameListeners } = createScene();
    const collection = createMapLibreSceneMarkerCollection(scene);
    const first = collection.addMarker({
      ...STYLE,
      id: "a",
      positionECEF: BASE,
    });
    const second = collection.addMarker({
      ...STYLE,
      id: "b",
      positionECEF: BASE,
    });
    const [visible] = meshesOf(root);
    runFrame(frameListeners);
    first.setVisible(false);
    expect((visible!.geometry as InstancedBufferGeometry).instanceCount).toBe(
      1
    );
    second.setPosition(BASE.clone().addScalar(1), new Vector3(0, 0, 3));
    const center = instanceValues(visible!, "markerCenter");
    expect(center[0]).toBe(Math.fround((BASE.x + 1) * 2 + 10));
    // one metre along the edge, in scene units
    expect(instanceValues(visible!, "markerAcross")).toEqual([0, 0, 2]);
  });

  it("is never a pick target and leaves the scene on destroy", () => {
    const { scene, root, frameListeners } = createScene();
    const collection = createMapLibreSceneMarkerCollection(scene);
    collection.addMarker({ ...STYLE, id: "a", positionECEF: BASE });
    const raycaster = new Raycaster(
      new Vector3(0, 0, 10),
      new Vector3(0, 0, -1)
    );
    expect(raycaster.intersectObjects(meshesOf(root), false)).toHaveLength(0);
    collection.destroy();
    expect(meshesOf(root)).toHaveLength(0);
    expect(frameListeners.size).toBe(0);
  });
});
