import { TilesRenderer } from "3d-tiles-renderer";
import {
  GLTFExtensionsPlugin,
  ImplicitTilingPlugin,
  ReorientationPlugin,
  UnloadTilesPlugin,
  UpdateOnChangePlugin,
} from "3d-tiles-renderer/plugins";
import * as THREE from "three/webgpu";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import {
  Fn,
  cameraProjectionMatrix,
  instancedBufferAttribute,
  modelViewMatrix,
  positionGeometry,
  screenSize,
  uniform,
  vec4,
} from "three/tsl";

/**
 * Renders a 3D Tiles 1.1 point tileset (glTF POINTS content) into a scene that
 * is already anchored on a local ENU frame — the point-cloud counterpart to
 * createMesh2024TilesRuntime, and placed the same way so both line up.
 */
export type PointTilesetRuntimeOptions = {
  scene: THREE.Scene;
  /** Only the canvas is needed, so WebGL and WebGPU renderers both fit. */
  renderer: { readonly domElement: HTMLCanvasElement };
  camera: THREE.PerspectiveCamera;
  /** Scene origin as WGS84 [lng, lat]. */
  originLngLat: readonly [number, number];
  /** Ellipsoidal height of the scene origin. */
  anchorHeightEllipsoidal: number;
  url: string;
  enabled?: boolean;
  /**
   * Returns true while another tileset should own the request budget. The
   * point tileset then skips traversal, so the mesh keeps priority.
   */
  isDeferred?: () => boolean;
  pointSize?: number;
  errorTarget?: number;
  requestRender?: () => void;
};

export const POINT_TILESET_DEFAULT_POINT_SIZE = 2;
export const POINT_TILESET_DEFAULT_ERROR_TARGET = 8;
/** Upper bound on yielding to the mesh, so points always make progress. */
const MAXIMUM_DEFER_MILLISECONDS = 3_000;

/** Corner quad every point instance expands to in the vertex stage. */
const buildQuadTemplate = () => {
  const corners = new THREE.BufferAttribute(
    new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, -0.5, 0.5, 0, 0.5, 0.5, 0]),
    3
  );
  const index = new THREE.BufferAttribute(
    new Uint16Array([0, 1, 2, 2, 1, 3]),
    1
  );
  return { corners, index };
};

