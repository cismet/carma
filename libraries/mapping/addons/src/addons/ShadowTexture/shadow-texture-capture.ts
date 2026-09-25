import * as THREE from "three";

import { degToRadNumeric } from "@carma-units";
import {
  fitShadowMap,
  getSunDiscSampleOffset,
  shadowRasterOffset,
  SUN_ANGULAR_RADIUS_RAD,
} from "@carma-mapping/shadow-simulation/core";

import {
  disposeDzbPrmGlbRoot,
  loadDzbPrmGlbPartsIntoRoot,
  type DzbPrmGlbLoadProgress,
  type DzbPrmGlbVisibility,
} from "./shadow-texture-assets";
import {
  createPrintedModelCaptureCamera,
  fitPrintedCaptureBounds,
} from "./shadow-texture-camera";
import {
  dzbPrmLocalToLonLat,
  dzbPrmPhysicalDirectionToProjected,
} from "./shadow-texture-georef";

export type DzbPrmShadowImage = Readonly<{
  canvas: HTMLCanvasElement;
  coordinates: [
    [number, number],
    [number, number],
    [number, number],
    [number, number]
  ];
}>;

export type DzbPrmShadowViewBounds = Readonly<{
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}>;

type CachedShadowFrame = Readonly<{
  blob: Blob;
  width: number;
  height: number;
  coordinates: DzbPrmShadowImage["coordinates"];
}>;

/** Compressed, bounded cache for one story view/asset configuration. */
export const createDzbPrmShadowFrameCache = (maxBytes = 512 * 1024 ** 2) => {
  const frames = new Map<string, CachedShadowFrame>();
  let bytes = 0;
  let generation = 0;

  return {
    get byteLength() {
      return bytes;
    },
    get frameCount() {
      return frames.size;
    },
    clear() {
      generation += 1;
      frames.clear();
      bytes = 0;
    },
    async get(key: string): Promise<DzbPrmShadowImage | null> {
      const frame = frames.get(key);
      if (!frame) return null;
      const startedAtGeneration = generation;
      frames.delete(key);
      frames.set(key, frame);
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(frame.blob);
      } catch {
        if (frames.get(key) === frame) {
          frames.delete(key);
          bytes -= frame.blob.size;
        }
        return null;
      }
      try {
        if (startedAtGeneration !== generation || frames.get(key) !== frame)
          return null;
        const canvas = document.createElement("canvas");
        canvas.width = frame.width;
        canvas.height = frame.height;
        const context = canvas.getContext("2d");
        if (!context) return null;
        context.drawImage(bitmap, 0, 0);
        return { canvas, coordinates: frame.coordinates };
      } finally {
        bitmap.close();
      }
    },
    async put(key: string, image: DzbPrmShadowImage): Promise<void> {
      const startedAtGeneration = generation;
      const blob = await new Promise<Blob | null>((resolve) =>
        image.canvas.toBlob(resolve, "image/webp", 0.9)
      );
      if (!blob || startedAtGeneration !== generation || blob.size > maxBytes) {
        return;
      }
      const previous = frames.get(key);
      if (previous) bytes -= previous.blob.size;
      frames.delete(key);
      frames.set(key, {
        blob,
        width: image.canvas.width,
        height: image.canvas.height,
        coordinates: image.coordinates,
      });
      bytes += blob.size;
      while (bytes > maxBytes) {
        const oldestKey = frames.keys().next().value;
        if (oldestKey === undefined) break;
        bytes -= frames.get(oldestKey)!.blob.size;
        frames.delete(oldestKey);
      }
    },
  };
};

type CaptureOptions = Readonly<{
  assetBaseUrl: string;
  visibility: DzbPrmGlbVisibility;
  sunAzimuthDegrees: number;
  sunElevationDegrees: number;
  pixelsPerMeter: number;
  maxImageDimension: 4096 | 8192;
  outputSize?: Readonly<{ width: number; height: number }>;
  strictOutputSize?: boolean;
  sunDiscSamples?: 1 | typeof DZB_SHADOW_SUN_DISC_SAMPLES;
  viewBounds?: DzbPrmShadowViewBounds;
  perspective?: Readonly<{
    cameraHeightMeters: number;
    boardBottomHeightMeters: number;
    boardBounds: DzbPrmShadowViewBounds;
  }>;
  isCancelled: () => boolean;
  onProgress?: (progress: DzbPrmGlbLoadProgress) => void;
  onSampleProgress?: (sample: number, total: number) => void;
}>;

/** Bounded proof-of-concept: each sample renders one distinct solar direction. */
export const DZB_SHADOW_SUN_DISC_SAMPLES = 64;

/** The derived GLB already contains local metre coordinates in Y-up axes. */
const createCaptureRoot = () => {
  const root = new THREE.Group();
  root.name = "DZ_B_PRM GLB shadow capture";
  return root;
};

