import { Bounds, Copc, Key } from "copc";
import type { Bounds as CopcBounds, Getter, Hierarchy } from "copc";
import { LazPerf } from "laz-perf";
import { MercatorCoordinate } from "maplibre-gl";

import { getFromUTM32ToWGS84 } from "@carma-geo/proj";

import { applyCopcRigidRegistration } from "./pointcloud-spatial-registration";
import type {
  CopcRigidRegistration,
  CopcSourcePosition,
} from "./pointcloud-spatial-registration";

import lazPerfWasmUrl from "laz-perf/lib/laz-perf.wasm?url";

export type { CopcRigidRegistration } from "./pointcloud-spatial-registration";

// ─────────────────────────────────────────────────────────────
//  COPC streaming loader (wupp#4064 point cloud experiment)
//
//  Streams a COPC-organized LAZ file via HTTP range requests,
//  decodes nodes with laz-perf (WASM) and emits point chunks in
//  scene-local meters (x east, y up, z south) relative to the
//  cloud center — the same local frame GenericThreeLayer uses.
//  Source data CRS is EPSG:25832 (Fraunhofer Nordbahntrasse).
// ─────────────────────────────────────────────────────────────

export interface CopcSceneMetadata {
  /** Source-CRS position represented by the layer's local origin. */
  sourceOrigin: CopcSourcePosition;
  /** Cloud center as WGS84 lng/lat — scene origin and flyTo target */
  centerLngLat: [number, number];
  /** WGS84 bounds [[minLng,minLat],[maxLng,maxLat]] for fitBounds */
  boundsLngLat: [[number, number], [number, number]];
  /** Scene-local horizontal bounds: [[minX,minZ],[maxX,maxZ]]. */
  boundsLocal: [[number, number], [number, number]];
  /** Height (meters, source CRS) subtracted from all point z values */
  zBase: number;
  zMin: number;
  zMax: number;
  /** Total points in the file (header) */
  totalFilePoints: number;
  /** Points selected for loading under the current budget */
  selectedPoints: number;
  /** Nodes selected / total nodes in the loaded hierarchy */
  selectedNodes: number;
  totalNodes: number;
  selectedInsidePoints: number;
  selectedOutsidePoints: number;
  /** File carries usable (non-zero) RGB values */
  hasRgb: boolean;
  /** File carries a classification dimension */
  hasClassification: boolean;
}

export interface CopcPointChunk {
  /** Stable COPC octree key when the chunk was loaded on demand. */
  nodeKey?: string;
  /** Scene-local axis-aligned bounds: [minX,minY,minZ,maxX,maxY,maxZ]. */
  boundsLocal?: CopcBounds;
  /** Scene-local meters relative to origin: x east, y up, z south */
  positions: Float32Array;
  /** Normalized 8-bit RGB per point; absent when the source has no RGB. */
  colors: Uint8Array | null;
  /** Approximate local point spacing in meters for this octree node
   *  (COPC root spacing halves per level) — drives auto point size */
  spacing: number;
  /** All scalar dimensions of the file (plus synthetic pointindex),
   *  for field-based colorization */
  fieldValues: Record<string, Float32Array>;
  pointCount: number;
}

export interface CopcNodeDescriptor {
  key: string;
  depth: number;
  pointCount: number;
  spacing: number;
  /** Scene-local axis-aligned bounds: [minX,minY,minZ,maxX,maxY,maxZ]. */
  boundsLocal: CopcBounds;
}

export interface CopcPointSource {
  metadata: CopcSceneMetadata;
  nodes: readonly CopcNodeDescriptor[];
  loadNode: (
    key: string,
    options?: { signal?: AbortSignal }
  ) => Promise<CopcPointChunk>;
}

export interface OpenCopcPointSourceOptions {
  url: string;
  registration?: CopcRigidRegistration;
  fieldDimensions?: readonly string[];
  /** Decode RGB only after the asset-wide audit marked it usable. */
  includeRgb?: boolean;
  cancelToken?: { cancelled: boolean };
}

/**
 * Browser-facing field identifiers are always lowercase. LAS/COPC readers use
 * mixed-case standard names and preserve source casing for Extra Bytes, so the
 * loader normalizes that external schema at this boundary.
 */
export const canonicalPointCloudFieldName = (name: string): string =>
  name.toLowerCase();

