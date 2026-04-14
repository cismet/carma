import { MercatorCoordinate } from "maplibre-gl";
import type {
  Map as MaplibreMap,
  CustomLayerInterface,
  CustomRenderMethodInput,
} from "maplibre-gl";
import * as THREE from "three";
import { load } from "@loaders.gl/core";
import { LASLoader } from "@loaders.gl/las";
import { getProj4Converter } from "@carma-geo/proj";

export interface PointCloudLayerOptions {
  id: string;
  url: string;
  /** EPSG code for the source LAS, e.g. "EPSG:25832" */
  sourceCrs?: "EPSG:25832" | "EPSG:4326";
  /** Point size in pixels when sizeAttenuation is false, else in scene units */
  pointSize?: number;
  /** Fallback color when the LAS has no RGB attribute */
  fallbackColor?: number;
  onLoadStart?: () => void;
  onLoaded?: (stats: {
    count: number;
    hasColor: boolean;
    centerLngLat: [number, number];
    bboxSrc: { minX: number; minY: number; maxX: number; maxY: number };
    zRange: { min: number; max: number };
  }) => void;
  onLoadError?: (err: unknown) => void;
}

/**
 * Minimal MapLibre custom layer that renders a LAS point cloud as THREE.Points.
 * Scene convention matches GenericThreeLayer: x=merc east, y=elevation (up),
 * z=merc south, origin at the point cloud's bbox centroid.
 */
export class PointCloudLayer implements CustomLayerInterface {
  id: string;
  type = "custom" as const;
  renderingMode = "3d" as const;

  private url: string;
  private sourceCrs: "EPSG:25832" | "EPSG:4326";
  private pointSize: number;
  private fallbackColor: number;
  private onLoadStart?: PointCloudLayerOptions["onLoadStart"];
  private onLoaded?: PointCloudLayerOptions["onLoaded"];
  private onLoadError?: PointCloudLayerOptions["onLoadError"];

  private map?: MaplibreMap;
  private renderer?: THREE.WebGLRenderer;
  private camera = new THREE.Camera();
  private scene = new THREE.Scene();
  private points?: THREE.Points;
  private originMerc?: MercatorCoordinate;
  private mScale = 1;

  // Cached data so style swaps don't trigger a reload
  private cachedPositions?: Float32Array;
  private cachedColors?: Float32Array;
  private cachedHasColor = false;
  private loadPromise?: Promise<void>;

  constructor(opts: PointCloudLayerOptions) {
    this.id = opts.id;
    this.url = opts.url;
    this.sourceCrs = opts.sourceCrs ?? "EPSG:25832";
    this.pointSize = opts.pointSize ?? 2;
    this.fallbackColor = opts.fallbackColor ?? 0x66aaff;
    this.onLoadStart = opts.onLoadStart;
    this.onLoaded = opts.onLoaded;
    this.onLoadError = opts.onLoadError;
  }

  onAdd(
    map: MaplibreMap,
    gl: WebGLRenderingContext | WebGL2RenderingContext
  ): void {
    this.map = map;

    this.renderer = new THREE.WebGLRenderer({
      canvas: map.getCanvas(),
      context: gl as WebGLRenderingContext,
      antialias: true,
    });
    this.renderer.autoClear = false;

    if (this.cachedPositions) {
      // Re-mount after a style swap: rebuild scene objects from cached data
      this.buildSceneFromCache();
      this.map.triggerRepaint();
    } else if (!this.loadPromise) {
      this.loadPromise = this.loadAndBuild().catch((err) => {
        console.error("[POINTCLOUD] load failed", err);
        this.onLoadError?.(err);
      });
    }
  }

