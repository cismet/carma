import { createProgressiveHost } from "./shared-three-scene-layer.test-support";
import * as THREE from "three";
import type { CssPixels } from "@carma-units";
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
    previous?: {
      texture: THREE.Texture;
      bounds: readonly [number, number, number, number];
      opacity?: number;
    };
    transition?: number;
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
  it.each([false, true])(
    "refreshes unchanged photo markings on a newly published LOD (local frame: %s)",
    (mountsOnLocalFrame) => {
      const host = createProgressiveHost();
      Object.assign(host.gl, {
        COLOR_BUFFER_BIT: 0x4000,
        COLOR_CLEAR_VALUE: 0x0c22,
        clearColor: vi.fn(),
      });
      host.gl.getParameter.mockImplementation((parameter) =>
        parameter === 0x0b70
          ? [0, 0.985]
          : parameter === 0x0c22
          ? [0, 0, 0, 0]
          : host.hostFramebuffer
      );
      const root = new THREE.Group();
      const material = new THREE.MeshStandardMaterial();
      root.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material));
      let revision = 0;
      let incoming: THREE.Mesh | undefined;
      const renderProgressive = vi.fn<
        NonNullable<typeof host.controller.renderProgressive>
      >(() => ({
        settled: true,
        progress: 1,
        needsRepaint: false,
      }));
      host.layer.setAccumulationController({
        ...host.controller,
        renderProgressive,
      });
      host.layer.setMapStylePresentationEnabled!(false);
      host.layer.addRuntime({
        id: "lod-receiver",
        originLngLat: [7.15, 51.25],
        root,
        mountsOnLocalFrame,
        receivesMapStyleTexture: true,
        mapStyleProjectionVersion: () => revision,
        update: () => {
          if (!incoming) return;
          root.clear();
          root.add(incoming);
          incoming = undefined;
          revision++;
        },
        dispose: vi.fn(),
      });
      const labels = new THREE.Texture();
      host.layer.setMapStyleProjectiveOverlay!("photos", {
        marks: Array.from({ length: 3 }, (_, index) => ({
          sceneToImage: new THREE.Matrix4().makeTranslation(index, 0, 0),
          color: new THREE.Color("white"),
          width: 3 as CssPixels,
          opacity: 1,
          labelRect: [0, 0, 1, 1] as const,
        })),
        labelAtlas: labels,
        trailColor: new THREE.Color("cyan"),
        opacity: 1,
      });
      const traversal = vi.spyOn(root, "traverse");
      const shader = () => ({
        uniforms: {} as Record<string, { value: unknown }>,
        vertexShader: "#include <common>\n#include <project_vertex>",
        fragmentShader:
          "#include <common>\n#include <map_fragment>\n#include <opaque_fragment>",
      });
      try {
        host.render();
        const initialEpoch = renderProgressive.mock.calls.at(-1)![1].styleEpoch;
        const initialShader = shader();
        material.onBeforeCompile(initialShader as never, {} as never);
        const marks = initialShader.uniforms.carmaProjectiveData
          .value as THREE.DataTexture;
        const textureVersion = marks.version;
        const repaintCount = host.map.triggerRepaint.mock.calls.length;
        host.render();
        expect(renderProgressive.mock.calls.at(-1)![1].styleEpoch).toBe(
          initialEpoch
        );
        expect(traversal).toHaveBeenCalledTimes(1);

        const newMaterial = new THREE.MeshStandardMaterial();
        incoming = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), newMaterial);
        host.render();
        const lodEpoch = renderProgressive.mock.calls.at(-1)![1].styleEpoch;
        expect(lodEpoch).toBeGreaterThan(initialEpoch);
        const lodShader = shader();
        newMaterial.onBeforeCompile(lodShader as never, {} as never);
        expect(lodShader.uniforms.carmaProjectiveCount.value).toBe(3);
        expect(lodShader.uniforms.carmaProjectiveData.value).toBe(marks);
        expect(lodShader.uniforms.carmaProjectiveLabelAtlas.value).toBe(labels);
        expect(marks.version).toBe(textureVersion);
        expect(traversal).toHaveBeenCalledTimes(2);
        expect(host.map.triggerRepaint).toHaveBeenCalledTimes(repaintCount);

        host.render();
        expect(renderProgressive.mock.calls.at(-1)![1].styleEpoch).toBe(
          lodEpoch
        );
        expect(traversal).toHaveBeenCalledTimes(2);
      } finally {
        host.layer.dispose();
      }
    }
  );

  it("bounds projective camera data and avoids redundant repaint/uploads", () => {
    const fixture = createSurfaceOverlayFixture([
      {
        id: "surface",
        texture: new THREE.Texture(),
        bounds: [7.14, 51.24, 7.16, 51.26],
        opacity: 0,
      },
    ]);
    const overlay = {
      marks: Array.from({ length: 50 }, (_, index) => ({
        sceneToImage: new THREE.Matrix4().makeTranslation(index, 0, 0),
        color: new THREE.Color("#ffff00"),
        width: 3 as CssPixels,
        opacity: 0.85,
        fillOpacity: index === 49 ? 1 : 0,
        trailStartedAt: index,
        labelRect: [0, 0, 1, 1] as const,
      })),
      labelAtlas: new THREE.Texture(),
      trailColor: new THREE.Color("#00b8ff"),
      trailDuration: 8,
      opacity: 1,
    };
    fixture.host.layer.setMapStyleProjectiveOverlay!("photos", overlay);
    fixture.host.render();
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: "#include <common>\n#include <project_vertex>",
      fragmentShader:
        "#include <common>\n#include <map_fragment>\n#include <opaque_fragment>",
    };
    fixture.material.onBeforeCompile(shader as never, {} as never);
    const texture = shader.uniforms.carmaProjectiveData
      .value as THREE.DataTexture;
    expect(shader.uniforms.carmaProjectiveCount.value).toBe(34);
    expect(texture.image.width).toBe(11);
    expect(texture.image.height).toBe(34);
    expect(texture.image.data.byteLength).toBe(34 * 44 * 4);
    const version = texture.version;
    const repaints = fixture.host.map.triggerRepaint.mock.calls.length;
    fixture.host.layer.setMapStyleProjectiveOverlay!("photos", overlay);
    expect(texture.version).toBe(version);
    expect(fixture.host.map.triggerRepaint).toHaveBeenCalledTimes(repaints);
    const dispose = vi.spyOn(texture, "dispose");
    fixture.host.layer.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("packs an analytic sphere contour with a white two-CSS-pixel outline and no label or fill", () => {
    const fixture = createSurfaceOverlayFixture([]);
    const scene = new THREE.Matrix4().makeTranslation(1, 2, 3);
    const terrain = new THREE.Matrix4().makeScale(0.1, 0.2, 0.3);
    const overlay = {
      marks: [
        {
          shape: "sphere" as const,
          sceneToImage: scene,
          sceneToImageTerrain: terrain,
          color: new THREE.Color("#ffffff"),
          width: 2 as CssPixels,
          opacity: 1,
          showUpMarker: false,
        },
      ],
      trailColor: new THREE.Color("#ffffff"),
      trailDuration: 1,
      opacity: 1,
    };
    fixture.host.layer.setMapStyleProjectiveOverlay!("sphere", overlay);
    fixture.host.render();
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: "#include <common>\n#include <project_vertex>",
      fragmentShader:
        "#include <common>\n#include <map_fragment>\n#include <opaque_fragment>",
    };
    fixture.material.onBeforeCompile(shader as never, {} as never);
    const texture = shader.uniforms.carmaProjectiveData
      .value as THREE.DataTexture;
    expect(Array.from(texture.image.data.slice(0, 16))).toEqual(scene.elements);
    expect(Array.from(texture.image.data.slice(16, 32))).toEqual(
      terrain.elements.map(Math.fround)
    );
    expect(Array.from(texture.image.data.slice(32, 44))).toEqual([
      1, 1, 1, 1, 2, 0, -1, 2, 0, 0, 0, 0,
    ]);
    expect(shader.fragmentShader).toContain("length(photo.xyz/photo.w)-1.0");
    expect(shader.fragmentShader).toContain("fwidth(sphereDistance)");
    expect(shader.fragmentShader).toContain(
      "shapeStyle.x*carmaProjectivePixelRatio*0.5"
    );
    const version = texture.version;
    const repaints = fixture.host.map.triggerRepaint.mock.calls.length;
    fixture.host.layer.setMapStyleProjectiveOverlay!("sphere", overlay);
    fixture.host.render();
    expect(texture.version).toBe(version);
    expect(fixture.host.map.triggerRepaint).toHaveBeenCalledTimes(repaints);
    fixture.host.layer.setMapStyleProjectiveOverlay!("sphere", null);
    expect(shader.uniforms.carmaProjectiveCount.value).toBe(0);
    fixture.host.layer.dispose();
  });

  it("changes only backdrop uniforms while keeping the screen image texture", () => {
    const fixture = createSurfaceOverlayFixture([
      {
        id: "surface",
        texture: new THREE.Texture(),
        bounds: [7.14, 51.24, 7.16, 51.26],
        opacity: 0,
      },
    ]);
    const texture = new THREE.Texture();
    const overlay = {
      texture,
      viewportToTexture: new THREE.Matrix3(),
      opacity: 0.75,
      backdropLook: { contrast: 0.5, brightness: 1.25, saturation: 0.5 },
      backdropTint: [0, 0, 0, 0.13] as const,
    };
    fixture.host.layer.setMapStyleScreenOverlay!("preview", overlay);
    fixture.host.render();
    expect(
      fixture.uniformValue<THREE.Vector3>("carmaScreenBackdropLook").toArray()
    ).toEqual([0.5, 1.25, 0.5]);
    expect(fixture.uniformValue<number>("carmaScreenBackdropOpacity")).toBe(
      0.75
    );
    const version = texture.version;
    const repaints = fixture.host.map.triggerRepaint.mock.calls.length;
    fixture.host.layer.setMapStyleScreenOverlay!("preview", overlay);
    expect(fixture.host.map.triggerRepaint).toHaveBeenCalledTimes(repaints);
    fixture.host.layer.setMapStyleScreenOverlay!("preview", {
      ...overlay,
      backdropLook: { ...overlay.backdropLook, contrast: 0.7 },
    });
    expect(
      fixture.uniformValue<THREE.Vector3>("carmaScreenBackdropLook").x
    ).toBe(0.7);
    expect(fixture.uniformValue<THREE.Texture>("carmaScreenTexture0")).toBe(
      texture
    );
    expect(texture.version).toBe(version);
    fixture.host.layer.setMapStyleScreenOverlay!("preview", null);
    expect(fixture.uniformValue<number>("carmaScreenBackdropOpacity")).toBe(0);
    fixture.host.layer.dispose();
  });

  it("projects frame edges and labels from photo UV above the screen image", () => {
    const fixture = createSurfaceOverlayFixture([
      {
        id: "surface",
        texture: new THREE.Texture(),
        bounds: [7.14, 51.24, 7.16, 51.26],
        opacity: 0,
      },
    ]);
    fixture.host.layer.setMapStyleProjectiveOverlay!("photos", {
      marks: [
        {
          sceneToImage: new THREE.Matrix4(),
          color: new THREE.Color("yellow"),
          width: 3 as CssPixels,
          opacity: 1,
          fillOpacity: 0.08,
          labelRect: [0, 0, 1, 1],
        },
      ],
      labelAtlas: new THREE.Texture(),
      trailColor: new THREE.Color("cyan"),
      trailDuration: 8,
      opacity: 1,
    });
    fixture.host.render();
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      vertexShader: "#include <common>\n#include <project_vertex>",
      fragmentShader:
        "#include <common>\n#include <map_fragment>\n#include <opaque_fragment>",
    };
    fixture.material.onBeforeCompile(shader as never, {} as never);
    expect(shader.vertexShader).toContain(
      "vCarmaReceiverPosition = carmaSurfacePosition.xyz"
    );
    expect(shader.fragmentShader).toContain(
      "projection * vec4(vCarmaReceiverPosition,1.0)"
    );
    expect(shader.fragmentShader).toContain("fwidth(uv)");
    expect(shader.fragmentShader).toContain("carmaProjectiveTime-style.z");
    expect(shader.fragmentShader).toContain("labelUv*cell.zw");
    expect(
      shader.fragmentShader.indexOf("vec4 projectiveMarkings =")
    ).toBeGreaterThan(
      shader.fragmentShader.indexOf(
        "outgoingLight = mix(outgoingLight,image.rgb,image.a)"
      )
    );
    fixture.host.layer.setMapStyleProjectiveOverlay!("photos", null);
    expect(shader.uniforms.carmaProjectiveCount.value).toBe(0);
    fixture.host.layer.dispose();
  });

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
      "carma-map-style-projection-v14"
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

  it("fades a previous world marking independently while retaining the current texture", () => {
    const texture = new THREE.Texture();
    const previousTexture = new THREE.Texture();
    const bounds = [7.14, 51.24, 7.16, 51.26] as const;
    const previousBounds = [7.12, 51.22, 7.14, 51.24] as const;
    const overlay = {
      id: "finite-trail",
      texture,
      bounds,
      opacity: 0.85,
      previous: {
        texture: previousTexture,
        bounds: previousBounds,
        opacity: 0.2,
      },
    };
    const fixture = createSurfaceOverlayFixture([overlay]);
    expect(fixture.uniformValue("carmaSurfaceTexture")).toBe(texture);
    expect(fixture.uniformValue("carmaSurfacePreviousTexture")).toBe(
      previousTexture
    );
    expect(fixture.uniformValue("carmaSurfaceTransition")).toBe(1);
    expect(fixture.uniformValue("carmaSurfacePreviousOpacity")).toBe(0.2);
    const currentProjection = fixture
      .uniformValue<THREE.Matrix4>("carmaSurfaceSceneToTexture")
      .clone();
    const previousProjection = fixture
      .uniformValue<THREE.Matrix4>("carmaSurfacePreviousSceneToTexture")
      .clone();
    expect(previousProjection.equals(currentProjection)).toBe(false);
    const precedingRepaints = fixture.host.map.triggerRepaint.mock.calls.length;
    fixture.host.layer.setMapStyleSurfaceOverlay!(overlay.id, {
      ...overlay,
      previous: { ...overlay.previous, opacity: 0.04 },
    });
    expect(fixture.host.map.triggerRepaint.mock.calls.length).toBe(
      precedingRepaints
    );
    expect(fixture.uniformValue("carmaSurfacePreviousOpacity")).toBe(0.04);
    expect(fixture.uniformValue("carmaSurfaceOpacity")).toBe(0.85);
    expect(fixture.uniformValue("carmaSurfaceTexture")).toBe(texture);
    expect(
      fixture
        .uniformValue<THREE.Matrix4>("carmaSurfaceSceneToTexture")
        .equals(currentProjection)
    ).toBe(true);
    fixture.host.layer.setMapStyleSurfaceOverlay!(overlay.id, {
      ...overlay,
      previous: undefined,
    });
    expect(fixture.uniformValue("carmaSurfacePreviousTexture")).toBe(null);
    expect(fixture.uniformValue("carmaSurfacePreviousOpacity")).toBe(-1);
    expect(fixture.uniformValue("carmaSurfaceTexture")).toBe(texture);
    fixture.host.layer.onRemove!(
      fixture.host.map as never,
      fixture.host.gl as never
    );
    texture.dispose();
    previousTexture.dispose();
  });

  it.each([-0.5, 0, 0.5, 2, Number.NaN])(
    "bounds explicit trail opacity %s and preserves legacy crossfades",
    (opacity) => {
      const texture = new THREE.Texture();
      const previousTexture = new THREE.Texture();
      const bounds = [7.14, 51.24, 7.16, 51.26] as const;
      const fixture = createSurfaceOverlayFixture([
        {
          id: "trail-opacity",
          texture,
          bounds,
          opacity: 1,
          previous: { texture: previousTexture, bounds, opacity },
        },
      ]);
      expect(fixture.uniformValue("carmaSurfacePreviousOpacity")).toBe(
        Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : -1
      );
      fixture.host.layer.setMapStyleSurfaceOverlay!("trail-opacity", {
        texture,
        bounds,
        opacity: 1,
        previous: { texture: previousTexture, bounds },
        transition: 0.5,
      });
      expect(fixture.uniformValue("carmaSurfacePreviousOpacity")).toBe(-1);
      expect(fixture.uniformValue("carmaSurfaceTransition")).toBe(0.5);
      fixture.host.layer.onRemove!(
        fixture.host.map as never,
        fixture.host.gl as never
      );
      texture.dispose();
      previousTexture.dispose();
    }
  );

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

  it("clears WebGL2 ground color without reading or changing the authored clear color", () => {
    const gl = {
      COLOR: 0x1800,
      COLOR_BUFFER_BIT: 0x00004000,
      DEPTH_BUFFER_BIT: 0x00000100,
      COLOR_CLEAR_VALUE: 0x0c22,
      clear: vi.fn(),
      clearBufferfv: vi.fn(),
      clearColor: vi.fn(),
      clearDepth: vi.fn(),
      depthMask: vi.fn(),
      depthRange: vi.fn(),
      getParameter: vi.fn(() => {
        throw new Error("WebGL2 clear must not perform a synchronous readback");
      }),
    };
    clearMapStyleGroundBeforeThreeTerrain(gl, [0, 0.985]);
    expect(gl.clearBufferfv).toHaveBeenCalledOnce();
    expect(gl.clearBufferfv).toHaveBeenCalledWith(
      gl.COLOR,
      0,
      new Float32Array(4)
    );
    expect(gl.clear).toHaveBeenCalledOnce();
    expect(gl.clear).toHaveBeenCalledWith(gl.DEPTH_BUFFER_BIT);
    expect(gl.clearColor).not.toHaveBeenCalled();
    expect(gl.getParameter).not.toHaveBeenCalled();
    expect(gl.depthMask).toHaveBeenCalledWith(true);
    expect(gl.clearDepth).toHaveBeenCalledWith(1);
    expect(gl.depthRange.mock.calls).toEqual([
      [0, 1],
      [0, 0.985],
    ]);
  });

  it("restores the authored WebGL1 clear color after replacing ground color and depth", () => {
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

    expect(gl.getParameter).toHaveBeenCalledOnce();
    expect(gl.getParameter).toHaveBeenCalledWith(gl.COLOR_CLEAR_VALUE);
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
