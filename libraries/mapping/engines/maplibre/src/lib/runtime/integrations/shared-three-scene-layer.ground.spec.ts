import { createProgressiveHost } from "./shared-three-scene-layer.test-support";
import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import {
  clearDepthForMapStyleOverlays,
  clearMapStyleGroundBeforeThreeTerrain,
} from "./shared-three-scene-render-context";
import { configureMapStyleProjectedMaterial } from "./shared-three-map-style-material";

const createSurfaceOverlayFixture = (
  overlays: Array<{
    id: string;
    texture: THREE.Texture;
    bounds: readonly [west: number, south: number, east: number, north: number];
    opacity: number;
  }>
) => {
  const host = createProgressiveHost();
  const material = new THREE.MeshStandardMaterial();
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material));
  host.layer.addRuntime({
    id: "surface-overlay-receiver",
    originLngLat: [7.15, 51.25],
    root,
    providesTerrain: false,
    receivesMapStyleTexture: true,
    update: vi.fn(),
    dispose: vi.fn(),
  });
  host.layer.setAccumulationController(null);
  host.layer.setMapStylePresentationEnabled!(false);
  for (const overlay of overlays) {
    host.layer.setMapStyleSurfaceOverlay!(overlay.id, overlay);
  }
  host.render();

  const shader = {
    uniforms: {} as Record<string, unknown>,
    vertexShader: "#include <common>\n#include <project_vertex>",
    fragmentShader:
      "#include <common>\n#include <map_fragment>\n#include <opaque_fragment>",
  };
  material.onBeforeCompile(shader as never, {} as never);
  const uniformValue = <T>(name: string): T =>
    (shader.uniforms[name] as { value: T }).value;

  return { host, material, shader, uniformValue };
};

