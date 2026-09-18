import * as THREE from "three";
import { radToDegNumeric } from "@carma-units";

import {
  getCameraStripLayout,
  type CameraRigView,
} from "../../core/multi-camera-rig";
import type { SharedThreeSceneLayer } from "../../core/shared-three-scene-types";
import {
  TILE_CAMERA_PRIORITY,
  TILE_CAMERA_ROLE,
} from "../../core/tile-camera-demand";
import { createSharedThreeSceneCameraPreview } from "./shared-three-scene-camera-preview";

let nextStripId = 0;

/** One scene/pool/context. Embedded strips use scissor; exported frames use readback. */
export const createSharedSceneCameraStrip = (
  layer: SharedThreeSceneLayer,
  views: readonly CameraRigView[],
  options: Readonly<{
    height: number;
    errorTargetPixels: number;
    clipping: boolean;
    showImagePlanes: boolean;
    /** A transparent region inside the shared renderer's canvas bounds. */
    viewport?: HTMLElement;
    /** Otherwise all array views load after the main observer camera. */
    priorityCameraIndex?: number | null;
    onFrame: (
      offset: number,
      pixels: Uint8Array,
      width: number,
      height: number
    ) => void;
    onError: (error: unknown) => void;
  }>
) => {
  if (
    options.priorityCameraIndex != null &&
    (!Number.isInteger(options.priorityCameraIndex) ||
      options.priorityCameraIndex < 0 ||
      options.priorityCameraIndex >= views.length)
  )
    throw new Error("Priority camera index is outside this strip");
  const prefix = `camera-strip-${nextStripId++}`;
  const layout = getCameraStripLayout(views, options.height);
  const preview = createSharedThreeSceneCameraPreview(layer);
  const helpers = new THREE.Group();
  const materials: THREE.MeshBasicMaterial[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const textures: THREE.DataTexture[] = [];
  const planePreviews = new Map<
    number,
    ReturnType<typeof createSharedThreeSceneCameraPreview>
  >();
  let disposed = false;
  let busy = false;
  let nextIndex = 0;
  let completed = 0;
  let lastReadbackMs = 0;
  let priorityCameraIndex = options.priorityCameraIndex ?? null;
  let elevationOffset = 0;
  let viewRevision = 0;
  let presentationPixelScale = 1;
  const activeCameraIndices = new Set<number>(
    options.viewport ? [] : views.map((_, index) => index)
  );
  let presentation: {
    y: number;
    scale: number;
    slices: readonly {
      sourceX: number;
      sourceWidth: number;
      x: number;
      width: number;
    }[];
  } | null = null;
  const removeScreenPass = options.viewport
    ? layer.addScreenRenderPass(() => {
        if (disposed || !presentation) return;
        helpers.visible = false;
        try {
          preview.renderViewport(null, options.viewport!);
          // Repeated meridian segments share geometry and demand, not another loader.
          for (const slice of presentation.slices) {
            views.forEach((view, index) => {
              const offset = layout.offsets[index];
              if (
                offset + layout.widths[index] <= slice.sourceX ||
                offset >= slice.sourceX + slice.sourceWidth
              )
                return;
              preview.renderViewport(
                view.camera,
                options.viewport!,
                {
                  x: slice.x + (offset - slice.sourceX) * presentation!.scale,
                  y: presentation!.y,
                  width: layout.widths[index] * presentation!.scale,
                  height: layout.height * presentation!.scale,
                },
                options.clipping ? view.clipPlanes : []
              );
            });
          }
        } finally {
          helpers.visible = options.showImagePlanes;
        }
      })
    : null;

  const publishCamera = (view: CameraRigView, index: number) => {
    layer.setTileCameraView({
      id: `${prefix}-${index}`,
      camera: view.camera,
      viewport: [
        Math.max(1, Math.round(layout.widths[index] * presentationPixelScale)),
        Math.max(1, Math.round(layout.height * presentationPixelScale)),
      ],
      errorTargetPixels: options.errorTargetPixels,
      role: TILE_CAMERA_ROLE.RECEIVER,
      priority:
        index === priorityCameraIndex
          ? TILE_CAMERA_PRIORITY.FOCUS
          : TILE_CAMERA_PRIORITY.SECONDARY,
    });
  };

  const nextActiveIndex = (after: number) => {
    for (let offset = 1; offset <= views.length; offset += 1) {
      const index = (after + offset) % views.length;
      if (activeCameraIndices.has(index)) return index;
    }
    return 0;
  };

  const updateActiveCameras = () => {
    if (!presentation) return;
    const nextActiveCameraIndices = new Set<number>();
    for (const slice of presentation.slices) {
      views.forEach((_, index) => {
        const offset = layout.offsets[index];
        if (
          offset + layout.widths[index] > slice.sourceX &&
          offset < slice.sourceX + slice.sourceWidth
        )
          nextActiveCameraIndices.add(index);
      });
    }
    activeCameraIndices.forEach((index) => {
      if (nextActiveCameraIndices.has(index)) return;
      layer.removeTileCameraView(`${prefix}-${index}`);
      const capture = planePreviews.get(index);
      capture?.dispose();
      planePreviews.delete(index);
      if (materials[index].map) {
        materials[index].map = null;
        materials[index].needsUpdate = true;
      }
      helpers.children[index].visible = false;
    });
    nextActiveCameraIndices.forEach((index) => {
      if (activeCameraIndices.has(index)) return;
      publishCamera(views[index], index);
      helpers.children[index].visible = options.showImagePlanes;
    });
    activeCameraIndices.clear();
    nextActiveCameraIndices.forEach((index) => activeCameraIndices.add(index));
    if (!activeCameraIndices.has(nextIndex))
      nextIndex = nextActiveIndex(nextIndex - 1);
  };

  views.forEach((view, index) => {
    if (activeCameraIndices.has(index)) publishCamera(view, index);
    const camera = view.camera;
    const height =
      camera instanceof THREE.PerspectiveCamera
        ? 2 * view.distance * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
        : camera.top - camera.bottom;
    const width =
      camera instanceof THREE.PerspectiveCamera
        ? height * camera.aspect
        : camera.right - camera.left;
    const geometry = new THREE.PlaneGeometry(width, height);
    const texture =
      options.showImagePlanes && !options.viewport
        ? new THREE.DataTexture(
            new Uint8Array(layout.widths[index] * layout.height * 4),
            layout.widths[index],
            layout.height
          )
        : null;
    if (texture) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearFilter;
    }
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
      transparent: true,
      // Diagnostic planes must not conceal the scene they are explaining.
      opacity: 0.3,
      depthWrite: false,
      toneMapped: false,
    });
    const plane = new THREE.Mesh(geometry, material);
    plane.position
      .copy(camera.position)
      .addScaledVector(
        camera.getWorldDirection(new THREE.Vector3()),
        view.distance
      );
    plane.quaternion.copy(camera.quaternion);
    plane.translateY(view.imagePlaneVerticalOffset ?? 0);
    plane.visible = !options.viewport;
    helpers.add(plane);
    materials.push(material);
    geometries.push(geometry);
    if (texture) textures.push(texture);
  });
  helpers.visible = options.showImagePlanes;
  layer.getScene().add(helpers);

  return {
    layout,
    /** One-way observer target for an open strip. Average directions as vectors,
     * weighted by visible strip width, so north does not jump at +/-180 degrees.
     * This reads the shared rig; it never feeds observer movement back into it. */
    getMapViewAt(sourceX: number, visibleWidth: number) {
      const position = this.getScenePositionAt(sourceX);
      if (!position || !Number.isFinite(visibleWidth) || visibleWidth <= 0)
        return null;
      const center = layer.projectSceneToLngLat(position);
      if (!center) return null;
      const x = THREE.MathUtils.clamp(sourceX, 0, layout.width);
      const start = Math.max(0, x - visibleWidth / 2);
      const end = Math.min(layout.width, x + visibleWidth / 2);
      const direction = new THREE.Vector3();
      const scratch = new THREE.Vector3();
      let central = views[0];
      views.forEach((view, index) => {
        const left = layout.offsets[index];
        const right = left + layout.widths[index];
        if (x >= left && x <= right) central = view;
        const overlap = Math.max(
          0,
          Math.min(end, right) - Math.max(start, left)
        );
        if (overlap > 0)
          direction.addScaledVector(
            view.camera.getWorldDirection(scratch),
            overlap / visibleWidth
          );
      });
      if (Math.hypot(direction.x, direction.z) < 1e-6)
        central.camera.getWorldDirection(direction);
      // Shared MapLibre scene axes are east (+X), up (+Y), south (+Z).
      const bearing = radToDegNumeric(Math.atan2(direction.x, -direction.z))!;
      return { center, bearing };
    },
    getScenePositionAt(sourceX: number) {
      if (!Number.isFinite(sourceX) || views.length === 0) return null;
      const clampedSourceX = THREE.MathUtils.clamp(sourceX, 0, layout.width);
      const index = layout.widths.findIndex(
        (width, candidate) =>
          clampedSourceX <= layout.offsets[candidate] + width
      );
      if (index < 0) return null;
      const view = views[index];
      const camera = view.camera;
      const fraction =
        (clampedSourceX - layout.offsets[index]) / layout.widths[index];
      const position = camera
        .getWorldDirection(new THREE.Vector3())
        .multiplyScalar(view.distance)
        .add(camera.position);
      if (camera instanceof THREE.OrthographicCamera) {
        position.addScaledVector(
          new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion),
          (fraction - 0.5) * (camera.right - camera.left)
        );
        position.addScaledVector(
          new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion),
          view.imagePlaneVerticalOffset ?? 0
        );
      }
      return [position.x, position.y, position.z].every(Number.isFinite)
        ? position
        : null;
    },
    setPresentation(frame: NonNullable<typeof presentation>) {
      presentation = frame;
      updateActiveCameras();
      const canvas = layer.getRenderer()?.domElement;
      const bounds = canvas?.getBoundingClientRect();
      const scale =
        frame.scale * (bounds?.width ? canvas!.width / bounds.width : 1);
      if (scale !== presentationPixelScale) {
        presentationPixelScale = scale;
        activeCameraIndices.forEach((index) =>
          publishCamera(views[index], index)
        );
      }
      layer.requestScreenRender();
    },
    getStats: () => ({
      completed,
      lastReadbackMs,
      busy,
      cameras: views.length,
      activeCameras: activeCameraIndices.size,
      priorityCameraIndex,
      elevationOffset,
    }),
    /** Reorder demand without rebuilding the scene, rig, textures or pool. */
    setPriorityCamera(index: number | null) {
      if (
        index !== null &&
        (!Number.isInteger(index) || index < 0 || index >= views.length)
      )
        throw new Error("Priority camera index is outside this strip");
      if (disposed || priorityCameraIndex === index) return;
      priorityCameraIndex = index;
      if (index !== null && activeCameraIndices.has(index)) nextIndex = index;
      activeCameraIndices.forEach((activeIndex) =>
        publishCamera(views[activeIndex], activeIndex)
      );
    },
    /** Translate the entire rig and clipping envelope in scene metres. */
    setElevationOffset(offset: number) {
      if (!Number.isFinite(offset))
        throw new Error("Camera elevation offset must be finite");
      if (disposed || elevationOffset === offset) return;
      const delta = offset - elevationOffset;
      elevationOffset = offset;
      viewRevision += 1;
      views.forEach((view, index) => {
        view.camera.position.y += delta;
        view.camera.updateMatrixWorld(true);
        view.clipPlanes.forEach((plane) => {
          plane.constant -= plane.normal.y * delta;
        });
        helpers.children[index].position.y += delta;
        if (activeCameraIndices.has(index)) publishCamera(view, index);
      });
    },
    /** One segment per opportunity. The previous complete pixels remain visible. */
    update() {
      if (options.viewport && !disposed) {
        if (activeCameraIndices.size === 0) return;
        layer.requestScreenRender();
        // Texture export is needed only for explicitly enabled 3D image planes.
        if (!options.showImagePlanes) return;
      }
      if (busy || disposed || activeCameraIndices.size === 0) return;
      const index = nextIndex;
      const revision = viewRevision;
      const view = views[index];
      const started = performance.now();
      if (options.viewport) {
        layer.runIdleRender?.(() => {
          helpers.visible = false;
          try {
            let capture = planePreviews.get(index);
            if (!capture) {
              capture = createSharedThreeSceneCameraPreview(layer);
              planePreviews.set(index, capture);
            }
            const texture = capture.renderTexture(
              view.camera,
              layout.widths[index],
              layout.height,
              options.clipping ? view.clipPlanes : []
            );
            if (texture) {
              if (materials[index].map !== texture) {
                materials[index].map = texture;
                materials[index].needsUpdate = true;
              }
              completed += 1;
              nextIndex = nextActiveIndex(index);
            }
          } finally {
            helpers.visible = options.showImagePlanes;
          }
        });
        return;
      }
      layer.runIdleRender?.(() => {
        busy = true;
        helpers.visible = false;
        // Decision: asynchronous PBO readback, not N blocking readPixels calls.
        // See MULTICAM-STRESS-20260913 in the package README.
        const result = preview.renderAsync(
          view.camera,
          layout.widths[index],
          layout.height,
          (pixels, width, height) => {
            if (disposed || revision !== viewRevision) return;
            if (textures[index]) {
              textures[index].image.data.set(pixels);
              textures[index].needsUpdate = true;
            }
            options.onFrame(layout.offsets[index], pixels, width, height);
          },
          options.clipping ? view.clipPlanes : []
        );
        helpers.visible = options.showImagePlanes;
        void result
          .then((rendered) => {
            if (!rendered || disposed || revision !== viewRevision) return;
            lastReadbackMs = performance.now() - started;
            completed += 1;
            nextIndex = nextActiveIndex(index);
          })
          .catch((error: unknown) => {
            if (!disposed) options.onError(error);
          })
          .finally(() => {
            busy = false;
          });
      });
    },
    dispose() {
      disposed = true;
      removeScreenPass?.();
      activeCameraIndices.forEach((index) =>
        layer.removeTileCameraView(`${prefix}-${index}`)
      );
      preview.dispose();
      planePreviews.forEach((capture) => capture.dispose());
      planePreviews.clear();
      helpers.removeFromParent();
      textures.forEach((texture) => texture.dispose());
      materials.forEach((material) => material.dispose());
      geometries.forEach((geometry) => geometry.dispose());
    },
  };
};
