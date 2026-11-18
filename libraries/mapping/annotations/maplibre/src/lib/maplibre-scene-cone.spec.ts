import { describe, expect, it } from "vitest";
import {
  FrontSide,
  GreaterDepth,
  Group,
  Matrix4,
  ShaderLib,
  UniformsUtils,
  Vector3,
  type Mesh,
  type MeshBasicMaterial,
  type WebGLProgramParametersWithUniforms,
  type WebGLRenderer,
} from "three";

import type { MapLibreAnnotationScene } from "./maplibre-annotation-scene.types";
import {
  createMapLibreSceneCone,
  createUnitConeGeometry,
} from "./maplibre-scene-cone";
import {
  CONE_PASS,
  createConeMaterial,
  createConeOutlineUniforms,
} from "./maplibre-scene-cone-material";
import { MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS } from "./maplibre-scene-defaults";
import { createMapLibreSceneRing } from "./maplibre-scene-primitives";

/** Scene units are ECEF scaled by 2 and shifted; frame updates run on demand. */
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
    requestRender: () => undefined,
    getPixelRatio: () => 2,
  } as unknown as MapLibreAnnotationScene;
  return { scene, root, frameListeners };
};

const meshesOf = (root: Group) =>
  root.children.filter((child): child is Mesh => (child as Mesh).isMesh);

const BASE = new Vector3(6_000_000, 500_000, 300_000);
const modelMatrix = new Matrix4()
  .makeBasis(
    new Vector3(0.5, 0, 0),
    new Vector3(0, 0.5, 0),
    new Vector3(0, 0, 2)
  )
  .setPosition(BASE);

describe("createUnitConeGeometry", () => {
  it("stands on its base at z = 0 with the tip at z = 1", () => {
    const geometry = createUnitConeGeometry(12);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    expect(box.min.z).toBeCloseTo(0, 9);
    expect(box.max.z).toBeCloseTo(1, 9);
    expect(box.max.x).toBeCloseTo(1, 9);
  });
});

describe("createConeMaterial", () => {
  it("patches the basic material's shader at chunks it still has", () => {
    const uniforms = createConeOutlineUniforms("white");
    const material = createConeMaterial("red", 1, uniforms, CONE_PASS.OCCLUDED);
    const shader = {
      uniforms: UniformsUtils.clone(ShaderLib.basic.uniforms),
      vertexShader: ShaderLib.basic.vertexShader,
      fragmentShader: ShaderLib.basic.fragmentShader,
    } as unknown as WebGLProgramParametersWithUniforms;
    material.onBeforeCompile(shader, {} as WebGLRenderer);
    expect(shader.vertexShader).toContain(
      "vConeNormal = normalMatrix * normal"
    );
    expect(shader.fragmentShader).toContain("uniform float coneDashPx");
    expect(shader.fragmentShader).toContain("float outline =");
    expect(shader.fragmentShader).toContain("#include <opaque_fragment>");
    expect(shader.uniforms["coneOutlineWidthPx"]).toBe(
      uniforms.coneOutlineWidthPx
    );
  });
});

describe("createMapLibreSceneCone", () => {
  it("draws a depth-tested pass and a depth-fail outline pass on one geometry", () => {
    const { scene, root } = createScene();
    createMapLibreSceneCone(scene, {
      id: "cone",
      color: "rgb(59, 130, 246)",
      outlineColor: "white",
      modelMatrix,
    });
    const [visible, occluded] = meshesOf(root);
    expect(visible!.geometry).toBe(occluded!.geometry);
    const visibleMaterial = visible!.material as MeshBasicMaterial;
    const occludedMaterial = occluded!.material as MeshBasicMaterial;
    expect(visibleMaterial.depthTest).toBe(true);
    expect(visibleMaterial.depthWrite).toBe(false);
    expect(visibleMaterial.side).toBe(FrontSide);
    expect(occludedMaterial.depthFunc).toBe(GreaterDepth);
    expect(occludedMaterial.defines).toHaveProperty("CONE_OCCLUDED");
    expect(occluded!.renderOrder).toBeGreaterThan(visible!.renderOrder);
  });

  it("places the unit tip where the scene projects the model's apex", () => {
    const { scene, root } = createScene();
    const handle = createMapLibreSceneCone(scene, {
      id: "cone",
      color: "red",
      outlineColor: "white",
      modelMatrix,
    });
    const tipECEF = new Vector3(0, 0, 1).applyMatrix4(modelMatrix);
    for (const mesh of meshesOf(root)) {
      expect(mesh.visible).toBe(true);
      const tipScene = new Vector3(0, 0, 1).applyMatrix4(mesh.matrix);
      expect(tipScene.distanceTo(scene.sceneFromEcef(tipECEF)!)).toBeLessThan(
        1e-6
      );
    }
    handle.setVisible(false);
    expect(meshesOf(root).every((mesh) => !mesh.visible)).toBe(true);
    handle.destroy();
    expect(meshesOf(root)).toHaveLength(0);
  });
});

describe("createMapLibreSceneRing", () => {
  it("draws on top by default and depth-tested with the fills when occludable", () => {
    const { scene, root } = createScene();
    createMapLibreSceneRing(scene, {
      id: "top",
      radius: 1,
      color: "white",
      modelMatrix,
    });
    createMapLibreSceneRing(scene, {
      id: "occludable",
      radius: 1,
      color: "white",
      modelMatrix,
      occludable: true,
    });
    const [top, occludable] = meshesOf(root);
    expect((top!.material as MeshBasicMaterial).depthTest).toBe(false);
    expect(top!.renderOrder).toBe(
      MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS.ringRenderOrder
    );
    expect((occludable!.material as MeshBasicMaterial).depthTest).toBe(true);
    expect(occludable!.renderOrder).toBe(
      MAPLIBRE_SCENE_PRIMITIVE_DEFAULTS.occludableRingRenderOrder
    );
  });
});