/** Dimensions handled elsewhere (positions/colors) — not field data */
const NON_FIELD_DIMENSIONS = new Set(["x", "y", "red", "green", "blue"]);
/** Synthetic/meta fields that are pointless to visualize (sorted last) */
const META_FIELDS = new Set(["pointindex"]);
const isAbortError = (value: unknown): boolean =>
  typeof value === "object" &&
  value !== null &&
  "name" in value &&
  value.name === "AbortError";

/**
 * Derived COPCs store sky visibility as one unsigned byte per point. Keep the
 * storage compact while exposing normalized 0..1 colorization values.
 */
export const normalizeCopcScalarFieldValue = (
  name: string,
  value: number
): number => (canonicalPointCloudFieldName(name) === "ao" ? value / 255 : value);

export interface StreamCopcOptions {
  url: string;
  /** Optional asset-specific rigid correction in source ENU coordinates. */
  registration?: CopcRigidRegistration;
  /** Asset-provenance-backed scalar dimensions retained for visualization. */
  fieldDimensions?: readonly string[];
  /** Decode RGB only after the asset-wide audit marked it usable. */
  includeRgb?: boolean;
  /** Absolute point budget. Ignored when pointBudgetPercent is provided. */
  pointBudget?: number;
  /** Percentage of all file points to select, from 0 to 100. */
  pointBudgetPercent?: number;
  roi?: CopcRegionOfInterest;
  onMetadata: (meta: CopcSceneMetadata) => void | Promise<void>;
  onChunk: (chunk: CopcPointChunk) => void;
  onProgress?: (loadedPoints: number, selectedPoints: number) => void;
  /** Set .cancelled to stop between nodes */
  cancelToken?: { cancelled: boolean };
}

export type CopcRoiOutsideMode = "hide" | "uniform";

export type CopcLineSegment = [[number, number], [number, number]];

/** Source-CRS centerline corridor used to prioritize COPC hierarchy nodes. */
export interface CopcRegionOfInterest {
  /** Line segments in the COPC horizontal source CRS (EPSG:25832 here). */
  segments: CopcLineSegment[];
  widthMeters: number;
  /** Share of the total point budget reserved for intersecting nodes. */
  insideBudgetShare: number;
  outsideMode: CopcRoiOutsideMode;
  /** Progressive COPC level retained outside when outsideMode is uniform. */
  outsideDepth: number;
}

let lazPerfPromise: Promise<LazPerf> | null = null;

/** laz-perf WASM singleton, resolved via Vite asset URL */
const getLazPerf = (): Promise<LazPerf> => {
  if (!lazPerfPromise) {
    lazPerfPromise = LazPerf.create({
      locateFile: (file: string) =>
        file.endsWith(".wasm") ? lazPerfWasmUrl : file,
    });
  }
  return lazPerfPromise;
};

const yieldToBrowser = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));

/**
 * HTTP range getter for copc. Falls back to caching the whole file
 * when the server answers 200 instead of 206 (no range support).
 */
export const createRangeGetter = (
  url: string,
  options: { requireByteRanges?: boolean; signal?: AbortSignal } = {}
): Getter => {
  let fullFile: Promise<Uint8Array> | null = null;
  return async (begin: number, end: number): Promise<Uint8Array> => {
    // Empty ranges (e.g. zero-point hierarchy nodes) would produce an
    // invalid Range header ("bytes=0--1") and make fetch throw.
    if (end <= begin) return new Uint8Array(0);
    if (!fullFile) {
      let response: Response;
      try {
        response = await fetch(url, {
          headers: { Range: `bytes=${begin}-${end - 1}` },
          signal: options.signal,
        });
      } catch (cause) {
        if (isAbortError(cause)) throw cause;
        throw new Error(
          `Range fetch ${begin}-${end - 1} (${end - begin} B) failed: ${cause}`
        );
      }
      if (!response.ok) {
        throw new Error(`Fetch failed (${response.status}) for ${url}`);
      }
      if (response.status === 206) {
        return new Uint8Array(await response.arrayBuffer());
      }
      if (options.requireByteRanges) {
        response.body?.cancel();
        throw new Error(
          `COPC source does not support HTTP byte ranges: ${url}`
        );
      }
      // Server ignored the Range header: cache the full body once
      fullFile = response.arrayBuffer().then((buf) => new Uint8Array(buf));
    }
    const buffer = await fullFile;
    return buffer.subarray(begin, end);
  };
};

interface SelectableNode extends Hierarchy.Node {
  key: string;
  depth: number;
  bounds: CopcBounds;
  insideRoi: boolean;
}

