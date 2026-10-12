import { describe, expect, it, vi } from "vitest";
import {
  BoxGeometry,
  Camera,
  Color,
  DepthTexture,
  Group,
  LineBasicMaterial,
  LineSegments,
  Points,
  PointsMaterial,
  Matrix3,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Texture,
  Vector2,
} from "three";
import {
  MAP_STYLE_PROJECTION_FRAGMENT_OUTPUT,
  MAP_STYLE_SCREEN_OVERLAY_FRAGMENT_HEADER,
  PHOTO_SOURCE_DEPTH_GLSL,
} from "../../core/shared-three-map-style-shaders";
import { configureMapStyleProjectedMaterial } from "./shared-three-map-style-material";
import * as photoDepthModule from "./shared-three-photo-depth";
import * as photoMosaicModule from "./shared-three-photo-mosaic";
import * as photoGapModule from "./shared-three-photo-gap-repair";
import { createSharedThreeMapStyleProjection } from "./shared-three-map-style-projection";

describe("map-style screen image ownership", () => {
  it("copies all four fixed footprint projectors into the live receiver uniforms", () => {
    const texture = new Texture();
    const metricToFootprint = [0, 1, 2, 3].map((offset) =>
      new Matrix4().makeTranslation(offset, offset * 2, 0)
    ) as [Matrix4, Matrix4, Matrix4, Matrix4];
    const result: {
      -readonly [K in keyof photoGapModule.PhotoGapRepairResult]: photoGapModule.PhotoGapRepairResult[K];
    } = {
      texture,
      geometry: texture,
      metricToClip: [new Matrix4(), new Matrix4(), new Matrix4()],
      metricToFootprint,
      footprints: 4,
      sceneToMetric: new Matrix4().makeTranslation(10, 20, 30),
      fieldSize: new Vector2(8, 8),
      pages: 3,
      changed: true,
    };
    const gap = vi
      .spyOn(photoGapModule, "createSharedThreePhotoGapRepair")
      .mockReturnValue({
        render: vi.fn(() => result),
        detach: vi.fn(),
        dispose: vi.fn(),
        state: {},
      } as never);
    const material = new MeshBasicMaterial();
    const geometry = new BoxGeometry();
    const controller = createSharedThreeMapStyleProjection(
      "four-footprints",
      new Map([
        [
          "receiver",
          {
            id: "receiver",
            root: new Mesh(geometry, material),
            mountsOnLocalFrame: true,
            receivesScreenImages: true,
            receivesMapStyleTexture: false,
          } as never,
        ],
      ]),
      new Vector2(800, 600)
    );
    controller.attach(
      {
        triggerRepaint: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        getCanvas: () => ({ clientWidth: 800 }),
      } as never,
      {} as never
    );
    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <project_vertex>",
      fragmentShader:
        "#include <common>\n#include <map_fragment>\n#include <opaque_fragment>",
    } as Parameters<typeof material.onBeforeCompile>[0];
    try {
      controller.setScreenOverlay("source", {
        texture,
        opacity: 1,
        viewportToTexture: new Matrix3(),
        projective: { sceneToTexture: new Matrix4(), fillGaps: true },
      });
      controller.capture(new Matrix4(), false);
      material.onBeforeCompile(shader, {} as never);
      controller.renderPhotoMosaic(new Camera());
      expect(shader.uniforms.carmaPhotoGapEnabled.value).toBe(1);
      expect(shader.uniforms.carmaPhotoGapFootprints.value).toBe(4);
      for (const [index, matrix] of metricToFootprint.entries()) {
        const uniform =
          shader.uniforms[`carmaPhotoGapMetricToFootprint${index}`];
        expect(uniform.value).toEqual(matrix);
        expect(uniform.value).not.toBe(matrix);
        matrix.makeTranslation(index + 10, index + 20, 0);
        expect(uniform.value).not.toEqual(matrix);
      }
      controller.renderPhotoMosaic(new Camera());
      metricToFootprint.forEach((matrix, index) =>
        expect(
          shader.uniforms[`carmaPhotoGapMetricToFootprint${index}`].value
        ).toEqual(matrix)
      );
      result.footprints = 0;
      result.texture = null;
      controller.renderPhotoMosaic(new Camera());
      expect(shader.uniforms.carmaPhotoGapEnabled.value).toBe(0);
      expect(shader.uniforms.carmaPhotoGapFootprints.value).toBe(0);
    } finally {
      gap.mockRestore();
      controller.dispose();
      material.dispose();
      geometry.dispose();
      texture.dispose();
    }
  });

  it("defers residual admission to the exact four-footprint sampler, not the matte union", () => {
    const header = MAP_STYLE_SCREEN_OVERLAY_FRAGMENT_HEADER;
    const repairCall = header.indexOf(
      "vec4 repaired = carmaPhotoGapSample(position)"
    );
    const repairGuard = header.slice(
      header.lastIndexOf("if (", repairCall),
      repairCall
    );
    expect(repairGuard).toContain(
      "fillGaps && source.a+target.a<=0.0 && screen.a<=0.0"
    );
    expect(repairGuard).not.toMatch(/frame|union|Coverage/);
    expect(header).toContain(
      "if(!carmaGapInsideFootprints(point))return vec4(0.0)"
    );
    // Real photographic union weighting remains independent of residual admission.
    expect(header).toContain(
      "carmaPhotoUnionWeights(source.a,target.a,carmaScreenOpacity0,carmaScreenOpacity1)"
    );
  });

  it("retains primary photo coverage until navigation pixels are fully opaque", () => {
    const suppression = MAP_STYLE_SCREEN_OVERLAY_FRAGMENT_HEADER.match(
      /if\(fillGaps && navigationCoverage[^\n]+/
    )![0];
    const evaluate = new Function(
      "fillGaps",
      "navigationCoverage",
      "source",
      "target",
      `${suppression}; return [source.a,target.a]`
    );
    for (const alpha of [0, 0.25, 0.5, 0.999])
      expect(evaluate(true, alpha, { a: 0.3 }, { a: 0.7 })).toEqual([0.3, 0.7]);
    expect(evaluate(true, 1, { a: 0.3 }, { a: 0.7 })).toEqual([0, 0]);
    expect(evaluate(false, 1, { a: 0.3 }, { a: 0.7 })).toEqual([0.3, 0.7]);
  });
  it("invalidates cached overlays for auxiliary readiness, quality, projectors and crop bounds", () => {
    const controller = createSharedThreeMapStyleProjection(
      "auxiliary",
      new Map(),
      new Vector2(800, 600)
    );
    const texture = new Texture();
    const extra = {
      texture,
      textureRevision: 1,
      opacity: 1,
      priority: 1,
      sceneToTexture: new Matrix4(),
      sourceProjection: new Matrix4(),
      textureBounds: [0, 0, 1, 1] as [number, number, number, number],
    };
    const gap = {
      id: "fixed",
      sceneToMetric: new Matrix4(),
      views: [new Matrix4()],
      auxiliaryExpected: 2,
      auxiliary: [] as (typeof extra)[],
    };
    const overlay = {
      texture,
      opacity: 1,
      viewportToTexture: new Matrix3(),
      projective: { sceneToTexture: new Matrix4(), gapRepair: gap },
    };
    try {
      controller.setScreenOverlay("source", overlay);
      let epoch = controller.epoch;
      controller.setScreenOverlay("source", overlay);
      expect(controller.epoch).toBe(epoch);
      for (const mutate of [
        () => gap.auxiliary.push(extra),
        () => extra.textureRevision++,
        () => extra.sceneToTexture.makeTranslation(1, 2, 3),
        () => extra.sourceProjection.makeTranslation(4, 5, 6),
        () => {
          extra.textureBounds[2] = 0.5;
        },
        () => {
          gap.auxiliaryExpected = 1;
        },
      ]) {
        mutate();
        controller.setScreenOverlay("source", overlay);
        expect(controller.epoch).toBeGreaterThan(epoch);
        epoch = controller.epoch;
        controller.setScreenOverlay("source", overlay);
        expect(controller.epoch).toBe(epoch);
      }
    } finally {
      controller.dispose();
      texture.dispose();
    }
  });

  it("keeps primary drapes enabled when an optional navigation compositor fails", () => {
    const texture = new Texture();
    const render = vi.fn((): { texture: Texture | null; changed: boolean } => ({
      texture,
      changed: true,
    }));
    const spy = vi
      .spyOn(photoMosaicModule, "createSharedThreePhotoMosaic")
      .mockReturnValue({
        active: true,
        navigationGroup: true,
        sourceDepthRequests: [],
        state: {},
        render,
        set: vi.fn(() => true),
        detach: vi.fn(),
        dispose: vi.fn(),
      } as never);
    const depth = vi
      .spyOn(photoDepthModule, "createSharedThreePhotoDepth")
      .mockReturnValue({
        setSources: vi.fn(),
        sync: vi.fn(() => ({ revision: 1, receivers: 0 })),
        renderView: vi.fn(),
        renderSource: vi.fn(),
        detach: vi.fn(),
        dispose: vi.fn(),
        state: { sources: 0 },
      } as never);
    const material = new MeshBasicMaterial();
    const geometry = new BoxGeometry();
    const root = new Mesh(geometry, material);
    const controller = createSharedThreeMapStyleProjection(
      "failure",
      new Map([
        [
          "receiver",
          {
            id: "receiver",
            root,
            mountsOnLocalFrame: true,
            receivesScreenImages: true,
            receivesMapStyleTexture: false,
          } as never,
        ],
      ]),
      new Vector2(800, 600)
    );
    controller.attach(
      {
        triggerRepaint: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        getCanvas: () => ({ clientWidth: 800 }),
      } as never,
      {} as never
    );
    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <project_vertex>",
      fragmentShader:
        "#include <common>\n#include <map_fragment>\n#include <opaque_fragment>",
    } as Parameters<typeof material.onBeforeCompile>[0];
    try {
      controller.setScreenOverlay("source", {
        texture,
        opacity: 1,
        viewportToTexture: new Matrix3(),
        projective: {
          sceneToTexture: new Matrix4(),
          underlay: true,
          fillGaps: true,
        },
      });
      controller.capture(new Matrix4(), false);
      material.onBeforeCompile(shader, {} as never);
      const uniforms = shader.uniforms;
      controller.renderPhotoMosaic(new Camera());
      expect(uniforms.carmaPhotoMosaicOpacity.value).toBe(1);
      expect(uniforms.carmaPhotoMosaicNavigationGroup.value).toBe(1);
      render.mockImplementation(() => {
        throw new Error("navigation GPU failed");
      });
      controller.renderPhotoMosaic(new Camera());
      expect(uniforms.carmaPhotoMosaicOpacity.value).toBe(0);
      expect(uniforms.carmaPhotoMosaicNavigationGroup.value).toBe(0);
      expect(uniforms.carmaScreenOpacity0.value).toBe(1);
      expect(uniforms.carmaScreenTexture0.value).toBe(texture);
    } finally {
      controller.dispose();
      material.dispose();
      geometry.dispose();
      texture.dispose();
      spy.mockRestore();
      depth.mockRestore();
    }
  });
  it("starts and fades photographs without an implicit opaque backdrop", () => {
    const controller = createSharedThreeMapStyleProjection(
      "scene",
      new Map(),
      new Vector2(800, 600)
    );
    const photo = new Texture();
    const uniforms = controller.screenOverlayMesh.material.uniforms;
    try {
      expect(uniforms.carmaScreenBackdropOverride.value.toArray()).toEqual([
        0, 0, 0, 0,
      ]);
      expect(controller.screenOverlayMesh.visible).toBe(false);
      for (const opacity of [1, 0.5, 0]) {
        controller.setScreenOverlay("preview", {
          texture: photo,
          viewportToTexture: new Matrix3(),
          opacity,
        });
        expect(uniforms.carmaScreenBackdropOverride.value.toArray()).toEqual([
          0, 0, 0, 0,
        ]);
      }
      controller.setScreenOverlay("preview", null);
      expect(uniforms.carmaScreenBackdropOverride.value.w).toBe(0);
      expect(controller.screenOverlayMesh.visible).toBe(false);
    } finally {
      controller.dispose();
      photo.dispose();
    }
  });

  it("compiles legacy receiver uniforms with a transparent missing-backdrop fallback", () => {
    const material = new MeshBasicMaterial();
    try {
      configureMapStyleProjectedMaterial(material, {
        texture: { value: null },
        sceneToClip: { value: new Matrix4() },
        enabled: { value: 0 },
        depthTexture: { value: null },
        depthEnabled: { value: 0 },
        depthNearFar: { value: new Vector2(1, 1000) },
        texelSize: { value: new Vector2(1, 1) },
      });
      const shader = {
        uniforms: {},
        vertexShader: "#include <common>\n#include <project_vertex>",
        fragmentShader:
          "#include <common>\n#include <map_fragment>\n#include <opaque_fragment>",
      } as Parameters<typeof material.onBeforeCompile>[0];
      material.onBeforeCompile(shader, {} as never);
      expect(
        shader.uniforms.carmaScreenBackdropOverride.value.toArray()
      ).toEqual([0, 0, 0, 0]);
    } finally {
      material.dispose();
    }
  });

  it.each(["photo-only", "markings-only", "regular"])(
    "enters the %s receiver output for a mosaic without either flat-photo slot",
    (branch) => {
      // These are the three actual GLSL output guards, not the compositor's
      // preparation counters. A populated mosaic must independently enable them.
      const guards = [
        ...MAP_STYLE_PROJECTION_FRAGMENT_OUTPUT.matchAll(
          /if \((carmaScreenOpacity0[^\n]+)\) \{/g
        ),
      ];
      expect(guards).toHaveLength(3);
      const index = ["photo-only", "markings-only", "regular"].indexOf(branch);
      const enabled = new Function(
        "carmaScreenOpacity0",
        "carmaScreenOpacity1",
        "carmaPhotoMosaicOpacity",
        "carmaScreenBackdropOverride = { a: 0 }",
        "carmaScreenFrameEnabled0 = 0",
        "carmaScreenFrameEnabled1 = 0",
        `return (${guards[index][1]});`
      ) as (
        flat0: number,
        flat1: number,
        mosaic: number,
        backdrop?: { a: number },
        frame0?: number,
        frame1?: number
      ) => boolean;
      expect(enabled(0, 0, 1)).toBe(true);
      expect(enabled(0, 0, 0)).toBe(false);
      expect(enabled(0, 0, 0, { a: 1 })).toBe(true);
      expect(enabled(1, 0, 0)).toBe(true);
      expect(enabled(0, 1, 0)).toBe(true);
      expect(enabled(0, 0, 0, undefined, 1)).toBe(true);
      expect(enabled(0, 0, 0, undefined, 0, 1)).toBe(true);
    }
  );

  it("holds an independent full-viewport backdrop without consuming either photograph slot", () => {
    const controller = createSharedThreeMapStyleProjection(
      "scene",
      new Map(),
      new Vector2(800, 600)
    );
    const source = new Texture(),
      target = new Texture();
    const uniforms = controller.screenOverlayMesh.material.uniforms;
    controller.setScreenOverlay("source", {
      texture: source,
      viewportToTexture: new Matrix3(),
      projective: { sceneToTexture: new Matrix4(), underlay: true },
      opacity: 1,
    });
    controller.setScreenOverlay("target", {
      texture: target,
      viewportToTexture: new Matrix3(),
      opacity: 0,
      priority: 120,
    });
    controller.setScreenBackdrop("flight", [0.5, 0.5, 0.5]);
    expect(controller.screenOverlayMesh.visible).toBe(true);
    expect(uniforms.carmaScreenTexture0.value).toBe(source);
    expect(uniforms.carmaScreenTexture1.value).toBe(target);
    expect(uniforms.carmaScreenBackdropOverride.value.w).toBe(1);
    // sRGB grey is converted once; it is not filtered/darkened a second time.
    expect(uniforms.carmaScreenBackdropOverride.value.x).toBeCloseTo(
      0.214041,
      5
    );
    controller.setScreenOverlay("target", null);
    expect(controller.screenOverlayMesh.visible).toBe(true);
    expect(uniforms.carmaScreenBackdropOverride.value.w).toBe(1);
    controller.setScreenBackdrop("flight", null);
    expect(uniforms.carmaScreenBackdropOverride.value.w).toBe(0);
    expect(controller.screenOverlayMesh.visible).toBe(false);
    controller.dispose();
    source.dispose();
    target.dispose();
  });
  it("releases only the matching backdrop owner and clears the override on dispose", () => {
    const controller = createSharedThreeMapStyleProjection(
      "scene",
      new Map(),
      new Vector2(800, 600)
    );
    const uniform =
      controller.screenOverlayMesh.material.uniforms
        .carmaScreenBackdropOverride;
    controller.setScreenBackdrop("old", [0.2, 0.2, 0.2]);
    controller.setScreenBackdrop("new", [0.5, 0.5, 0.5]);
    controller.setScreenBackdrop("old", null);
    expect(uniform.value.w).toBe(1);
    expect(uniform.value.x).toBeCloseTo(0.214041, 5);
    controller.dispose();
    expect(uniform.value.w).toBe(0);
  });

  it("configures later building meshes, outlines and points as photo-only without a DEM capture", () => {
    const runtimes = new Map();
    const controller = createSharedThreeMapStyleProjection(
      "scene",
      runtimes,
      new Vector2(800, 600)
    );
    const copy = vi.fn(),
      terrain = vi.fn();
    const map = {
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
      getCanvas: () => ({ clientWidth: 800 }),
      getTerrain: terrain,
    };
    controller.attach(
      map as never,
      { copyFramebufferToTexture: copy } as never
    );
    const photo = new Texture();
    controller.setScreenOverlay("preview", {
      texture: photo,
      viewportToTexture: new Matrix3(),
      opacity: 1,
    });
    controller.capture(new Matrix4(), false);
    const root = new Group();
    const materials = [
      new MeshBasicMaterial(),
      new LineBasicMaterial(),
      new PointsMaterial(),
    ];
    const geometry = new BoxGeometry();
    root.add(
      new Mesh(geometry, materials[0]),
      new LineSegments(geometry, materials[1]),
      new Points(geometry, materials[2])
    );
    runtimes.set("late-building", {
      id: "late-building",
      root,
      originLngLat: [0, 0],
      receivesMapStyleTexture: false,
      receivesScreenImages: true,
      providesTerrain: false,
      update: () => undefined,
      dispose: () => undefined,
    });
    try {
      controller.capture(new Matrix4(), false);
      for (const material of materials) {
        expect(material.defines.CARMA_MAP_STYLE_PHOTO_ONLY).toBe("");
        const shader = {
          uniforms: {},
          vertexShader: "#include <common>\n#include <project_vertex>",
          fragmentShader:
            "#include <common>\n#include <map_fragment>\n#include <opaque_fragment>",
        } as Parameters<typeof material.onBeforeCompile>[0];
        material.onBeforeCompile(shader, {} as never);
        expect(shader.vertexShader).toContain("vCarmaScreenClip = gl_Position");
        expect(shader.uniforms.carmaScreenTexture0).toBe(
          controller.screenOverlayMesh.material.uniforms.carmaScreenTexture0
        );
      }
      expect(controller.getState(1).receivers["late-building"]).toBe(false);
      expect(copy).not.toHaveBeenCalled();
      expect(terrain).not.toHaveBeenCalled();
    } finally {
      controller.dispose();
      materials.forEach((material) => material.dispose());
      geometry.dispose();
      photo.dispose();
    }
  });

  it("preserves borrowed photo slots across projection detach and reattach", () => {
    const controller = createSharedThreeMapStyleProjection(
      "scene",
      new Map(),
      new Vector2(800, 600)
    );
    const photo = new Texture(),
      crop = new Texture();
    const photoDispose = vi.spyOn(photo, "dispose"),
      cropDispose = vi.spyOn(crop, "dispose");
    const map = {
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
      getCanvas: () => ({ clientWidth: 800 }),
    };
    const renderer = { copyFramebufferToTexture: vi.fn() };
    const mesh = controller.screenOverlayMesh;
    controller.attach(map as never, renderer as never);
    controller.setScreenOverlay("preview", {
      texture: photo,
      viewportToTexture: new Matrix3(),
      opacity: 1,
    });
    controller.setScreenOverlay("crop", {
      texture: crop,
      viewportToTexture: new Matrix3(),
      opacity: 1,
      priority: 1,
    });
    controller.detach();
    controller.attach(map as never, renderer as never);
    expect(controller.screenOverlayMesh).toBe(mesh);
    expect(mesh.material.uniforms.carmaScreenTexture0.value).toBe(photo);
    expect(mesh.material.uniforms.carmaScreenTexture1.value).toBe(crop);
    expect(mesh.visible).toBe(true);
    controller.setScreenOverlay("crop", null);
    expect(mesh.material.uniforms.carmaScreenTexture0.value).toBe(photo);
    controller.dispose();
    expect(photoDispose).not.toHaveBeenCalled();
    expect(cropDispose).not.toHaveBeenCalled();
    photo.dispose();
    crop.dispose();
  });

  it.each([true, false])(
    "admits building-only photo receivers only in the shared local frame (local=%s)",
    (local) => {
      const material = new MeshBasicMaterial();
      const root = new Mesh(new BoxGeometry(), material);
      const controller = createSharedThreeMapStyleProjection(
        "scene",
        new Map([
          [
            "lod2",
            {
              id: "lod2",
              originLngLat: [0, 0] as [number, number],
              root,
              receivesMapStyleTexture: false,
              receivesScreenImages: true,
              providesTerrain: false,
              mountsOnLocalFrame: local,
              update: () => undefined,
              dispose: () => undefined,
            },
          ],
        ]),
        new Vector2(800, 600)
      );
      const texture = new Texture();
      try {
        controller.setScreenOverlay("neighbour", {
          texture,
          viewportToTexture: new Matrix3(),
          projective: { sceneToTexture: new Matrix4(), underlay: true },
          opacity: 1,
          priority: 110,
        });
        controller.capture(new Matrix4(), false);
        expect(material.defines?.CARMA_MAP_STYLE_PHOTO_ONLY).toBe(
          local ? "" : undefined
        );
        expect(material.defines?.CARMA_PROJECTIVE_LOCAL_FRAME).toBe(
          local ? "" : undefined
        );
        expect(controller.getState(1).receivers.lod2).not.toBe(true);
        if (local) {
          const shader = {
            uniforms: {},
            vertexShader: "#include <common>\n#include <project_vertex>",
            fragmentShader:
              "#include <common>\n#include <map_fragment>\n#include <opaque_fragment>",
          } as Parameters<typeof material.onBeforeCompile>[0];
          material.onBeforeCompile(
            shader,
            {} as Parameters<typeof material.onBeforeCompile>[1]
          );
          expect(shader.uniforms.carmaScreenUnderlay0.value).toBe(1);
          expect(shader.vertexShader).toContain(
            "vCarmaReceiverPosition = carmaSurfacePosition.xyz"
          );
          expect(shader.vertexShader).toContain(
            "modelMatrix * vec4( transformed, 1.0 )"
          );
        }
      } finally {
        controller.dispose();
        root.geometry.dispose();
        material.dispose();
        texture.dispose();
      }
    }
  );

  it.each([false, true])(
    "projects photos on existing local-frame DEM while preserving its basemap role (map=%s)",
    (receivesMapStyleTexture) => {
      const material = new MeshBasicMaterial();
      const root = new Mesh(new BoxGeometry(), material);
      const controller = createSharedThreeMapStyleProjection(
        "scene",
        new Map([
          [
            "dem",
            {
              id: "dem",
              originLngLat: [0, 0] as [number, number],
              root,
              receivesMapStyleTexture,
              mountsOnLocalFrame: true,
              providesTerrain: true,
              mapStyleProjectionBlend: "replace" as const,
              update: () => undefined,
              dispose: () => undefined,
            },
          ],
        ]),
        new Vector2(800, 600)
      );
      const texture = new Texture();
      const projector = new Matrix4().makeTranslation(0.1, 0.2, 0.3);
      try {
        controller.setScreenOverlay("photo", {
          texture,
          viewportToTexture: new Matrix3(),
          projective: { sceneToTexture: projector, underlay: true },
          opacity: 1,
        });
        controller.capture(new Matrix4(), false);
        expect(material.defines.CARMA_PROJECTIVE_LOCAL_FRAME).toBe("");
        expect(material.defines.CARMA_MAP_STYLE_PHOTO_ONLY).toBe(
          receivesMapStyleTexture ? undefined : ""
        );
        expect(material.defines.CARMA_MAP_STYLE_OVERLAY).toBeUndefined();
        expect(controller.getState(1).receivers.dem).toBe(
          receivesMapStyleTexture
        );
        expect(controller.screenOverlayMesh.visible).toBe(false);
        const shader = {
          uniforms: {},
          vertexShader: "#include <common>\n#include <project_vertex>",
          fragmentShader:
            "#include <common>\n#include <map_fragment>\n#include <opaque_fragment>",
        } as Parameters<typeof material.onBeforeCompile>[0];
        material.onBeforeCompile(
          shader,
          {} as Parameters<typeof material.onBeforeCompile>[1]
        );
        expect(
          shader.uniforms.carmaScreenSceneToTexture0.value.equals(projector)
        ).toBe(true);
        expect(shader.uniforms.carmaScreenUnderlay0.value).toBe(1);
        expect(shader.fragmentShader).toContain(
          "#ifdef CARMA_PROJECTIVE_LOCAL_FRAME"
        );
        expect(shader.fragmentShader).not.toContain(
          "defined(CARMA_PROJECTIVE_LOCAL_FRAME) &&"
        );
        expect(shader.fragmentShader).toContain("beneathAlpha*(1.0-screen.a)");
        root.visible = false;
        controller.capture(new Matrix4(), false);
        expect(root.visible).toBe(false);
        controller.setScreenOverlay("photo", null);
        expect(root.visible).toBe(false);
        expect(root.geometry).toBeInstanceOf(BoxGeometry);
      } finally {
        controller.dispose();
        root.geometry.dispose();
        material.dispose();
        texture.dispose();
      }
    }
  );

  it("keeps DEM outside the shared local frame ineligible for projective photos", () => {
    const material = new MeshBasicMaterial();
    const root = new Mesh(new BoxGeometry(), material);
    const controller = createSharedThreeMapStyleProjection(
      "scene",
      new Map([
        [
          "dem",
          {
            id: "dem",
            originLngLat: [0, 0] as [number, number],
            root,
            receivesMapStyleTexture: false,
            mountsOnLocalFrame: false,
            providesTerrain: true,
            mapStyleProjectionBlend: "replace" as const,
            update: () => undefined,
            dispose: () => undefined,
          },
        ],
      ]),
      new Vector2(800, 600)
    );
    const texture = new Texture();
    try {
      controller.setScreenOverlay("photo", {
        texture,
        viewportToTexture: new Matrix3(),
        projective: { sceneToTexture: new Matrix4() },
        opacity: 1,
      });
      controller.capture(new Matrix4(), false);
      expect(material.defines?.CARMA_PROJECTIVE_LOCAL_FRAME).toBeUndefined();
      expect(material.defines?.CARMA_MAP_STYLE_PHOTO_ONLY).toBeUndefined();
    } finally {
      controller.dispose();
      root.geometry.dispose();
      material.dispose();
      texture.dispose();
    }
  });
  it.each([false, () => false] as const)(
    "admits a photo on filtered roofs/facades without basemap capture or repeated material traversal (%s)",
    (receivesMapStyleTexture) => {
      const material = new MeshBasicMaterial();
      const root = new Mesh(new BoxGeometry(), material);
      const traversal = vi.spyOn(root, "traverse");
      const controller = createSharedThreeMapStyleProjection(
        "scene",
        new Map([
          [
            "mesh",
            {
              id: "mesh",
              originLngLat: [0, 0] as [number, number],
              root,
              receivesMapStyleTexture,
              mountsOnLocalFrame: true,
              providesTerrain: true,
              mapStyleProjectionBlend: "overlay" as const,
              update: () => undefined,
              dispose: () => undefined,
            },
          ],
        ]),
        new Vector2(800, 600)
      );
      const photo = {
        texture: new Texture(),
        viewportToTexture: new Matrix3(),
        projective: { sceneToTexture: new Matrix4() },
        opacity: 1,
      };
      controller.setScreenOverlay("photo", photo);
      controller.capture(new Matrix4(), false);
      expect(material.defines.CARMA_MAP_STYLE_PHOTO_ONLY).toBe("");
      expect(material.defines.CARMA_PROJECTIVE_LOCAL_FRAME).toBe("");
      expect(material.defines.CARMA_MAP_STYLE_MARKINGS_ONLY).toBeUndefined();
      expect(material.defines.CARMA_MAP_STYLE_OVERLAY).toBeUndefined();
      expect(controller.getState(1).receivers.mesh).toBe(false);
      const visits = traversal.mock.calls.length;
      controller.setScreenOverlay("photo", { ...photo, opacity: 0.5 });
      controller.capture(new Matrix4(), false);
      expect(traversal.mock.calls.length).toBe(visits);
      controller.setScreenOverlay("photo", null);
      controller.capture(new Matrix4(), false);
      expect(traversal.mock.calls.length).toBe(visits + 1);
      controller.capture(new Matrix4(), false);
      expect(traversal.mock.calls.length).toBe(visits + 1);
      controller.setScreenOverlay("screen", {
        ...photo,
        projective: undefined,
      });
      expect(
        controller.screenOverlayMesh.material.uniforms.carmaScreenProjective0
          .value
      ).toBe(0);
      // This runtime opts into projected photos only; a regular screen photo
      // does not turn it into a map-style receiver.
      expect(material.defines.CARMA_MAP_STYLE_PHOTO_ONLY).toBe("");
      controller.dispose();
      traversal.mockRestore();
      root.geometry.dispose();
      material.dispose();
      photo.texture.dispose();
    }
  );
  it("borrows two projective photos on mesh receivers without enabling the fullscreen backdrop", () => {
    const material = new MeshBasicMaterial();
    const root = new Mesh(new BoxGeometry(), material);
    const controller = createSharedThreeMapStyleProjection(
      "scene",
      new Map([
        [
          "mesh",
          {
            id: "mesh",
            originLngLat: [0, 0] as [number, number],
            root,
            receivesMapStyleTexture: true,
            mapStyleProjectionBlend: "overlay" as const,
            mountsOnLocalFrame: true,
            update: () => undefined,
            dispose: () => undefined,
          },
        ],
      ]),
      new Vector2(800, 600)
    );
    const sourceTexture = new Texture();
    const targetTexture = new Texture();
    const sourceProjection = new Matrix4();
    const targetProjection = new Matrix4().makeTranslation(0.1, 0.2, 0);
    const source = {
      texture: sourceTexture,
      viewportToTexture: new Matrix3(),
      projective: { sceneToTexture: sourceProjection },
      opacity: 0.75,
    };
    controller.setScreenOverlay("source", source);
    controller.setScreenOverlay("target", {
      ...source,
      texture: targetTexture,
      projective: { sceneToTexture: targetProjection },
      opacity: 0.25,
      priority: 1,
    });
    const uniforms = controller.screenOverlayMesh.material.uniforms;
    expect(controller.screenOverlayMesh.visible).toBe(false);
    expect(uniforms.carmaScreenTexture0.value).toBe(sourceTexture);
    expect(uniforms.carmaScreenTexture1.value).toBe(targetTexture);
    expect(uniforms.carmaScreenProjective0.value).toBe(1);
    expect(uniforms.carmaScreenProjective1.value).toBe(1);
    expect(uniforms.carmaScreenUnderlay0.value).toBe(0);
    expect(uniforms.carmaScreenUnderlay1.value).toBe(0);
    expect(uniforms.carmaScreenOpacity0.value).toBe(0.75);
    expect(uniforms.carmaScreenOpacity1.value).toBe(0.25);
    expect(uniforms.carmaScreenBackdropOpacity.value).toBe(0);
    expect(uniforms.carmaScreenBorderStyle.value.toArray()).toEqual([
      0, 0, 0, 0,
    ]);
    const unchangedEpoch = controller.epoch;
    controller.setScreenOverlay("source", source);
    expect(controller.epoch).toBe(unchangedEpoch);
    sourceProjection.elements[12] = 0.3;
    expect(uniforms.carmaScreenSceneToTexture0.value.elements[12]).toBe(0);
    controller.setScreenOverlay("source", source);
    expect(controller.epoch).toBeGreaterThan(unchangedEpoch);
    expect(uniforms.carmaScreenSceneToTexture0.value.elements[12]).toBe(0.3);
    controller.capture(new Matrix4(), false);
    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <project_vertex>",
      fragmentShader:
        "#include <common>\n#include <map_fragment>\n#include <opaque_fragment>",
    } as Parameters<typeof material.onBeforeCompile>[0];
    material.onBeforeCompile(
      shader,
      {} as Parameters<typeof material.onBeforeCompile>[1]
    );
    expect(material.defines.CARMA_PROJECTIVE_LOCAL_FRAME).toBe("");
    expect(material.defines.CARMA_MAP_STYLE_OVERLAY).toBe("");
    expect(shader.uniforms.carmaScreenSceneToTexture0).toBe(
      uniforms.carmaScreenSceneToTexture0
    );
    expect(shader.uniforms.carmaScreenProjective1).toBe(
      uniforms.carmaScreenProjective1
    );
    expect(shader.uniforms.carmaScreenSceneToTexture1).toBe(
      uniforms.carmaScreenSceneToTexture1
    );
    expect(
      uniforms.carmaScreenSceneToTexture1.value.equals(targetProjection)
    ).toBe(true);
    // Both borrowed samplers must stay live during a rotation and LOD refresh;
    // replacing one slot must never retarget the other photograph's camera.
    const refinedTarget = new Texture();
    controller.setScreenOverlay("source", { ...source, opacity: 0.5 });
    controller.setScreenOverlay("target", {
      ...source,
      texture: refinedTarget,
      projective: { sceneToTexture: targetProjection },
      opacity: 0.5,
      priority: 1,
    });
    expect(shader.uniforms.carmaScreenTexture0.value).toBe(sourceTexture);
    expect(shader.uniforms.carmaScreenTexture1.value).toBe(refinedTarget);
    expect(shader.uniforms.carmaScreenOpacity0.value).toBe(0.5);
    expect(shader.uniforms.carmaScreenOpacity1.value).toBe(0.5);
    expect(
      shader.uniforms.carmaScreenSceneToTexture0.value.equals(sourceProjection)
    ).toBe(true);
    expect(
      shader.uniforms.carmaScreenSceneToTexture1.value.equals(targetProjection)
    ).toBe(true);
    const beforeRefinement = controller.epoch;
    refinedTarget.needsUpdate = true;
    controller.setScreenOverlay("target", {
      ...source,
      texture: refinedTarget,
      projective: { sceneToTexture: targetProjection },
      opacity: 0.5,
      priority: 1,
    });
    expect(controller.epoch).toBeGreaterThan(beforeRefinement);
    expect(shader.uniforms.carmaScreenTexture0.value).toBe(sourceTexture);
    refinedTarget.dispose();
    controller.setScreenOverlay("target", null);
    controller.setScreenOverlay("source", { ...source, projective: undefined });
    expect(controller.screenOverlayMesh.visible).toBe(true);
    expect(uniforms.carmaScreenProjective0.value).toBe(0);
    expect(uniforms.carmaScreenProjective1.value).toBe(0);
    controller.dispose();
    root.geometry.dispose();
    material.dispose();
    sourceTexture.dispose();
    targetTexture.dispose();
  });
  it("keeps the mesh underlay beside either the current flat photo or its prepared bridge and publishes role changes to receivers", () => {
    const material = new MeshBasicMaterial();
    const root = new Mesh(new BoxGeometry(), material);
    const controller = createSharedThreeMapStyleProjection(
      "scene",
      new Map([
        [
          "mesh",
          {
            id: "mesh",
            originLngLat: [0, 0] as [number, number],
            root,
            receivesMapStyleTexture: true,
            mapStyleProjectionBlend: "overlay" as const,
            mountsOnLocalFrame: true,
            update: () => undefined,
            dispose: () => undefined,
          },
        ],
      ]),
      new Vector2(800, 600)
    );
    const flat = new Texture(),
      neighbour = new Texture(),
      bridge = new Texture();
    const image = {
      texture: flat,
      viewportToTexture: new Matrix3(),
      opacity: 1,
      priority: 1,
    };
    const projection = new Matrix4().makeTranslation(0.1, 0.2, 0);
    const underlay = {
      ...image,
      texture: neighbour,
      priority: 110,
      projective: { sceneToTexture: projection, underlay: true },
    };
    try {
      controller.setScreenOverlay("current-photo", image);
      controller.setScreenOverlay("neighbour", underlay);
      const uniforms = controller.screenOverlayMesh.material.uniforms;
      expect(uniforms.carmaScreenTexture0.value).toBe(flat);
      expect(uniforms.carmaScreenTexture1.value).toBe(neighbour);
      expect(uniforms.carmaScreenUnderlay0.value).toBe(0);
      expect(uniforms.carmaScreenUnderlay1.value).toBe(1);
      expect(uniforms.carmaScreenProjective0.value).toBe(0);
      expect(uniforms.carmaScreenProjective1.value).toBe(1);
      expect(controller.screenOverlayMesh.visible).toBe(true);
      controller.capture(new Matrix4(), false);
      const shader = {
        uniforms: {},
        vertexShader: "#include <common>\n#include <project_vertex>",
        fragmentShader:
          "#include <common>\n#include <map_fragment>\n#include <opaque_fragment>",
      } as Parameters<typeof material.onBeforeCompile>[0];
      material.onBeforeCompile(
        shader,
        {} as Parameters<typeof material.onBeforeCompile>[1]
      );
      expect(shader.uniforms.carmaScreenUnderlay0).toBe(
        uniforms.carmaScreenUnderlay0
      );
      expect(shader.uniforms.carmaScreenUnderlay1).toBe(
        uniforms.carmaScreenUnderlay1
      );
      expect(shader.uniforms.carmaScreenUnderlay1.value).toBe(1);
      expect(
        shader.uniforms.carmaScreenSceneToTexture1.value.equals(projection)
      ).toBe(true);

      const stable = controller.epoch;
      controller.setScreenOverlay("neighbour", underlay);
      expect(controller.epoch).toBe(stable);
      // Caller mutation must not mutate the admitted flag; the next publication must dirty the draw.
      underlay.projective.underlay = false;
      expect(uniforms.carmaScreenUnderlay1.value).toBe(1);
      controller.setScreenOverlay("neighbour", underlay);
      expect(controller.epoch).toBeGreaterThan(stable);
      expect(shader.uniforms.carmaScreenUnderlay1.value).toBe(0);
      const changed = controller.epoch;
      underlay.projective.underlay = true;
      controller.setScreenOverlay("neighbour", underlay);
      expect(controller.epoch).toBeGreaterThan(changed);
      expect(shader.uniforms.carmaScreenUnderlay1.value).toBe(1);

      controller.setScreenOverlay("prepared-target", {
        ...image,
        texture: bridge,
        priority: 120,
      });
      expect(uniforms.carmaScreenTexture0.value).toBe(neighbour);
      expect(uniforms.carmaScreenTexture1.value).toBe(bridge);
      expect(shader.uniforms.carmaScreenUnderlay0.value).toBe(1);
      expect(shader.uniforms.carmaScreenUnderlay1.value).toBe(0);
      expect(shader.uniforms.carmaScreenProjective0.value).toBe(1);
      expect(shader.uniforms.carmaScreenProjective1.value).toBe(0);
      expect(
        shader.uniforms.carmaScreenSceneToTexture0.value.equals(projection)
      ).toBe(true);
      controller.setScreenOverlay("prepared-target", null);
      expect(uniforms.carmaScreenTexture0.value).toBe(flat);
      expect(uniforms.carmaScreenTexture1.value).toBe(neighbour);
      expect(shader.uniforms.carmaScreenUnderlay1.value).toBe(1);
    } finally {
      controller.dispose();
      root.geometry.dispose();
      material.dispose();
      flat.dispose();
      neighbour.dispose();
      bridge.dispose();
    }
  });

  it("changes preview labels without replacing the texture and restores the base policy after a crop", () => {
    const controller = createSharedThreeMapStyleProjection(
      "scene",
      new Map(),
      new Vector2(800, 600)
    );
    const base = {
      texture: new Texture(),
      viewportToTexture: new Matrix3(),
      opacity: 1,
    };
    controller.setScreenOverlay("preview", base);
    const uniforms = controller.screenOverlayMesh.material.uniforms;
    expect(uniforms.carmaScreenBasemapLabels.value).toBe(1);
    const before = controller.epoch;
    controller.setScreenOverlay("preview", {
      ...base,
      showBasemapLabels: false,
    });
    expect(controller.epoch).toBeGreaterThan(before);
    expect(uniforms.carmaScreenTexture0.value).toBe(base.texture);
    expect(uniforms.carmaScreenBasemapLabels.value).toBe(0);
    controller.setScreenOverlay("crop", {
      ...base,
      priority: 1,
      showBasemapLabels: true,
    });
    expect(uniforms.carmaScreenBasemapLabels.value).toBe(1);
    controller.setScreenOverlay("crop", null);
    expect(uniforms.carmaScreenBasemapLabels.value).toBe(0);
    controller.setScreenOverlay("preview", null);
    expect(uniforms.carmaScreenBasemapLabels.value).toBe(1);
    controller.dispose();
  });
  it("preserves preview label policy through zero-opacity matte frames", () => {
    const controller = createSharedThreeMapStyleProjection(
      "scene",
      new Map(),
      new Vector2(800, 600)
    );
    const texture = new Texture();
    const base = { texture, viewportToTexture: new Matrix3(), opacity: 1 };
    const matte = {
      ...base,
      opacity: 0,
      priority: 1,
      showBasemapLabels: false,
      projective: {
        sceneToTexture: new Matrix4(),
        sourceProjection: new Matrix4(),
        frame: { opacity: 0, width: 2, feather: 50, featherOpacity: 0.8 },
      },
    };
    try {
      const uniforms = controller.screenOverlayMesh.material.uniforms;
      controller.setScreenOverlay("preview", base);
      controller.setScreenOverlay("source", matte);
      controller.setScreenOverlay("target", { ...matte, priority: 2 });
      expect(uniforms.carmaScreenBasemapLabels.value).toBe(0);
      controller.setScreenOverlay("target", {
        ...matte,
        priority: 2,
        showBasemapLabels: true,
      });
      expect(uniforms.carmaScreenBasemapLabels.value).toBe(1);
      controller.setScreenOverlay("target", null);
      expect(uniforms.carmaScreenBasemapLabels.value).toBe(0);
      controller.setScreenOverlay("source", null);
      expect(uniforms.carmaScreenBasemapLabels.value).toBe(1);
      controller.setScreenOverlay("source", {
        ...matte,
        projective: { ...matte.projective, sourceProjection: undefined },
      });
      expect(uniforms.carmaScreenBasemapLabels.value).toBe(1);
    } finally {
      controller.dispose();
      texture.dispose();
    }
  });

  it("composes two bounded slots and restores the progressive image when a crop is removed", () => {
    const controller = createSharedThreeMapStyleProjection(
      "scene",
      new Map(),
      new Vector2(800, 600)
    );
    const base = new Texture(),
      crop = new Texture(),
      matrix = new Matrix3();
    controller.setScreenOverlay("preview", {
      texture: base,
      viewportToTexture: matrix,
      opacity: 1,
    });
    controller.setScreenOverlay("crop", {
      texture: crop,
      viewportToTexture: matrix,
      opacity: 1,
      priority: 1,
    });
    const uniforms = controller.screenOverlayMesh.material.uniforms;
    expect(uniforms.carmaScreenTexture0.value).toBe(base);
    expect(uniforms.carmaScreenTexture1.value).toBe(crop);
    expect(controller.screenOverlayMesh.visible).toBe(true);
    controller.setScreenOverlay("crop", null);
    expect(uniforms.carmaScreenTexture0.value).toBe(base);
    expect(uniforms.carmaScreenOpacity1.value).toBe(0);
    controller.setScreenOverlay("preview", null);
    expect(controller.screenOverlayMesh.visible).toBe(false);
    controller.dispose();
  });
  it("stops invalidating an unchanged image transform and copies caller matrices", () => {
    const controller = createSharedThreeMapStyleProjection(
      "scene",
      new Map(),
      new Vector2(800, 600)
    );
    const texture = new Texture(),
      matrix = new Matrix3(),
      entry = { texture, viewportToTexture: matrix, opacity: 1 };
    controller.setScreenOverlay("preview", entry);
    const epoch = controller.epoch;
    controller.setScreenOverlay("preview", entry);
    expect(controller.epoch).toBe(epoch);
    matrix.elements[6] = 0.2;
    expect(
      controller.screenOverlayMesh.material.uniforms.carmaScreenToTexture0.value
        .elements[6]
    ).toBe(0);
    controller.setScreenOverlay("preview", entry);
    expect(controller.epoch).toBeGreaterThan(epoch);
    texture.needsUpdate = true;
    const updated = controller.epoch;
    controller.setScreenOverlay("preview", entry);
    expect(controller.epoch).toBeGreaterThan(updated);
    controller.dispose();
  });
  it("shares one full-image frame with receivers while a crop uses independent texture UVs", () => {
    const material = new MeshBasicMaterial();
    const root = new Mesh(new BoxGeometry(), material);
    const controller = createSharedThreeMapStyleProjection(
      "scene",
      new Map([
        [
          "receiver",
          {
            id: "receiver",
            originLngLat: [0, 0] as [number, number],
            root,
            receivesMapStyleTexture: true,
            update: () => undefined,
            dispose: () => undefined,
          },
        ],
      ]),
      new Vector2(1600, 1200)
    );
    const fullImage = new Matrix3().set(0, -1, 1, 1, 0, 0, 0, 0, 1);
    const border = {
      viewportToImage: fullImage,
      imageSize: { width: 800, height: 600 },
      width: 2,
      opacity: 0.9,
      feather: 50,
      featherOpacity: 0.8,
    };
    const preview = {
      texture: new Texture(),
      viewportToTexture: fullImage,
      opacity: 0.5,
      border,
    };
    controller.setScreenOverlay("preview", preview);
    const cropTransform = new Matrix3().set(4, 0, -1, 0, 4, -1, 0, 0, 1);
    controller.setScreenOverlay("crop", {
      texture: new Texture(),
      viewportToTexture: cropTransform,
      opacity: 1,
      priority: 1,
      border,
    });
    const uniforms = controller.screenOverlayMesh.material.uniforms;
    expect(uniforms.carmaScreenToTexture1.value.equals(cropTransform)).toBe(
      true
    );
    expect(uniforms.carmaScreenToBorderImage.value.equals(fullImage)).toBe(
      true
    );
    expect(uniforms.carmaScreenBorderImageSize.value.toArray()).toEqual([
      800, 600,
    ]);
    expect(uniforms.carmaScreenBorderStyle.value.toArray()).toEqual([
      2, 0.45, 50, 0.4,
    ]);

    controller.setEnabled(false);
    controller.capture(new Matrix4(), false);
    const shader = {
      uniforms: {},
      vertexShader: "#include <common>\n#include <project_vertex>",
      fragmentShader:
        "#include <common>\n#include <map_fragment>\n#include <opaque_fragment>",
    } as Parameters<typeof material.onBeforeCompile>[0];
    material.onBeforeCompile(
      shader,
      {} as Parameters<typeof material.onBeforeCompile>[1]
    );
    for (const name of [
      "carmaScreenToBorderImage",
      "carmaScreenBorderImageSize",
      "carmaScreenBorderStyle",
    ]) {
      expect(shader.uniforms[name]).toBe(uniforms[name]);
    }

    controller.setScreenOverlay("preview", { ...preview, opacity: 0 });
    expect(uniforms.carmaScreenBorderStyle.value.toArray()).toEqual([
      2, 0.9, 50, 0.8,
    ]);
    expect(uniforms.carmaScreenToBorderImage.value.equals(fullImage)).toBe(
      true
    );
    controller.setScreenOverlay("preview", null);
    expect(uniforms.carmaScreenBorderStyle.value.toArray()).toEqual([
      2, 0.9, 50, 0.8,
    ]);
    controller.setScreenOverlay("crop", null);
    expect(uniforms.carmaScreenBorderStyle.value.toArray()).toEqual([
      0, 0, 0, 0,
    ]);
    controller.dispose();
    root.geometry.dispose();
    material.dispose();
  });
  it("copies frame transforms and CSS dimensions and invalidates only when their values change", () => {
    const controller = createSharedThreeMapStyleProjection(
      "scene",
      new Map(),
      new Vector2(800, 600)
    );
    const border = {
      viewportToImage: new Matrix3(),
      imageSize: { width: 800, height: 600 },
      width: 2,
      opacity: 0.9,
      feather: 50,
      featherOpacity: 0.8,
    };
    const overlay = {
      texture: new Texture(),
      viewportToTexture: new Matrix3(),
      opacity: 1,
      border,
    };
    controller.setScreenOverlay("preview", overlay);
    const epoch = controller.epoch;
    controller.setScreenOverlay("preview", overlay);
    expect(controller.epoch).toBe(epoch);
    border.viewportToImage.elements[6] = 0.2;
    border.imageSize.width = 400;
    const uniforms = controller.screenOverlayMesh.material.uniforms;
    expect(uniforms.carmaScreenToBorderImage.value.elements[6]).toBe(0);
    expect(uniforms.carmaScreenBorderImageSize.value.x).toBe(800);
    controller.setScreenOverlay("preview", overlay);
    expect(controller.epoch).toBeGreaterThan(epoch);
    expect(uniforms.carmaScreenToBorderImage.value.elements[6]).toBe(0.2);
    expect(uniforms.carmaScreenBorderImageSize.value.x).toBe(400);
    controller.dispose();
  });
});