const boxCorners = (bounds: THREE.Box3) => {
  const points: THREE.Vector3[] = [];
  for (const x of [bounds.min.x, bounds.max.x]) {
    for (const y of [bounds.min.y, bounds.max.y]) {
      for (const z of [bounds.min.z, bounds.max.z]) {
        points.push(new THREE.Vector3(x, y, z));
      }
    }
  }
  return points;
};

/** One persistent WebGL context, independent of MapLibre's viewport/context. */
export const createDzbPrmShadowCapture = () => {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false });
  renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  const depthMaterial = new THREE.MeshDepthMaterial({ side: THREE.DoubleSide });
  depthMaterial.colorWrite = false;
  const shadowMaterial = new THREE.ShadowMaterial({
    color: 0x000000,
    opacity: 1,
    side: THREE.DoubleSide,
  });
  shadowMaterial.depthFunc = THREE.EqualDepth;
  shadowMaterial.depthWrite = false;
  let disposed = false;

  const render = async ({
    assetBaseUrl,
    visibility,
    sunAzimuthDegrees,
    sunElevationDegrees,
    pixelsPerMeter,
    maxImageDimension,
    outputSize,
    strictOutputSize = false,
    sunDiscSamples = DZB_SHADOW_SUN_DISC_SAMPLES,
    viewBounds,
    perspective,
    isCancelled,
    onProgress,
    onSampleProgress,
  }: CaptureOptions): Promise<DzbPrmShadowImage | null> => {
    if (disposed || !Object.values(visibility).some(Boolean)) {
      return null;
    }
    const scene = new THREE.Scene();
    const root = createCaptureRoot();
    let shadowLight: THREE.DirectionalLight | null = null;
    scene.add(root);
    try {
      await loadDzbPrmGlbPartsIntoRoot({
        root,
        assetBaseUrl,
        visibility,
        isCancelled,
        onProgress,
      });
      if (disposed || isCancelled()) return null;
      root.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = true;
        object.receiveShadow = true;
      });
      root.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(root);
      if (bounds.isEmpty()) return null;
      const imageBounds = bounds.clone();
      if (perspective) {
        const footprint = fitPrintedCaptureBounds(
          new THREE.Box3(
            new THREE.Vector3(
              perspective.boardBounds.minX,
              perspective.boardBottomHeightMeters,
              perspective.boardBounds.minZ
            ),
            new THREE.Vector3(
              perspective.boardBounds.maxX,
              perspective.boardBottomHeightMeters,
              perspective.boardBounds.maxZ
            )
          )
        );
        imageBounds.min.x = footprint.min.x;
        imageBounds.max.x = footprint.max.x;
        imageBounds.min.z = footprint.min.z;
        imageBounds.max.z = footprint.max.z;
      } else if (viewBounds) {
        imageBounds.min.x = Math.max(imageBounds.min.x, viewBounds.minX);
        imageBounds.max.x = Math.min(imageBounds.max.x, viewBounds.maxX);
        imageBounds.min.z = Math.max(imageBounds.min.z, viewBounds.minZ);
        imageBounds.max.z = Math.min(imageBounds.max.z, viewBounds.maxZ);
      }
      if (
        imageBounds.min.x >= imageBounds.max.x ||
        imageBounds.min.z >= imageBounds.max.z
      ) {
        return null;
      }
      const size = imageBounds.getSize(new THREE.Vector3());
      const center = imageBounds.getCenter(new THREE.Vector3());
      const gl = renderer.getContext();
      const maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
      const maxImageSize = Math.max(
        1,
        Math.min(
          maxImageDimension,
          renderer.capabilities.maxTextureSize,
          gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number,
          maxViewport[0],
          maxViewport[1]
        )
      );
      const requestedPixelsPerMeter = outputSize
        ? Math.min(outputSize.width / size.x, outputSize.height / size.z)
        : pixelsPerMeter;
      if (
        strictOutputSize &&
        Math.max(
          size.x * requestedPixelsPerMeter,
          size.z * requestedPixelsPerMeter
        ) > maxImageSize
      ) {
        throw new Error(
          `Requested ${outputSize?.width}×${outputSize?.height} capture exceeds this GPU's ${maxImageSize}px limit`
        );
      }
      const effectivePixelsPerMeter = Math.min(
        Math.max(1 / 16, requestedPixelsPerMeter),
        maxImageSize / Math.max(size.x, size.z)
      );
      const width = Math.max(
        1,
        Math.min(maxImageSize, Math.ceil(size.x * effectivePixelsPerMeter))
      );
      const height = Math.max(
        1,
        Math.min(maxImageSize, Math.ceil(size.z * effectivePixelsPerMeter))
      );
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return null;
      const image: DzbPrmShadowImage = {
        canvas,
        coordinates: [
          dzbPrmLocalToLonLat(imageBounds.min.x, imageBounds.min.z),
          dzbPrmLocalToLonLat(imageBounds.max.x, imageBounds.min.z),
          dzbPrmLocalToLonLat(imageBounds.max.x, imageBounds.max.z),
          dzbPrmLocalToLonLat(imageBounds.min.x, imageBounds.max.z),
        ],
      };
      if (sunElevationDegrees <= 0) {
        context.fillStyle = "#000000";
        context.fillRect(0, 0, width, height);
        return image;
      }
      const camera = perspective
        ? createPrintedModelCaptureCamera(
            imageBounds,
            perspective.boardBottomHeightMeters,
            perspective.cameraHeightMeters
          )
        : new THREE.OrthographicCamera(
            -size.x / 2,
            size.x / 2,
            size.z / 2,
            -size.z / 2,
            0.1,
            Math.max(size.x, size.z, size.y) * 3 + 100
          );
      if (!perspective) {
        camera.up.set(0, 0, -1);
        camera.position.set(
          center.x,
          bounds.max.y + Math.max(size.x, size.z, 100),
          center.z
        );
        camera.lookAt(center);
        camera.updateMatrixWorld(true);
      }

      const azimuth = degToRadNumeric(sunAzimuthDegrees);
      const elevation = degToRadNumeric(sunElevationDegrees);
      const physicalDirectionToSun = new THREE.Vector3(
        Math.sin(azimuth) * Math.cos(elevation),
        Math.sin(elevation),
        -Math.cos(azimuth) * Math.cos(elevation)
      );
      const directionToSun = new THREE.Vector3(
        ...dzbPrmPhysicalDirectionToProjected(
          physicalDirectionToSun.x,
          physicalDirectionToSun.y,
          physicalDirectionToSun.z
        )
      ).normalize();
      const sun = new THREE.DirectionalLight(0xffffff, 1);
      shadowLight = sun;
      const fullSize = bounds.getSize(new THREE.Vector3());
      const fullCenter = bounds.getCenter(new THREE.Vector3());
      const sunDistance = Math.max(fullSize.x, fullSize.z, fullSize.y, 100) * 2;
      sun.position
        .copy(fullCenter)
        .addScaledVector(directionToSun, sunDistance);
      sun.target.position.copy(fullCenter);
      sun.castShadow = true;
      scene.add(sun, sun.target);
      scene.updateMatrixWorld(true);
      sun.shadow.updateMatrices(sun);
      const fullLightBounds = new THREE.Box3().setFromPoints(
        boxCorners(bounds).map((point) =>
          point.applyMatrix4(sun.shadow.camera.matrixWorldInverse)
        )
      );
      // Fit shadow texels to the visible receivers, but retain the complete
      // caster depth range and render every GLB part into the light pass.
      const receiverLightBounds = new THREE.Box3().setFromPoints(
        boxCorners(imageBounds).map((point) =>
          point.applyMatrix4(sun.shadow.camera.matrixWorldInverse)
        )
      );
      const lightCamera = sun.shadow.camera as THREE.OrthographicCamera;
      const guard = 20;
      const sunDiscGuard =
        sunDiscSamples > 1 ? Math.tan(SUN_ANGULAR_RADIUS_RAD) * sunDistance : 0;
      // Decision: use the shared ground-texel fit for this single-extent image.
      // A light-space Y pixel covers 1/sin(elevation) more horizontal ground;
      // see libraries/mapping/shadow-simulation/three/README.md#controls.
      const groundPixelMeters = Math.max(size.x / width, size.z / height);
      const shadowFit = fitShadowMap(
        {
          left: receiverLightBounds.min.x - guard,
          right: receiverLightBounds.max.x + guard,
          bottom: receiverLightBounds.min.y - guard,
          top: receiverLightBounds.max.y + guard,
        },
        {
          mapSize: maxImageDimension,
          maxMapSize: Math.min(
            maxImageDimension,
            renderer.capabilities.maxTextureSize,
            gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number
          ),
          elevationSine: directionToSun.y,
          sunDiscGuardMeters: sunDiscGuard,
          groundTexelFit: true,
          groundTexelTargetMeters: groundPixelMeters,
        }
      );
      sun.shadow.mapSize.set(shadowFit.mapWidth, shadowFit.mapHeight);
      lightCamera.left = shadowFit.left;
      lightCamera.right = shadowFit.right;
      lightCamera.bottom = shadowFit.bottom;
      lightCamera.top = shadowFit.top;
      lightCamera.near = Math.max(
        0.1,
        -fullLightBounds.max.z - guard - sunDiscGuard
      );
      lightCamera.far = Math.max(
        lightCamera.near + 1,
        -fullLightBounds.min.z + guard + sunDiscGuard
      );
      // Match the shadow runtime's achieved-texel depth bias. A fixed bias
      // caused broad self-shadow stippling when this capture fitted kilometres.
      const achievedTexelMeters = Math.max(
        shadowFit.metersPerTexelX,
        shadowFit.metersPerTexelY
      );
      const elevationBiasSine = Math.max(0.2, directionToSun.y);
      sun.shadow.normalBias = THREE.MathUtils.clamp(
        (achievedTexelMeters * 1.2) / elevationBiasSine,
        0.05,
        8
      );
      sun.shadow.bias = -THREE.MathUtils.clamp(
        (achievedTexelMeters * 4) / (lightCamera.far - lightCamera.near),
        Number.EPSILON,
        0.01
      );
      lightCamera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      renderer.clear();
      // Capture depth, then only black shadow alpha. No GLB PBR material is
      // rendered into the draped canvas; lit pixels remain transparent.
      // When the catalog bridge accompanies Bestand/Neu, keep it out of the
      // nadir receiver depth but restore it for the light pass below. Its
      // shadow then lands on the BuGa GLBs instead of its own deck pixels.
      const catalogCaster =
        visibility.catalogBridge &&
        (visibility.bridge || visibility.bridgeExisting)
          ? root.children.find(
              (child) => child.userData.dzbPrmGlbPartId === "catalogBridge"
            )
          : undefined;
      if (catalogCaster) catalogCaster.visible = false;
      renderer.shadowMap.enabled = false;
      scene.overrideMaterial = depthMaterial;
      renderer.render(scene, camera);
      if (catalogCaster) catalogCaster.visible = true;
      renderer.shadowMap.enabled = true;
      scene.overrideMaterial = shadowMaterial;
      const tangentA = new THREE.Vector3();
      if (Math.abs(physicalDirectionToSun.y) > 0.99) tangentA.set(1, 0, 0);
      else
        tangentA
          .crossVectors(new THREE.Vector3(0, 1, 0), physicalDirectionToSun)
          .normalize();
      const tangentB = new THREE.Vector3().crossVectors(
        physicalDirectionToSun,
        tangentA
      );
      context.globalCompositeOperation = "lighter";
      context.globalAlpha = 1 / sunDiscSamples;
      for (let sample = 0; sample < sunDiscSamples; sample += 1) {
        if (sample > 0) {
          onSampleProgress?.(sample, sunDiscSamples);
          await new Promise<void>((resolve) =>
            requestAnimationFrame(() => resolve())
          );
        }
        if (disposed || isCancelled()) return null;
        const sampleDirection = physicalDirectionToSun.clone();
        if (sunDiscSamples > 1) {
          const {
            angularRadius,
            tangentA: offsetA,
            tangentB: offsetB,
          } = getSunDiscSampleOffset(sample, sunDiscSamples);
          const tangentDirection = tangentA
            .clone()
            .multiplyScalar(offsetA)
            .addScaledVector(tangentB, offsetB)
            .normalize();
          sampleDirection
            .multiplyScalar(Math.cos(angularRadius))
            .addScaledVector(tangentDirection, Math.sin(angularRadius))
            .normalize();
        }
        const projectedSampleDirection = new THREE.Vector3(
          ...dzbPrmPhysicalDirectionToProjected(
            sampleDirection.x,
            sampleDirection.y,
            sampleDirection.z
          )
        ).normalize();
        sun.position
          .copy(fullCenter)
          .addScaledVector(projectedSampleDirection, sunDistance);
        const [phaseX, phaseY] =
          sunDiscSamples > 1 ? shadowRasterOffset(sample) : [0, 0];
        const shiftX =
          (phaseX * (shadowFit.right - shadowFit.left)) / shadowFit.mapWidth;
        const shiftY =
          (phaseY * (shadowFit.top - shadowFit.bottom)) / shadowFit.mapHeight;
        lightCamera.left = shadowFit.left + shiftX;
        lightCamera.right = shadowFit.right + shiftX;
        lightCamera.bottom = shadowFit.bottom + shiftY;
        lightCamera.top = shadowFit.top + shiftY;
        lightCamera.updateProjectionMatrix();
        sun.updateMatrixWorld(true);
        sun.shadow.updateMatrices(sun);
        sun.shadow.needsUpdate = true;
        renderer.clear(true, false, false);
        renderer.render(scene, camera);
        context.drawImage(renderer.domElement, 0, 0);
      }
      onSampleProgress?.(sunDiscSamples, sunDiscSamples);
      context.globalAlpha = 1;
      context.globalCompositeOperation = "source-over";
      return image;
    } finally {
      renderer.shadowMap.enabled = true;
      scene.overrideMaterial = null;
      shadowLight?.dispose();
      disposeDzbPrmGlbRoot(root);
      scene.clear();
    }
  };

  return {
    render,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      shadowMaterial.dispose();
      depthMaterial.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
};