const segmentIntersectsBounds = (
  [[x0, y0], [x1, y1]]: CopcLineSegment,
  bounds: CopcBounds,
  padding: number
): boolean => {
  const minX = bounds[0] - padding;
  const minY = bounds[1] - padding;
  const maxX = bounds[3] + padding;
  const maxY = bounds[4] + padding;
  const dx = x1 - x0;
  const dy = y1 - y0;
  let t0 = 0;
  let t1 = 1;

  for (const [p, q] of [
    [-dx, x0 - minX],
    [dx, maxX - x0],
    [-dy, y0 - minY],
    [dy, maxY - y0],
  ] as Array<[number, number]>) {
    if (p === 0 && q < 0) return false;
    if (p === 0) continue;
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return true;
};

/** Collect nodes from the root hierarchy page, following sub-pages if needed */
const collectNodes = async (
  getter: Getter,
  rootPage: Hierarchy.Page,
  pointBudget: number,
  cube: CopcBounds,
  roi?: CopcRegionOfInterest
): Promise<{ all: SelectableNode[]; selected: SelectableNode[] }> => {
  const nodes: SelectableNode[] = [];
  const pageQueue: Hierarchy.Page[] = [rootPage];
  const roiPadding = roi ? Math.max(0, roi.widthMeters) / 2 : 0;
  let discoveredPoints = 0;

  while (pageQueue.length > 0) {
    const page = pageQueue.shift()!;
    const subtree = await Copc.loadHierarchyPage(getter, page);
    for (const [key, node] of Object.entries(subtree.nodes)) {
      // Large untwine outputs contain empty internal octree nodes
      if (!node || node.pointCount <= 0) continue;
      const depth = Number(key.split("-")[0]);
      const bounds = Bounds.stepTo(cube, Key.create(key));
      nodes.push({
        ...node,
        key,
        depth,
        bounds,
        insideRoi: roi
          ? roi.segments.some((segment) =>
              segmentIntersectsBounds(segment, bounds, roiPadding)
            )
          : true,
      });
      discoveredPoints += node.pointCount;
    }
    if (roi || discoveredPoints < pointBudget) {
      for (const subPage of Object.values(subtree.pages)) {
        if (subPage) pageQueue.push(subPage);
      }
    }
  }

  const selected: SelectableNode[] = [];
  const selectedKeys = new Set<string>();
  let budgetLeft = pointBudget;
  const addCandidates = (
    candidates: SelectableNode[],
    allocation = budgetLeft
  ) => {
    let allocationLeft = Math.min(budgetLeft, allocation);
    candidates.sort((a, b) => a.depth - b.depth);
    for (const node of candidates) {
      if (
        selectedKeys.has(node.key) ||
        node.pointCount > budgetLeft ||
        node.pointCount > allocationLeft
      ) {
        continue;
      }
      selected.push(node);
      selectedKeys.add(node.key);
      budgetLeft -= node.pointCount;
      allocationLeft -= node.pointCount;
    }
  };

  if (roi) {
    if (roi.outsideMode === "uniform") {
      const inside = nodes.filter((node) => node.insideRoi);
      const outside = nodes.filter(
        (node) => !node.insideRoi && node.depth <= roi.outsideDepth
      );
      const insideBudget =
        pointBudget * Math.min(1, Math.max(0, roi.insideBudgetShare));
      addCandidates(outside, pointBudget - insideBudget);
      addCandidates(inside, insideBudget);
      addCandidates(inside);
      addCandidates(outside);
    } else {
      addCandidates(nodes.filter((node) => node.insideRoi));
    }
  } else {
    addCandidates(nodes);
  }
  return { all: nodes, selected };
};

interface CopcDecodeContext {
  getter: Getter;
  copc: Copc;
  lazPerf: LazPerf;
  registration?: CopcRigidRegistration;
  retainedFieldDimensions: Set<string> | null;
  includeRgb: boolean;
  zBase: number;
  originMerc: MercatorCoordinate;
  meterScale: number;
  colorState: { shift: number | null };
}

const sourcePositionToLocal = (
  context: Pick<
    CopcDecodeContext,
    "registration" | "zBase" | "originMerc" | "meterScale"
  >,
  easting: number,
  northing: number,
  height: number
): [number, number, number] => {
  const sourcePosition = context.registration
    ? applyCopcRigidRegistration(
        { easting, northing, height },
        context.registration
      )
    : { easting, northing, height };
  const lngLat = getFromUTM32ToWGS84([
    sourcePosition.easting,
    sourcePosition.northing,
  ]) as [number, number];
  const merc = MercatorCoordinate.fromLngLat(
    lngLat,
    sourcePosition.height - context.zBase
  );
  return [
    (merc.x - context.originMerc.x) / context.meterScale,
    (merc.z - context.originMerc.z) / context.meterScale,
    (merc.y - context.originMerc.y) / context.meterScale,
  ];
};

const nodeBoundsToLocal = (
  context: Pick<
    CopcDecodeContext,
    "registration" | "zBase" | "originMerc" | "meterScale"
  >,
  bounds: CopcBounds
): CopcBounds => {
  const result: CopcBounds = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ];
  for (const easting of [bounds[0], bounds[3]]) {
    for (const northing of [bounds[1], bounds[4]]) {
      for (const height of [bounds[2], bounds[5]]) {
        const local = sourcePositionToLocal(context, easting, northing, height);
        result[0] = Math.min(result[0], local[0]);
        result[1] = Math.min(result[1], local[1]);
        result[2] = Math.min(result[2], local[2]);
        result[3] = Math.max(result[3], local[0]);
        result[4] = Math.max(result[4], local[1]);
        result[5] = Math.max(result[5], local[2]);
      }
    }
  }
  return result;
};

