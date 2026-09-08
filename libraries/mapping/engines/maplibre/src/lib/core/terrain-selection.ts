// Pure, worker-safe terrain selection contracts and helpers live here.
// Runtime code supplies only snapshots and source metadata; this module never
// touches MapLibre, DOM, WebGL, network state, or mesh ownership.
import { Box3, Camera, Frustum, Matrix4, Vector3 } from "three";
import { geographicBoundsIntersect } from "@carma-geo/helpers";

import {
  boundsIntersect,
  EARTH_CIRCUMFERENCE_METERS,
  getTileBounds,
  latitudeToTileY,
  longitudeToTileX,
  type TerrainTileBounds,
  type TerrainTileId,
  terrainTileKey,
} from "./raster-dem-tile";

export type TerrainSelectionEntry = Readonly<{
  id: TerrainTileId;
  kind: "source";
}>;

export type TerrainSelection = Readonly<{
  entries: readonly TerrainSelectionEntry[];
  viewportStages: readonly (readonly TerrainSelectionEntry[])[];
  loadEntries: readonly TerrainSelectionEntry[];
  signature: string;
  viewportElevationSignature: string;
}>;

export type TerrainSelectionSourceMetadata = Readonly<{
  bounds: TerrainTileBounds;
  minzoom: number;
  maxzoom: number;
  meshSegments: number;
}>;

export type TerrainSelectionCameraSnapshot = Readonly<{
  projectionMatrix: readonly number[];
  matrixWorldInverse: readonly number[];
  matrixWorld: readonly number[];
  coordinateSystem?: Camera["coordinateSystem"];
  reversedDepth?: boolean;
  position: readonly [number, number, number];
  fov: number;
  isOrthographicCamera?: boolean;
}>;

export type TerrainSelectionInput = Readonly<{
  viewportBounds: TerrainTileBounds;
  viewport: readonly [width: number, height: number];
  renderCamera: TerrainSelectionCameraSnapshot;
  lodCameraPosition: readonly [number, number, number];
  rootMatrixWorld: readonly number[];
  origin: readonly [x: number, y: number, z: number];
  meterScale: number;
  shadow?: Readonly<{
    camera: TerrainSelectionCameraSnapshot;
    shadowMapSize: readonly [width: number, height: number];
    bounds: TerrainTileBounds;
  }>;
  source: TerrainSelectionSourceMetadata;
  knownHeightRanges: Readonly<Record<string, readonly [number, number]>>;
  unknownHeightRange: readonly [number, number];
  errorTargetPixels: number;
  shadowLevelOffset: number;
  minimumLevel: number;
  maximumLevel: number;
  maxSelectionTiles: number;
  initialErrorTargetPixels: number;
}>;

export type TerrainSelectionAdapter = Readonly<{
  getTileGridIdsForBounds: (
    bounds: TerrainTileBounds,
    level: number
  ) => TerrainTileId[];
  getTileBounds: (id: TerrainTileId) => TerrainTileBounds;
  getTileGeometricError: (level: number) => number;
  getTileDataAvailable: (id: TerrainTileId) => boolean;
}>;

const selectionKey = ({ id, kind }: TerrainSelectionEntry) =>
  `${kind}:${terrainTileKey(id)}`;

const tileIsAvailable = (adapter: TerrainSelectionAdapter, id: TerrainTileId) =>
  adapter.getTileDataAvailable(id);

const getGridIds = (
  source: TerrainSelectionSourceMetadata,
  bounds: TerrainTileBounds,
  level: number
): TerrainTileId[] => {
  if (level < source.minzoom || level > source.maxzoom) return [];
  const west = Math.max(bounds.west, source.bounds.west);
  const south = Math.max(bounds.south, source.bounds.south);
  const east = Math.min(bounds.east, source.bounds.east);
  const north = Math.min(bounds.north, source.bounds.north);
  if (west >= east || south >= north) return [];
  const scale = 2 ** level;
  const epsilon = 1e-10;
  const minimumX = Math.max(0, Math.floor(longitudeToTileX(west, level)));
  const maximumX = Math.min(
    scale - 1,
    Math.floor(longitudeToTileX(east - epsilon, level))
  );
  const minimumY = Math.max(
    0,
    Math.floor(latitudeToTileY(north - epsilon, level))
  );
  const maximumY = Math.min(
    scale - 1,
    Math.floor(latitudeToTileY(south + epsilon, level))
  );
  const ids: TerrainTileId[] = [];
  for (let y = minimumY; y <= maximumY; y += 1)
    for (let x = minimumX; x <= maximumX; x += 1) ids.push({ level, x, y });
  return ids;
};

