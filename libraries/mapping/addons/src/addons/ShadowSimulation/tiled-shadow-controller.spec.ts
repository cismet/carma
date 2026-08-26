// @vitest-environment node

import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";

import {
  buildTiledLightSpaceLightsFragment,
  TiledShadowController,
  SHADOW_TILE_COUNT,
  type TiledShadowUpdate,
} from "./tiled-shadow-controller";

const buildCamera = () => {
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 1, 2_000);
  camera.position.set(0, 300, 500);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
};

const buildReceiverPoints = () =>
  [-300, 300].flatMap((x) =>
    [100, 250].flatMap((y) =>
      [-300, 300].map((z) => new THREE.Vector3(x, y, z))
    )
  );

const buildUpdate = (
  camera: THREE.PerspectiveCamera,
  receiverWorldPoints = buildReceiverPoints()
): TiledShadowUpdate => ({
  camera,
  receiverWorldPoints,
  minimumElevationMeters: 100,
  maximumElevationMeters: 250,
  directionToSun: new THREE.Vector3(0.4, 0.6, -0.7).normalize(),
  color: "#ffd6a0",
  intensity: 2,
  shadowIntensity: 0.45,
  quality: 4,
});

describe("buildTiledLightSpaceLightsFragment", () => {
  it("selects one receiver-core tile and evaluates the sun once", () => {
    const controller = new TiledShadowController(
      new THREE.Scene(),
      buildCamera()
    );
    const source = buildTiledLightSpaceLightsFragment(
      THREE.ShaderChunk.lights_fragment_begin
    );
    const selectionBlock = source.slice(
      source.indexOf("// CARMA light-space tile selection begin"),
      source.indexOf("// CARMA light-space tile selection end")
    );

    expect(selectionBlock).toContain("CSM_tileReceiverUv[ i ]");
    expect(selectionBlock).toContain("! CSM_tileSelected");
    expect(selectionBlock.match(/getShadow\(/g)).toHaveLength(1);
    expect(selectionBlock.match(/RE_Direct\(/g)).toHaveLength(1);
    expect(source).not.toContain("float linearDepth");

    controller.dispose();
  });
});

describe("TiledShadowController", () => {
  it("keeps a prior material compiler hook while enabling tiled shadows", () => {
    const scene = new THREE.Scene();
    const controller = new TiledShadowController(scene, buildCamera());
    const material = new THREE.MeshLambertMaterial();
    const previousHook = vi.fn();
    material.onBeforeCompile = previousHook;

    controller.setupMaterial(material);
    const shader = {
      uniforms: {},
      fragmentShader:
        "#include <lights_pars_begin>\n#include <lights_fragment_begin>",
    } as unknown as THREE.WebGLProgramParametersWithUniforms;
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer);

    expect(previousHook).toHaveBeenCalledOnce();
    expect(material.defines).toMatchObject({
      USE_CSM: 1,
      CSM_CASCADES: SHADOW_TILE_COUNT,
    });
    expect(shader.uniforms).toHaveProperty("CSM_cascades");
    expect(shader.uniforms).toHaveProperty("CSM_tileReceiverUv");
    expect(shader.fragmentShader).toContain(
      "CARMA light-space tile selection begin"
    );

    controller.dispose();
    expect(material.onBeforeCompile).toBe(previousHook);
  });

  it("leaves unlit and custom materials outside the tiled-light shader path", () => {
    const controller = new TiledShadowController(
      new THREE.Scene(),
      buildCamera()
    );
    const basic = new THREE.MeshBasicMaterial();
    const custom = new THREE.ShaderMaterial({
      fragmentShader: "void main() { gl_FragColor = vec4(1.0); }",
    });
    const basicHook = basic.onBeforeCompile;
    const customHook = custom.onBeforeCompile;
    const basicDefines = basic.defines;
    const customDefines = custom.defines;

    controller.setupMaterial(basic);
    controller.setupMaterial(custom);

    expect(basic.onBeforeCompile).toBe(basicHook);
    expect(custom.onBeforeCompile).toBe(customHook);
    expect(basic.defines).toBe(basicDefines);
    expect(custom.defines).toBe(customDefines);
    expect(controller.csm.shaders.has(basic)).toBe(false);
    expect(controller.csm.shaders.has(custom)).toBe(false);

    controller.dispose();
    basic.dispose();
    custom.dispose();
  });

  it("rejects a lit built-in shader that loses the required light includes", () => {
    const controller = new TiledShadowController(
      new THREE.Scene(),
      buildCamera()
    );
    const material = new THREE.MeshStandardMaterial();
    controller.setupMaterial(material);
    const shader = {
      uniforms: {},
      fragmentShader: "void main() {}",
    } as unknown as THREE.WebGLProgramParametersWithUniforms;

    expect(() =>
      material.onBeforeCompile(shader, {} as THREE.WebGLRenderer)
    ).toThrow(/must retain the Three\.js light shader includes/);

    controller.dispose();
  });

  it("prunes replaced materials and releases disposed streamed materials", () => {
    const scene = new THREE.Scene();
    const controller = new TiledShadowController(scene, buildCamera());
    const firstMaterial = new THREE.MeshLambertMaterial();
    const firstHook = vi.fn();
    firstMaterial.onBeforeCompile = firstHook;
    firstMaterial.defines = { SOURCE_DEFINE: 1 };
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), firstMaterial);
    scene.add(mesh);

    controller.syncSceneMaterials(scene);
    expect(controller.csm.shaders.has(firstMaterial)).toBe(true);
    expect(firstMaterial.defines).toMatchObject({ USE_CSM: 1 });

    const replacementMaterial = new THREE.MeshLambertMaterial();
    const replacementHook = vi.fn();
    replacementMaterial.onBeforeCompile = replacementHook;
    mesh.material = replacementMaterial;
    controller.syncSceneMaterials(scene);

    expect(controller.csm.shaders.has(firstMaterial)).toBe(false);
    expect(firstMaterial.onBeforeCompile).toBe(firstHook);
    expect(firstMaterial.defines).toEqual({ SOURCE_DEFINE: 1 });
    expect(controller.csm.shaders.has(replacementMaterial)).toBe(true);
    expect(replacementMaterial.defines).toMatchObject({ USE_CSM: 1 });

    replacementMaterial.dispose();

    expect(controller.csm.shaders.has(replacementMaterial)).toBe(false);
    expect(replacementMaterial.onBeforeCompile).toBe(replacementHook);
    expect(replacementMaterial.defines).toBeUndefined();

    controller.dispose();
    mesh.geometry.dispose();
    firstMaterial.dispose();
  });

  it("fits a true two-dimensional four-map layout to the receiver prism", () => {
    const scene = new THREE.Scene();
    const camera = buildCamera();
    const controller = new TiledShadowController(scene, camera);

    const snapshot = controller.update(buildUpdate(camera));

    expect(snapshot).not.toBeNull();
    expect(snapshot?.strategy).toBe("tiled-light-space");
    expect(snapshot?.tileCount).toBe(SHADOW_TILE_COUNT);
    expect(snapshot?.totalShadowTexels).toBe(SHADOW_TILE_COUNT * 2_048 * 2_048);
    expect(snapshot?.tiles.map(({ id }) => id)).toEqual([
      "r0-c0",
      "r0-c1",
      "r1-c0",
      "r1-c1",
    ]);
    for (const tile of snapshot?.tiles ?? []) {
      expect(tile.leftMeters).toBeLessThan(tile.receiverLeftMeters);
      expect(tile.rightMeters).toBeGreaterThan(tile.receiverRightMeters);
      expect(tile.bottomMeters).toBeLessThan(tile.receiverBottomMeters);
      expect(tile.topMeters).toBeGreaterThan(tile.receiverTopMeters);
      expect(tile.nearMeters).toBeLessThan(tile.farMeters);
      expect(tile.statistics).toMatchObject({
        tileCount: SHADOW_TILE_COUNT,
        rowCount: 2,
        columnCount: 2,
        maxTileCount: SHADOW_TILE_COUNT,
      });
      expect(tile.shadowMapWidth).toBe(2_048);
      expect(tile.shadowMapHeight).toBe(2_048);
    }
    expect(snapshot?.tiles[0].receiverRightMeters).toBeCloseTo(
      snapshot?.tiles[1].receiverLeftMeters ?? Number.NaN
    );
    expect(snapshot?.tiles[0].receiverBottomMeters).toBeCloseTo(
      snapshot?.tiles[2].receiverTopMeters ?? Number.NaN
    );
    expect(controller.lights.every((light) => light.intensity === 2)).toBe(
      true
    );
    expect(
      controller.lights.every((light) => light.shadow.intensity === 0.45)
    ).toBe(true);

    controller.dispose();
  });

  it("restores the legacy single viewport buffer without tiled shaders", () => {
    const scene = new THREE.Scene();
    const camera = buildCamera();
    const controller = new TiledShadowController(scene, camera);
    const material = new THREE.MeshLambertMaterial();
    const originalHook = material.onBeforeCompile;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    scene.add(mesh);

    controller.syncSceneMaterials(scene);
    expect(controller.csm.shaders.has(material)).toBe(true);

    controller.setMode("single");
    controller.syncSceneMaterials(scene);
    const snapshot = controller.update(buildUpdate(camera));

    expect(controller.csm.shaders.has(material)).toBe(false);
    expect(material.onBeforeCompile).toBe(originalHook);
    expect(snapshot?.strategy).toBe("single-viewport");
    expect(snapshot?.tileCount).toBe(1);
    expect(snapshot?.totalShadowTexels).toBe(4_096 * 4_096);
    expect(snapshot?.tiles[0]?.id).toBe("single");
    const singleTile = snapshot!.tiles[0]!;
    expect(
      (singleTile.rightMeters - singleTile.leftMeters) /
        (singleTile.topMeters - singleTile.bottomMeters)
    ).toBeCloseTo(singleTile.shadowMapWidth / singleTile.shadowMapHeight, 10);
    expect(controller.lights[0].visible).toBe(true);
    expect(controller.lights[0].castShadow).toBe(true);
    expect(controller.lights.slice(1).every((light) => !light.visible)).toBe(
      true
    );
    expect(controller.lights.slice(1).every((light) => !light.castShadow)).toBe(
      true
    );

    controller.setMode("advanced");
    controller.syncSceneMaterials(scene);
    expect(controller.csm.shaders.has(material)).toBe(true);
    expect(controller.lights.every((light) => light.visible)).toBe(true);
    expect(controller.lights.every((light) => light.castShadow)).toBe(true);

    controller.dispose();
    mesh.geometry.dispose();
    material.dispose();
  });

  it("keeps the fixed map budget while disabling unused receiver tiles", () => {
    const scene = new THREE.Scene();
    const camera = buildCamera();
    const controller = new TiledShadowController(scene, camera);
    const update = buildUpdate(camera);

    const activeSnapshot = controller.update(update);
    expect(activeSnapshot?.totalShadowTexels).toBe(
      SHADOW_TILE_COUNT * 2_048 * 2_048
    );

    expect(
      controller.update({ ...update, receiverWorldPoints: [] })
    ).toBeNull();
    controller.invalidate();

    expect(controller.lights.every((light) => light.intensity === 0)).toBe(
      true
    );
    expect(
      controller.lights.every(
        (light) => light.shadow.needsUpdate === (light.shadow.map === null)
      )
    ).toBe(true);

    controller.dispose();
  });

  it("keeps all sampler slots valid for a three-tile layout and quality reset", () => {
    const camera = buildCamera();
    const controller = new TiledShadowController(new THREE.Scene(), camera);
    const receiverWorldPoints = [-5, 5].flatMap((x) =>
      [100, 250].flatMap((y) =>
        [-55, 55].map((z) => new THREE.Vector3(x, y, z))
      )
    );
    const update = buildUpdate(camera, receiverWorldPoints);

    expect(controller.update(update)?.tileCount).toBe(3);
    for (const light of controller.lights) {
      light.shadow.map = new THREE.WebGLRenderTarget(2_048, 2_048);
      light.shadow.needsUpdate = false;
    }

    expect(controller.update(update)?.tileCount).toBe(3);
    expect(
      controller.lights.slice(0, 3).every(({ shadow }) => shadow.needsUpdate)
    ).toBe(true);
    expect(controller.lights[3].intensity).toBe(0);
    expect(controller.lights[3].shadow.map).not.toBeNull();
    expect(controller.lights[3].shadow.needsUpdate).toBe(false);

    expect(controller.update({ ...update, quality: 16 })?.tileCount).toBe(3);
    expect(
      controller.lights.every(
        ({ shadow }) => shadow.map === null && shadow.needsUpdate
      )
    ).toBe(true);

    for (const light of controller.lights) {
      light.shadow.map = new THREE.WebGLRenderTarget(4_096, 4_096);
      light.shadow.needsUpdate = false;
    }
    controller.update({ ...update, quality: 16 });
    expect(controller.lights[3].shadow.map).not.toBeNull();
    expect(controller.lights[3].shadow.needsUpdate).toBe(false);

    controller.dispose();
  });
});
