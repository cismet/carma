import { describe, expect, it, vi } from "vitest";
import {
  BoxGeometry,
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
import { createSharedThreeMapStyleProjection } from "./shared-three-map-style-projection";

describe("map-style screen image ownership", () => {
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

  it("does not turn an ECEF DEM replace receiver into a photo-only surface", () => {
    const material = new MeshBasicMaterial();
    const root = new Mesh(new BoxGeometry(), material);
    const program = material.customProgramCacheKey();
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
    controller.setScreenOverlay("photo", {
      texture,
      viewportToTexture: new Matrix3(),
      projective: { sceneToTexture: new Matrix4() },
      opacity: 1,
    });
    controller.capture(new Matrix4(), false);
    expect(material.customProgramCacheKey()).toBe(program);
    expect(controller.screenOverlayMesh.visible).toBe(false);
    controller.dispose();
    root.geometry.dispose();
    material.dispose();
    texture.dispose();
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