describe("photo capture first-hit depth ownership", () => {
  const setup = () => {
    const result = {
      texture: new DepthTexture(16, 16),
      sceneToClip: new Matrix4().makeScale(2, 3, 4),
      nearFar: new Vector2(1, 20000),
      biasMeters: 0.1,
      changed: false,
    };
    const provider = {
      setSources: vi.fn(),
      sync: vi.fn(() => ({ revision: 1, receivers: 1 })),
      renderSource: vi.fn(
        (_renderer: unknown, _projection: Matrix4): typeof result | null =>
          result
      ),
      renderView: vi.fn(),
      detach: vi.fn(),
      dispose: vi.fn(),
      state: { sources: 1 },
    };
    const spy = vi
      .spyOn(photoDepthModule, "createSharedThreePhotoDepth")
      .mockReturnValue(provider as never);
    const controller = createSharedThreeMapStyleProjection(
      "test",
      new Map(),
      new Vector2(800, 600)
    );
    const renderer = {};
    controller.attach(
      { triggerRepaint: vi.fn(), on: vi.fn(), off: vi.fn() } as never,
      renderer as never
    );
    const texture = new Texture();
    const set = (
      id: string,
      sourceProjection?: Matrix4,
      crop = new Matrix4(),
      opacity = 1,
      withFrame = false,
      fillGaps = false
    ) =>
      controller.setScreenOverlay(id, {
        texture,
        opacity,
        viewportToTexture: new Matrix3(),
        projective: {
          sourceProjection,
          sceneToTexture: crop,
          fillGaps,
          frame: withFrame
            ? { opacity: 0, width: 2, feather: 50, featherOpacity: 0.8 }
            : undefined,
        },
      });
    return {
      provider,
      result,
      controller,
      renderer,
      set,
      uniforms: controller.screenOverlayMesh.material.uniforms,
      cleanup: () => {
        controller.dispose();
        texture.dispose();
        result.texture.dispose();
        spy.mockRestore();
      },
    };
  };

  it("skips depth synchronization without source cameras or an active mosaic", () => {
    const f = setup();
    try {
      f.controller.renderPhotoMosaic(new Camera());
      f.set("flat");
      f.controller.renderPhotoMosaic(new Camera());
      expect(f.provider.sync).not.toHaveBeenCalled();
      f.set("source", new Matrix4());
      f.controller.renderPhotoMosaic(new Camera());
      expect(f.provider.sync).toHaveBeenCalledOnce();
      f.controller.setScreenOverlay("source", null);
      f.controller.renderPhotoMosaic(new Camera());
      expect(f.provider.sync).toHaveBeenCalledOnce();
    } finally {
      f.cleanup();
    }
  });

  it("keeps zero-opacity matte frames active without requesting photo first-hit depth", () => {
    const f = setup();
    try {
      f.set("source", new Matrix4(), new Matrix4(), 0, true);
      f.set(
        "target",
        new Matrix4().makeTranslation(8, 0, 0),
        new Matrix4(),
        0,
        true
      );
      expect(f.uniforms.carmaScreenFrameEnabled0.value).toBe(1);
      expect(f.uniforms.carmaScreenFrameEnabled1.value).toBe(1);
      expect(f.uniforms.carmaScreenSourceDepthEnabled0.value).toBe(0);
      expect(f.uniforms.carmaScreenSourceDepthEnabled1.value).toBe(0);
      f.controller.renderPhotoMosaic(new Camera());
      expect(f.provider.sync).not.toHaveBeenCalled();
      expect(f.provider.renderSource).not.toHaveBeenCalled();
      expect(f.provider.setSources).toHaveBeenLastCalledWith([]);
    } finally {
      f.cleanup();
    }
  });

  it.each([0, 0.25, 0.5, 0.75, 1])(
    "retains both capture depths throughout a union transition at %s",
    (mix) => {
      const f = setup();
      try {
        const source = new Matrix4();
        const target = new Matrix4().makeTranslation(8, 0, 0);
        f.set("source", source, new Matrix4(), 1 - mix, true, true);
        f.set("target", target, new Matrix4(), mix, true, true);
        f.controller.renderPhotoMosaic(new Camera());
        expect(f.provider.sync).toHaveBeenCalledOnce();
        expect(f.provider.renderSource).toHaveBeenCalledTimes(2);
        expect(f.uniforms.carmaScreenSourceDepthEnabled0.value).toBe(1);
        expect(f.uniforms.carmaScreenSourceDepthEnabled1.value).toBe(1);
        expect(f.provider.setSources).toHaveBeenLastCalledWith([
          { projection: source, width: undefined, height: undefined },
          { projection: target, width: undefined, height: undefined },
        ]);
      } finally {
        f.cleanup();
      }
    }
  );

  it.each([
    [true, false],
    [false, true],
  ])(
    "does not retain a zero-opacity capture with only one union opt-in (%s, %s)",
    (sourceFill, targetFill) => {
      const f = setup();
      try {
        const source = new Matrix4();
        const target = new Matrix4().makeTranslation(8, 0, 0);
        f.set("source", source, new Matrix4(), 0, false, sourceFill);
        f.set("target", target, new Matrix4(), 1, false, targetFill);
        f.controller.renderPhotoMosaic(new Camera());
        expect(f.provider.renderSource).toHaveBeenCalledTimes(1);
        expect(f.provider.setSources).toHaveBeenLastCalledWith([
          { projection: target, width: undefined, height: undefined },
        ]);
        expect(f.uniforms.carmaScreenSourceDepthEnabled0.value).toBe(0);
        expect(f.uniforms.carmaScreenSourceDepthEnabled1.value).toBe(1);
      } finally {
        f.cleanup();
      }
    }
  );

  it("shares full capture depth between base and cropped detail while retaining each crop", () => {
    const f = setup();
    try {
      const source = new Matrix4().makeTranslation(1, 2, 3);
      const original = source.clone();
      const crop = new Matrix4().makeScale(3, 4, 1);
      f.set("base", source);
      f.set("detail", source, crop);
      source.elements[12] = 99; // publisher retains ownership; stored camera must be immutable
      f.controller.renderPhotoMosaic(new Camera());
      expect(f.provider.renderSource).toHaveBeenCalledTimes(1);
      expect(f.provider.renderSource).toHaveBeenCalledWith(
        f.renderer,
        original,
        undefined
      );
      expect(f.provider.setSources.mock.calls[0][0]).toEqual([
        { projection: original, width: undefined, height: undefined },
        { projection: original, width: undefined, height: undefined },
      ]);
      for (const index of [0, 1]) {
        expect(f.uniforms[`carmaScreenSourceDepthEnabled${index}`].value).toBe(
          1
        );
        expect(f.uniforms[`carmaScreenSourceDepthTexture${index}`].value).toBe(
          f.result.texture
        );
        expect(
          f.uniforms[`carmaScreenSourceDepthSceneToClip${index}`].value
        ).toEqual(f.result.sceneToClip);
      }
      expect(f.uniforms.carmaScreenSceneToTexture1.value).toEqual(crop);
      f.set("detail", original, new Matrix4().makeScale(4, 5, 1), 0.4);
      f.controller.renderPhotoMosaic(new Camera());
      expect(f.provider.renderSource.mock.calls[1][1]).toEqual(original);
      expect(f.uniforms.carmaScreenOpacity1.value).toBe(0.4);
    } finally {
      f.cleanup();
    }
  });

  it("binds independent capture cameras and fails closed only when requested source depth is unavailable", () => {
    const f = setup();
    try {
      const source = new Matrix4();
      const target = new Matrix4().makeTranslation(8, 0, 0);
      f.set("source", source);
      f.set("target", target);
      f.provider.renderSource.mockImplementation((_renderer, projection) =>
        projection.equals(target) ? null : f.result
      );
      f.controller.renderPhotoMosaic(new Camera());
      expect(f.provider.renderSource).toHaveBeenCalledTimes(2);
      expect(f.uniforms.carmaScreenSourceDepthEnabled0.value).toBe(1);
      expect(f.uniforms.carmaScreenSourceDepthEnabled1.value).toBe(-1);
      expect(f.uniforms.carmaScreenSourceDepthTexture1.value).toBeNull();
      f.set("target"); // legacy callers with no source camera keep their existing behavior
      f.controller.renderPhotoMosaic(new Camera());
      expect(f.uniforms.carmaScreenSourceDepthEnabled1.value).toBe(0);
      f.provider.renderSource.mockImplementation(() => {
        throw new Error("render failed");
      });
      expect(() => f.controller.renderPhotoMosaic(new Camera())).not.toThrow();
      expect(f.uniforms.carmaScreenSourceDepthEnabled0.value).toBe(-1);
      expect(f.uniforms.carmaScreenSourceDepthTexture0.value).toBeNull();
    } finally {
      f.cleanup();
    }
  });

  it("invalidates receiver accumulation on fresh source depth and clears disposed GPU references", () => {
    const f = setup();
    try {
      f.set("source", new Matrix4());
      f.controller.renderPhotoMosaic(new Camera());
      const epoch = f.controller.epoch;
      f.controller.renderPhotoMosaic(new Camera());
      expect(f.controller.epoch).toBe(epoch);
      f.result.changed = true;
      f.controller.renderPhotoMosaic(new Camera());
      expect(f.controller.epoch).toBeGreaterThan(epoch);
      f.controller.detach();
      expect(f.provider.detach).toHaveBeenCalledTimes(1);
      expect(f.uniforms.carmaScreenSourceDepthTexture0.value).toBeNull();
      expect(f.uniforms.carmaScreenSourceDepthEnabled0.value).toBe(-1);
    } finally {
      f.cleanup();
    }
    expect(f.provider.dispose).toHaveBeenCalledTimes(1);
  });
});