  private buildSceneFromCache(): void {
    if (!this.cachedPositions) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.BufferAttribute(this.cachedPositions, 3)
    );
    if (this.cachedColors) {
      geo.setAttribute(
        "color",
        new THREE.BufferAttribute(this.cachedColors, 3)
      );
    }
    const material = new THREE.PointsMaterial({
      size: this.pointSize,
      sizeAttenuation: false,
      vertexColors: this.cachedHasColor,
      color: this.cachedHasColor ? 0xffffff : this.fallbackColor,
    });
    this.points = new THREE.Points(geo, material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  private async loadAndBuild(): Promise<void> {
    console.log("[POINTCLOUD] loading", this.url);
    this.onLoadStart?.();
    const t0 = performance.now();

    const data = await load(this.url, LASLoader, {
      las: { fp64: true, skip: 1, colorDepth: "auto" },
    });

    const positionsRaw = data.attributes?.POSITION?.value as
      | Float32Array
      | Float64Array
      | undefined;
    if (!positionsRaw || positionsRaw.length === 0) {
      console.warn("[POINTCLOUD] no positions in LAS", data);
      return;
    }

    const pointCount = positionsRaw.length / 3;
    const colorAttr = data.attributes?.COLOR_0;
    const hasColor = !!colorAttr?.value;

    // Compute bbox in source CRS to anchor the scene origin at data center
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < positionsRaw.length; i += 3) {
      const x = positionsRaw[i];
      const y = positionsRaw[i + 1];
      const z = positionsRaw[i + 2];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const originSrcX = (minX + maxX) / 2;
    const originSrcY = (minY + maxY) / 2;

    const toWgs84 = getProj4Converter(this.sourceCrs, "EPSG:4326");
    const originWgs84 = toWgs84.forward([originSrcX, originSrcY]) as number[];
    const originMerc = MercatorCoordinate.fromLngLat(
      [originWgs84[0], originWgs84[1]],
      0
    );
    const mScale = originMerc.meterInMercatorCoordinateUnits();
    this.originMerc = originMerc;
    this.mScale = mScale;

    console.log(
      "[POINTCLOUD] bbox src:",
      `X[${minX.toFixed(1)}..${maxX.toFixed(1)}]`,
      `Y[${minY.toFixed(1)}..${maxY.toFixed(1)}]`,
      `Z[${minZ.toFixed(1)}..${maxZ.toFixed(1)}]`
    );
    console.log(
      "[POINTCLOUD] origin src:",
      originSrcX.toFixed(1),
      originSrcY.toFixed(1),
      "→ lng/lat:",
      originWgs84[0].toFixed(6),
      originWgs84[1].toFixed(6),
      "| points:",
      pointCount,
      "hasColor:",
      hasColor
    );

    // Transform all points to local scene coords
    // scene.x = (merc.x - origin.x) / mScale
    // scene.y = elevation (meters)
    // scene.z = (merc.y - origin.y) / mScale
    //
    // Inlined mercator math (matches maplibre-gl's MercatorCoordinate):
    //   mercX(lng) = (180 + lng) / 360
    //   mercY(lat) = (180 - 180/PI * ln(tan(PI/4 + lat*PI/360))) / 360
    //
    // Processed in batches with setTimeout yields so the UI stays responsive.
    const sceneXYZ = new Float32Array(pointCount * 3);
    const originMercX = originMerc.x;
    const originMercY = originMerc.y;
    const DEG_TO_RAD_OVER_2 = Math.PI / 360;
    const ONE_OVER_PI_TIMES_180 = 180 / Math.PI;
    const BATCH = 500_000;
    const yieldToUI = () =>
      new Promise<void>((resolve) => setTimeout(resolve, 0));

    for (let batchStart = 0; batchStart < pointCount; batchStart += BATCH) {
      const batchEnd = Math.min(batchStart + BATCH, pointCount);
      for (let i = batchStart; i < batchEnd; i++) {
        const srcX = positionsRaw[i * 3 + 0];
        const srcY = positionsRaw[i * 3 + 1];
        const srcZ = positionsRaw[i * 3 + 2];
        const wgs = toWgs84.forward([srcX, srcY]) as number[];
        const lng = wgs[0];
        const lat = wgs[1];
        const mx = (180 + lng) / 360;
        const my =
          (180 -
            ONE_OVER_PI_TIMES_180 *
              Math.log(Math.tan(Math.PI / 4 + lat * DEG_TO_RAD_OVER_2))) /
          360;
        sceneXYZ[i * 3 + 0] = (mx - originMercX) / mScale;
        sceneXYZ[i * 3 + 1] = srcZ;
        sceneXYZ[i * 3 + 2] = (my - originMercY) / mScale;
      }
      if (batchEnd < pointCount) await yieldToUI();
    }

    this.cachedPositions = sceneXYZ;
    this.cachedHasColor = hasColor;

    if (hasColor && colorAttr) {
      const src = colorAttr.value as Uint8Array | Uint16Array;
      const stride = colorAttr.size ?? 3;
      // Detect 16-bit vs 8-bit from actual data
      let maxVal = 0;
      const sampleCount = Math.min(src.length, 50000);
      for (let i = 0; i < sampleCount; i++) {
        if (src[i] > maxVal) maxVal = src[i];
      }
      const divisor = maxVal > 255 ? 65535 : 255;
      // Scan all channels across the full dataset to compute true distribution
      let maxR = 0, maxG = 0, maxB = 0;
      let sumR = 0, sumG = 0, sumB = 0;
      let nonBlackCount = 0;
      for (let i = 0; i < pointCount; i++) {
        const r = src[i * stride + 0];
        const g = src[i * stride + 1];
        const b = src[i * stride + 2];
        if (r > maxR) maxR = r;
        if (g > maxG) maxG = g;
        if (b > maxB) maxB = b;
        sumR += r;
        sumG += g;
        sumB += b;
        if (r > 0 || g > 0 || b > 0) nonBlackCount++;
      }
      const samples: number[][] = [];
      for (let s = 0; s < 6; s++) {
        const i = Math.floor((pointCount * s) / 6);
        samples.push([
          src[i * stride + 0],
          src[i * stride + 1],
          src[i * stride + 2],
        ]);
      }
      console.log(
        "[POINTCLOUD] color:",
        "ctor:", (src as Uint8Array | Uint16Array).constructor.name,
        "stride:", stride,
        "divisor:", divisor,
        "len:", src.length,
        "max RGB:", [maxR, maxG, maxB],
        "mean RGB:",
        [
          (sumR / pointCount).toFixed(1),
          (sumG / pointCount).toFixed(1),
          (sumB / pointCount).toFixed(1),
        ],
        "nonBlack:", nonBlackCount,
        "/", pointCount,
        `(${((nonBlackCount / pointCount) * 100).toFixed(1)}%)`,
        "samples:", samples
      );
      const out = new Float32Array(pointCount * 3);
      for (let i = 0; i < pointCount; i++) {
        out[i * 3 + 0] = src[i * stride + 0] / divisor;
        out[i * 3 + 1] = src[i * stride + 1] / divisor;
        out[i * 3 + 2] = src[i * stride + 2] / divisor;
      }
      this.cachedColors = out;
    }

    this.buildSceneFromCache();

    const dt = (performance.now() - t0).toFixed(0);
    console.log(`[POINTCLOUD] ready in ${dt}ms (${pointCount} pts)`);
    this.onLoaded?.({
      count: pointCount,
      hasColor,
      centerLngLat: [originWgs84[0], originWgs84[1]],
      bboxSrc: { minX, minY, maxX, maxY },
      zRange: { min: minZ, max: maxZ },
    });

    this.map?.triggerRepaint();
  }

  render(
    gl: WebGLRenderingContext | WebGL2RenderingContext,
    options: CustomRenderMethodInput
  ): void {
    if (!this.originMerc || !this.renderer) return;

    const originMerc = this.originMerc;
    const mScale = this.mScale;

    const rotationX = new THREE.Matrix4().makeRotationAxis(
      new THREE.Vector3(1, 0, 0),
      Math.PI / 2
    );
    const m = new THREE.Matrix4().fromArray(
      options.defaultProjectionData.mainMatrix as unknown as number[]
    );
    const l = new THREE.Matrix4()
      .makeTranslation(originMerc.x, originMerc.y, originMerc.z)
      .scale(new THREE.Vector3(mScale, -mScale, mScale))
      .multiply(rotationX);

    this.camera.projectionMatrix = m.multiply(l);
    this.camera.projectionMatrixInverse
      .copy(this.camera.projectionMatrix)
      .invert();

    const savedDepthRange = gl.getParameter(gl.DEPTH_RANGE) as Float32Array;
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    gl.depthRange(savedDepthRange[0], savedDepthRange[1]);
  }

  onRemove(): void {
    // Called by MapLibre on style swap too — keep cached data so we can re-mount
    this.points?.geometry.dispose();
    (this.points?.material as THREE.Material | undefined)?.dispose();
    this.points = undefined;
    this.scene.clear();
    this.renderer = undefined;
  }

  /** Explicit final disposal; drops cached buffers so the layer cannot be re-mounted. */
  dispose(): void {
    this.onRemove();
    this.cachedPositions = undefined;
    this.cachedColors = undefined;
    this.loadPromise = undefined;
    this.originMerc = undefined;
  }
}