const nodeSpacing = (copc: Copc, depth: number): number => {
  const rootSpacing =
    copc.info.spacing > 0 ? copc.info.spacing : 0.5 * 2 ** depth;
  return rootSpacing / 2 ** depth;
};

const decodeCopcNode = async (
  context: CopcDecodeContext,
  node: SelectableNode,
  pointIndexOffset = 0
): Promise<CopcPointChunk> => {
  const view = await Copc.loadPointDataView(
    context.getter,
    context.copc,
    node,
    { lazPerf: context.lazPerf }
  );
  const count = view.pointCount;
  const getX = view.getter("X");
  const getY = view.getter("Y");
  const getZ = view.getter("Z");
  const rgbDim =
    context.includeRgb &&
    ["Red", "Green", "Blue"].every((name) => name in view.dimensions);
  const getRed = rgbDim ? view.getter("Red") : null;
  const getGreen = rgbDim ? view.getter("Green") : null;
  const getBlue = rgbDim ? view.getter("Blue") : null;

  if (context.colorState.shift === null && getRed) {
    let maxChannel = 0;
    const sample = Math.min(count, 1000);
    for (let i = 0; i < sample; i++) {
      maxChannel = Math.max(maxChannel, getRed(i), getGreen!(i), getBlue!(i));
    }
    context.colorState.shift = maxChannel > 255 ? 8 : 0;
  }

  const positions = new Float32Array(count * 3);
  const colors = getRed ? new Uint8Array(count * 3) : null;
  const fieldGetters: Array<[string, (index: number) => number]> = Object.keys(
    view.dimensions
  )
    .filter(
      (name) => !NON_FIELD_DIMENSIONS.has(canonicalPointCloudFieldName(name))
    )
    .filter(
      (name) =>
        context.retainedFieldDimensions === null ||
        context.retainedFieldDimensions.has(canonicalPointCloudFieldName(name))
    )
    .map((name) => [canonicalPointCloudFieldName(name), view.getter(name)]);
  const fieldValues: Record<string, Float32Array> = {};
  for (const [name] of fieldGetters) {
    fieldValues[name] = new Float32Array(count);
  }
  const pointIndex = new Float32Array(count);
  fieldValues["pointindex"] = pointIndex;

  for (let i = 0; i < count; i++) {
    const local = sourcePositionToLocal(context, getX(i), getY(i), getZ(i));
    positions[i * 3] = local[0];
    positions[i * 3 + 1] = local[1];
    positions[i * 3 + 2] = local[2];
    if (getRed) {
      const shift = context.colorState.shift ?? 0;
      colors![i * 3] = getRed(i) >> shift;
      colors![i * 3 + 1] = getGreen!(i) >> shift;
      colors![i * 3 + 2] = getBlue!(i) >> shift;
    }
    for (const [name, getField] of fieldGetters) {
      fieldValues[name][i] = normalizeCopcScalarFieldValue(name, getField(i));
    }
    pointIndex[i] = pointIndexOffset + i;
    // Keep large node conversion cooperative. The LAZ fetch/decode is
    // asynchronous, but this attribute conversion loop otherwise monopolizes
    // the main thread until the complete node has been copied.
    if ((i + 1) % 4096 === 0) await yieldToBrowser();
  }

  return {
    nodeKey: node.key,
    boundsLocal: nodeBoundsToLocal(context, node.bounds),
    positions,
    colors,
    spacing: nodeSpacing(context.copc, node.depth),
    fieldValues,
    pointCount: count,
  };
};

