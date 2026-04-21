import { MercatorCoordinate } from "maplibre-gl";
import type {
  Map as MaplibreMap,
  CustomLayerInterface,
  CustomRenderMethodInput,
} from "maplibre-gl";
import * as THREE from "three";
import { Copc, Key, Hierarchy, Las } from "copc";
import { getProj4Converter } from "@carma-geo/proj";

// laz-perf WASM init: we pre-init with locateFile pointing to the public copy
// so the emscripten module finds the .wasm in the browser.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let lazPerfPromise: Promise<any> | undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getLazPerf(): Promise<any> {
  if (!lazPerfPromise) {
    lazPerfPromise = Las.PointData.createLazPerf({
      locateFile: () => `${window.location.origin}/laz-perf.wasm`,
    });
  }
  return lazPerfPromise;
}

// ─────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────

export interface PointCloudLayerOptions {
  id: string;
  url: string;
  /** EPSG code for the source data, e.g. "EPSG:25832" */
  sourceCrs?: "EPSG:25832" | "EPSG:4326";
  /** Maximum octree depth to load (0 = root only, higher = more detail) */
  maxDepth?: number;
  /** Point size in pixels */
  pointSize?: number;
  /** Elevation offset in meters subtracted from every point's Z */
  elevationOffset?: number;
  /** Fallback color when the COPC has no RGB */
  fallbackColor?: number;
  onLoadStart?: () => void;
  onProgress?: (loaded: number) => void;
  onLoaded?: (stats: {
    count: number;
    hasColor: boolean;
    centerLngLat: [number, number];
    bboxSrc: { minX: number; minY: number; maxX: number; maxY: number };
    bboxWgs84: {
      sw: [number, number];
      nw: [number, number];
      ne: [number, number];
      se: [number, number];
    };
    zRange: { min: number; max: number };
  }) => void;
  onLoadError?: (err: unknown) => void;
}

// ─────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────

// Classification colors (float RGB 0..1)
// Standard LAS classes + Fraunhofer 3D segmentation classes (11-18)
const CLASS_COLORS: Record<number, [number, number, number]> = {
  0: [0.6, 0.6, 0.6],   // never classified (gray)
  1: [0.6, 0.6, 0.6],   // unclassified (gray)
  2: [0.6, 0.4, 0.2],   // ground (brown)
  3: [0.2, 0.7, 0.2],   // low vegetation (light green)
  4: [0.1, 0.5, 0.1],   // medium vegetation (green)
  5: [0.0, 0.35, 0.0],  // high vegetation (dark green)
  6: [0.9, 0.2, 0.2],   // building (red)
  7: [0.5, 0.5, 0.5],   // low point / noise (dark gray)
  9: [0.3, 0.5, 0.9],   // water (blue)
  11: [0.95, 0.6, 0.1],  // seg: infrastructure (orange)
  13: [0.8, 0.8, 0.2],   // seg: wire/cable (yellow)
  14: [0.5, 0.2, 0.6],   // seg: pole/post (purple)
  15: [0.15, 0.55, 0.15], // seg: vegetation (green, dominant class)
  16: [0.85, 0.3, 0.3],  // seg: building (red)
  17: [0.55, 0.35, 0.2], // seg: ground/terrain (brown)
  18: [0.3, 0.6, 0.85],  // seg: other structure (steel blue)
};