describe("projective photograph union coverage", () => {
  const weights = (
    sourceAlpha: number,
    targetAlpha: number,
    sourceWeight: number,
    targetWeight: number
  ): readonly [number, number] => {
    // Execute the scalar statements from the production GLSL. Only constructors
    // and built-ins are supplied here; the blend arithmetic stays in the shader.
    const body = MAP_STYLE_SCREEN_OVERLAY_FRAGMENT_HEADER.match(
      /vec2 carmaPhotoUnionWeights\s*\([^]*?\)\s*\{([^]*?)\n}/
    )?.[1];
    expect(body).toBeDefined();
    const evaluate = new Function(
      "sourceAlpha",
      "targetAlpha",
      "sourceWeight",
      "targetWeight",
      "max",
      "min",
      "clamp",
      "vec2",
      body!
        .replace(/\bfloat\s+/g, "let ")
        .replace(/\bvec2\s+(\w+)\s*=/g, "let $1 =")
    ) as (...args: unknown[]) => readonly [number, number];
    return evaluate(
      sourceAlpha,
      targetAlpha,
      sourceWeight,
      targetWeight,
      Math.max,
      Math.min,
      (value: number, minimum: number, maximum: number) =>
        Math.max(minimum, Math.min(maximum, value)),
      (x: number, y: number) => [x, y]
    );
  };

  it.each([
    ["source-only", 1, 0, 1, 0],
    ["target-only", 0, 1, 0, 1],
    ["neither camera sees the surface", 0, 0, 0, 0],
    ["source crop feather", 0.25, 0, 0.25, 0],
    ["target crop feather", 0, 0.25, 0, 0.25],
  ] as const)(
    "preserves %s at both endpoints and every intermediate heading",
    (_name, sourceAlpha, targetAlpha, source, target) => {
      for (let step = 0; step <= 100; step++) {
        const mix = step / 100;
        const result = weights(sourceAlpha, targetAlpha, 1 - mix, mix);
        expect(result[0]).toBeCloseTo(source, 12);
        expect(result[1]).toBeCloseTo(target, 12);
      }
    }
  );

  it("crossfades opaque overlap without fading its coverage", () => {
    for (let step = 0; step <= 100; step++) {
      const mix = step / 100;
      const [source, target] = weights(1, 1, 1 - mix, mix);
      expect(source).toBeCloseTo(1 - mix, 12);
      expect(target).toBeCloseTo(mix, 12);
      expect(source + target).toBeCloseTo(1, 12);
    }
  });

  it("retains partial-alpha union without making either photograph opaque", () => {
    expect(weights(0.5, 0.25, 1, 0)).toEqual([0.5, 0.125]);
    expect(weights(0.5, 0.25, 0.5, 0.5)).toEqual([0.4375, 0.1875]);
    expect(weights(0.5, 0.25, 0, 1)).toEqual([0.375, 0.25]);
    for (const sourceAlpha of [0, 0.125, 0.5, 0.9, 1])
      for (const targetAlpha of [0, 0.125, 0.5, 0.9, 1])
        for (const mix of [0, 0.01, 0.25, 0.5, 0.99, 1]) {
          const [source, target] = weights(
            sourceAlpha,
            targetAlpha,
            1 - mix,
            mix
          );
          const transparentRemainder = (1 - sourceAlpha) * (1 - targetAlpha);
          expect(source + target).toBeCloseTo(1 - transparentRemainder, 12);
          expect(source).toBeGreaterThanOrEqual(0);
          expect(target).toBeGreaterThanOrEqual(0);
          expect(source).toBeLessThanOrEqual(sourceAlpha);
          expect(target).toBeLessThanOrEqual(targetAlpha);
          const reversed = weights(targetAlpha, sourceAlpha, mix, 1 - mix);
          expect(reversed[0]).toBeCloseTo(target, 12);
          expect(reversed[1]).toBeCloseTo(source, 12);
        }
  });

  it("normalizes heading weights and chooses source overlap when both weights are zero", () => {
    expect(weights(1, 1, 6, 2)).toEqual([0.75, 0.25]);
    expect(weights(1, 1, 0, 0)).toEqual([1, 0]);
    expect(weights(0, 1, 0, 0)).toEqual([0, 1]);
    expect(weights(0.5, 0.25, 0, 0)).toEqual([0.5, 0.125]);
    expect(weights(0, 0, 0, 0)).toEqual([0, 0]);
  });

  it("uses visibility-checked unweighted samples for the opted-in pair before both composition paths", () => {
    const receiver = MAP_STYLE_SCREEN_OVERLAY_FRAGMENT_HEADER.slice(
      MAP_STYLE_SCREEN_OVERLAY_FRAGMENT_HEADER.indexOf(
        "vec4 carmaReceiverImages("
      )
    );
    expect(receiver).toMatch(
      /bool fillGaps = carmaScreenFillGaps0 > 0\.5 && carmaScreenFillGaps1 > 0\.5/
    );
    expect(receiver).toContain(
      "carmaScreenProjective0 > 0.5 && carmaScreenProjective1 > 0.5"
    );
    for (const slot of [0, 1])
      expect(receiver).toContain(
        `fillGaps ? 1.0 : carmaScreenOpacity${slot}*carmaScreenProjective${slot}`
      );
    const contribution = receiver.match(
      /vec2 (\w+) = carmaPhotoUnionWeights\(\s*source\.a\s*,\s*target\.a\s*,\s*carmaScreenOpacity0\s*,\s*carmaScreenOpacity1\s*\)/
    )?.[1];
    expect(contribution).toBeDefined();
    const compactReceiver = receiver.replace(/\s+/g, "");
    expect(compactReceiver).toContain(`source.a=${contribution}.x;`);
    expect(compactReceiver).toContain(`target.a=${contribution}.y;`);
    const blend = receiver.indexOf("carmaPhotoUnionWeights(");
    expect(blend).toBeGreaterThan(receiver.indexOf("if (fillGaps) {"));
    expect(blend).toBeGreaterThan(
      receiver.indexOf("vec4 target = carmaScreenProjectiveSample(")
    );
    expect(blend).toBeLessThan(receiver.indexOf("float beneathSource ="));
    expect(blend).toBeLessThan(
      receiver.indexOf("float weight = source.a+target.a")
    );
    const sample = MAP_STYLE_SCREEN_OVERLAY_FRAGMENT_HEADER.match(
      /vec4 carmaScreenProjectiveSample\([^]*?\n}/
    )?.[0];
    expect(sample).toBeDefined();
    const readPixel = sample!.indexOf("vec4 pixel = texture2D(image,uv)");
    for (const check of [
      "sourceEnabled < 0.0",
      "!carmaPhotoSourceVisible(",
      "photo.w <= 0.0",
      "lessThan(uv,vec2(0.0))",
      "greaterThan(uv,vec2(1.0))",
    ]) {
      const position = sample!.indexOf(check);
      expect(position).toBeGreaterThanOrEqual(0);
      expect(position).toBeLessThan(readPixel);
    }
  });
});

