import { describe, expect, it, vi } from "vitest";
import {
  BoxGeometry,
  Camera,
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
import { MAP_STYLE_PROJECTION_FRAGMENT_OUTPUT } from "../../core/shared-three-map-style-shaders";
import { configureMapStyleProjectedMaterial } from "./shared-three-map-style-material";
import * as photoDepthModule from "./shared-three-photo-depth";
import { createSharedThreeMapStyleProjection } from "./shared-three-map-style-projection";

describe("map-style screen image ownership", () => {
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
      opacity = 1
    ) =>
      controller.setScreenOverlay(id, {
        texture,
        opacity,
        viewportToTexture: new Matrix3(),
        projective: { sourceProjection, sceneToTexture: crop },
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
        original
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

describe("projective transition frames", () => {
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
    try {
      controller.setScreenOverlay("flat", flat);
      controller.setScreenOverlay("source", {
        ...flat,
        priority: 10,
        backdropLook: fallback,
        projective: {
          sceneToTexture: new Matrix4(),
          sourceProjection: new Matrix4(),
          frame,
        },
      });
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
      controller.setScreenOverlay("flat", { ...flat, backdropLook: fallback });
      controller.setScreenOverlay("source", null);
      controller.setScreenOverlay("target", null);
      expect(u.carmaScreenBackdropLook.value.toArray()).toEqual([
        0.5, 1.25, 0.5,
      ]);
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