const POINT_FORMATS_WITH_RGB = new Set([2, 3, 5, 7, 8, 10]);

/**
 * Opens a COPC hierarchy without fetching its point-data nodes. Consumers can
 * then request only the octree nodes needed by the current camera. HTTP range
 * responses remain eligible for the browser's normal disk cache while the
 * decoded working set can be kept independently bounded by the caller.
 */
export async function openCopcPointSource(
  options: OpenCopcPointSourceOptions
): Promise<CopcPointSource> {
  const {
    url,
    registration,
    fieldDimensions,
    includeRgb = true,
    cancelToken,
  } = options;
  const getter = createRangeGetter(url, { requireByteRanges: true });
  const [copc, lazPerf] = await Promise.all([
    Copc.create(getter),
    getLazPerf(),
  ]);
  if (cancelToken?.cancelled) throw new Error("COPC load cancelled");

  const [minX, minY, minZ] = copc.header.min;
  const [maxX, maxY, maxZ] = copc.header.max;
  const centerUtm: [number, number] = [(minX + maxX) / 2, (minY + maxY) / 2];
  const centerLngLat = getFromUTM32ToWGS84(centerUtm) as [number, number];
  const minLngLat = getFromUTM32ToWGS84([minX, minY]) as [number, number];
  const maxLngLat = getFromUTM32ToWGS84([maxX, maxY]) as [number, number];
  const originMerc = MercatorCoordinate.fromLngLat(centerLngLat, 0);
  const meterScale = originMerc.meterInMercatorCoordinateUnits();
  const decodeContext: CopcDecodeContext = {
    getter,
    copc,
    lazPerf,
    registration,
    retainedFieldDimensions: fieldDimensions
      ? new Set(fieldDimensions.map(canonicalPointCloudFieldName))
      : null,
    includeRgb,
    zBase: minZ,
    originMerc,
    meterScale,
    colorState: { shift: null },
  };
  const { all } = await collectNodes(
    getter,
    copc.info.rootHierarchyPage,
    Number.POSITIVE_INFINITY,
    copc.info.cube
  );
  if (cancelToken?.cancelled) throw new Error("COPC load cancelled");

  const nodes = all.map<CopcNodeDescriptor>((node) => ({
    key: node.key,
    depth: node.depth,
    pointCount: node.pointCount,
    spacing: nodeSpacing(copc, node.depth),
    boundsLocal: nodeBoundsToLocal(decodeContext, node.bounds),
  }));
  const nodesByKey = new Map(all.map((node) => [node.key, node]));
  const selectedPoints = all.reduce((sum, node) => sum + node.pointCount, 0);
  const retainedFieldNames = fieldDimensions?.map(
    canonicalPointCloudFieldName
  );
  const minMerc = MercatorCoordinate.fromLngLat(minLngLat, 0);
  const maxMerc = MercatorCoordinate.fromLngLat(maxLngLat, 0);
  const localA: [number, number] = [
    (minMerc.x - originMerc.x) / meterScale,
    (minMerc.y - originMerc.y) / meterScale,
  ];
  const localB: [number, number] = [
    (maxMerc.x - originMerc.x) / meterScale,
    (maxMerc.y - originMerc.y) / meterScale,
  ];
  const metadata: CopcSceneMetadata = {
    sourceOrigin: {
      easting: centerUtm[0],
      northing: centerUtm[1],
      height: minZ,
    },
    centerLngLat,
    boundsLngLat: [minLngLat, maxLngLat],
    boundsLocal: [
      [Math.min(localA[0], localB[0]), Math.min(localA[1], localB[1])],
      [Math.max(localA[0], localB[0]), Math.max(localA[1], localB[1])],
    ],
    zBase: minZ,
    zMin: minZ,
    zMax: maxZ,
    totalFilePoints: copc.header.pointCount,
    selectedPoints,
    selectedNodes: nodes.length,
    totalNodes: nodes.length,
    selectedInsidePoints: selectedPoints,
    selectedOutsidePoints: 0,
    hasRgb:
      includeRgb &&
      POINT_FORMATS_WITH_RGB.has(copc.header.pointDataRecordFormat),
    hasClassification:
      retainedFieldNames === undefined ||
      retainedFieldNames.includes("classification"),
  };

  return {
    metadata,
    nodes,
    async loadNode(key, loadOptions) {
      if (cancelToken?.cancelled || loadOptions?.signal?.aborted) {
        throw new DOMException("COPC node load aborted", "AbortError");
      }
      const node = nodesByKey.get(key);
      if (!node) throw new Error(`Unknown COPC node ${key}`);
      const nodeContext = loadOptions?.signal
        ? {
            ...decodeContext,
            getter: createRangeGetter(url, {
              requireByteRanges: true,
              signal: loadOptions.signal,
            }),
          }
        : decodeContext;
      const chunk = await decodeCopcNode(nodeContext, node);
      if (cancelToken?.cancelled || loadOptions?.signal?.aborted) {
        throw new DOMException("COPC node load aborted", "AbortError");
      }
      return chunk;
    },
  };
}