export const createPointTilesetRuntime = ({
  scene,
  renderer,
  camera,
  originLngLat,
  anchorHeightEllipsoidal,
  url,
  enabled: initialEnabled = true,
  pointSize: initialPointSize = POINT_TILESET_DEFAULT_POINT_SIZE,
  errorTarget: initialErrorTarget = POINT_TILESET_DEFAULT_ERROR_TARGET,
  isDeferred = () => false,
  requestRender = () => undefined,
}: PointTilesetRuntimeOptions) => {
  let disposed = false;
  /** When the current deferral to the mesh started; 0 when not deferring. */
  let deferringSince = 0;
  /** Point size in physical pixels, shared by every tile's material. */
  const pointSizeUniform = uniform(initialPointSize);
  const quadTemplate = buildQuadTemplate();

  const tiles = new TilesRenderer(url);
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath(
    "https://www.gstatic.com/draco/versioned/decoders/1.5.6/"
  );
  tiles.registerPlugin(new ImplicitTilingPlugin());
  tiles.registerPlugin(new UpdateOnChangePlugin());
  tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader }));
  // Give the budget to what is on screen: tiles that leave the view free
  // their GPU data almost immediately.
  tiles.registerPlugin(new UnloadTilesPlugin({ delay: 200 }));
  tiles.registerPlugin(
    new ReorientationPlugin({
      lat: THREE.MathUtils.degToRad(originLngLat[1]),
      lon: THREE.MathUtils.degToRad(originLngLat[0]),
      height: anchorHeightEllipsoidal,
    })
  );
  tiles.errorTarget = initialErrorTarget;
  tiles.downloadQueue.maxJobsPerOrigin = 8;
  tiles.parseQueue.maxJobs = 8;
  tiles.lruCache.minSize = 128;
  tiles.lruCache.maxSize = 4_096;
  tiles.lruCache.unloadPercent = 0.4;
  tiles.setCamera(camera);
  tiles.setResolutionFromRenderer(camera, renderer as never);

  // ReorientationPlugin yields X west / Z north; this scene uses X east and
  // Z south, matching how the mesh runtime is anchored.
  const group = new THREE.Group();
  group.rotation.y = Math.PI;
  group.visible = initialEnabled;
  group.add(tiles.group);
  scene.add(group);

  /**
   * WebGPU has no sized point primitive — three draws THREE.Points one pixel
   * wide no matter what material.size says. Every loaded tile is therefore
   * rebuilt as one screen-aligned quad per point, expanded to the configured
   * pixel size in the vertex stage — the technique three's own WebGPU
   * instance-points example uses.
   */
  const convertTileScene = (tileScene: THREE.Object3D) => {
    const pointObjects: THREE.Points[] = [];
    tileScene.traverse((child) => {
      if ((child as THREE.Points).isPoints) {
        pointObjects.push(child as THREE.Points);
      }
    });
    for (const points of pointObjects) {
      const source = points.geometry;
      const position = source.getAttribute("position");
      if (!position) continue;
      const geometry = new THREE.InstancedBufferGeometry();
      geometry.setIndex(quadTemplate.index.clone());
      geometry.setAttribute("position", quadTemplate.corners.clone());
      const instancePosition = new THREE.InstancedBufferAttribute(
        position.array,
        position.itemSize
      );
      geometry.setAttribute("instancePosition", instancePosition);
      const color = source.getAttribute("color");
      let instanceColor: THREE.InstancedBufferAttribute | null = null;
      if (color) {
        const strideBytes =
          color.itemSize *
          (color.array as unknown as { BYTES_PER_ELEMENT: number })
            .BYTES_PER_ELEMENT;
        if (strideBytes % 4 === 0) {
          instanceColor = new THREE.InstancedBufferAttribute(
            color.array,
            color.itemSize,
            color.normalized
          );
        } else {
          // WebGPU requires vertex buffer strides in multiples of 4 bytes;
          // the u8 RGB colors these tiles carry (stride 3) are padded to RGBA.
          const channels = color.array as unknown as
            | Uint8Array
            | Uint16Array
            | Float32Array;
          const TypedArrayCtor = channels.constructor as new (
            length: number
          ) => Uint8Array;
          const alphaMaximum =
            channels instanceof Uint8Array
              ? 255
              : channels instanceof Uint16Array
              ? 65_535
              : 1;
          const rgba = new TypedArrayCtor(color.count * 4);
          for (let index = 0; index < color.count; index += 1) {
            rgba[index * 4] = channels[index * 3];
            rgba[index * 4 + 1] = channels[index * 3 + 1];
            rgba[index * 4 + 2] = channels[index * 3 + 2];
            rgba[index * 4 + 3] = alphaMaximum;
          }
          instanceColor = new THREE.InstancedBufferAttribute(
            rgba,
            4,
            color.normalized
          );
        }
        geometry.setAttribute("instanceColor", instanceColor);
      }
      geometry.instanceCount = position.count;
      if (!source.boundingSphere) source.computeBoundingSphere();
      geometry.boundingSphere = source.boundingSphere?.clone() ?? null;

      const material = new THREE.NodeMaterial();
      const instancePositionNode = instancedBufferAttribute(instancePosition);
      material.vertexNode = Fn(() => {
        const clipPosition = cameraProjectionMatrix
          .mul(modelViewMatrix)
          .mul(vec4(instancePositionNode, 1));
        const cornerOffset = positionGeometry.xy
          .mul(pointSizeUniform)
          .mul(2)
          .div(screenSize)
          .mul(clipPosition.w);
        return vec4(
          clipPosition.xy.add(cornerOffset),
          clipPosition.z,
          clipPosition.w
        );
      })();
      material.colorNode = instanceColor
        ? instanceColor.itemSize === 4
          ? vec4(instancedBufferAttribute(instanceColor))
          : vec4(instancedBufferAttribute(instanceColor), 1)
        : vec4(1, 1, 1, 1);
      material.side = THREE.DoubleSide;
      material.toneMapped = false;

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(points.position);
      mesh.quaternion.copy(points.quaternion);
      mesh.scale.copy(points.scale);
      mesh.renderOrder = points.renderOrder;
      const parent = points.parent;
      if (parent) {
        parent.add(mesh);
        parent.remove(points);
      }
      source.dispose();
      (points.material as THREE.Material).dispose();
    }
  };
  const onLoadModel = (event: { scene?: THREE.Object3D }) => {
    if (!event.scene) return;
    convertTileScene(event.scene);
    requestRender();
  };
  tiles.addEventListener("load-model", onLoadModel);
  // UpdateOnChangePlugin only re-traverses on detected change; a periodic kick
  // keeps a slow tileset from settling in a half-loaded state.
  const watchdogTimer = window.setInterval(() => {
    if (!disposed && group.visible) {
      tiles.dispatchEvent({ type: "needs-update" });
    }
  }, 2_000);

  return {
    group,
    tiles,
    update: () => {
      if (disposed || !group.visible) return;
      // Mesh 2024 has priority: while it is fetching, the point tileset stays
      // idle rather than competing for the same connections. Two exceptions
      // keep the deferral from becoming a deadlock: the root tileset must be
      // allowed to load at all (nothing can be scheduled before it), and a
      // long stretch of mesh traffic must not starve the points forever.
      const now = performance.now();
      if (tiles.root && isDeferred()) {
        if (deferringSince === 0) deferringSince = now;
        if (now - deferringSince < MAXIMUM_DEFER_MILLISECONDS) return;
      } else {
        deferringSince = 0;
      }
      tiles.update();
    },
    setEnabled: (enabled: boolean) => {
      if (group.visible === enabled) return;
      group.visible = enabled;
      if (enabled) tiles.dispatchEvent({ type: "needs-update" });
      requestRender();
    },
    setPointSize: (size: number) => {
      if (size === pointSizeUniform.value) return;
      pointSizeUniform.value = size;
      requestRender();
    },
    setErrorTarget: (errorTarget: number) => {
      if (tiles.errorTarget === errorTarget) return;
      tiles.errorTarget = errorTarget;
      tiles.dispatchEvent({ type: "needs-update" });
    },
    notifyViewChanged: () => {
      if (!disposed && group.visible) {
        tiles.dispatchEvent({ type: "needs-update" });
      }
    },
    setResolutionFromRenderer: () =>
      tiles.setResolutionFromRenderer(camera, renderer as never),
    dispose: () => {
      disposed = true;
      window.clearInterval(watchdogTimer);
      tiles.removeEventListener("load-model", onLoadModel);
      scene.remove(group);
      tiles.dispose();
      dracoLoader.dispose();
    },
  };
};