function classificationColor(cls: number): [number, number, number] {
  const known = CLASS_COLORS[cls];
  if (known) return known;
  // Distinct hue for unknown classes
  const hue = (cls * 137.508) % 360;
  const s = 0.7, v = 0.85;
  const c = v * s;
  const hp = (hue % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = v - c;
  return [r + m, g + m, b + m];
}

/** Mercator X from longitude (matches maplibre-gl internals) */
function mercX(lng: number): number {
  return (180 + lng) / 360;
}

/** Mercator Y from latitude (matches maplibre-gl internals) */
function mercY(lat: number): number {
  return (
    (180 -
      (180 / Math.PI) *
        Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) /
    360
  );
}

// ─────────────────────────────────────────────────────────────
//  PointCloudLayer (COPC)
// ─────────────────────────────────────────────────────────────

/**
 * MapLibre custom layer that renders a COPC point cloud via THREE.Points.
 * Loads the octree progressively by depth, updating the scene after each level.
 */
export class PointCloudLayer implements CustomLayerInterface {
  id: string;
  type = "custom" as const;
  renderingMode = "3d" as const;

  private url: string;
  private sourceCrs: "EPSG:25832" | "EPSG:4326";
  private maxDepth: number;
  private pointSize: number;
  private elevationOffset: number;
  private fallbackColor: number;
  private onLoadStart?: PointCloudLayerOptions["onLoadStart"];
  private onProgress?: PointCloudLayerOptions["onProgress"];
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
  private cachedRawZ?: Float32Array;
  private cachedColors?: Float32Array;
  private cachedHasColor = false;
  private totalPointCount = 0;
  private loadPromise?: Promise<void>;

  constructor(opts: PointCloudLayerOptions) {
    this.id = opts.id;
    this.url = opts.url;
    this.sourceCrs = opts.sourceCrs ?? "EPSG:25832";
    this.maxDepth = opts.maxDepth ?? 4;
    this.pointSize = opts.pointSize ?? 2;
    this.elevationOffset = opts.elevationOffset ?? 0;
    this.fallbackColor = opts.fallbackColor ?? 0x66aaff;
    this.onLoadStart = opts.onLoadStart;
    this.onProgress = opts.onProgress;
    this.onLoaded = opts.onLoaded;
    this.onLoadError = opts.onLoadError;
  }

  // ── MapLibre lifecycle ────────────────────────────────────

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
      this.buildSceneFromCache();
      this.map.triggerRepaint();
    } else if (!this.loadPromise) {
      this.loadPromise = this.loadCopc().catch((err) => {
        console.error("[POINTCLOUD] load failed", err);
        this.onLoadError?.(err);
      });
    }
  }

  render(
    _gl: WebGLRenderingContext | WebGL2RenderingContext,
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

    const savedDepthRange = _gl.getParameter(_gl.DEPTH_RANGE) as Float32Array;
    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    _gl.depthRange(savedDepthRange[0], savedDepthRange[1]);
  }

  onRemove(): void {
    this.points?.geometry.dispose();
    (this.points?.material as THREE.Material | undefined)?.dispose();
    this.points = undefined;
    this.scene.clear();
    this.renderer = undefined;
  }

  // ── Public API ────────────────────────────────────────────

  setPointSize(size: number): void {
    this.pointSize = size;
    if (this.points) {
      const mat = this.points.material as THREE.PointsMaterial;
      mat.size = size;
      mat.needsUpdate = true;
      this.map?.triggerRepaint();
    }
  }

  setElevationOffset(offset: number): void {
    this.elevationOffset = offset;
    if (this.cachedPositions && this.cachedRawZ && this.points) {
      const pos = this.cachedPositions;
      const raw = this.cachedRawZ;
      for (let i = 0; i < raw.length; i++) {
        pos[i * 3 + 1] = raw[i] - offset;
      }
      (this.points.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
      this.map?.triggerRepaint();
    }
  }

  dispose(): void {
    this.onRemove();
    this.cachedPositions = undefined;
    this.cachedRawZ = undefined;
    this.cachedColors = undefined;
    this.loadPromise = undefined;
    this.originMerc = undefined;
  }

  // ── Scene building ────────────────────────────────────────

  private buildSceneFromCache(): void {
    if (!this.cachedPositions) return;

    // Remove old points object if present
    if (this.points) {
      this.points.geometry.dispose();
      (this.points.material as THREE.Material).dispose();
      this.scene.remove(this.points);
    }

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
      depthTest: false,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  // ── COPC loading ──────────────────────────────────────────

  private async loadCopc(): Promise<void> {
    console.log("[POINTCLOUD] opening COPC", this.url);
    this.onLoadStart?.();
    const t0 = performance.now();

    // 1. Open COPC header (fetches first 64KB via range request)
    const copc = await Copc.create(this.url);
    const { header, info } = copc;
    const cube = info.cube;

    console.log("[POINTCLOUD] COPC info:", {
      pointCount: header.pointCount,
      pointFormat: header.pointDataRecordFormat,
      cube,
      spacing: info.spacing,
      wkt: copc.wkt?.substring(0, 80) + "...",
    });

    // Detected from first loaded node's actual dimensions
    let hasRgb: boolean | undefined;
    let hasClassification = false;

    // Set up projection from source CRS to WGS84
    const toWgs84 = getProj4Converter(this.sourceCrs, "EPSG:4326");

    // Use the COPC cube center as scene origin
    const originSrcX = (cube[0] + cube[3]) / 2;
    const originSrcY = (cube[1] + cube[4]) / 2;
    const originWgs84 = toWgs84.forward([originSrcX, originSrcY]) as number[];
    const originMerc = MercatorCoordinate.fromLngLat(
      [originWgs84[0], originWgs84[1]],
      0
    );
    const mScale = originMerc.meterInMercatorCoordinateUnits();
    this.originMerc = originMerc;
    this.mScale = mScale;

    console.log(
      "[POINTCLOUD] origin:",
      originSrcX.toFixed(1),
      originSrcY.toFixed(1),
      "->",
      originWgs84[0].toFixed(6),
      originWgs84[1].toFixed(6)
    );

    // 2. Load hierarchy and collect all nodes up to maxDepth
    const nodesToLoad: Array<{ key: string; node: Hierarchy.Node }> = [];
    await this.collectNodes(
      this.url,
      copc.info.rootHierarchyPage,
      0,
      this.maxDepth,
      nodesToLoad
    );

    console.log(
      `[POINTCLOUD] ${nodesToLoad.length} nodes to load (maxDepth=${this.maxDepth})`
    );

    // Estimate total point count for buffer pre-allocation
    let totalPoints = 0;
    for (const { node } of nodesToLoad) {
      totalPoints += node.pointCount;
    }

    // Pre-allocate buffers (colors allocated lazily after first node tells us)
    const positions = new Float32Array(totalPoints * 3);
    const rawZ = new Float32Array(totalPoints);
    let colors: Float32Array | undefined;
    let writeOffset = 0;

    // Bbox tracking
    let minLng = Infinity,
      maxLng = -Infinity,
      minLat = Infinity,
      maxLat = -Infinity;
    let minZ = Infinity,
      maxZ = -Infinity;

    const originMercX = originMerc.x;
    const originMercY = originMerc.y;

    // 3. Pre-init laz-perf WASM, then load point data for each node
    const lazPerf = await getLazPerf();

    for (let ni = 0; ni < nodesToLoad.length; ni++) {
      const { key, node } = nodesToLoad[ni];
      try {
        const view = await Copc.loadPointDataView(this.url, copc, node, {
          lazPerf,
        });
        const count = view.pointCount;

        // Detect color source on first node
        if (hasRgb === undefined) {
          hasRgb = "Red" in view.dimensions;
          hasClassification = "Classification" in view.dimensions;
          const hasColor = hasRgb || hasClassification;
          if (hasColor) {
            colors = new Float32Array(totalPoints * 3);
          }
          console.log(
            "[POINTCLOUD] dimensions:",
            Object.keys(view.dimensions),
            "hasRgb:", hasRgb,
            "hasClassification:", hasClassification
          );
        }

        const getX = view.getter("X");
        const getY = view.getter("Y");
        const getZ = view.getter("Z");
        const getRed = hasRgb ? view.getter("Red") : null;
        const getGreen = hasRgb ? view.getter("Green") : null;
        const getBlue = hasRgb ? view.getter("Blue") : null;
        const getClass = hasClassification ? view.getter("Classification") : null;

        for (let i = 0; i < count; i++) {
          const srcX = getX(i);
          const srcY = getY(i);
          const srcZ = getZ(i);

          // Track Z range
          if (srcZ < minZ) minZ = srcZ;
          if (srcZ > maxZ) maxZ = srcZ;

          // Project to WGS84
          const wgs = toWgs84.forward([srcX, srcY]) as number[];
          const lng = wgs[0];
          const lat = wgs[1];
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;

          // To scene coordinates
          const mx = mercX(lng);
          const my = mercY(lat);
          const idx = (writeOffset + i) * 3;
          positions[idx + 0] = (mx - originMercX) / mScale;
          rawZ[writeOffset + i] = srcZ;
          positions[idx + 1] = srcZ - this.elevationOffset;
          positions[idx + 2] = (my - originMercY) / mScale;

          // Colors: prefer RGB, fall back to classification-based
          if (colors) {
            if (getRed && getGreen && getBlue) {
              colors[idx + 0] = getRed(i) / 65535;
              colors[idx + 1] = getGreen(i) / 65535;
              colors[idx + 2] = getBlue(i) / 65535;
            } else if (getClass) {
              const c = classificationColor(getClass(i));
              colors[idx + 0] = c[0];
              colors[idx + 1] = c[1];
              colors[idx + 2] = c[2];
            }
          }
        }

        writeOffset += count;
        this.onProgress?.(writeOffset);

        console.log(
          `[POINTCLOUD] node ${key}: ${count} pts (total: ${writeOffset})`
        );
      } catch (err) {
        console.warn(`[POINTCLOUD] failed to load node ${key}:`, err);
      }

      // Yield to UI every few nodes
      if (ni % 5 === 4) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }

    // Trim buffers if we got fewer points than estimated (node load failures)
    const actualPositions =
      writeOffset === totalPoints
        ? positions
        : positions.slice(0, writeOffset * 3);
    const actualColors =
      colors && writeOffset === totalPoints
        ? colors
        : colors?.slice(0, writeOffset * 3);

    this.totalPointCount = writeOffset;
    this.cachedPositions = actualPositions;
    this.cachedRawZ =
      writeOffset === totalPoints ? rawZ : rawZ.slice(0, writeOffset);
    this.cachedColors = actualColors;
    this.cachedHasColor = !!actualColors;

    this.buildSceneFromCache();

    const dt = (performance.now() - t0).toFixed(0);
    console.log(`[POINTCLOUD] ready in ${dt}ms (${writeOffset} pts)`);

    // Compute WGS84 bbox
    const sw: [number, number] = [minLng, minLat];
    const nw: [number, number] = [minLng, maxLat];
    const ne: [number, number] = [maxLng, maxLat];
    const se: [number, number] = [maxLng, minLat];

    const bboxSrc = {
      minX: cube[0],
      minY: cube[1],
      maxX: cube[3],
      maxY: cube[4],
    };

    this.onLoaded?.({
      count: writeOffset,
      hasColor: this.cachedHasColor,
      centerLngLat: [originWgs84[0], originWgs84[1]],
      bboxSrc,
      bboxWgs84: { sw, nw, ne, se },
      zRange: { min: minZ, max: maxZ },
    });

    // Re-add layer to force MapLibre to pick up the new geometry
    const map = this.map;
    if (map && map.getLayer(this.id)) {
      map.removeLayer(this.id);
      map.addLayer(this);
    }
  }

  /**
   * Recursively collect all hierarchy nodes up to a given depth.
   */
  private async collectNodes(
    url: string,
    page: Hierarchy.Page,
    currentDepth: number,
    maxDepth: number,
    result: Array<{ key: string; node: Hierarchy.Node }>
  ): Promise<void> {
    const subtree = await Copc.loadHierarchyPage(url, page);

    // Add all point-data nodes within depth limit
    for (const [keyStr, node] of Object.entries(subtree.nodes)) {
      if (!node || node.pointCount <= 0) continue;
      const depth = Key.depth(Key.create(keyStr));
      if (depth <= maxDepth) {
        result.push({ key: keyStr, node });
      }
    }

    // Recurse into sub-pages if they're within our depth limit
    for (const [keyStr, subPage] of Object.entries(subtree.pages)) {
      if (!subPage) continue;
      const depth = Key.depth(Key.create(keyStr));
      if (depth <= maxDepth) {
        await this.collectNodes(url, subPage, depth, maxDepth, result);
      }
    }
  }
}