describe("shared three scene layer.ground", () => {
  it.each([false, true, undefined])(
    "preserves DEM under building-only style receivers (%s)",
    (providesTerrain) => {
      const host = createProgressiveHost();
      const clearColor = vi.fn();
      Object.assign(host.gl, {
        COLOR_BUFFER_BIT: 0x4000,
        COLOR_CLEAR_VALUE: 0x0c22,
        clearColor,
      });
      host.gl.getParameter.mockImplementation((parameter) =>
        parameter === 0x0b70
          ? [0, 0.985]
          : parameter === 0x0c22
          ? [0, 0, 0, 0]
          : host.hostFramebuffer
      );
      host.layer.setAccumulationController(null);
      // Isolate ground ownership; capture/material rendering has separate tests.
      host.layer.setMapStyleProjectionVisible(false);
      host.layer.addRuntime({
        id: "style-ground",
        originLngLat: [7.15, 51.25],
        root: new THREE.Group(),
        providesTerrain,
        receivesMapStyleTexture: true,
        update: vi.fn(),
        dispose: vi.fn(),
      });
      try {
        host.render();
        expect(clearColor).toHaveBeenCalledTimes(
          providesTerrain === false ? 0 : 2
        );
      } finally {
        host.layer.onRemove!(host.map as never, host.gl as never);
      }
    }
  );

  it("projects the captured MapLibre ground pass before terrain lighting", () => {
    const material = new THREE.MeshLambertMaterial();
    const texture = new THREE.Texture();
    const sceneToClip = new THREE.Matrix4().makeTranslation(1, 2, 3);
    const uniforms = {
      texture: { value: texture },
      sceneToClip: { value: sceneToClip },
      enabled: { value: 1 },
      depthTexture: { value: null },
      depthEnabled: { value: 0 },
      depthNearFar: { value: new THREE.Vector2(1, 1000) },
      texelSize: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
    };
    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <project_vertex>",
      fragmentShader:
        "#include <common>\n#include <map_fragment>\n#include <opaque_fragment>",
    };

    configureMapStyleProjectedMaterial(material, uniforms);
    material.onBeforeCompile(shader as never, {} as never);

    expect(shader.uniforms).toMatchObject({
      carmaMapStyleTexture: uniforms.texture,
      carmaMapStyleSceneToClip: uniforms.sceneToClip,
      carmaMapStyleEnabled: uniforms.enabled,
      carmaMapStyleTexelSize: uniforms.texelSize,
    });
    expect(shader.vertexShader).toContain(
      "carmaMapStyleSceneToClip * carmaSurfacePosition"
    );
    expect(shader.fragmentShader).toContain(
      "diffuseColor.rgb = carmaMapStyleSRGBToLinear"
    );
    expect(shader.fragmentShader).toContain("diffuseColor.a = 1.0");
    const terrainDepthBranch = shader.fragmentShader
      .split("#ifndef CARMA_MAP_STYLE_OVERLAY")[1]
      .split("#else")[0];
    expect(terrainDepthBranch).toContain("return true;");
    expect(terrainDepthBranch).not.toContain("fragmentDistance");
    expect(material.customProgramCacheKey()).toContain(
      "carma-map-style-projection-v8"
    );
    expect(material.defines?.CARMA_MAP_STYLE_OVERLAY).toBeUndefined();
  });

  it("composites the captured pass over a textured receiver in overlay mode", () => {
    const material = new THREE.MeshStandardMaterial();
    const uniforms = {
      texture: { value: new THREE.Texture() },
      sceneToClip: { value: new THREE.Matrix4() },
      enabled: { value: 1 },
      depthTexture: { value: new THREE.Texture() },
      depthEnabled: { value: 1 },
      depthNearFar: { value: new THREE.Vector2(1, 1000) },
      texelSize: { value: new THREE.Vector2(1 / 1280, 1 / 720) },
    };
    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <project_vertex>",
      fragmentShader:
        "#include <common>\n#include <map_fragment>\n#include <opaque_fragment>",
    };

    configureMapStyleProjectedMaterial(material, uniforms, "overlay");
    material.onBeforeCompile(shader as never, {} as never);

    expect(material.defines?.CARMA_MAP_STYLE_OVERLAY).toBe("");
    expect(shader.fragmentShader).toContain("#ifdef CARMA_MAP_STYLE_OVERLAY");
    expect(shader.fragmentShader).toContain("carmaMapStyleOccludedByMesh");
    expect(shader.fragmentShader).toContain("carmaMapStyleLabelCoverage");
    expect(shader.fragmentShader.indexOf("carmaShade")).toBeLessThan(
      shader.fragmentShader.indexOf("#include <opaque_fragment>")
    );
    expect(shader.uniforms).toMatchObject({
      carmaMapStyleDepthTexture: uniforms.depthTexture,
      carmaMapStyleDepthEnabled: uniforms.depthEnabled,
      carmaMapStyleDepthNearFar: uniforms.depthNearFar,
    });
    expect(shader.fragmentShader).toContain("carmaMapStyleSample.a");
    expect(shader.fragmentShader).toContain("carmaMapStyleSampleGround");
    expect(shader.fragmentShader).toContain("carmaMapStyleMatchesReceiver");
    expect(material.customProgramCacheKey()).toContain("|overlay");

    configureMapStyleProjectedMaterial(material, uniforms, "replace");
    expect(material.defines?.CARMA_MAP_STYLE_OVERLAY).toBeUndefined();
    expect(material.customProgramCacheKey()).toContain("|replace");
  });

  it("maps Mercator northwest/southeast bounds to world UV independent of height", () => {
    const texture = new THREE.Texture();
    const bounds = [7.14, 51.24, 7.16, 51.26] as const;
    const fixture = createSurfaceOverlayFixture([
      { id: "year-marker", texture, bounds, opacity: 0.5 },
    ]);
    const matrix = fixture.uniformValue<THREE.Matrix4>(
      "carmaSurfaceSceneToTexture"
    );
    const uv = (lng: number, lat: number, height: number) => {
      const point = fixture.host.layer.projectLngLatToScene(
        [lng, lat],
        height
      )!;
      return new THREE.Vector4(point.x, point.y, point.z, 1).applyMatrix4(
        matrix
      );
    };
    const northwest = uv(bounds[0], bounds[3], 0);
    const northwestRoof = uv(bounds[0], bounds[3], 250);
    const southeast = uv(bounds[2], bounds[1], 0);

    expect(northwest.x).toBeCloseTo(0, 8);
    expect(northwest.y).toBeCloseTo(1, 8);
    expect(southeast.x).toBeCloseTo(1, 8);
    expect(southeast.y).toBeCloseTo(0, 8);
    expect(northwestRoof.x).toBeCloseTo(northwest.x, 10);
    expect(northwestRoof.y).toBeCloseTo(northwest.y, 10);
    expect(
      fixture.uniformValue<THREE.Texture | null>("carmaSurfaceTexture")
    ).toBe(texture);
    expect(fixture.uniformValue<number>("carmaSurfaceOpacity")).toBe(0.5);
    expect(fixture.uniformValue<number>("carmaMapStyleEnabled")).toBe(0);
    fixture.host.layer.onRemove!(
      fixture.host.map as never,
      fixture.host.gl as never
    );
    texture.dispose();
  });

  it("keeps surface opacity out of DEM occlusion and restores the previous owner", () => {
    const firstTexture = new THREE.Texture();
    const secondTexture = new THREE.Texture();
    const bounds = [7.14, 51.24, 7.16, 51.26] as const;
    const fixture = createSurfaceOverlayFixture([
      { id: "first-owner", texture: firstTexture, bounds, opacity: 0.25 },
      { id: "second-owner", texture: secondTexture, bounds, opacity: 0.5 },
    ]);
    const fragment = fixture.shader.fragmentShader;
    const surfaceBranch = fragment
      .split("if ( carmaSurfaceOpacity > 0.0 )")[1]
      .split("if (carmaScreenOpacity")[0];

    expect(
      fixture.uniformValue<THREE.Texture | null>("carmaSurfaceTexture")
    ).toBe(secondTexture);
    expect(fixture.uniformValue<number>("carmaSurfaceOpacity")).toBe(0.5);
    expect(surfaceBranch).toContain("alpha*carmaSurfaceOpacity");
    expect(surfaceBranch).not.toContain("carmaMapStyleOccludedByMesh");
    expect(surfaceBranch).not.toContain("carmaMapStyleDepth");

    fixture.host.layer.setMapStyleSurfaceOverlay!("second-owner", null);
    expect(
      fixture.uniformValue<THREE.Texture | null>("carmaSurfaceTexture")
    ).toBe(firstTexture);
    expect(fixture.uniformValue<number>("carmaSurfaceOpacity")).toBe(0.25);
    fixture.host.layer.setMapStyleSurfaceOverlay!("first-owner", null);
    expect(
      fixture.uniformValue<THREE.Texture | null>("carmaSurfaceTexture")
    ).toBe(null);
    expect(fixture.uniformValue<number>("carmaSurfaceOpacity")).toBe(0);

    fixture.host.layer.onRemove!(
      fixture.host.map as never,
      fixture.host.gl as never
    );
    firstTexture.dispose();
    secondTexture.dispose();
  });

  it("clears mesh depth before MapLibre draws retained place labels", () => {
    const gl = {
      DEPTH_BUFFER_BIT: 0x00000100,
      clear: vi.fn(),
      clearDepth: vi.fn(),
      depthMask: vi.fn(),
      depthRange: vi.fn(),
    };

    clearDepthForMapStyleOverlays(gl, [0, 0.985]);

    expect(gl.depthMask).toHaveBeenCalledWith(true);
    expect(gl.depthRange.mock.calls).toEqual([
      [0, 1],
      [0, 0.985],
    ]);
    expect(gl.clearDepth).toHaveBeenCalledWith(1);
    expect(gl.clear).toHaveBeenCalledWith(gl.DEPTH_BUFFER_BIT);
  });

  it("clears MapLibre ground color and depth before Three replaces it", () => {
    const previousClearColor = new Float32Array([0.2, 0.3, 0.4, 1]);
    const gl = {
      COLOR_BUFFER_BIT: 0x00004000,
      DEPTH_BUFFER_BIT: 0x00000100,
      COLOR_CLEAR_VALUE: 0x0c22,
      clear: vi.fn(),
      clearColor: vi.fn(),
      clearDepth: vi.fn(),
      depthMask: vi.fn(),
      depthRange: vi.fn(),
      getParameter: vi.fn(() => previousClearColor),
    };

    clearMapStyleGroundBeforeThreeTerrain(gl, [0, 0.985]);

    expect(gl.clear).toHaveBeenCalledWith(
      gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT
    );
    expect(gl.clearColor.mock.calls).toEqual([
      [0, 0, 0, 0],
      [...previousClearColor],
    ]);
    expect(gl.depthRange.mock.calls).toEqual([
      [0, 1],
      [0, 0.985],
    ]);
  });
});