/**
 * Stream a COPC file: emits metadata once, then one chunk per octree node.
 * Returns after all selected nodes are loaded or the token is cancelled.
 */
export async function streamCopcPoints(
  options: StreamCopcOptions
): Promise<void> {
  const {
    url,
    registration,
    fieldDimensions,
    includeRgb = true,
    pointBudget,
    pointBudgetPercent,
    roi,
    onMetadata,
    onChunk,
    onProgress,
    cancelToken,
  } = options;
  const retainedFieldDimensions = fieldDimensions
    ? new Set(fieldDimensions.map(canonicalPointCloudFieldName))
    : null;

  const getter = createRangeGetter(url);
  const [copc, lazPerf] = await Promise.all([
    Copc.create(getter),
    getLazPerf(),
  ]);

  const [minX, minY, minZ] = copc.header.min;
  const [maxX, maxY, maxZ] = copc.header.max;
  const centerUtm: [number, number] = [(minX + maxX) / 2, (minY + maxY) / 2];
  const centerLngLat = getFromUTM32ToWGS84(centerUtm) as [number, number];
  const minLngLat = getFromUTM32ToWGS84([minX, minY]) as [number, number];
  const maxLngLat = getFromUTM32ToWGS84([maxX, maxY]) as [number, number];
  const boundsLngLat: [[number, number], [number, number]] = [
    minLngLat,
    maxLngLat,
  ];
  const zBase = minZ;

  const effectivePointBudget =
    pointBudgetPercent === undefined
      ? pointBudget ?? copc.header.pointCount
      : Math.ceil(
          copc.header.pointCount *
            (Math.min(100, Math.max(0, pointBudgetPercent)) / 100)
        );
  const { all, selected } = await collectNodes(
    getter,
    copc.info.rootHierarchyPage,
    effectivePointBudget,
    copc.info.cube,
    roi
  );
  const selectedPoints = selected.reduce((sum, n) => sum + n.pointCount, 0);
  const selectedInsidePoints = selected.reduce(
    (sum, node) => sum + (node.insideRoi ? node.pointCount : 0),
    0
  );
  const selectedOutsidePoints = selectedPoints - selectedInsidePoints;

  const originMerc = MercatorCoordinate.fromLngLat(centerLngLat, 0);
  const mScale = originMerc.meterInMercatorCoordinateUnits();
  const minMerc = MercatorCoordinate.fromLngLat(minLngLat, 0);
  const maxMerc = MercatorCoordinate.fromLngLat(maxLngLat, 0);
  const localA: [number, number] = [
    (minMerc.x - originMerc.x) / mScale,
    (minMerc.y - originMerc.y) / mScale,
  ];
  const localB: [number, number] = [
    (maxMerc.x - originMerc.x) / mScale,
    (maxMerc.y - originMerc.y) / mScale,
  ];
  const boundsLocal: [[number, number], [number, number]] = [
    [Math.min(localA[0], localB[0]), Math.min(localA[1], localB[1])],
    [Math.max(localA[0], localB[0]), Math.max(localA[1], localB[1])],
  ];

  let colorShift: number | null = null;
  let metadataSent = false;
  let loadedPoints = 0;

  for (const node of selected) {
    if (cancelToken?.cancelled) return;

    const view = await Copc.loadPointDataView(getter, copc, node, { lazPerf });
    if (cancelToken?.cancelled) return;

    const count = view.pointCount;
    const getX = view.getter("X");
    const getY = view.getter("Y");
    const getZ = view.getter("Z");

    const rgbDim =
      includeRgb &&
      ["Red", "Green", "Blue"].every((name) => name in view.dimensions);
    const getRed = rgbDim ? view.getter("Red") : null;
    const getGreen = rgbDim ? view.getter("Green") : null;
    const getBlue = rgbDim ? view.getter("Blue") : null;
    const getClassification = view.dimensions["Classification"]
      ? view.getter("Classification")
      : null;

    // Report available color attributes once, from the first node
    if (!metadataSent) {
      let rgbNonZero = false;
      if (getRed && getGreen && getBlue) {
        const sample = Math.min(count, 1000);
        for (let i = 0; i < sample; i++) {
          if (getRed(i) > 0 || getGreen(i) > 0 || getBlue(i) > 0) {
            rgbNonZero = true;
            break;
          }
        }
      }
      await onMetadata({
        sourceOrigin: {
          easting: centerUtm[0],
          northing: centerUtm[1],
          height: minZ,
        },
        centerLngLat,
        boundsLngLat,
        boundsLocal,
        zBase,
        zMin: minZ,
        zMax: maxZ,
        totalFilePoints: copc.header.pointCount,
        selectedPoints,
        selectedNodes: selected.length,
        totalNodes: all.length,
        selectedInsidePoints,
        selectedOutsidePoints,
        hasRgb: rgbNonZero,
        hasClassification: Boolean(getClassification),
      });
      metadataSent = true;
    }

    // Detect 16-bit vs 8-bit RGB storage from this node's value range
    if (colorShift === null && getRed) {
      let maxChannel = 0;
      const sample = Math.min(count, 1000);
      for (let i = 0; i < sample; i++) {
        const value = Math.max(getRed(i), getGreen!(i), getBlue!(i));
        if (value > maxChannel) maxChannel = value;
      }
      colorShift = maxChannel > 255 ? 8 : 0;
    }

    const positions = new Float32Array(count * 3);
    // Both color attributes in parallel — the shader multiplies the
    // enabled ones; white (255) is the multiplicative identity.
    const colors = getRed ? new Uint8Array(count * 3) : null;
    const shift = colorShift ?? 0;

    // Extract every scalar dimension for field-based colorization
    // (Z as absolute height; X/Y and RGB are handled separately).
    const fieldGetters: Array<[string, (index: number) => number]> =
      Object.keys(view.dimensions)
        .filter(
          (name) =>
            !NON_FIELD_DIMENSIONS.has(canonicalPointCloudFieldName(name))
        )
        .filter(
          (name) =>
            retainedFieldDimensions === null ||
            retainedFieldDimensions.has(canonicalPointCloudFieldName(name))
        )
        .map((name) => [canonicalPointCloudFieldName(name), view.getter(name)]);
    const fieldValues: Record<string, Float32Array> = {};
    for (const [name] of fieldGetters) {
      fieldValues[name] = new Float32Array(count);
    }
    const pointIndex = new Float32Array(count);
    fieldValues["pointindex"] = pointIndex;

    for (let i = 0; i < count; i++) {
      const sourcePosition = registration
        ? applyCopcRigidRegistration(
            {
              easting: getX(i),
              northing: getY(i),
              height: getZ(i),
            },
            registration
          )
        : {
            easting: getX(i),
            northing: getY(i),
            height: getZ(i),
          };
      const lngLat = getFromUTM32ToWGS84([
        sourcePosition.easting,
        sourcePosition.northing,
      ]) as [number, number];
      const merc = MercatorCoordinate.fromLngLat(
        lngLat,
        sourcePosition.height - zBase
      );
      positions[i * 3] = (merc.x - originMerc.x) / mScale;
      positions[i * 3 + 1] = (merc.z - originMerc.z) / mScale;
      positions[i * 3 + 2] = (merc.y - originMerc.y) / mScale;

      if (getRed) {
        colors![i * 3] = getRed(i) >> shift;
        colors![i * 3 + 1] = getGreen!(i) >> shift;
        colors![i * 3 + 2] = getBlue!(i) >> shift;
      }
      for (const [name, getField] of fieldGetters) {
        fieldValues[name][i] = normalizeCopcScalarFieldValue(name, getField(i));
      }
      pointIndex[i] = loadedPoints + i;
    }

    // COPC spacing metadata is the free local-density estimate:
    // fall back to 0.5 m when a file carries no usable value.
    const rootSpacing =
      copc.info.spacing > 0 ? copc.info.spacing : 0.5 * 2 ** node.depth;
    const spacing = rootSpacing / 2 ** node.depth;

    loadedPoints += count;
    onChunk({
      nodeKey: node.key,
      boundsLocal: nodeBoundsToLocal(
        { registration, zBase, originMerc, meterScale: mScale },
        node.bounds
      ),
      positions,
      colors,
      spacing,
      fieldValues,
      pointCount: count,
    });
    onProgress?.(loadedPoints, selectedPoints);

    // Yield to the event loop so the map stays responsive
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** Field metadata shape consumed by the PointColorizer component */
export interface CloudFieldInfo {
  name: string;
  min: number;
  max: number;
  empty: boolean;
  meta?: boolean;
  histogram: number[];
  /** Exact counts for integer-valued qualitative fields in the byte range. */
  categories?: Array<{ value: number; count: number }>;
}

const HISTOGRAM_BINS = 48;

/**
 * Removes scalar dimensions that carry one value across the loaded cloud.
 * COPC/LAS standard dimensions may be structurally mandatory on disk, but
 * they do not need per-point browser or GPU storage when they contain no
 * information.
 */
export function dropConstantCloudFields(chunks: CopcPointChunk[]): string[] {
  const names = new Set<string>();
  for (const chunk of chunks) {
    for (const name of Object.keys(chunk.fieldValues)) names.add(name);
  }

  const removed: string[] = [];
  for (const name of names) {
    let firstValue: number | undefined;
    let constant = true;
    for (const chunk of chunks) {
      const values = chunk.fieldValues[name];
      if (!values) continue;
      for (let index = 0; index < values.length; index++) {
        if (firstValue === undefined) firstValue = values[index];
        else if (values[index] !== firstValue) {
          constant = false;
          break;
        }
      }
      if (!constant) break;
    }
    if (!constant || firstValue === undefined) continue;
    for (const chunk of chunks) delete chunk.fieldValues[name];
    removed.push(name);
  }
  return removed;
}

/**
 * Build per-field stats + histograms over all loaded chunks
 * (for the colorization UI). Meta fields are flagged so the UI
 * can sort them (and empty fields) to the end of its list.
 */
export function buildCloudFieldInfos(
  chunks: CopcPointChunk[]
): CloudFieldInfo[] {
  const names = new Set<string>();
  for (const chunk of chunks) {
    for (const name of Object.keys(chunk.fieldValues)) names.add(name);
  }

  const infos: CloudFieldInfo[] = [];
  for (const name of names) {
    let min = Infinity;
    let max = -Infinity;
    for (const chunk of chunks) {
      const values = chunk.fieldValues[name];
      if (!values) continue;
      for (let i = 0; i < values.length; i++) {
        const value = values[i];
        if (value < min) min = value;
        if (value > max) max = value;
      }
    }
    if (!Number.isFinite(min)) {
      min = 0;
      max = 0;
    }
    const empty = min === max;

    const bins = new Array<number>(HISTOGRAM_BINS).fill(0);
    if (!empty) {
      const scale = HISTOGRAM_BINS / (max - min);
      for (const chunk of chunks) {
        const values = chunk.fieldValues[name];
        if (!values) continue;
        for (let i = 0; i < values.length; i++) {
          const bin = Math.min(
            HISTOGRAM_BINS - 1,
            Math.floor((values[i] - min) * scale)
          );
          bins[bin]++;
        }
      }
      const peak = Math.max(...bins) || 1;
      for (let i = 0; i < bins.length; i++) bins[i] /= peak;
    }

    const categoryCounts =
      min >= 0 && max <= 255 && Number.isInteger(min) && Number.isInteger(max)
        ? new Uint32Array(256)
        : null;
    if (categoryCounts) {
      for (const chunk of chunks) {
        const values = chunk.fieldValues[name];
        if (!values) continue;
        for (let i = 0; i < values.length; i++) {
          const value = values[i];
          if (!Number.isInteger(value) || value < 0 || value > 255) continue;
          categoryCounts[value]++;
        }
      }
    }

    infos.push({
      name,
      min,
      max,
      empty,
      meta: META_FIELDS.has(name),
      histogram: bins,
      categories: categoryCounts
        ? Array.from(categoryCounts.entries())
            .filter(([, count]) => count > 0)
            .map(([value, count]) => ({ value, count }))
        : undefined,
    });
  }
  return infos;
}
