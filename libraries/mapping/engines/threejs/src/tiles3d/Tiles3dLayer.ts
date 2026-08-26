import { TilesRenderer } from "3d-tiles-renderer";
import {
  GLTFExtensionsPlugin,
  ImplicitTilingPlugin,
  ReorientationPlugin,
  UpdateOnChangePlugin,
} from "3d-tiles-renderer/plugins";
import { MercatorCoordinate } from "maplibre-gl";
import type {
  Map as MaplibreMap,
  CustomLayerInterface,
  CustomRenderMethodInput,
} from "maplibre-gl";
import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

import { synthesizeLodCamera } from "./lodCamera";
import {
  GLTFPrimitiveOutlineExtension,
  TILE_OUTLINE_FLAG,
} from "./primitiveOutline";

// ─────────────────────────────────────────────────────────────
//  Tiles3dLayer: a Cesium 3D Tiles tileset drawn inside MapLibre.
//
//  The same tilesets the Cesium view of an app already shows, rendered by
//  NASA-AMMOS 3DTilesRendererJS (Apache-2.0) into MapLibre's own depth buffer,
//  so the buildings sit among the 2D layers rather than on top of them.
//
//  Nothing here reads a vector source. The tileset carries its own geometry and
//  its own level of detail, and the only thing the layer needs from the map is
//  where the camera is.
// ─────────────────────────────────────────────────────────────

/**
 * How many pixels of error a tile may show before a finer one is fetched.
 * Lower asks for more detail and more downloads; this is the value the
 * 3DTilesRendererJS demos settle on.
 */
export const DEFAULT_ERROR_TARGET_PIXELS = 6;

/** A coarse target used for the first frames, so something is on screen quickly. */
const COVERAGE_ERROR_TARGET_PIXELS = 64;

const DEFAULT_CACHE_BYTES = 256 * 1024 ** 2;
const MINIMUM_CACHE_BYTES = 16 * 1024 ** 2;

/**
 * Where Draco-compressed payloads get their decoder.
 *
 * Google's hosted build, the same one the playground uses. A tileset without
 * Draco never fetches it.
 */
const DRACO_DECODER_PATH =
  "https://www.gstatic.com/draco/versioned/decoders/1.5.6/";

export interface Tiles3dLayerOptions {
  /** Pixels of allowed error, see DEFAULT_ERROR_TARGET_PIXELS. */
  errorTarget?: number;
  cacheBudgetBytes?: number;
  /** Parallel tile downloads. */
  requestConcurrency?: number;
  /** 0 to 1, applied to every tile material. */
  opacity?: number;
  /**
   * Draw the edges the tileset marks with `CESIUM_primitive_outline`, the ones
   * Cesium draws and gives no way to turn off. Defaults to on, so the two
   * views of the same tileset look alike.
   */
  outline?: boolean;
  /** Colour of those edges. */
  outlineColor?: THREE.ColorRepresentation;
  /** 0 to 1 for the edges alone. */
  outlineOpacity?: number;
}

export interface Tiles3dCustomLayer extends CustomLayerInterface {
  setErrorTarget: (pixels: number) => void;
  setOutlineVisible: (visible: boolean) => void;
  setOpacity: (opacity: number) => void;
  setVisible: (visible: boolean) => void;
  dispose: () => void;
}

/**
 * Build a MapLibre custom layer that draws a 3D Tiles tileset.
 *
 * @param layerId       unique MapLibre layer id
 * @param tilesetUrl    the tileset.json
 * @param originLngLat  where the local metre frame is anchored, normally the
 *                      map centre at the time the layer is created
 */