const createDefaultAdapter = (
  source: TerrainSelectionSourceMetadata
): TerrainSelectionAdapter => ({
  getTileGridIdsForBounds: (bounds, level) => getGridIds(source, bounds, level),
  getTileBounds,
  getTileGeometricError: (level) =>
    (EARTH_CIRCUMFERENCE_METERS *
      Math.cos(((source.bounds.south + source.bounds.north) * Math.PI) / 360)) /
    (2 ** level * source.meshSegments),
  getTileDataAvailable: (id) =>
    id.level >= source.minzoom &&
    id.level <= source.maxzoom &&
    boundsIntersect(getTileBounds(id), [
      source.bounds.west,
      source.bounds.south,
      source.bounds.east,
      source.bounds.north,
    ]),
});

const geometricError = (adapter: TerrainSelectionAdapter, level: number) => {
  return adapter.getTileGeometricError(level);
};

const projectToLocalWorld = (
  longitude: number,
  latitude: number,
  height: number,
  origin: readonly [number, number, number],
  meterScale: number,
  target: Vector3
) => {
  const latitudeRadians = (latitude * Math.PI) / 180;
  const x = (longitude + 180) / 360;
  const y =
    (180 -
      (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + latitudeRadians / 2))) /
    360;
  // Reuse the caller's Mercator scale, including its Earth-radius convention.
  const originLatitude = Math.atan(Math.sinh(Math.PI * (1 - 2 * origin[1])));
  const z =
    (height * meterScale * Math.cos(originLatitude)) /
    Math.cos(latitudeRadians);
  return target.set(
    (x - origin[0]) / meterScale,
    (z - origin[2]) / meterScale,
    (y - origin[1]) / meterScale
  );
};

const snapshotCamera = (snapshot: TerrainSelectionCameraSnapshot) => {
  const camera = {
    projectionMatrix: new Matrix4().fromArray([...snapshot.projectionMatrix]),
    matrixWorldInverse: new Matrix4().fromArray([
      ...snapshot.matrixWorldInverse,
    ]),
    matrixWorld: new Matrix4().fromArray([...snapshot.matrixWorld]),
    position: new Vector3(...snapshot.position),
    fov: snapshot.fov,
    coordinateSystem: snapshot.coordinateSystem,
    reversedDepth: snapshot.reversedDepth,
    isOrthographicCamera: snapshot.isOrthographicCamera,
  } as const;
  return camera;
};