describe("projective transition frames", () => {
  it.each([
    ["departing only", 1, 0],
    ["arriving only", 0, 1],
    ["common intersection", 1, 1],
    ["outside both", 0, 0],
  ])(
    "fades the %s matte continuously across rotation progress",
    (_name, from, to) => {
      const expression = MAP_STYLE_SCREEN_OVERLAY_FRAGMENT_HEADER.match(
        /^\s+carmaFrameCoverage = ([^;]+);/m
      )![1];
      const coverage = new Function(
        "source",
        "target",
        "carmaScreenFrameCoverage0",
        "carmaScreenFrameCoverage1",
        "max",
        "clamp",
        "carmaFrameCoverage = 0",
        `return ${expression};`
      );
      for (const progress of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
        const actual = coverage(
          { x: from },
          { x: to },
          1 - progress,
          progress,
          Math.max,
          (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
        );
        const expected = from === to ? from : from ? 1 - progress : progress;
        expect(actual).toBeCloseTo(expected, 12);
      }
    }
  );
  it("skips disabled or zero-weight frame decoration work while retaining sensor coverage", () => {
    const frame = MAP_STYLE_SCREEN_OVERLAY_FRAGMENT_HEADER.match(
      /vec3 carmaPhotoFrame\([^]*?\n}/
    )?.[0];
    expect(frame).toBeDefined();
    const projection = frame!.indexOf("vec4 photo =");
    const derivative = frame!.indexOf("vec2 pixelsPerUv =");
    const invisible = frame!.indexOf(
      "if (style.y<=0.0 && style.w<=0.0) return vec3(coverage,0.0,0.0);"
    );
    expect(frame!.indexOf("if (enabled<=0.0) return vec3(0.0);")).toBeLessThan(
      projection
    );
    expect(invisible).toBeGreaterThan(projection);
    expect(invisible).toBeLessThan(derivative);
    expect(frame!.slice(0, derivative)).not.toMatch(
      /dFdx|dFdy|carmaScreenGaussianIntegral/
    );
    const coverageExpression = frame!.match(/float coverage = ([^;]+);/)?.[1];
    const coverage = new Function(
      "photo",
      "uv",
      "step",
      `return ${coverageExpression};`
    ) as (
      photo: { w: number },
      uv: { x: number; y: number },
      step: (edge: number, value: number) => number
    ) => number;
    const step = (edge: number, value: number) => (value >= edge ? 1 : 0);
    expect(coverage({ w: 1 }, { x: 0.5, y: 0.5 }, step)).toBe(1);
    expect(coverage({ w: 1 }, { x: 1.5, y: 0.5 }, step)).toBe(0);
    expect(coverage({ w: -1 }, { x: 0.5, y: 0.5 }, step)).toBe(0);
  });

  it.each([
    ["source-only", 1, 0, 1],
    ["disjoint target", 0, 1, 1],
    ["overlap", 1, 1, 1],
    ["outside both", 0, 0, 0],
  ])(
    "keeps the %s matte hole independent of photograph opacity",
    (_name, source, target, expected) => {
      // Evaluate the actual shader assignment so changing photo weights cannot
      // silently restore a grey fade inside either full-sensor footprint.
      const expression = MAP_STYLE_SCREEN_OVERLAY_FRAGMENT_HEADER.match(
        /^\s+carmaFrameCoverage = ([^;]+);/m
      )?.[1];
      expect(expression).toBeDefined();
      const coverage = new Function(
        "source",
        "target",
        "carmaScreenOpacity0",
        "carmaScreenOpacity1",
        "max",
        "clamp",
        "carmaFrameCoverage = 0",
        "carmaScreenFrameCoverage0 = 1",
        "carmaScreenFrameCoverage1 = 1",
        `return ${expression};`
      ) as (
        source: { x: number },
        target: { x: number },
        sourceOpacity: number,
        targetOpacity: number,
        max: typeof Math.max,
        clamp: (value: number, minimum: number, maximum: number) => number
      ) => number;
      for (const [sourceOpacity, targetOpacity] of [
        [0, 0],
        [1, 0],
        [0.5, 0.5],
        [0, 1],
      ])
        expect(
          coverage(
            { x: source as number },
            { x: target as number },
            sourceOpacity,
            targetOpacity,
            Math.max,
            (value, minimum, maximum) =>
              Math.max(minimum, Math.min(maximum, value))
          )
        ).toBe(expected);
    }
  );

  it.each([
    ["inside half-visible flat photo", 2, 1, 0.5, 0.5, 0.5, 0, 1],
    ["outside half-visible flat photo", 2, 1, 1.5, 0.5, 0.5, 0.5, 0],
    ["undecorated photo", 0, 1, 0.5, 0.5, 0.5, 0.5, 0],
    ["projection behind viewer", 2, -1, 0.5, 0.5, 0.5, 0.5, 0],
  ])(
    "keeps flat sensor geometry independent of photo fading: %s",
    (_name, width, depth, x, y, photoOpacity, outsideOpacity, expected) => {
      const coverageBranch = MAP_STYLE_SCREEN_OVERLAY_FRAGMENT_HEADER.match(
        /if \((carmaScreenBorderStyle.x>0.0 && projected.z>0.0)\)\n\s+carmaFrameCoverage = ([^;]+);/
      );
      expect(coverageBranch).not.toBeNull();
      const evaluate = new Function(
        "carmaScreenBorderStyle",
        "projected",
        "imageUv",
        "step",
        `let carmaFrameCoverage = 0; if (${coverageBranch?.[1]}) carmaFrameCoverage = ${coverageBranch?.[2]}; return carmaFrameCoverage;`
      ) as (
        style: { x: number },
        projected: { z: number },
        imageUv: { x: number; y: number },
        step: (edge: number, value: number) => number
      ) => number;
      const coverage = evaluate(
        { x: width as number },
        { z: depth as number },
        { x: x as number, y: y as number },
        (edge, value) => (value >= edge ? 1 : 0)
      );
      expect(coverage).toBe(expected);
      // The photo alpha-over and independent matte fade leave the interior
      // scene clear, while exterior pixels retain the requested grey share.
      expect((photoOpacity as number) * (1 - coverage)).toBe(outsideOpacity);
    }
  );

  it("crossfades exclusive footprint coverage independently of contour and photo alpha", () => {
    const controller = createSharedThreeMapStyleProjection(
      "test",
      new Map(),
      new Vector2(800, 600)
    );
    const texture = new Texture();
    const projection = new Matrix4();
    const overlay = {
      texture,
      viewportToTexture: new Matrix3(),
      opacity: 0,
      backdropOpacity: 1,
      backdropLook: { contrast: 0.5, brightness: 1.25, saturation: 0.5 },
      projective: {
        sceneToTexture: projection,
        sourceProjection: projection,
        frame: {
          width: 2,
          opacity: 0.9,
          feather: 50,
          featherOpacity: 0.8,
          coverageOpacity: 1,
        },
      },
    };
    try {
      for (const mix of [0, 0.25, 0.5, 0.75, 1]) {
        overlay.projective.frame.coverageOpacity = 1 - mix;
        controller.setScreenOverlay("source", overlay);
        controller.setScreenOverlay("target", {
          ...overlay,
          priority: 1,
          projective: {
            ...overlay.projective,
            frame: { ...overlay.projective.frame, coverageOpacity: mix },
          },
        });
        const u = controller.screenOverlayMesh.material.uniforms;
        expect(u.carmaScreenFrameCoverage0.value).toBe(1 - mix);
        expect(u.carmaScreenFrameCoverage1.value).toBe(mix);
        expect(
          u.carmaScreenFrameCoverage0.value + u.carmaScreenFrameCoverage1.value
        ).toBe(1);
        expect(u.carmaScreenBackdropOpacity.value).toBe(1);
      }
      // Changing only coverage must invalidate, and stored metadata must be cloned.
      const epoch = controller.epoch;
      overlay.projective.frame.coverageOpacity = 0.4;
      controller.setScreenOverlay("source", overlay);
      expect(controller.epoch).toBeGreaterThan(epoch);
      overlay.projective.frame.coverageOpacity = 0.7;
      expect(
        controller.screenOverlayMesh.material.uniforms.carmaScreenFrameCoverage0
          .value
      ).toBe(0.4);
    } finally {
      controller.dispose();
      texture.dispose();
    }
  });

  it("keeps full-sensor union participants at zero photo/frame weight and clones metadata", () => {
    const controller = createSharedThreeMapStyleProjection(
      "test",
      new Map(),
      new Vector2(800, 600)
    );
    const texture = new Texture();
    const full = new Matrix4().makeTranslation(1, 2, 3);
    const crop = new Matrix4().makeScale(4, 4, 1);
    const frame = { width: 2, opacity: 0, feather: 50, featherOpacity: 0.8 };
    const overlay = {
      texture,
      viewportToTexture: new Matrix3(),
      opacity: 0,
      backdropOpacity: 1,
      backdropLook: { contrast: 0.5, brightness: 1.25, saturation: 0.5 },
      projective: { sceneToTexture: crop, sourceProjection: full, frame },
    };
    try {
      controller.setScreenOverlay("source", overlay);
      controller.setScreenOverlay("target", {
        ...overlay,
        priority: 1,
        projective: { ...overlay.projective, sourceProjection: new Matrix4() },
      });
      const u = controller.screenOverlayMesh.material.uniforms;
      expect(u.carmaScreenFrameEnabled0.value).toBe(1);
      expect(u.carmaScreenFrameEnabled1.value).toBe(1);
      expect(u.carmaScreenBackdropOpacity.value).toBe(1);
      expect(u.carmaScreenFrameProjection0.value.equals(full)).toBe(true);
      expect(u.carmaScreenSceneToTexture0.value.equals(crop)).toBe(true);
      expect(u.carmaScreenFrameStyle0.value.toArray()).toEqual([2, 0, 50, 0]);
      expect(controller.screenOverlayMesh.visible).toBe(true);
      const epoch = controller.epoch;
      controller.setScreenOverlay("source", overlay);
      expect(controller.epoch).toBe(epoch);
      frame.opacity = 0.5;
      controller.setScreenOverlay("source", overlay);
      expect(controller.epoch).toBeGreaterThan(epoch);
      expect(u.carmaScreenFrameStyle0.value.toArray()).toEqual([
        2, 0.5, 50, 0.4,
      ]);
      controller.setScreenOverlay("source", null);
      controller.setScreenOverlay("target", null);
      expect(
        u.carmaScreenFrameEnabled0.value + u.carmaScreenFrameEnabled1.value
      ).toBe(0);
      expect(u.carmaScreenBackdropOpacity.value).toBe(0);
      expect(controller.screenOverlayMesh.visible).toBe(false);
    } finally {
      controller.dispose();
      texture.dispose();
    }
  });

  it("retains the settled flat look through the pair and target handoff until its next look change", () => {
    const controller = createSharedThreeMapStyleProjection(
      "test",
      new Map(),
      new Vector2(800, 600)
    );
    const texture = new Texture();
    const flat = {
      texture,
      viewportToTexture: new Matrix3(),
      opacity: 1,
      backdropLook: { contrast: 0.5, brightness: 1.25, saturation: 0.5 },
      backdropTint: [0, 0, 0, 0.13] as const,
    };
    const fallback = { contrast: 0.95, brightness: 1.25, saturation: 0.85 };
    const frame = { opacity: 0.9, width: 2, feather: 50, featherOpacity: 0.8 };
    const source = {
      ...flat,
      priority: 10,
      backdropLook: fallback,
      projective: {
        sceneToTexture: new Matrix4(),
        sourceProjection: new Matrix4(),
        frame,
      },
    };
    try {
      controller.setScreenOverlay("flat", flat);
      controller.setScreenOverlay("source", source);
      controller.setScreenOverlay("target", {
        ...flat,
        priority: 11,
        opacity: 0,
        backdropLook: fallback,
        projective: {
          sceneToTexture: new Matrix4(),
          sourceProjection: new Matrix4(),
          frame: { ...frame, opacity: 0 },
        },
      });
      const u = controller.screenOverlayMesh.material.uniforms;
      expect(u.carmaScreenBackdropLook.value.toArray()).toEqual([
        0.5, 1.25, 0.5,
      ]);
      controller.setScreenOverlay("source", {
        ...source,
        backdropOpacity: 0.5,
      });
      expect(u.carmaScreenBackdropOpacity.value).toBe(0.5);
      expect(u.carmaScreenBackdropLook.value.toArray()).toEqual([
        0.5, 1.25, 0.5,
      ]);
      controller.setScreenOverlay("source", source);
      expect(u.carmaScreenBackdropOpacity.value).toBe(1);
      controller.setScreenOverlay("flat", {
        ...flat,
        opacity: 0.5,
        backdropLook: fallback,
      });
      controller.setScreenOverlay("source", null);
      controller.setScreenOverlay("target", null);
      expect(u.carmaScreenBackdropOpacity.value).toBe(1);
      expect(u.carmaScreenBackdropLook.value.toArray()).toEqual([
        0.5, 1.25, 0.5,
      ]);
      // Explicit presentation opacity is already the final grey fraction;
      // the retained look must neither force it to one nor square the fade.
      for (const opacity of [0, 0.25, 0.5, 1, 0.5, 0]) {
        controller.setScreenOverlay("flat", {
          ...flat,
          opacity,
          backdropOpacity: opacity,
          backdropLook: fallback,
        });
        expect(u.carmaScreenBackdropOpacity.value).toBe(opacity);
        expect(u.carmaScreenBackdropLook.value.toArray()).toEqual([
          0.5, 1.25, 0.5,
        ]);
      }
      controller.setScreenOverlay("flat", {
        ...flat,
        backdropLook: { ...fallback, contrast: 0.7 },
      });
      expect(u.carmaScreenBackdropLook.value.x).toBe(0.7);
      controller.setScreenOverlay("flat", null);
      expect(u.carmaScreenBackdropOpacity.value).toBe(0);
    } finally {
      controller.dispose();
      texture.dispose();
    }
  });

  it("hands the matte to the highest visible flat slot and keeps hidden prepared slots subordinate", () => {
    const controller = createSharedThreeMapStyleProjection(
      "two-flat-handoff",
      new Map(),
      new Vector2(800, 600)
    );
    const texture = new Texture();
    const flat = {
      texture,
      viewportToTexture: new Matrix3(),
      opacity: 1,
      backdropOpacity: 1,
      backdropLook: { contrast: 0.5, brightness: 1.25, saturation: 0.5 },
    };
    const projected = {
      ...flat,
      priority: 100,
      opacity: 0,
      projective: {
        sceneToTexture: new Matrix4(),
        sourceProjection: new Matrix4(),
        frame: { opacity: 0, width: 2, feather: 50, featherOpacity: 0.8 },
      },
    };
    try {
      controller.setScreenOverlay("coarse", { ...flat, priority: 0 });
      controller.setScreenOverlay("projected", projected);
      controller.setScreenOverlay("coarse", {
        ...flat,
        priority: 0,
        opacity: 0,
        backdropOpacity: 0,
      });
      controller.setScreenOverlay("native", { ...flat, priority: 1 });
      controller.setScreenOverlay("projected", null);
      const u = controller.screenOverlayMesh.material.uniforms;
      expect(u.carmaScreenBackdropOpacity.value).toBe(1);
      controller.setScreenOverlay("coarse", {
        ...flat,
        priority: 0,
        backdropOpacity: 0.75,
      });
      controller.setScreenOverlay("native", {
        ...flat,
        priority: 1,
        backdropOpacity: 0.5,
      });
      expect(u.carmaScreenBackdropOpacity.value).toBe(0.5);
      controller.setScreenOverlay("native", {
        ...flat,
        priority: 1,
        opacity: 0,
        backdropOpacity: 0,
      });
      expect(u.carmaScreenBackdropOpacity.value).toBe(0.75);
      controller.setScreenOverlay("coarse", {
        ...flat,
        priority: 0,
        opacity: 0,
        backdropOpacity: 0,
      });
      expect(u.carmaScreenBackdropOpacity.value).toBe(0);
      controller.setScreenOverlay("coarse", { ...flat, priority: 0 });
      expect(u.carmaScreenBackdropOpacity.value).toBe(1);
    } finally {
      controller.dispose();
      texture.dispose();
    }
  });

  it("keeps the framed matte through a transparent flat target until the published handoff", () => {
    const controller = createSharedThreeMapStyleProjection(
      "handoff",
      new Map(),
      new Vector2(800, 600)
    );
    const texture = new Texture();
    const settled = { contrast: 0.5, brightness: 1.25, saturation: 0.5 };
    const fallback = { contrast: 0.95, brightness: 1.25, saturation: 0.85 };
    const flat = {
      texture,
      viewportToTexture: new Matrix3(),
      priority: 1,
      opacity: 1,
      backdropOpacity: 1,
      backdropLook: settled,
      backdropTint: [0, 0, 0, 0.13] as const,
    };
    const projected = {
      ...flat,
      priority: 100,
      opacity: 0,
      backdropLook: fallback,
      projective: {
        sceneToTexture: new Matrix4(),
        sourceProjection: new Matrix4(),
        frame: { opacity: 0, width: 2, feather: 50, featherOpacity: 0.8 },
      },
    };
    try {
      controller.setScreenOverlay("flat", flat);
      controller.setScreenOverlay("projected", projected);
      const u = controller.screenOverlayMesh.material.uniforms;
      for (const opacity of [0, 0.5, 1]) {
        controller.setScreenOverlay("flat", {
          ...flat,
          opacity,
          backdropOpacity: opacity,
          backdropLook: fallback,
        });
        expect(
          u.carmaScreenFrameEnabled0.value + u.carmaScreenFrameEnabled1.value
        ).toBe(1);
        expect(u.carmaScreenBackdropOpacity.value).toBe(1);
        expect(u.carmaScreenBackdropLook.value.toArray()).toEqual([
          0.5, 1.25, 0.5,
        ]);
      }
      controller.setScreenOverlay("projected", null);
      expect(u.carmaScreenBackdropOpacity.value).toBe(1);
      expect(u.carmaScreenBackdropLook.value.toArray()).toEqual([
        0.5, 1.25, 0.5,
      ]);
      expect(
        u.carmaScreenFrameEnabled0.value + u.carmaScreenFrameEnabled1.value
      ).toBe(0);
    } finally {
      controller.dispose();
      texture.dispose();
    }
  });

  it("honors the framed matte exit fade while a hidden flat image is prepared", () => {
    const controller = createSharedThreeMapStyleProjection(
      "matte-exit",
      new Map(),
      new Vector2(800, 600)
    );
    const texture = new Texture();
    const flat = {
      texture,
      viewportToTexture: new Matrix3(),
      priority: 1,
      opacity: 1,
      backdropOpacity: 1,
      backdropLook: { contrast: 0.5, brightness: 1.25, saturation: 0.5 },
    };
    const projected = {
      ...flat,
      priority: 100,
      opacity: 0,
      projective: {
        sceneToTexture: new Matrix4(),
        sourceProjection: new Matrix4(),
        frame: { opacity: 0, width: 2, feather: 50, featherOpacity: 0.8 },
      },
    };
    try {
      controller.setScreenOverlay("flat", flat);
      controller.setScreenOverlay("projected", projected);
      controller.setScreenOverlay("flat", {
        ...flat,
        opacity: 0,
        backdropOpacity: 0,
      });
      const u = controller.screenOverlayMesh.material.uniforms;
      for (const backdropOpacity of [1, 0.75, 0.5, 0.25, 0]) {
        controller.setScreenOverlay("projected", {
          ...projected,
          backdropOpacity,
        });
        expect(u.carmaScreenBackdropOpacity.value).toBe(backdropOpacity);
        expect(u.carmaScreenBackdropLook.value.toArray()).toEqual([
          0.5, 1.25, 0.5,
        ]);
      }
      controller.setScreenOverlay("projected", null);
      expect(u.carmaScreenBackdropOpacity.value).toBe(0);
    } finally {
      controller.dispose();
      texture.dispose();
    }
  });

  it("uses the flat matte when a projective frame has no valid projection", () => {
    const controller = createSharedThreeMapStyleProjection(
      "invalid-frame",
      new Map(),
      new Vector2(800, 600)
    );
    const texture = new Texture();
    const flat = {
      texture,
      viewportToTexture: new Matrix3(),
      priority: 1,
      opacity: 1,
      backdropOpacity: 1,
      backdropLook: { contrast: 0.5, brightness: 1.25, saturation: 0.5 },
    };
    try {
      controller.setScreenOverlay("flat", flat);
      controller.setScreenOverlay("invalid", {
        ...flat,
        priority: 100,
        backdropOpacity: 0,
        projective: {
          sceneToTexture: new Matrix4(),
          frame: { opacity: 0, width: 2, feather: 50, featherOpacity: 0.8 },
        },
      });
      controller.setScreenOverlay("flat", {
        ...flat,
        priority: 200,
        backdropOpacity: 0.5,
      });
      expect(
        controller.screenOverlayMesh.material.uniforms
          .carmaScreenBackdropOpacity.value
      ).toBe(0.5);
    } finally {
      controller.dispose();
      texture.dispose();
    }
  });

  it("captures the existing framebuffer for frame backdrop with map-style presentation off", () => {
    const controller = createSharedThreeMapStyleProjection(
      "test",
      new Map(),
      new Vector2(800, 600)
    );
    const texture = new Texture();
    const renderer = { copyFramebufferToTexture: vi.fn() };
    controller.attach(
      {
        triggerRepaint: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        getCanvas: () => ({ clientWidth: 400 }),
      } as never,
      renderer as never
    );
    try {
      controller.setEnabled(false);
      controller.setScreenOverlay("source", {
        texture,
        viewportToTexture: new Matrix3(),
        opacity: 0,
        backdropOpacity: 1,
        projective: {
          sceneToTexture: new Matrix4(),
          sourceProjection: new Matrix4(),
          frame: { opacity: 0, width: 2, feather: 50, featherOpacity: 0.8 },
        },
      });
      controller.capture(new Matrix4(), false);
      const u = controller.screenOverlayMesh.material.uniforms;
      expect(renderer.copyFramebufferToTexture).toHaveBeenCalledOnce();
      expect(u.carmaScreenBackgroundAvailable.value).toBe(1);
      expect(u.carmaScreenFramePixelRatio.value).toBe(2);
      expect(u.carmaScreenBackgroundTexture.value).not.toBeNull();
      controller.setScreenOverlay("source", null);
      controller.capture(new Matrix4(), false);
      expect(u.carmaScreenBackgroundAvailable.value).toBe(0);
      expect(renderer.copyFramebufferToTexture).toHaveBeenCalledOnce();
    } finally {
      controller.dispose();
      texture.dispose();
    }
  });
});

it("captures a half-visible flat preview matte with presentation off and clears it for an undecorated preview", () => {
  const controller = createSharedThreeMapStyleProjection(
    "test",
    new Map(),
    new Vector2(800, 600)
  );
  const texture = new Texture();
  const renderer = { copyFramebufferToTexture: vi.fn() };
  controller.attach(
    {
      triggerRepaint: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      getCanvas: () => ({ clientWidth: 800 }),
    } as never,
    renderer as never
  );
  const flat = {
    texture,
    viewportToTexture: new Matrix3(),
    opacity: 0.5,
    backdropOpacity: 0.5,
    backdropLook: { contrast: 0.5, brightness: 1.25, saturation: 0.5 },
  };
  try {
    controller.setEnabled(false);
    controller.setScreenOverlay("flat", {
      ...flat,
      border: {
        viewportToImage: new Matrix3(),
        imageSize: { width: 400, height: 300 },
        width: 2,
        opacity: 0,
        feather: 50,
        featherOpacity: 0,
      },
    });
    controller.capture(new Matrix4(), false);
    const u = controller.screenOverlayMesh.material.uniforms;
    expect(renderer.copyFramebufferToTexture).toHaveBeenCalledOnce();
    expect(u.carmaScreenBackgroundAvailable.value).toBe(1);
    expect(u.carmaScreenBackdropOpacity.value).toBe(0.5);
    expect(u.carmaScreenBorderStyle.value.toArray()).toEqual([2, 0, 50, 0]);
    expect(controller.screenOverlayMesh.material.fragmentShader).toContain(
      "carmaScreenBackdropOpacity*(1.0-carmaFrameCoverage)"
    );
    controller.setScreenOverlay("flat", flat);
    controller.capture(new Matrix4(), false);
    expect(u.carmaScreenBackgroundAvailable.value).toBe(0);
    expect(renderer.copyFramebufferToTexture).toHaveBeenCalledOnce();
  } finally {
    controller.dispose();
    texture.dispose();
  }
});

it("refreshes borrowed FBO pixels by publisher revision without a CPU upload", () => {
  const controller = createSharedThreeMapStyleProjection(
    "scene",
    new Map(),
    new Vector2(800, 600)
  );
  const map = {
    on: vi.fn(),
    off: vi.fn(),
    triggerRepaint: vi.fn(),
    getCanvas: () => ({ clientWidth: 800 }),
    getTerrain: vi.fn(),
  };
  controller.attach(
    map as never,
    { copyFramebufferToTexture: vi.fn() } as never
  );
  const texture = new Texture();
  const overlay = { texture, viewportToTexture: new Matrix3(), opacity: 1 };
  try {
    map.triggerRepaint.mockClear();
    const version = texture.version;
    controller.setScreenOverlay("fbo", { ...overlay, textureRevision: 1 });
    const first = map.triggerRepaint.mock.calls.length;
    controller.setScreenOverlay("fbo", { ...overlay, textureRevision: 2 });
    expect(map.triggerRepaint).toHaveBeenCalledTimes(first + 1);
    controller.setScreenOverlay("fbo", { ...overlay, textureRevision: 2 });
    expect(map.triggerRepaint).toHaveBeenCalledTimes(first + 1);
    expect(texture.version).toBe(version);
  } finally {
    controller.dispose();
    texture.dispose();
  }
});

// Execute the production GLSL visibility decision, translating only GLSL vector
// syntax. Controlled samples can then prove that a neighbour never overrides a
// central occluder without duplicating the visibility rule in the test.
const evaluatePhotoDepthDecision = (
  depths: readonly number[],
  {
    receiverDepth = 0.81,
    sourceUv = [0.5, 0.5],
    depthGradient = [0, 0],
    metricBias = 0,
  }: {
    receiverDepth?: number;
    sourceUv?: readonly [number, number];
    depthGradient?: readonly [number, number];
    metricBias?: number;
  } = {}
) => {
  type Pair = readonly [number, number];
  const start = PHOTO_SOURCE_DEPTH_GLSL.indexOf("  float centralDepth =");
  expect(start).toBeGreaterThan(0);
  const body = PHOTO_SOURCE_DEPTH_GLSL.slice(
    start,
    PHOTO_SOURCE_DEPTH_GLSL.lastIndexOf("\n}")
  )
    .replaceAll("sampleUv-sourceUv", "subtract(sampleUv,sourceUv)")
    .replaceAll("uv-sourceUv", "subtract(uv,sourceUv)")
    .replaceAll(
      "sampleUv + vec2(float(x),float(y))/size",
      "offsetTexel(sampleUv,x,y,size)"
    )
    .replaceAll("vec2(0.0)", "[0,0]")
    .replaceAll("vec2(1.0)", "[1,1]")
    .replace(/\b(?:float|vec2|int)\s+/g, "let ");
  const sampled: number[] = [];
  const evaluate = new Function(
    "sourceDepth",
    "sampleUv",
    "sourceUv",
    "size",
    "receiverDepth",
    "depthGradient",
    "metricBias",
    "texture2D",
    "subtract",
    "offsetTexel",
    "dot",
    "lessThan",
    "greaterThan",
    "any",
    body
  ) as (...parameters: unknown[]) => boolean;
  const visible = evaluate(
    depths,
    [0.5, 0.5],
    sourceUv,
    [3, 3],
    receiverDepth,
    depthGradient,
    metricBias,
    (_texture: unknown, uv: Pair) => {
      const index = Math.floor(uv[1] * 3) * 3 + Math.floor(uv[0] * 3);
      sampled.push(index);
      return { r: depths[index] };
    },
    (a: Pair, b: Pair) => [a[0] - b[0], a[1] - b[1]],
    (uv: Pair, x: number, y: number, size: Pair) => [
      uv[0] + x / size[0],
      uv[1] + y / size[1],
    ],
    (a: Pair, b: Pair) => a[0] * b[0] + a[1] * b[1],
    (a: Pair, b: Pair) => [a[0] < b[0], a[1] < b[1]],
    (a: Pair, b: Pair) => [a[0] > b[0], a[1] > b[1]],
    (values: boolean[]) => values.some(Boolean)
  );
  return { visible, sampled };
};

describe("photo first-hit central occluder", () => {
  it.each([0.95, 1])(
    "keeps a central roof occluder authoritative over neighbouring depth %s",
    (neighbor) => {
      const depths = Array(9).fill(neighbor) as number[];
      depths[4] = 0.8;
      expect(evaluatePhotoDepthDecision(depths)).toEqual({
        visible: false,
        sampled: [4],
      });
    }
  );

  it("accepts a visible central facade without consulting neighbouring roofs", () => {
    const depths = Array(9).fill(0.2) as number[];
    depths[4] = 0.85;
    expect(evaluatePhotoDepthDecision(depths)).toEqual({
      visible: true,
      sampled: [4],
    });
  });

  it("retains receiver-plane correction at the actual central texel position", () => {
    const depths = Array(9).fill(0.8) as number[];
    expect(evaluatePhotoDepthDecision(depths).visible).toBe(false);
    expect(
      evaluatePhotoDepthDecision(depths, {
        sourceUv: [0.6, 0.5],
        depthGradient: [0.2, 0],
      })
    ).toEqual({ visible: true, sampled: [4] });
  });

  it("retains the existing metric-bias allowance and numerical epsilon", () => {
    const depths = Array(9).fill(0.8) as number[];
    expect(
      evaluatePhotoDepthDecision(depths, { receiverDepth: 0.80005 }).visible
    ).toBe(false);
    expect(
      evaluatePhotoDepthDecision(depths, {
        receiverDepth: 0.80005,
        metricBias: 0.0001,
      }).visible
    ).toBe(true);
    expect(
      evaluatePhotoDepthDecision(depths, { receiverDepth: 0.80000005 }).visible
    ).toBe(true);
    expect(PHOTO_SOURCE_DEPTH_GLSL).toContain(
      "bias/(sourceClip.w*(sourceClip.w+bias))"
    );
  });

  it("never infers visibility solely from empty depth neighbours", () => {
    const depths = Array(9).fill(0.8) as number[];
    depths[4] = depths[0] = 1;
    expect(evaluatePhotoDepthDecision(depths).visible).toBe(false);
    expect(evaluatePhotoDepthDecision(Array(9).fill(1)).visible).toBe(false);
    expect(PHOTO_SOURCE_DEPTH_GLSL).not.toContain("clearNeighbor");
  });

  it("allows a real visible neighbour only when the central texel is empty", () => {
    const depths = Array(9).fill(1) as number[];
    depths[0] = 0.85;
    expect(evaluatePhotoDepthDecision(depths)).toEqual({
      visible: true,
      sampled: [4, 0],
    });
  });

  it("keeps the receiver-plane correction for the empty-center fallback", () => {
    const depths = Array(9).fill(1) as number[];
    depths[0] = 0.8;
    expect(evaluatePhotoDepthDecision(depths).visible).toBe(false);
    expect(
      evaluatePhotoDepthDecision(depths, { depthGradient: [0.1, 0] }).visible
    ).toBe(true);
  });
});

describe("live shared photo-footprint theme", () => {
  it("updates owner colors only when the visible theme changes and restores matching owners", () => {
    const controller = createSharedThreeMapStyleProjection(
      "theme",
      new Map(),
      new Vector2(800, 600)
    );
    const map = { triggerRepaint: vi.fn(), on: vi.fn(), off: vi.fn() };
    controller.attach(
      map as never,
      { copyFramebufferToTexture: vi.fn() } as never
    );
    const uniform =
      controller.screenOverlayMesh.material.uniforms.carmaScreenFootprintColor;
    try {
      map.triggerRepaint.mockClear();
      expect(uniform.value).toEqual(new Color(1, 1, 1));
      let epoch = controller.epoch;
      controller.setFootprintColor("missing", null);
      expect(controller.epoch).toBe(epoch);
      expect(map.triggerRepaint).not.toHaveBeenCalled();
      controller.setFootprintColor("old", "#404040");
      expect(uniform.value).toEqual(new Color("#404040"));
      expect(controller.epoch).toBe(++epoch);
      expect(map.triggerRepaint).toHaveBeenCalledTimes(1);
      controller.setFootprintColor("old", "#404040");
      expect(controller.epoch).toBe(epoch);
      expect(map.triggerRepaint).toHaveBeenCalledTimes(1);
      controller.setFootprintColor("new", "#606060");
      expect(controller.epoch).toBe(++epoch);
      controller.setFootprintColor("old", "#202020");
      expect(controller.epoch).toBe(epoch);
      expect(uniform.value).toEqual(new Color("#606060"));
      controller.setFootprintColor("new", null);
      expect(controller.epoch).toBe(++epoch);
      expect(uniform.value).toEqual(new Color("#202020"));
      controller.setFootprintColor("old", null, false);
      expect(controller.epoch).toBe(++epoch);
      expect(uniform.value).toEqual(new Color(1, 1, 1));
      expect(map.triggerRepaint).toHaveBeenCalledTimes(3);
      const owned = new Color("#303030");
      controller.setFootprintColor("snapshot", owned);
      owned.set("#ffffff");
      expect(uniform.value).toEqual(new Color("#303030"));
      controller.dispose();
      expect(uniform.value).toEqual(new Color(1, 1, 1));
    } finally {
      controller.dispose();
    }
  });

  it("binds the same live linear color to receivers and themes both framing paths", () => {
    const controller = createSharedThreeMapStyleProjection(
      "theme",
      new Map(),
      new Vector2(800, 600)
    );
    const uniform =
      controller.screenOverlayMesh.material.uniforms.carmaScreenFootprintColor;
    const material = new MeshBasicMaterial();
    try {
      configureMapStyleProjectedMaterial(material, {
        texture: { value: null },
        sceneToClip: { value: new Matrix4() },
        enabled: { value: 0 },
        depthTexture: { value: null },
        depthEnabled: { value: 0 },
        depthNearFar: { value: new Vector2(1, 1000) },
        texelSize: { value: new Vector2(1, 1) },
        screenFootprintColor: uniform,
      });
      const shader = {
        uniforms: {},
        vertexShader: "#include <common>\n#include <project_vertex>",
        fragmentShader:
          "#include <common>\n#include <map_fragment>\n#include <opaque_fragment>",
      } as Parameters<typeof material.onBeforeCompile>[0];
      material.onBeforeCompile(shader, {} as never);
      expect(shader.uniforms.carmaScreenFootprintColor).toBe(uniform);
      const version = material.version;
      controller.setFootprintColor("map", "#404040");
      expect(shader.uniforms.carmaScreenFootprintColor.value.r).toBeCloseTo(
        0.05126946,
        7
      );
      expect(material.version).toBe(version);
      expect(shader.fragmentShader).toContain(
        "+carmaScreenFootprintColor*borderAlpha"
      );
      expect(shader.fragmentShader).toContain(
        "image.rgb*image.a-carmaScreenFootprintColor*decorationAlpha*(1.0-photographAlpha)"
      );
      expect(shader.fragmentShader).toContain(
        "carmaMapStyleLinearToSRGB(carmaScreenFootprintColor),carmaFrameDecoration"
      );
      expect(shader.fragmentShader).toContain(
        "vec4(carmaScreenFootprintColor*carmaFrameDecoration,carmaFrameDecoration)"
      );
    } finally {
      controller.dispose();
      material.dispose();
    }
  });
});