export function buildTiles3dLayer(
  layerId: string,
  tilesetUrl: string,
  originLngLat: [number, number],
  options: Tiles3dLayerOptions = {}
): Tiles3dCustomLayer {
  const originMerc = MercatorCoordinate.fromLngLat(originLngLat, 0);
  const meterScale = originMerc.meterInMercatorCoordinateUnits();

  let map: MaplibreMap | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  // Which context the renderer was built for. A style swap keeps the map's
  // canvas and its context, so the renderer survives it; a lost context does
  // not, and then it has to be built again.
  let rendererContext: WebGLRenderingContext | WebGL2RenderingContext | null =
    null;
  let tiles: TilesRenderer | null = null;
  let kickstartTimer = 0;
  let visible = true;
  let opacity = options.opacity ?? 1;
  let outlineVisible = options.outline ?? true;
  let errorTarget = options.errorTarget ?? DEFAULT_ERROR_TARGET_PIXELS;
  // Start coarse and tighten once the first tiles are up, so the first look at
  // the map is not an empty hole while the finest level downloads.
  let activeErrorTarget = COVERAGE_ERROR_TARGET_PIXELS;

  const scene = new THREE.Scene();
  const renderCamera = new THREE.Camera();
  const lodCamera = new THREE.PerspectiveCamera();
  const viewport = new THREE.Vector2(1, 1);
  const lookTarget = new THREE.Vector3();

  // The reorientation plugin hands back a frame with x west and z north, while
  // MapLibre's matrix below is built for x east and z south. Half a turn about
  // the up axis reconciles them. It lives in a parent group because the plugin
  // rewrites tiles.group's own transform whenever the tileset root loads.
  const orientationGroup = new THREE.Group();
  orientationGroup.rotation.y = Math.PI;
  scene.add(orientationGroup);

  // Lights belong to the scene, not to a particular attachment, so they are
  // built once. Adding them from onAdd would stack another set on every
  // re-attach after a style rebuild.
  const ambient = new THREE.AmbientLight(0xffffff, 0.65);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(120, 260, -160);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xc8d8ff, 0.35);
  fill.position.set(-80, 100, 60);
  scene.add(fill);

  // THREE is y-up, the Mercator frame MapLibre projects into is z-up.
  const rotationX = new THREE.Matrix4().makeRotationAxis(
    new THREE.Vector3(1, 0, 0),
    Math.PI / 2
  );

  const applyOpacity = () => {
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const material of materials) {
        material.transparent = opacity < 1;
        material.opacity = opacity;
        material.depthWrite = opacity >= 1;
        material.needsUpdate = true;
      }
    });
  };

  // Tiles arrive over time, so a switched-off outline has to be re-applied to
  // whatever came in since. Only walked while the answer is "off"; the lines
  // are built visible.
  const applyOutlineVisibility = () => {
    scene.traverse((object) => {
      if (object.userData[TILE_OUTLINE_FLAG]) {
        object.visible = outlineVisible;
      }
    });
  };

  const stopKickstart = () => {
    if (kickstartTimer) {
      window.clearInterval(kickstartTimer);
      kickstartTimer = 0;
    }
  };

  // tiles.update() only runs from render(), and render() only runs when
  // MapLibre has a reason to draw. Until the first tiles are up there is no
  // such reason, so nudge it until the pipeline has work. This stops on its
  // own rather than repainting forever, which would keep the map from ever
  // going idle and stall everything that waits on that.
  const startKickstart = () => {
    if (kickstartTimer) return;
    kickstartTimer = window.setInterval(() => {
      if (!tiles || !map) {
        stopKickstart();
        return;
      }
      if (tiles.group.children.length > 0) {
        // Something is on screen: tighten the target and let the normal
        // repaint cycle carry it from here.
        activeErrorTarget = errorTarget;
        tiles.errorTarget = errorTarget;
        stopKickstart();
      }
      map.triggerRepaint();
    }, 250);
  };

  const layer: Tiles3dCustomLayer = {
    id: layerId,
    type: "custom",
    renderingMode: "3d",

    onAdd(mapInstance: MaplibreMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
      map = mapInstance;

      // A style rebuild takes every custom layer off the map and the manager
      // puts this one back on, so onAdd can run again on a layer that is still
      // fully built. Only what is missing is built.
      if (!renderer || rendererContext !== gl) {
        renderer?.dispose();
        renderer = new THREE.WebGLRenderer({
          canvas: mapInstance.getCanvas(),
          context: gl,
          antialias: true,
        });
        renderer.autoClear = false;
        rendererContext = gl;
      }

      if (tiles) {
        // The tileset is still loaded and still in the scene. Nothing to fetch
        // again, it only has to be drawn. If the style swap caught it before
        // its first tiles arrived, it also needs the nudge back.
        if (tiles.group.children.length === 0) {
          startKickstart();
        }
        mapInstance.triggerRepaint();
        return;
      }

      tiles = new TilesRenderer(tilesetUrl);
      // 3D Tiles 1.1 implicit tiling: the tileset names its content with a
      // {level}/{x}/{y} template instead of listing every child.
      tiles.registerPlugin(new ImplicitTilingPlugin());
      tiles.registerPlugin(new UpdateOnChangePlugin());
      const dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath(DRACO_DECODER_PATH);
      tiles.registerPlugin(
        new GLTFExtensionsPlugin({
          dracoLoader,
          plugins: [
            (parser: unknown) =>
              new GLTFPrimitiveOutlineExtension(
                parser as ConstructorParameters<
                  typeof GLTFPrimitiveOutlineExtension
                >[0],
                {
                  color: options.outlineColor ?? 0x000000,
                  opacity: options.outlineOpacity ?? 1,
                }
              ),
          ],
        })
      );
      // The tileset is georeferenced in ECEF. This drops it into a local
      // east-north-up frame at the layer origin.
      tiles.registerPlugin(
        new ReorientationPlugin({
          lat: THREE.MathUtils.degToRad(originLngLat[1]),
          lon: THREE.MathUtils.degToRad(originLngLat[0]),
          height: 0,
        })
      );

      tiles.errorTarget = activeErrorTarget;
      tiles.loadSiblings = false;
      tiles.loadAncestors = false;
      tiles.downloadQueue.maxJobs = Math.max(
        1,
        Math.floor(options.requestConcurrency ?? 6)
      );
      tiles.parseQueue.maxJobs = 4;
      tiles.lruCache.maxBytesSize = Math.max(
        MINIMUM_CACHE_BYTES,
        Math.floor(options.cacheBudgetBytes ?? DEFAULT_CACHE_BYTES)
      );
      orientationGroup.add(tiles.group);

      startKickstart();
    },

    render(
      gl: WebGLRenderingContext | WebGL2RenderingContext,
      renderOptions: CustomRenderMethodInput
    ) {
      if (!map || !renderer || !tiles || !visible) return;

      const mainMatrix = new THREE.Matrix4().fromArray(
        renderOptions.defaultProjectionData.mainMatrix as unknown as number[]
      );
      const localFromScene = new THREE.Matrix4()
        .makeTranslation(originMerc.x, originMerc.y, originMerc.z)
        .scale(new THREE.Vector3(meterScale, -meterScale, meterScale))
        .multiply(rotationX);
      renderCamera.projectionMatrix = mainMatrix.multiply(localFromScene);
      renderCamera.projectionMatrixInverse
        .copy(renderCamera.projectionMatrix)
        .invert();

      renderer.getDrawingBufferSize(viewport);
      const posed = synthesizeLodCamera(
        lodCamera,
        map,
        { originMerc, meterScale, viewport },
        lookTarget
      );
      if (posed) {
        tiles.setCamera(lodCamera);
        tiles.setResolution(
          lodCamera,
          Math.max(1, viewport.x),
          Math.max(1, viewport.y)
        );
        scene.updateMatrixWorld(true);
        tiles.update();
        if (opacity < 1) {
          applyOpacity();
        }
        if (!outlineVisible) {
          applyOutlineVisibility();
        }
      }

      // MapLibre's depth range is not the one THREE resets to, and the symbol
      // layers drawn afterwards have to test against the same depth space the
      // buildings wrote into.
      const savedDepthRange = gl.getParameter(gl.DEPTH_RANGE) as Float32Array;
      renderer.resetState();
      renderer.render(scene, renderCamera);
      gl.depthRange(savedDepthRange[0], savedDepthRange[1]);
    },

    // Coming off the map is not the end of the layer. MapLibre cannot diff a
    // style while a custom layer is attached (`Custom layers cannot be
    // serialized`), so every style change rebuilds the style from scratch and
    // takes this layer off on the way; the manager puts the same object back.
    // Dropping the tileset here would mean downloading all of it again on each
    // of those. `dispose` ends the layer, and only the manager calls it.
    onRemove() {
      stopKickstart();
      map = null;
    },

    setErrorTarget(pixels: number) {
      errorTarget = pixels;
      if (tiles && activeErrorTarget !== COVERAGE_ERROR_TARGET_PIXELS) {
        activeErrorTarget = pixels;
        tiles.errorTarget = pixels;
        map?.triggerRepaint();
      }
    },

    setOutlineVisible(next: boolean) {
      outlineVisible = next;
      applyOutlineVisibility();
      map?.triggerRepaint();
    },

    setOpacity(next: number) {
      opacity = Math.max(0, Math.min(1, next));
      applyOpacity();
      map?.triggerRepaint();
    },

    setVisible(next: boolean) {
      visible = next;
      map?.triggerRepaint();
    },

    dispose() {
      stopKickstart();
      if (tiles) {
        orientationGroup.remove(tiles.group);
        tiles.dispose();
        tiles = null;
      }
      renderer?.dispose();
      renderer = null;
      rendererContext = null;
      map = null;
    },
  };

  return layer;
}