export const buildTerrainSelection = (
  input: TerrainSelectionInput,
  adapter: TerrainSelectionAdapter = createDefaultAdapter(input.source)
): TerrainSelection => {
  const { source } = input;
  const renderCamera = snapshotCamera(input.renderCamera);
  const viewportFrustum = new Frustum().setFromProjectionMatrix(
    new Matrix4().multiplyMatrices(
      renderCamera.projectionMatrix,
      renderCamera.matrixWorldInverse
    )
  );
  const shadowCamera = input.shadow
    ? snapshotCamera(input.shadow.camera)
    : null;
  const shadowFrustum = shadowCamera
    ? new Frustum().setFromProjectionMatrix(
        new Matrix4().multiplyMatrices(
          shadowCamera.projectionMatrix,
          shadowCamera.matrixWorldInverse
        ),
        shadowCamera.coordinateSystem,
        shadowCamera.reversedDepth
      )
    : null;
  const rootMatrixWorld = new Matrix4().fromArray([...input.rootMatrixWorld]);
  const localFromWorld = rootMatrixWorld.clone().invert();
  const localCameraPosition = new Vector3(
    ...input.lodCameraPosition
  ).applyMatrix4(localFromWorld);
  const shadowPixelsPerMeter =
    input.shadow && shadowCamera?.isOrthographicCamera
      ? (() => {
          const clipFromRoot = new Matrix4()
            .multiplyMatrices(
              shadowCamera!.projectionMatrix,
              shadowCamera!.matrixWorldInverse
            )
            .multiply(rootMatrixWorld);
          const elements = clipFromRoot.elements;
          const pixels = (offset: number) =>
            Math.hypot(
              (elements[offset] * input.shadow!.shadowMapSize[0]) / 2,
              (elements[offset + 1] * input.shadow!.shadowMapSize[1]) / 2
            );
          return Math.max(pixels(0), pixels(4), pixels(8));
        })()
      : 0;
  const coverageBounds = input.shadow
    ? {
        west: Math.min(input.viewportBounds.west, input.shadow.bounds.west),
        south: Math.min(input.viewportBounds.south, input.shadow.bounds.south),
        east: Math.max(input.viewportBounds.east, input.shadow.bounds.east),
        north: Math.max(input.viewportBounds.north, input.shadow.bounds.north),
      }
    : input.viewportBounds;
  const metrics = new Map<
    string,
    {
      intersectsViewport: boolean;
      intersectsShadow: boolean;
      localBoundingBox: Box3;
      distance: number;
    }
  >();
  const getMetrics = (entry: TerrainSelectionEntry) => {
    const key = selectionKey(entry);
    const cached = metrics.get(key);
    if (cached) return cached;
    const bounds = adapter.getTileBounds(entry.id);
    let known = input.knownHeightRanges[terrainTileKey(entry.id)];
    let ancestor = entry.id;
    while (!known && ancestor.level >= 0) {
      ancestor = {
        level: ancestor.level - 1,
        x: ancestor.x >> 1,
        y: ancestor.y >> 1,
      };
      known = input.knownHeightRanges[terrainTileKey(ancestor)];
      if (ancestor.level === 0) break;
    }
    if (!known) known = input.unknownHeightRange;
    else if (ancestor.level !== entry.id.level) {
      const uncertainty = geometricError(adapter, ancestor.level);
      known = [known[0] - uncertainty, known[1] + uncertainty];
    }
    const localBoundingBox = new Box3();
    for (const longitude of [bounds.west, bounds.east])
      for (const latitude of [bounds.south, bounds.north]) {
        localBoundingBox.expandByPoint(
          projectToLocalWorld(
            longitude,
            latitude,
            known[0],
            input.origin,
            input.meterScale,
            new Vector3()
          )
        );
        localBoundingBox.expandByPoint(
          projectToLocalWorld(
            longitude,
            latitude,
            known[1],
            input.origin,
            input.meterScale,
            new Vector3()
          )
        );
      }
    const worldBoundingBox = localBoundingBox
      .clone()
      .applyMatrix4(rootMatrixWorld);
    const projectedCenter = worldBoundingBox
      .getCenter(new Vector3())
      .applyMatrix4(renderCamera.matrixWorldInverse)
      .applyMatrix4(renderCamera.projectionMatrix);
    const value = {
      intersectsViewport:
        geographicBoundsIntersect(bounds, input.viewportBounds) ||
        viewportFrustum.intersectsBox(worldBoundingBox),
      intersectsShadow: shadowFrustum?.intersectsBox(worldBoundingBox) ?? false,
      localBoundingBox,
      distance: projectedCenter.x ** 2 + projectedCenter.y ** 2,
    };
    metrics.set(key, value);
    return value;
  };
  const intersectsViewport = (entry: TerrainSelectionEntry) =>
    getMetrics(entry).intersectsViewport;
  const intersectsShadow = (entry: TerrainSelectionEntry) =>
    getMetrics(entry).intersectsShadow;
  const rootIds = (level: number) => {
    const viewportIds = adapter.getTileGridIdsForBounds(
      input.viewportBounds,
      level
    );
    let longitudePadding = 0;
    let latitudePadding = 0;
    for (const id of viewportIds) {
      const bounds = adapter.getTileBounds(id);
      longitudePadding = Math.max(longitudePadding, bounds.east - bounds.west);
      latitudePadding = Math.max(latitudePadding, bounds.north - bounds.south);
    }
    const viewportAndNeighbors = {
      west: input.viewportBounds.west - longitudePadding,
      south: Math.max(-90, input.viewportBounds.south - latitudePadding),
      east: input.viewportBounds.east + longitudePadding,
      north: Math.min(90, input.viewportBounds.north + latitudePadding),
    };
    const rootBounds = {
      west: Math.min(coverageBounds.west, viewportAndNeighbors.west),
      south: Math.min(coverageBounds.south, viewportAndNeighbors.south),
      east: Math.max(coverageBounds.east, viewportAndNeighbors.east),
      north: Math.max(coverageBounds.north, viewportAndNeighbors.north),
    };
    return adapter
      .getTileGridIdsForBounds(rootBounds, level)
      .filter((id) => tileIsAvailable(adapter, id));
  };
  let rootLevel = input.minimumLevel;
  let rootEntries = rootIds(rootLevel).flatMap((id) => {
    const entry = { id, kind: "source" } as const;
    return intersectsViewport(entry) || intersectsShadow(entry) ? [entry] : [];
  });
  while (rootEntries.length > input.maxSelectionTiles && rootLevel > 0) {
    rootLevel -= 1;
    rootEntries = rootIds(rootLevel).flatMap((id) => {
      const entry = { id, kind: "source" } as const;
      return intersectsViewport(entry) || intersectsShadow(entry)
        ? [entry]
        : [];
    });
  }
  const selected = new Map(
    rootEntries.map((entry) => [selectionKey(entry), entry])
  );
  type Candidate = {
    entry: TerrainSelectionEntry;
    viewportErrorRatio: number;
    shadowErrorRatio: number;
    intersectsViewport: boolean;
    viewportCenterDistanceSquared: number;
  };
  const toCandidate = (entry: TerrainSelectionEntry): Candidate => {
    const view = getMetrics(entry);
    const distance = Math.max(
      1,
      view.localBoundingBox.distanceToPoint(localCameraPosition)
    );
    const focal =
      input.viewport[1] /
      (2 * Math.tan((input.renderCamera.fov * Math.PI) / 360));
    const viewport = view.intersectsViewport
      ? (geometricError(adapter, entry.id.level) * focal) /
        distance /
        input.errorTargetPixels
      : 0;
    const shadow = view.intersectsShadow
      ? (geometricError(adapter, entry.id.level) * shadowPixelsPerMeter) /
        (input.errorTargetPixels * 2 ** input.shadowLevelOffset)
      : 0;
    return {
      entry,
      viewportErrorRatio: viewport,
      shadowErrorRatio: shadow,
      intersectsViewport: view.intersectsViewport,
      viewportCenterDistanceSquared: view.distance,
    };
  };
  const makeHeap = (ratioOf: (candidate: Candidate) => number) => {
    const heap: Candidate[] = [];
    const swap = (a: number, b: number) => {
      const held = heap[a];
      heap[a] = heap[b];
      heap[b] = held;
    };
    const siftDown = (from: number) => {
      let index = from;
      for (;;) {
        const left = 2 * index + 1;
        const right = left + 1;
        let largest = index;
        if (left < heap.length && ratioOf(heap[left]) > ratioOf(heap[largest]))
          largest = left;
        if (
          right < heap.length &&
          ratioOf(heap[right]) > ratioOf(heap[largest])
        )
          largest = right;
        if (largest === index) break;
        swap(largest, index);
        index = largest;
      }
    };
    return {
      get size() {
        return heap.length;
      },
      push(candidate: Candidate) {
        heap.push(candidate);
        let index = heap.length - 1;
        while (index > 0) {
          const parent = (index - 1) >> 1;
          if (ratioOf(heap[parent]) >= ratioOf(heap[index])) break;
          swap(parent, index);
          index = parent;
        }
      },
      pop(): Candidate {
        const top = heap[0];
        const last = heap.pop()!;
        if (heap.length > 0) {
          heap[0] = last;
          siftDown(0);
        }
        return top;
      },
    };
  };
  const viewportHeap = makeHeap((candidate) => candidate.viewportErrorRatio);
  const shadowHeap = makeHeap((candidate) => candidate.shadowErrorRatio);
  for (const entry of rootEntries) {
    const candidate = toCandidate(entry);
    if (candidate.intersectsViewport) viewportHeap.push(candidate);
    else shadowHeap.push(candidate);
  }
  const refine = (
    heap: ReturnType<typeof makeHeap>,
    ratioOf: (candidate: Candidate) => number
  ) => {
    while (heap.size > 0) {
      const candidate = heap.pop();
      if (ratioOf(candidate) <= 1) break;
      if (candidate.entry.id.level >= input.maximumLevel) continue;
      const children: TerrainSelectionEntry[] = [];
      let unavailableChild = false;
      for (let y = 0; y < 2; y += 1)
        for (let x = 0; x < 2; x += 1) {
          const id = {
            level: candidate.entry.id.level + 1,
            x: candidate.entry.id.x * 2 + x,
            y: candidate.entry.id.y * 2 + y,
          };
          const entry = { id, kind: "source" } as const;
          if (intersectsViewport(entry) || intersectsShadow(entry)) {
            if (!tileIsAvailable(adapter, id)) unavailableChild = true;
            else children.push(entry);
          }
        }
      if (
        unavailableChild ||
        !children.length ||
        selected.size + children.length - 1 > input.maxSelectionTiles
      )
        continue;
      selected.delete(selectionKey(candidate.entry));
      for (const child of children) {
        selected.set(selectionKey(child), child);
        const childCandidate = toCandidate(child);
        if (childCandidate.intersectsViewport)
          viewportHeap.push(childCandidate);
        else shadowHeap.push(childCandidate);
      }
    }
  };
  refine(viewportHeap, (candidate) => candidate.viewportErrorRatio);
  refine(shadowHeap, (candidate) => candidate.shadowErrorRatio);
  const entries = [...selected.values()].sort((a, b) => {
    const av = intersectsViewport(a) ? 0 : 1;
    const bv = intersectsViewport(b) ? 0 : 1;
    return av - bv || getMetrics(a).distance - getMetrics(b).distance;
  });
  const viewportEntries = entries.filter(intersectsViewport);
  const ancestor = (
    entry: TerrainSelectionEntry,
    level: number
  ): TerrainSelectionEntry =>
    level >= entry.id.level
      ? entry
      : {
          kind: "source",
          id: {
            level,
            x: entry.id.x >> (entry.id.level - level),
            y: entry.id.y >> (entry.id.level - level),
          },
        };
  // A near tile must not force the entire distant viewport to its resolution.
  // Find each receiver's first useful ancestor, then refine the cut one level
  // at a time. The loader publishes each cut before spending work on the next.
  const previewLevels = viewportEntries.map((entry) => {
    for (let level = rootLevel; level < entry.id.level; level += 1) {
      const candidate = ancestor(entry, level);
      if (
        tileIsAvailable(adapter, candidate.id) &&
        toCandidate(candidate).viewportErrorRatio * input.errorTargetPixels <=
          input.initialErrorTargetPixels
      )
        return level;
    }
    return entry.id.level;
  });
  const refinementSteps = viewportEntries.reduce(
    (max, entry, index) => Math.max(max, entry.id.level - previewLevels[index]),
    0
  );
  const viewportStages: TerrainSelectionEntry[][] = [];
  // Responsiveness takes precedence over the preview error goal: unknown
  // heights can conservatively put the eye inside every tile's bounds. Start
  // with at most four ancestors where possible, rather than waiting for a
  // screen full of source-maxzoom tiles. Never coarsen an already visible cut.
  for (
    let level = Math.min(input.maximumLevel, ...previewLevels);
    level >= rootLevel;
    level -= 1
  ) {
    const coverage = new Map<string, TerrainSelectionEntry>();
    for (const entry of viewportEntries) {
      const candidate = ancestor(entry, level);
      coverage.set(selectionKey(candidate), candidate);
    }
    if (coverage.size > 4 && level > rootLevel) continue;
    if (
      [...coverage.values()].every((entry) =>
        tileIsAvailable(adapter, entry.id)
      )
    ) {
      viewportStages.push(
        [...coverage.values()].sort(
          (a, b) => getMetrics(a).distance - getMetrics(b).distance
        )
      );
      break;
    }
  }
  for (let step = 0; step <= refinementSteps; step += 1) {
    const stageByKey = new Map<string, TerrainSelectionEntry>();
    viewportEntries.forEach((entry, index) => {
      const candidate = ancestor(entry, previewLevels[index] + step);
      stageByKey.set(selectionKey(candidate), candidate);
    });
    const candidates = [...stageByKey.values()];
    // Different projected errors can select a parent and one of its children.
    // Keep a disjoint cut; parent coverage is refined together in later stages.
    const stage = candidates
      .filter(
        (entry) =>
          !candidates.some(
            (other) =>
              other.id.level < entry.id.level &&
              selectionKey(ancestor(entry, other.id.level)) ===
                selectionKey(other)
          )
      )
      .sort((a, b) => getMetrics(a).distance - getMetrics(b).distance);
    viewportStages.push(stage);
  }
  const load = new Map<string, TerrainSelectionEntry>();
  for (const stage of viewportStages)
    for (const entry of stage) load.set(selectionKey(entry), entry);
  for (const entry of entries) load.set(selectionKey(entry), entry);
  return {
    entries,
    viewportStages,
    loadEntries: [...load.values()],
    signature: entries.map(selectionKey).sort().join("|"),
    viewportElevationSignature: entries
      .filter(intersectsViewport)
      .map(selectionKey)
      .sort()
      .join("|"),
  };
};
